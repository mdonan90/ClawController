"""
OpenClaw Gateway Watchdog for ClawController

Monitors the OpenClaw gateway and automatically restarts it if it crashes.
Provides crash notifications, uptime tracking, and health monitoring.
"""

import json
import subprocess
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from database import SessionLocal
from models import ActivityLog
import logging

# Configuration
HEALTH_CHECK_INTERVAL = 30  # Check every 30 seconds
HEALTH_CHECK_TIMEOUT = 10   # Timeout for health check commands
MAX_RESTART_ATTEMPTS = 3    # Max restart attempts before giving up
RESTART_COOLDOWN = timedelta(minutes=5)  # Wait before retry after multiple failures
NOTIFICATION_COOLDOWN = timedelta(minutes=15)  # Don't spam crash notifications
STARTUP_DELAY = 30          # Seconds to wait after crash before watchdog restarts (lets LaunchAgent self-heal first)
RESTART_VERIFY_DELAY = 15   # Seconds to wait after restart before verifying health
STATE_FILE = Path(__file__).parent.parent / "data" / "gateway_watchdog_state.json"

class GatewayWatchdog:
    """Monitor and restart OpenClaw gateway with crash detection and notifications."""
    
    def __init__(self):
        self.state_file = STATE_FILE
        self.state_file.parent.mkdir(exist_ok=True)
        self.state = self._load_state()
        self.monitoring = False
        self._startup_logged = False  # Prevent duplicate "monitoring started" log entries
        
    def _load_state(self) -> Dict:
        """Load persistent state from file."""
        try:
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logging.warning(f"Failed to load gateway watchdog state: {e}")
        
        return {
            "last_check": None,
            "last_healthy": None,
            "last_crash": None,
            "uptime_start": None,
            "crash_count": 0,
            "restart_count": 0,
            "consecutive_failures": 0,
            "last_notification": None,
            "total_uptime_hours": 0.0,
            "health_status": "unknown"
        }
    
    def _save_state(self):
        """Save state to file."""
        try:
            self.state["last_check"] = datetime.utcnow().isoformat()
            with open(self.state_file, 'w') as f:
                json.dump(self.state, f, indent=2, default=str)
        except Exception as e:
            logging.error(f"Failed to save gateway watchdog state: {e}")
    
    async def check_gateway_health(self) -> Tuple[bool, str]:
        """
        Check if OpenClaw gateway is healthy.
        Returns: (is_healthy, status_message)
        """
        try:
            # Try a simple status check command with timeout
            result = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "openclaw", "status", "--json",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=HEALTH_CHECK_TIMEOUT
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0:
                # Parse status output to verify gateway is actually running
                try:
                    status_data = json.loads(stdout.decode())
                    gateway_info = status_data.get("gateway", {})
                    is_reachable = gateway_info.get("reachable", False)
                    if is_reachable:
                        return True, "Gateway healthy"
                    else:
                        error = gateway_info.get("error", "unreachable")
                        return False, f"Gateway status: {error}"
                except json.JSONDecodeError:
                    return False, "Gateway responding but status unreadable"
            else:
                error_msg = stderr.decode().strip() if stderr else "Unknown error"
                return False, f"Status check failed: {error_msg}"
                
        except asyncio.TimeoutError:
            return False, "Health check timed out"
        except Exception as e:
            return False, f"Health check error: {str(e)}"
    
    async def restart_gateway(self) -> Tuple[bool, str]:
        """
        Attempt to restart the OpenClaw gateway.
        Returns: (success, message)
        """
        try:
            logging.info("Attempting to restart OpenClaw gateway...")
            
            # Try to restart using openclaw gateway start
            result = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "openclaw", "gateway", "start",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=30  # Give restart more time
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0:
                # Wait for gateway to fully start before verifying
                await asyncio.sleep(RESTART_VERIFY_DELAY)
                
                # Verify it's actually running
                is_healthy, status_msg = await self.check_gateway_health()
                if is_healthy:
                    self.state["restart_count"] += 1
                    self.state["consecutive_failures"] = 0
                    self.state["uptime_start"] = datetime.utcnow().isoformat()
                    return True, "Gateway restarted successfully"
                else:
                    return False, f"Gateway started but not healthy: {status_msg}"
            else:
                error_msg = stderr.decode().strip() if stderr else "Unknown error"
                return False, f"Restart command failed: {error_msg}"
                
        except asyncio.TimeoutError:
            return False, "Restart command timed out"
        except Exception as e:
            return False, f"Restart failed: {str(e)}"
    
    async def notify_crash(self, crash_info: Dict):
        """Send crash notification to main agent."""
        try:
            consecutive = crash_info.get("consecutive_failures", 0)
            restart_attempts = crash_info.get("restart_attempts", 0)
            
            if consecutive == 1:
                urgency = "🟡 Gateway Crash Detected"
            elif consecutive >= 3:
                urgency = "🔴 CRITICAL: Repeated Gateway Crashes"
            else:
                urgency = "🟠 Gateway Crash (Multiple Failures)"
            
            uptime_info = ""
            if crash_info.get("uptime_hours"):
                uptime_info = f"\n**Uptime before crash:** {crash_info['uptime_hours']:.1f} hours"
            
            restart_info = ""
            if restart_attempts > 0:
                if crash_info.get("restart_success"):
                    restart_info = f"\n✅ **Auto-restart:** Successful after {restart_attempts} attempts"
                else:
                    restart_info = f"\n❌ **Auto-restart:** Failed after {restart_attempts} attempts"
            
            message = f"""{urgency}

**OpenClaw Gateway has crashed**
**Detected at:** {crash_info.get('crash_time', 'Unknown')}
**Error:** {crash_info.get('error_message', 'Unknown error')}{uptime_info}{restart_info}
**Total crashes:** {crash_info.get('total_crashes', 0)}
**Consecutive failures:** {consecutive}

**Status:** Gateway monitoring will continue attempting recovery.

**Manual intervention may be needed if auto-restart continues to fail.**
Check OpenClaw logs: `openclaw logs --follow`
Manual restart: `openclaw gateway restart`

View watchdog status in ClawController dashboard."""
            
            subprocess.Popen(
                ["openclaw", "agent", "--agent", "main", "--message", message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=str(Path.home())
            )
            
            logging.info(f"Sent gateway crash notification (consecutive: {consecutive})")
            
        except Exception as e:
            logging.error(f"Failed to send crash notification: {e}")
    
    async def notify_recovery(self, recovery_info: Dict):
        """Send recovery notification to main agent."""
        try:
            message = f"""✅ Gateway Recovery

**OpenClaw Gateway is back online**
**Recovered at:** {recovery_info.get('recovery_time', 'Unknown')}
**Downtime:** {recovery_info.get('downtime_minutes', 0):.1f} minutes
**Recovery method:** {recovery_info.get('recovery_method', 'Auto-restart')}

**Status:** Gateway monitoring resumed.
**Total restarts:** {recovery_info.get('total_restarts', 0)}

Gateway is now healthy and operational."""
            
            subprocess.Popen(
                ["openclaw", "agent", "--agent", "main", "--message", message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=str(Path.home())
            )
            
            logging.info("Sent gateway recovery notification")
            
        except Exception as e:
            logging.error(f"Failed to send recovery notification: {e}")
    
    async def log_activity(self, activity_type: str, description: str):
        """Log watchdog activity to database."""
        try:
            db = SessionLocal()
            activity = ActivityLog(
                activity_type=activity_type,
                agent_id="gateway_watchdog",
                description=description
            )
            db.add(activity)
            db.commit()
            db.close()
        except Exception as e:
            logging.error(f"Failed to log activity: {e}")
    
    def should_notify_crash(self) -> bool:
        """Check if we should send a crash notification (respects cooldown)."""
        last_notification = self.state.get("last_notification")
        if not last_notification:
            return True
        
        last_notified_dt = datetime.fromisoformat(last_notification)
        return datetime.utcnow() - last_notified_dt > NOTIFICATION_COOLDOWN
    
    def calculate_uptime(self) -> float:
        """Calculate current session uptime in hours."""
        uptime_start = self.state.get("uptime_start")
        if not uptime_start:
            return 0.0
        
        start_dt = datetime.fromisoformat(uptime_start)
        uptime_delta = datetime.utcnow() - start_dt
        return uptime_delta.total_seconds() / 3600
    
    async def handle_crash(self, error_message: str):
        """Handle gateway crash with restart attempts and notifications."""
        crash_time = datetime.utcnow()
        uptime_hours = self.calculate_uptime()
        
        # Update crash statistics
        self.state["last_crash"] = crash_time.isoformat()
        self.state["crash_count"] += 1
        self.state["consecutive_failures"] += 1
        self.state["health_status"] = "crashed"
        
        # Add uptime to total
        if uptime_hours > 0:
            self.state["total_uptime_hours"] += uptime_hours
        
        await self.log_activity("gateway_crash", f"Gateway crashed: {error_message}")
        
        # Attempt restart if we haven't exceeded max attempts
        restart_success = False
        restart_attempts = 0
        
        if self.state["consecutive_failures"] <= MAX_RESTART_ATTEMPTS:
            # Wait before attempting our own restart — gives the LaunchAgent time to self-heal
            # so we don't fight each other with competing SIGTERMs
            logging.info(f"Waiting {STARTUP_DELAY}s startup delay before watchdog restart attempt...")
            await asyncio.sleep(STARTUP_DELAY)
            
            # Check if LaunchAgent already recovered on its own
            already_healthy, _ = await self.check_gateway_health()
            if already_healthy:
                logging.info("Gateway self-healed during startup delay — skipping watchdog restart")
                await self.handle_recovery()
                return
            
            restart_attempts = 1
            restart_success, restart_msg = await self.restart_gateway()
            
            if restart_success:
                await self.log_activity("gateway_restart", f"Gateway auto-restarted successfully")
                # Send recovery notification
                await self.notify_recovery({
                    "recovery_time": datetime.utcnow().isoformat(),
                    "downtime_minutes": round(STARTUP_DELAY / 60, 1),
                    "recovery_method": "Auto-restart",
                    "total_restarts": self.state["restart_count"]
                })
            else:
                await self.log_activity("gateway_restart_failed", f"Gateway restart failed: {restart_msg}")
        
        # Send crash notification if cooldown period has passed
        if self.should_notify_crash():
            await self.notify_crash({
                "crash_time": crash_time.isoformat(),
                "error_message": error_message,
                "uptime_hours": uptime_hours,
                "total_crashes": self.state["crash_count"],
                "consecutive_failures": self.state["consecutive_failures"],
                "restart_attempts": restart_attempts,
                "restart_success": restart_success
            })
            self.state["last_notification"] = crash_time.isoformat()
        
        self._save_state()
    
    async def handle_recovery(self):
        """Handle gateway recovery after being down."""
        recovery_time = datetime.utcnow()
        
        # Check if this is a recovery from crash
        last_crash = self.state.get("last_crash")
        if last_crash and self.state.get("health_status") in ["crashed", "down"]:
            crash_time = datetime.fromisoformat(last_crash)
            downtime = recovery_time - crash_time
            
            await self.log_activity("gateway_recovery", "Gateway recovered")
            
            # Reset consecutive failures on successful recovery
            self.state["consecutive_failures"] = 0
            self.state["health_status"] = "healthy"
            self.state["last_healthy"] = recovery_time.isoformat()
            self.state["uptime_start"] = recovery_time.isoformat()
            
            self._save_state()
    
    async def monitor_gateway(self):
        """Main monitoring loop."""
        self.monitoring = True
        logging.info("Gateway watchdog started")
        # Only log startup once per process lifetime to avoid spam on restarts
        if not self._startup_logged:
            self._startup_logged = True
            await self.log_activity("watchdog_started", "Gateway monitoring started")
        
        while self.monitoring:
            try:
                is_healthy, status_msg = await self.check_gateway_health()
                current_time = datetime.utcnow()
                
                if is_healthy:
                    # Gateway is healthy
                    if self.state.get("health_status") != "healthy":
                        await self.handle_recovery()
                    
                    self.state["health_status"] = "healthy"
                    self.state["last_healthy"] = current_time.isoformat()
                    
                    # Initialize uptime tracking if not set
                    if not self.state.get("uptime_start"):
                        self.state["uptime_start"] = current_time.isoformat()
                        
                else:
                    # Gateway is down or unhealthy
                    await self.handle_crash(status_msg)
                
                self._save_state()
                
            except Exception as e:
                logging.error(f"Gateway monitor error: {e}")
                await self.log_activity("monitor_error", f"Monitoring error: {str(e)}")
            
            # Wait before next check
            await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        
        logging.info("Gateway watchdog stopped")
        await self.log_activity("watchdog_stopped", "Gateway monitoring stopped")
    
    def stop_monitoring(self):
        """Stop the monitoring loop."""
        self.monitoring = False
    
    def get_status(self) -> Dict:
        """Get current watchdog status and statistics."""
        current_uptime = self.calculate_uptime()
        last_check = self.state.get("last_check")
        last_healthy = self.state.get("last_healthy")
        
        # Calculate time since last healthy
        time_since_healthy = None
        if last_healthy:
            healthy_dt = datetime.fromisoformat(last_healthy)
            time_since_healthy = (datetime.utcnow() - healthy_dt).total_seconds() / 60  # minutes
        
        return {
            "monitoring": self.monitoring,
            "health_status": self.state.get("health_status", "unknown"),
            "last_check": last_check,
            "last_healthy": last_healthy,
            "time_since_healthy_minutes": time_since_healthy,
            "current_uptime_hours": round(current_uptime, 2),
            "total_uptime_hours": round(self.state.get("total_uptime_hours", 0), 2),
            "crash_count": self.state.get("crash_count", 0),
            "restart_count": self.state.get("restart_count", 0),
            "consecutive_failures": self.state.get("consecutive_failures", 0),
            "last_crash": self.state.get("last_crash"),
            "last_notification": self.state.get("last_notification"),
            "state_file": str(self.state_file),
            "config": {
                "check_interval_seconds": HEALTH_CHECK_INTERVAL,
                "health_check_timeout": HEALTH_CHECK_TIMEOUT,
                "max_restart_attempts": MAX_RESTART_ATTEMPTS,
                "restart_cooldown_minutes": RESTART_COOLDOWN.total_seconds() / 60,
                "notification_cooldown_minutes": NOTIFICATION_COOLDOWN.total_seconds() / 60,
                "startup_delay_seconds": STARTUP_DELAY,
                "restart_verify_delay_seconds": RESTART_VERIFY_DELAY
            }
        }

# Global watchdog instance
_watchdog = None

async def start_gateway_watchdog():
    """Start the gateway watchdog monitoring."""
    global _watchdog
    if _watchdog is None:
        _watchdog = GatewayWatchdog()
    await _watchdog.monitor_gateway()

def stop_gateway_watchdog():
    """Stop the gateway watchdog monitoring."""
    global _watchdog
    if _watchdog:
        _watchdog.stop_monitoring()

def get_watchdog_status() -> Dict:
    """Get watchdog status without starting monitoring."""
    global _watchdog
    if _watchdog is None:
        _watchdog = GatewayWatchdog()
    return _watchdog.get_status()

# Convenience functions for API integration
async def run_health_check() -> Dict:
    """Run a one-time health check and return results."""
    global _watchdog
    if _watchdog is None:
        _watchdog = GatewayWatchdog()
    
    is_healthy, status_msg = await _watchdog.check_gateway_health()
    return {
        "is_healthy": is_healthy,
        "status_message": status_msg,
        "check_time": datetime.utcnow().isoformat()
    }

async def manual_restart() -> Dict:
    """Manually restart the gateway and return results."""
    global _watchdog
    if _watchdog is None:
        _watchdog = GatewayWatchdog()
    
    success, message = await _watchdog.restart_gateway()
    await _watchdog.log_activity(
        "manual_restart", 
        f"Manual restart: {'successful' if success else 'failed'} - {message}"
    )
    
    return {
        "success": success,
        "message": message,
        "restart_time": datetime.utcnow().isoformat()
    }