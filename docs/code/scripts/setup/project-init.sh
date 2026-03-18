#!/usr/bin/env bash
# =============================================================================
# Project Bootstrap Script
# =============================================================================
# Sets up a new development environment from scratch:
#   1. Check prerequisites (node, npm, docker, git)
#   2. Create standard directory structure
#   3. Initialize git repository with .gitignore
#   4. Install npm dependencies
#   5. Create .env from .env.example template
#   6. Set up pre-commit hooks (via Husky)
#   7. Verify everything works with a test run
#
# Usage:
#   chmod +x project-init.sh
#   ./project-init.sh [--skip-docker] [--skip-hooks]
#
# Options:
#   --skip-docker   Skip Docker prerequisite check
#   --skip-hooks    Skip pre-commit hook setup
#   --verbose       Enable verbose output
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly LOG_FILE="${PROJECT_ROOT}/setup.log"

# Minimum required versions
readonly MIN_NODE_VERSION="18"
readonly MIN_NPM_VERSION="9"

# Feature flags (toggled by CLI args)
SKIP_DOCKER=false
SKIP_HOOKS=false
VERBOSE=false

# ---------------------------------------------------------------------------
# Colors & output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${BLUE}[INFO]${NC}  $*" | tee -a "$LOG_FILE"; }
ok()     { echo -e "${GREEN}[OK]${NC}    $*" | tee -a "$LOG_FILE"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "$LOG_FILE"; }
fail()   { echo -e "${RED}[FAIL]${NC}  $*" | tee -a "$LOG_FILE"; exit 1; }
debug()  { if [[ "$VERBOSE" == true ]]; then echo -e "${BLUE}[DEBUG]${NC} $*" | tee -a "$LOG_FILE"; fi; }

# ---------------------------------------------------------------------------
# Parse CLI arguments
# ---------------------------------------------------------------------------
parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --skip-docker) SKIP_DOCKER=true ;;
            --skip-hooks)  SKIP_HOOKS=true ;;
            --verbose)     VERBOSE=true ;;
            --help|-h)
                echo "Usage: $0 [--skip-docker] [--skip-hooks] [--verbose]"
                exit 0
                ;;
            *)
                warn "Unknown argument: $arg"
                ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
check_prerequisites() {
    log "Checking prerequisites..."

    # --- Node.js ---
    if ! command -v node &>/dev/null; then
        fail "Node.js is not installed. Install it from https://nodejs.org/"
    fi
    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_version" -lt "$MIN_NODE_VERSION" ]]; then
        fail "Node.js v${MIN_NODE_VERSION}+ required, found v$(node -v)"
    fi
    ok "Node.js $(node -v)"

    # --- npm ---
    if ! command -v npm &>/dev/null; then
        fail "npm is not installed"
    fi
    local npm_version
    npm_version=$(npm -v | cut -d. -f1)
    if [[ "$npm_version" -lt "$MIN_NPM_VERSION" ]]; then
        fail "npm v${MIN_NPM_VERSION}+ required, found v$(npm -v)"
    fi
    ok "npm v$(npm -v)"

    # --- Git ---
    if ! command -v git &>/dev/null; then
        fail "Git is not installed. Install it from https://git-scm.com/"
    fi
    ok "Git $(git --version | awk '{print $3}')"

    # --- Docker (optional) ---
    if [[ "$SKIP_DOCKER" == false ]]; then
        if ! command -v docker &>/dev/null; then
            warn "Docker is not installed. Some features may not work."
            warn "Install from https://docs.docker.com/get-docker/"
            warn "Or re-run with --skip-docker to skip this check."
        else
            if ! docker info &>/dev/null 2>&1; then
                warn "Docker is installed but not running. Start the Docker daemon."
            else
                ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
            fi
        fi

        if command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>&1; then
            ok "Docker Compose available"
        else
            warn "Docker Compose not found (optional)"
        fi
    else
        debug "Skipping Docker check (--skip-docker)"
    fi
}

