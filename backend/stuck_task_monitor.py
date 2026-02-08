"""
Stuck Task Detection System for ClawController

Monitors tasks for excessive time in same status and alerts when intervention is needed.
Includes safeguards to prevent notification loops and tracks consecutive detections.
"""

import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Task, TaskStatus, Agent, AgentStatus
import logging

# Configuration
STUCK_TASK_THRESHOLDS = {
    TaskStatus.ASSIGNED: timedelta(hours=2),      # 2 hours in ASSIGNED
    TaskStatus.IN_PROGRESS: timedelta(hours=6),   # 6 hours in IN_PROGRESS (max)
    TaskStatus.REVIEW: timedelta(hours=4),        # 4 hours in REVIEW
    TaskStatus.INBOX: timedelta(hours=6),         # 6 hours in INBOX
}

URGENT_TASK_THRESHOLDS = {
    TaskStatus.ASSIGNED: timedelta(hours=1),      # 1 hour for urgent tasks
    TaskStatus.IN_PROGRESS: timedelta(hours=2),   # 2 hours for urgent tasks
    TaskStatus.REVIEW: timedelta(hours=1),        # 1 hour for urgent tasks
    TaskStatus.INBOX: timedelta(hours=2),         # 2 hours for urgent tasks
}

AGENT_OFFLINE_THRESHOLD = timedelta(hours=6)      # Agent considered offline after 6 hours
NOTIFICATION_COOLDOWN = timedelta(hours=6)        # Don't spam notifications
STATE_FILE = Path(__file__).parent.parent / "data" / "stuck_task_state.json"

