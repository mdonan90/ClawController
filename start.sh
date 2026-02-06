#!/bin/bash
# ClawController v2 - Start Script
# Starts both backend and frontend services

echo "🚀 Starting ClawController v2..."

# Create logs directory if it doesn't exist
mkdir -p ~/.openclaw/mission-control-v2/logs

# Load LaunchAgents
launchctl load ~/Library/LaunchAgents/com.missioncontrol.backend.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.missioncontrol.frontend.plist 2>/dev/null

# Wait a moment for services to start
sleep 2

# Check if services are running
BACKEND_PID=$(pgrep -f "uvicorn main:app.*8000")
FRONTEND_PID=$(pgrep -f "vite.*5001")

echo ""
echo "Service Status:"
if [ -n "$BACKEND_PID" ]; then
    echo "  ✅ Backend running (PID: $BACKEND_PID)"
else
    echo "  ❌ Backend not running - check logs/backend.error.log"
fi

if [ -n "$FRONTEND_PID" ]; then
    echo "  ✅ Frontend running (PID: $FRONTEND_PID)"
else
    echo "  ❌ Frontend not running - check logs/frontend.error.log"
fi

echo ""
echo "ClawController available at: http://localhost:5001"
echo "Backend API available at: http://localhost:8000"
echo ""
echo "Logs:"
echo "  Backend: ~/.openclaw/mission-control-v2/logs/backend.log"
echo "  Frontend: ~/.openclaw/mission-control-v2/logs/frontend.log"