# ---------------------------------------------------------------------------
# Step 2: Create directory structure
# ---------------------------------------------------------------------------
create_directory_structure() {
    log "Creating directory structure..."

    local dirs=(
        "src/controllers"
        "src/models"
        "src/services"
        "src/middleware"
        "src/routes"
        "src/utils"
        "src/config"
        "src/types"
        "tests/unit"
        "tests/integration"
        "tests/fixtures"
        "docs"
        "scripts"
        "config"
        "migrations"
        "seeds"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "${PROJECT_ROOT}/${dir}"
        debug "Created ${dir}/"
    done

    ok "Directory structure created (${#dirs[@]} directories)"
}

# ---------------------------------------------------------------------------
# Step 3: Initialize Git repository
# ---------------------------------------------------------------------------
init_git() {
    log "Initializing Git repository..."

    cd "$PROJECT_ROOT"

    if [[ -d ".git" ]]; then
        ok "Git repository already initialized"
    else
        git init
        ok "Git repository initialized"
    fi

    # Create .gitignore if it doesn't exist
    if [[ ! -f ".gitignore" ]]; then
        cat > .gitignore << 'GITIGNORE'
# Dependencies
node_modules/
package-lock.json

# Build output
dist/
build/
.next/

# Environment files (NEVER commit secrets)
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Test coverage
coverage/
.nyc_output/

# Docker
docker-compose.override.yml

# Terraform
.terraform/
*.tfstate
*.tfstate.backup
*.tfvars
!*.tfvars.example
GITIGNORE
        ok "Created .gitignore"
    else
        debug ".gitignore already exists"
    fi
}

# ---------------------------------------------------------------------------
# Step 4: Install dependencies
# ---------------------------------------------------------------------------
install_dependencies() {
    log "Installing dependencies..."

    cd "$PROJECT_ROOT"

    if [[ ! -f "package.json" ]]; then
        warn "No package.json found — skipping npm install"
        warn "Run 'npm init -y' to create one, then re-run this script"
        return 0
    fi

    # Use npm ci for reproducible installs if lock file exists
    if [[ -f "package-lock.json" ]]; then
        npm ci --loglevel=warn 2>&1 | tee -a "$LOG_FILE"
    else
        npm install --loglevel=warn 2>&1 | tee -a "$LOG_FILE"
    fi

    ok "Dependencies installed"
}

# ---------------------------------------------------------------------------
# Step 5: Create .env from template
# ---------------------------------------------------------------------------
create_env_file() {
    log "Setting up environment file..."

    cd "$PROJECT_ROOT"

    local env_example=".env.example"
    local env_file=".env"

    # Create .env.example if it doesn't exist
    if [[ ! -f "$env_example" ]]; then
        cat > "$env_example" << 'ENVTEMPLATE'
# =============================================================================
# Application Configuration
# =============================================================================
# Copy this file to .env and fill in the values.
# NEVER commit .env to version control.
# =============================================================================

# --- Application ---
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# --- Database ---
DATABASE_URL=postgresql://user:password@localhost:5432/myapp_dev
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# --- Redis ---
REDIS_URL=redis://localhost:6379

# --- Auth ---
JWT_SECRET=change-me-to-a-random-string
JWT_EXPIRES_IN=7d

# --- External Services ---
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=us-east-1
# S3_BUCKET=

# --- Email ---
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
# EMAIL_FROM=noreply@example.com
ENVTEMPLATE
        ok "Created .env.example template"
    fi

    # Copy to .env if it doesn't exist
    if [[ ! -f "$env_file" ]]; then
        cp "$env_example" "$env_file"
        ok "Created .env from .env.example"
        warn "Edit .env and fill in your local values before starting the app"
    else
        # Check for any new variables in .env.example that are missing from .env
        local missing_vars=()
        while IFS= read -r line; do
            # Skip comments and empty lines
            [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
            local var_name="${line%%=*}"
            if ! grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
                missing_vars+=("$var_name")
            fi
        done < "$env_example"

        if [[ ${#missing_vars[@]} -gt 0 ]]; then
            warn "New variables in .env.example not yet in .env:"
            for var in "${missing_vars[@]}"; do
                warn "  - ${var}"
            done
        else
            ok ".env is up to date with .env.example"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Step 6: Setup pre-commit hooks
# ---------------------------------------------------------------------------
setup_hooks() {
    if [[ "$SKIP_HOOKS" == true ]]; then
        debug "Skipping hook setup (--skip-hooks)"
        return 0
    fi

    log "Setting up pre-commit hooks..."

    cd "$PROJECT_ROOT"

    # Check if husky is available
    if [[ ! -f "package.json" ]]; then
        warn "No package.json — skipping hook setup"
        return 0
    fi

    # Install husky if not already a dependency
    if ! npm ls husky &>/dev/null 2>&1; then
        log "Installing husky..."
        npm install --save-dev husky 2>&1 | tee -a "$LOG_FILE"
    fi

    # Install lint-staged if not already a dependency
    if ! npm ls lint-staged &>/dev/null 2>&1; then
        log "Installing lint-staged..."
        npm install --save-dev lint-staged 2>&1 | tee -a "$LOG_FILE"
    fi

    # Initialize husky
    npx husky init 2>/dev/null || npx husky install 2>/dev/null || true

    # Create pre-commit hook
    local hook_dir=".husky"
    mkdir -p "$hook_dir"

    cat > "${hook_dir}/pre-commit" << 'HOOK'
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

# Run lint-staged to lint and format only staged files
npx lint-staged

# Run type checking
npx tsc --noEmit 2>/dev/null || true
HOOK
    chmod +x "${hook_dir}/pre-commit"

    # Create commit-msg hook for conventional commits
    cat > "${hook_dir}/commit-msg" << 'HOOK'
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

# Enforce conventional commit format
commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,72}"

if ! echo "$commit_msg" | grep -Eq "$pattern"; then
    echo "ERROR: Commit message does not follow Conventional Commits format."
    echo ""
    echo "Expected: <type>(<scope>): <description>"
    echo "Example:  feat(auth): add JWT refresh token support"
    echo ""
    echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    exit 1
fi
HOOK
    chmod +x "${hook_dir}/commit-msg"

    ok "Pre-commit hooks configured (husky + lint-staged)"
}

# ---------------------------------------------------------------------------
# Step 7: Final verification
# ---------------------------------------------------------------------------
verify_setup() {
    log "Verifying setup..."

    cd "$PROJECT_ROOT"

    local checks_passed=0
    local checks_total=0

    # Check directory structure
    checks_total=$((checks_total + 1))
    if [[ -d "src" && -d "tests" ]]; then
        checks_passed=$((checks_passed + 1))
        debug "Directory structure OK"
    else
        warn "Directory structure incomplete"
    fi

    # Check git
    checks_total=$((checks_total + 1))
    if [[ -d ".git" ]]; then
        checks_passed=$((checks_passed + 1))
        debug "Git repository OK"
    else
        warn "Git not initialized"
    fi

    # Check .env
    checks_total=$((checks_total + 1))
    if [[ -f ".env" ]]; then
        checks_passed=$((checks_passed + 1))
        debug ".env file OK"
    else
        warn ".env file missing"
    fi

    # Check node_modules
    checks_total=$((checks_total + 1))
    if [[ -d "node_modules" ]]; then
        checks_passed=$((checks_passed + 1))
        debug "node_modules OK"
    else
        warn "Dependencies not installed"
    fi

    # Check .gitignore
    checks_total=$((checks_total + 1))
    if [[ -f ".gitignore" ]]; then
        # Verify .env is in .gitignore
        if grep -q "^\.env$" .gitignore 2>/dev/null; then
            checks_passed=$((checks_passed + 1))
            debug ".gitignore includes .env"
        else
            warn ".gitignore does not include .env — secrets may be committed!"
        fi
    else
        warn ".gitignore missing"
    fi

    echo ""
    echo "=============================================="
    if [[ "$checks_passed" -eq "$checks_total" ]]; then
        ok "Setup complete! ${checks_passed}/${checks_total} checks passed"
    else
        warn "Setup complete with warnings: ${checks_passed}/${checks_total} checks passed"
    fi
    echo "=============================================="
    echo ""
    log "Log saved to: ${LOG_FILE}"
    echo ""
    log "Next steps:"
    echo "  1. Edit .env with your local configuration"
    echo "  2. Run 'npm run dev' to start the development server"
    echo "  3. Run 'npm test' to verify tests pass"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo ""
    echo "=============================================="
    echo "  Project Bootstrap"
    echo "=============================================="
    echo ""

    # Truncate log file
    : > "$LOG_FILE"

    parse_args "$@"

    check_prerequisites
    create_directory_structure
    init_git
    install_dependencies
    create_env_file
    setup_hooks
    verify_setup
}

main "$@"
