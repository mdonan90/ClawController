#!/bin/bash
# ClawController Installer
# Usage: curl -fsSL https://clawcontroller.com/install.sh | bash

set -e

REPO="mdonan90/ClawController"
INSTALL_DIR="$HOME/.clawcontroller"
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____ _                 _____            _             _ _           "
echo "  / ____| |               / ____|          | |           | | |          "
echo " | |    | | __ ___      _| |     ___  _ __ | |_ _ __ ___ | | | ___ _ __ "
echo " | |    | |/ _\` \ \ /\ / / |    / _ \| '_ \| __| '__/ _ \| | |/ _ \ '__|"
echo " | |____| | (_| |\ V  V /| |___| (_) | | | | |_| | | (_) | | |  __/ |   "
echo "  \_____|_|\__,_| \_/\_/  \_____\___/|_| |_|\__|_|  \___/|_|_|\___|_|   "
echo -e "${NC}"
echo ""
echo "Installing ClawController - Mission Control for OpenClaw Agents"
echo ""

# Check for required tools
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is required but not installed.${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}Checking dependencies...${NC}"
check_command git
check_command python3
check_command node
check_command npm

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    echo -e "${RED}Error: Python 3.10+ required (found $PYTHON_VERSION)${NC}"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required (found v$NODE_VERSION)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All dependencies satisfied${NC}"
echo ""

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Updating existing installation...${NC}"
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/$BRANCH
else
    echo -e "${YELLOW}Cloning ClawController...${NC}"
    git clone --depth 1 -b $BRANCH "https://github.com/$REPO.git" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""

# Setup backend
echo -e "${YELLOW}Setting up backend...${NC}"
cd "$INSTALL_DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate

echo -e "${GREEN}✓ Backend ready${NC}"

# Setup frontend
echo -e "${YELLOW}Setting up frontend...${NC}"
cd "$INSTALL_DIR/frontend"
npm install --silent

echo -e "${GREEN}✓ Frontend ready${NC}"
echo ""

# Create CLI wrapper
echo -e "${YELLOW}Creating CLI...${NC}"
mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/clawcontroller" << 'CLICONTENT'
#!/bin/bash
INSTALL_DIR="$HOME/.clawcontroller"

case "$1" in
    start)
        echo "Starting ClawController..."
        cd "$INSTALL_DIR"
        ./start.sh
        echo ""
        echo "Dashboard: http://localhost:5001"
        echo "API:       http://localhost:8000"
        ;;
    stop)
        echo "Stopping ClawController..."
        cd "$INSTALL_DIR"
        ./stop.sh
        ;;
    update)
        echo "Updating ClawController..."
        cd "$INSTALL_DIR"
        git pull origin main
        cd backend && source venv/bin/activate && pip install -q -r requirements.txt && deactivate
        cd ../frontend && npm install --silent
        echo "Update complete!"
        ;;
    logs)
        tail -f "$INSTALL_DIR/logs/backend.log"
        ;;
    *)
        echo "ClawController - Mission Control for OpenClaw Agents"
        echo ""
        echo "Usage: clawcontroller <command>"
        echo ""
        echo "Commands:"
        echo "  start   Start the dashboard"
        echo "  stop    Stop the dashboard"
        echo "  update  Update to latest version"
        echo "  logs    View backend logs"
        ;;
esac
CLICONTENT

chmod +x "$HOME/.local/bin/clawcontroller"

# Add to PATH if needed
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo -e "${YELLOW}Add this to your shell profile (~/.bashrc or ~/.zshrc):${NC}"
    echo ""
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ClawController installed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Start the dashboard:"
echo -e "    ${BLUE}clawcontroller start${NC}"
echo ""
echo "  Then open:"
echo -e "    ${BLUE}http://localhost:5001${NC}"
echo ""
echo "  Other commands:"
echo "    clawcontroller stop    - Stop the dashboard"
echo "    clawcontroller update  - Update to latest version"
echo "    clawcontroller logs    - View logs"
echo ""
echo -e "  GitHub: ${BLUE}https://github.com/$REPO${NC}"
echo ""
