#!/bin/bash
set -e

echo "🚀 HAPI Multi-User Deployment Script"
echo "======================================"
echo ""

# Configuration
REPO_DIR=${REPO_DIR:-"$HOME/hapi"}
BACKUP_DIR=${BACKUP_DIR:-"$HOME/.hapi/backups"}
HAPI_HOME=${HAPI_HOME:-"$HOME/.hapi"}
DB_PATH="$HAPI_HOME/hapi.db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Step 1: Backup database
info "Step 1/7: Backing up database..."
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
    BACKUP_FILE="$BACKUP_DIR/hapi.db.backup-$(date +%Y%m%d-%H%M%S)"
    cp "$DB_PATH" "$BACKUP_FILE"
    info "Database backed up to: $BACKUP_FILE"
else
    warn "No existing database found at $DB_PATH"
fi

# Step 2: Stop running server
info "Step 2/7: Stopping HAPI server..."
if pgrep -f "hapi.*server" > /dev/null; then
    pkill -f "hapi.*server" || true
    sleep 2
    info "Server stopped"
else
    warn "No running server found"
fi

# Step 3: Navigate to repository
info "Step 3/7: Navigating to repository..."
if [ ! -d "$REPO_DIR" ]; then
    error "Repository not found at $REPO_DIR. Set REPO_DIR environment variable."
fi
cd "$REPO_DIR"
info "Working directory: $(pwd)"

# Step 4: Pull latest code
info "Step 4/7: Pulling latest code..."
git fetch origin
git checkout feat/multi-user-support-planning
git pull origin feat/multi-user-support-planning
info "Code updated to latest version"

# Step 5: Install dependencies
info "Step 5/7: Installing dependencies..."
cd server
bun install
info "Dependencies installed"

# Step 6: Run database migration
info "Step 6/7: Running database migration..."
if [ -f "$DB_PATH" ]; then
    bun run scripts/migrate-add-users.ts --force
    info "Database migration completed"
else
    warn "Database will be created on first server start"
fi

# Step 7: Build and start server
info "Step 7/7: Building server..."
bun run build

echo ""
echo "======================================"
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Start the server:"
echo "     cd $REPO_DIR/server && bun run start"
echo ""
echo "  2. Or if using Docker:"
echo "     cd $REPO_DIR && docker-compose up -d --build"
echo ""
echo "  3. Visit the web interface and:"
echo "     - Register a new account (or login with existing Telegram)"
echo "     - Generate a new CLI token"
echo "     - Configure your CLI: hapi auth setup"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
