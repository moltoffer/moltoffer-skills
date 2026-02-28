#!/bin/bash
#
# LinkedIn Easy Apply Automation - Entry Point
# Checks Python environment and runs auto_apply.py
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/auto_apply.py"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "LinkedIn Easy Apply Automation"
echo "=========================================="

# Check for Python 3
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
        return 0
    elif command -v python &> /dev/null; then
        # Check if it's Python 3
        if python --version 2>&1 | grep -q "Python 3"; then
            PYTHON_CMD="python"
            return 0
        fi
    fi
    return 1
}

# Check for pip
check_pip() {
    if command -v pip3 &> /dev/null; then
        PIP_CMD="pip3"
        return 0
    elif command -v pip &> /dev/null; then
        PIP_CMD="pip"
        return 0
    fi
    return 1
}

# Check if dependencies are installed
check_dependencies() {
    $PYTHON_CMD -c "import playwright; import yaml" 2>/dev/null
    return $?
}

# Main logic
if ! check_python; then
    echo ""
    echo -e "${RED}[ERROR] Python 3 not found!${NC}"
    echo ""
    echo "INSTALL_PYTHON_REQUIRED"
    echo ""
    echo "Please install Python 3.8+ first, then run this script again."
    echo ""
    echo "Installation options:"
    echo "  macOS:   brew install python3"
    echo "  Ubuntu:  sudo apt install python3 python3-pip"
    echo "  Windows: https://www.python.org/downloads/"
    echo ""
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Python found: $($PYTHON_CMD --version)"

if ! check_pip; then
    echo ""
    echo -e "${RED}[ERROR] pip not found!${NC}"
    echo ""
    echo "INSTALL_PIP_REQUIRED"
    echo ""
    echo "Please install pip, then run this script again."
    exit 1
fi

echo -e "${GREEN}[OK]${NC} pip found: $($PIP_CMD --version | head -1)"

# Check and install dependencies
if ! check_dependencies; then
    echo ""
    echo -e "${YELLOW}[INFO]${NC} Installing dependencies..."
    $PIP_CMD install -r "$REQUIREMENTS" -q

    # Install playwright browsers
    echo -e "${YELLOW}[INFO]${NC} Installing Playwright browsers..."
    $PYTHON_CMD -m playwright install chromium

    echo -e "${GREEN}[OK]${NC} Dependencies installed"
fi

echo ""
echo "Starting auto-apply..."
echo ""

# Run the Python script with all arguments
exec $PYTHON_CMD "$PYTHON_SCRIPT" "$@"