class StuckTaskMonitor:
    """Monitor and detect stuck tasks with safeguards against notification loops."""
    
    def __init__(self):
        self.state_file = STATE_FILE
        self.state_file.parent.mkdir(exist_ok=True)
        self.state = self._load_state()
        
    def _load_state(self) -> Dict:
        """Load persistent state from file."""
        try:
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logging.warning(f"Failed to load stuck task state: {e}")
        
        return {
            "stuck_tasks": {},           # task_id -> {first_detected, last_notified, consecutive_count}
            "last_run": None,            # timestamp of last check
            "notification_count": 0      # total notifications sent (for rate limiting)
        }
    
    def _save_state(self):
        """Save state to file."""
        try:
            self.state["last_run"] = datetime.utcnow().isoformat()
            with open(self.state_file, 'w') as f:
                json.dump(self.state, f, indent=2, default=str)
        except Exception as e:
            logging.error(f"Failed to save stuck task state: {e}")
    
    def check_stuck_tasks(self) -> Dict:
        """
        Check for stuck tasks and return summary.
        Returns: {"stuck_tasks": [...], "notifications_sent": 0, "agents_offline": [...]}
        """
        db = SessionLocal()
        result = {
            "stuck_tasks": [],
            "notifications_sent": 0,
            "agents_offline": [],
            "run_timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            # Get all active tasks (not DONE)
            active_tasks = db.query(Task).filter(Task.status != TaskStatus.DONE).all()
            current_time = datetime.utcnow()
            currently_stuck = set()
            
            for task in active_tasks:
                stuck_info = self._check_task_stuck(task, current_time)
                if stuck_info:
                    currently_stuck.add(task.id)
                    result["stuck_tasks"].append(stuck_info)
                    
                    # Check if we should notify about this task
                    if self._should_notify_about_task(task.id, stuck_info):
                        notification_sent = self._notify_stuck_task(task, stuck_info)
                        if notification_sent:
                            result["notifications_sent"] += 1
                            self._update_task_state(task.id, current_time)
            
            # Check for offline agents
            result["agents_offline"] = self._check_offline_agents(db, current_time)
            
            # Clean up state for tasks that are no longer stuck
            self._cleanup_resolved_tasks(currently_stuck)
            
            # Save state
            self._save_state()
            
        except Exception as e:
            logging.error(f"Error during stuck task check: {e}")
            result["error"] = str(e)
        finally:
            db.close()
        
        return result
    
    def _check_task_stuck(self, task: Task, current_time: datetime) -> Optional[Dict]:
        """Check if a single task is stuck."""
        if not task.updated_at:
            return None
        
        # Determine threshold based on priority
        if hasattr(task, 'priority') and task.priority and task.priority.value == "URGENT":
            thresholds = URGENT_TASK_THRESHOLDS
        else:
            thresholds = STUCK_TASK_THRESHOLDS
        
        threshold = thresholds.get(task.status)
        if not threshold:
            return None
        
        time_in_status = current_time - task.updated_at
        
        if time_in_status > threshold:
            return {
                "task_id": task.id,
                "title": task.title,
                "status": task.status.value,
                "assignee_id": task.assignee_id,
                "assignee_name": getattr(task.assignee, 'name', 'Unknown') if task.assignee else None,
                "time_stuck_hours": round(time_in_status.total_seconds() / 3600, 1),
                "threshold_hours": round(threshold.total_seconds() / 3600, 1),
                "priority": getattr(task.priority, 'value', 'NORMAL') if hasattr(task, 'priority') else 'NORMAL',
                "updated_at": task.updated_at.isoformat()
            }
        
        return None
    
    def _should_notify_about_task(self, task_id: str, stuck_info: Dict) -> bool:
        """Determine if we should send a notification for this stuck task."""
        task_state = self.state["stuck_tasks"].get(task_id, {})
        
        # First time detecting this task as stuck
        if not task_state:
            return True
        
        # Check if enough time has passed since last notification
        last_notified = task_state.get("last_notified")
        if last_notified:
            last_notified_dt = datetime.fromisoformat(last_notified)
            if datetime.utcnow() - last_notified_dt < NOTIFICATION_COOLDOWN:
                return False
        
        # Check consecutive count - escalate after 2 consecutive detections
        consecutive_count = task_state.get("consecutive_count", 0)
        if consecutive_count >= 1:  # Second time seeing this task stuck
            return True
        
        return False
    
    def _notify_stuck_task(self, task: Task, stuck_info: Dict) -> bool:
        """Send notification about stuck task to main agent."""
        task_state = self.state["stuck_tasks"].get(task.id, {})
        consecutive_count = task_state.get("consecutive_count", 0) + 1
        
        # Build notification message
        if consecutive_count == 1:
            urgency = "🟡 Task Stuck Alert"
        else:
            urgency = "🔴 PERSISTENT Stuck Task Alert"
        
        assignee_info = f"\n**Assignee:** {stuck_info['assignee_name']} ({stuck_info['assignee_id']})" if stuck_info['assignee_id'] else "\n**Assignee:** Unassigned"
        
        message = f"""{urgency}

**Task:** {stuck_info['title']}
**Status:** {stuck_info['status']} for {stuck_info['time_stuck_hours']} hours{assignee_info}
**Priority:** {stuck_info['priority']}
**Task ID:** {stuck_info['task_id']}

**Threshold exceeded:** {stuck_info['threshold_hours']} hours
**Consecutive detections:** {consecutive_count}

**Possible actions:**
- Check if agent is available and responsive
- Reassign task to another agent  
- Update task status or priority
- Add clarifying comments or instructions

View in ClawController: http://localhost:5001"""
        
        try:
            subprocess.Popen(
                ["openclaw", "agent", "--agent", "main", "--message", message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=str(Path.home())
            )
            logging.info(f"Notified main agent about stuck task: {stuck_info['title']}")
            return True
        except Exception as e:
            logging.error(f"Failed to notify about stuck task {task.id}: {e}")
            return False
    
    def _update_task_state(self, task_id: str, current_time: datetime):
        """Update state tracking for a notified task."""
        if task_id not in self.state["stuck_tasks"]:
            self.state["stuck_tasks"][task_id] = {
                "first_detected": current_time.isoformat(),
                "consecutive_count": 0
            }
        
        self.state["stuck_tasks"][task_id]["last_notified"] = current_time.isoformat()
        self.state["stuck_tasks"][task_id]["consecutive_count"] += 1
        self.state["notification_count"] += 1
    
    def _check_offline_agents(self, db: Session, current_time: datetime) -> List[Dict]:
        """Check for agents that appear to be offline or unavailable."""
        offline_agents = []
        
        try:
            # Get agents that have tasks assigned but haven't been active
            agents_with_tasks = db.query(Agent).join(
                Task, Task.assignee_id == Agent.id
            ).filter(
                Task.status.in_([TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS])
            ).distinct().all()
            
            for agent in agents_with_tasks:
                # Check if agent has any recent activity
                recent_tasks = db.query(Task).filter(
                    Task.assignee_id == agent.id,
                    Task.updated_at > current_time - AGENT_OFFLINE_THRESHOLD
                ).count()
                
                if recent_tasks == 0:
                    offline_agents.append({
                        "agent_id": agent.id,
                        "agent_name": agent.name,
                        "status": agent.status.value if agent.status else "UNKNOWN",
                        "assigned_task_count": db.query(Task).filter(
                            Task.assignee_id == agent.id,
                            Task.status.in_([TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS])
                        ).count()
                    })
        
        except Exception as e:
            logging.error(f"Error checking offline agents: {e}")
        
        return offline_agents
    
    def _cleanup_resolved_tasks(self, currently_stuck: Set[str]):
        """Remove tasks from state that are no longer stuck."""
        resolved_tasks = set(self.state["stuck_tasks"].keys()) - currently_stuck
        for task_id in resolved_tasks:
            del self.state["stuck_tasks"][task_id]
    
    def get_status(self) -> Dict:
        """Get current monitor status and statistics."""
        return {
            "last_run": self.state.get("last_run"),
            "total_notifications_sent": self.state.get("notification_count", 0),
            "currently_tracked_tasks": len(self.state.get("stuck_tasks", {})),
            "state_file": str(self.state_file),
            "thresholds": {
                "normal": {k.value: v.total_seconds()/3600 for k, v in STUCK_TASK_THRESHOLDS.items()},
                "urgent": {k.value: v.total_seconds()/3600 for k, v in URGENT_TASK_THRESHOLDS.items()}
            }
        }

# Convenience functions for API integration
def run_stuck_task_check() -> Dict:
    """Run a stuck task check and return results."""
    monitor = StuckTaskMonitor()
    return monitor.check_stuck_tasks()

def get_monitor_status() -> Dict:
    """Get monitor status without running a check."""
    monitor = StuckTaskMonitor()
    return monitor.get_status()