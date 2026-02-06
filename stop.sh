#!/bin/bash
# ClawController v2 - Stop Script
# Stops both backend and frontend services

echo "🛑 Stopping ClawController v2..."

# Unload LaunchAgents
launchctl unload ~/Library/LaunchAgents/com.missioncontrol.backend.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.missioncontrol.frontend.plist 2>/dev/null

# Kill any remaining processes
pkill -f "uvicorn main:app.*8000" 2>/dev/null
pkill -f "vite.*5001" 2>/dev/null

sleep 1

# Verify services are stopped
BACKEND_PID=$(pgrep -f "uvicorn main:app.*8000")
FRONTEND_PID=$(pgrep -f "vite.*5001")

echo ""
echo "Service Status:"
if [ -z "$BACKEND_PID" ]; then
    echo "  ✅ Backend stopped"
else
    echo "  ⚠️  Backend still running (PID: $BACKEND_PID)"
fi

if [ -z "$FRONTEND_PID" ]; then
    echo "  ✅ Frontend stopped"
else
    echo "  ⚠️  Frontend still running (PID: $FRONTEND_PID)"
fi

echo ""
echo "ClawController v2 stopped."
