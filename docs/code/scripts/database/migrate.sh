#!/usr/bin/env bash
# =============================================================================
# Database Migration Script
# =============================================================================
# Manages PostgreSQL schema migrations with the following features:
#   1. Run pending migrations in order
#   2. Verify schema after migration
#   3. Rollback support (undo last N migrations)
#   4. Dry-run mode (show what would be executed)
#   5. Migration status reporting
#
# Migration files follow the naming convention:
#   YYYYMMDDHHMMSS_description.up.sql   — forward migration
#   YYYYMMDDHHMMSS_description.down.sql — rollback migration
#
# Usage:
#   ./migrate.sh up                    Run all pending migrations
#   ./migrate.sh up --steps 1          Run only the next pending migration
#   ./migrate.sh down --steps 1        Rollback the last migration
#   ./migrate.sh down --steps 3        Rollback the last 3 migrations
#   ./migrate.sh status                Show migration status
#   ./migrate.sh create <name>         Create a new migration pair
#   ./migrate.sh verify                Verify schema integrity
#   ./migrate.sh up --dry-run          Show pending migrations without running
#
# Environment variables:
#   DATABASE_URL   — PostgreSQL connection string
#   MIGRATIONS_DIR — Directory containing migration files (default: ./migrations)
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-${PROJECT_ROOT}/migrations}"
DATABASE_URL="${DATABASE_URL:-}"

# Parse DATABASE_URL components (or use PG* env vars)
if [[ -n "$DATABASE_URL" ]]; then
    # Extract components from postgresql://user:pass@host:port/dbname
    PGUSER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
    PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
    PGHOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    PGPORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    PGDATABASE=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
    export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-myapp}"

# CLI arguments
COMMAND=""
STEPS=0  # 0 means "all"
DRY_RUN=false
MIGRATION_NAME=""

# Tracking table for applied migrations
readonly MIGRATIONS_TABLE="schema_migrations"

# ---------------------------------------------------------------------------
# Colors & logging
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${BLUE}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()     { echo -e "${GREEN}[$(date -u +%H:%M:%S)] OK${NC}    $*"; }
warn()   { echo -e "${YELLOW}[$(date -u +%H:%M:%S)] WARN${NC}  $*"; }
fail()   { echo -e "${RED}[$(date -u +%H:%M:%S)] FAIL${NC}  $*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse CLI arguments
# ---------------------------------------------------------------------------
parse_args() {
    if [[ $# -lt 1 ]]; then
        usage
        exit 1
    fi

    COMMAND="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --steps|-n)  STEPS="$2";        shift 2 ;;
            --dry-run)   DRY_RUN=true;      shift ;;
            --help|-h)   usage; exit 0 ;;
            *)
                # For "create" command, the next arg is the migration name
                if [[ "$COMMAND" == "create" && -z "$MIGRATION_NAME" ]]; then
                    MIGRATION_NAME="$1"
                    shift
                else
                    warn "Unknown argument: $1"
                    shift
                fi
                ;;
        esac
    done
}

usage() {
    cat << EOF
Usage: $SCRIPT_NAME <command> [options]

Commands:
  up        Run pending forward migrations
  down      Rollback migrations
  status    Show migration status
  create    Create a new migration pair
  verify    Verify database schema integrity

Options:
  --steps, -n <N>   Number of migrations to run/rollback (default: all for up, 1 for down)
  --dry-run         Show what would be executed without making changes
  --help, -h        Show this help message

Examples:
  $SCRIPT_NAME up                    # Run all pending migrations
  $SCRIPT_NAME up --steps 1          # Run next pending migration only
  $SCRIPT_NAME down --steps 1        # Rollback last migration
  $SCRIPT_NAME status                # Show which migrations have been applied
  $SCRIPT_NAME create add_users      # Create new migration files
  $SCRIPT_NAME up --dry-run          # Preview pending migrations
EOF
}

# ---------------------------------------------------------------------------
# Execute SQL against the database
# ---------------------------------------------------------------------------
run_sql() {
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        --no-psqlrc --quiet --tuples-only --no-align \
        -c "$1" 2>/dev/null
}

run_sql_file() {
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        --no-psqlrc --quiet --single-transaction \
        -v ON_ERROR_STOP=1 \
        -f "$1"
}

# ---------------------------------------------------------------------------
# Initialize migrations tracking table
# ---------------------------------------------------------------------------
init_migrations_table() {
    run_sql "
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            version     VARCHAR(14) PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    " || fail "Could not create migrations table"
}

# ---------------------------------------------------------------------------
# Get list of applied migration versions
# ---------------------------------------------------------------------------
get_applied_versions() {
    run_sql "SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version;"
}

# ---------------------------------------------------------------------------
# Get list of available migration files
# ---------------------------------------------------------------------------
get_available_migrations() {
    local direction="${1:-up}"
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        return 0
    fi
    # Return just the version number and full filename
    find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.${direction}.sql" -printf "%f\n" 2>/dev/null \
        | sort \
        || ls "$MIGRATIONS_DIR"/*.${direction}.sql 2>/dev/null \
        | xargs -I{} basename {} \
        | sort
}

# ---------------------------------------------------------------------------
# Command: status
# ---------------------------------------------------------------------------
cmd_status() {
    log "Migration status for '${PGDATABASE}':"
    echo ""

    init_migrations_table

    local applied
    applied=$(get_applied_versions)
    local available
    available=$(get_available_migrations "up")

    local total=0
    local applied_count=0
    local pending_count=0

    printf "  %-16s %-40s %-10s %s\n" "VERSION" "NAME" "STATUS" "APPLIED AT"
    printf "  %-16s %-40s %-10s %s\n" "-------" "----" "------" "----------"

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        total=$((total + 1))

        local version
        version=$(echo "$file" | cut -d'_' -f1)
        local name
        name=$(echo "$file" | sed "s/^${version}_//;s/\.up\.sql$//")

        if echo "$applied" | grep -q "^${version}$"; then
            local applied_at
            applied_at=$(run_sql "SELECT applied_at FROM ${MIGRATIONS_TABLE} WHERE version = '${version}';")
            printf "  %-16s %-40s ${GREEN}%-10s${NC} %s\n" "$version" "$name" "applied" "$applied_at"
            applied_count=$((applied_count + 1))
        else
            printf "  %-16s %-40s ${YELLOW}%-10s${NC}\n" "$version" "$name" "pending"
            pending_count=$((pending_count + 1))
        fi
    done <<< "$available"

    echo ""
    log "Total: ${total} | Applied: ${applied_count} | Pending: ${pending_count}"
}

# ---------------------------------------------------------------------------
# Command: up — run forward migrations
# ---------------------------------------------------------------------------
cmd_up() {
    init_migrations_table

    local applied
    applied=$(get_applied_versions)
    local available
    available=$(get_available_migrations "up")

    # Find pending migrations
    local pending=()
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        local version
        version=$(echo "$file" | cut -d'_' -f1)
        if ! echo "$applied" | grep -q "^${version}$"; then
            pending+=("$file")
        fi
    done <<< "$available"

    if [[ ${#pending[@]} -eq 0 ]]; then
        ok "No pending migrations"
        return 0
    fi

    # Apply step limit
    local to_apply=("${pending[@]}")
    if [[ "$STEPS" -gt 0 && "$STEPS" -lt ${#pending[@]} ]]; then
        to_apply=("${pending[@]:0:$STEPS}")
    fi

    log "Pending migrations: ${#pending[@]} | Running: ${#to_apply[@]}"
    echo ""

    for file in "${to_apply[@]}"; do
        local version
        version=$(echo "$file" | cut -d'_' -f1)
        local name
        name=$(echo "$file" | sed "s/^${version}_//;s/\.up\.sql$//")
        local filepath="${MIGRATIONS_DIR}/${file}"

        if [[ ! -f "$filepath" ]]; then
            fail "Migration file not found: ${filepath}"
        fi

        log "Running: ${CYAN}${version}${NC} — ${name}"

        if [[ "$DRY_RUN" == true ]]; then
            log "[DRY RUN] Would execute: ${filepath}"
            echo "  ---"
            head -20 "$filepath" | sed 's/^/  /'
            echo "  ..."
            echo ""
            continue
        fi

        # Execute the migration in a transaction
        if run_sql_file "$filepath"; then
            # Record the migration as applied
            run_sql "INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES ('${version}', '${name}');"
            ok "Applied: ${version} — ${name}"
        else
            fail "Migration failed: ${version} — ${name}. Database is unchanged (transaction rolled back)."
        fi
    done

    echo ""
    ok "All migrations applied successfully"
}

# ---------------------------------------------------------------------------
# Command: down — rollback migrations
# ---------------------------------------------------------------------------
cmd_down() {
    init_migrations_table

    # Default to 1 step for rollback (safety first)
    if [[ "$STEPS" -eq 0 ]]; then
        STEPS=1
    fi

    # Get applied migrations in reverse order
    local applied_reversed
    applied_reversed=$(run_sql "SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version DESC LIMIT ${STEPS};")

    if [[ -z "$applied_reversed" ]]; then
        ok "No migrations to rollback"
        return 0
    fi

    local count
    count=$(echo "$applied_reversed" | wc -l | tr -d ' ')
    log "Rolling back ${count} migration(s)..."

    # Confirm rollback
    if [[ "$DRY_RUN" == false && -t 0 ]]; then
        warn "This will rollback ${count} migration(s). This may cause data loss!"
        read -rp "Type 'rollback' to confirm: " confirm
        if [[ "$confirm" != "rollback" ]]; then
            fail "Rollback aborted"
        fi
    fi

    echo ""

    while IFS= read -r version; do
        [[ -z "$version" ]] && continue

        # Find the corresponding down migration file
        local down_file
        down_file=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "${version}_*.down.sql" -printf "%f\n" 2>/dev/null \
            | head -n1 \
            || ls "$MIGRATIONS_DIR"/${version}_*.down.sql 2>/dev/null | xargs -I{} basename {} | head -n1)

        if [[ -z "$down_file" ]]; then
            fail "No rollback file found for version ${version}. Expected: ${MIGRATIONS_DIR}/${version}_*.down.sql"
        fi

        local name
        name=$(echo "$down_file" | sed "s/^${version}_//;s/\.down\.sql$//")
        local filepath="${MIGRATIONS_DIR}/${down_file}"

        log "Rolling back: ${CYAN}${version}${NC} — ${name}"

        if [[ "$DRY_RUN" == true ]]; then
            log "[DRY RUN] Would execute: ${filepath}"
            echo "  ---"
            head -20 "$filepath" | sed 's/^/  /'
            echo "  ..."
            echo ""
            continue
        fi

        if run_sql_file "$filepath"; then
            run_sql "DELETE FROM ${MIGRATIONS_TABLE} WHERE version = '${version}';"
            ok "Rolled back: ${version} — ${name}"
        else
            fail "Rollback failed: ${version} — ${name}"
        fi
    done <<< "$applied_reversed"

    echo ""
    ok "Rollback completed"
}

# ---------------------------------------------------------------------------
# Command: create — create new migration files
# ---------------------------------------------------------------------------
cmd_create() {
    if [[ -z "$MIGRATION_NAME" ]]; then
        fail "Migration name is required. Usage: $SCRIPT_NAME create <name>"
    fi

    mkdir -p "$MIGRATIONS_DIR"

    local version
    version=$(date -u +%Y%m%d%H%M%S)
    # Sanitize name: lowercase, replace spaces/special chars with underscores
    local safe_name
    safe_name=$(echo "$MIGRATION_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')

    local up_file="${MIGRATIONS_DIR}/${version}_${safe_name}.up.sql"
    local down_file="${MIGRATIONS_DIR}/${version}_${safe_name}.down.sql"

    # Create up migration
    cat > "$up_file" << EOF
-- =============================================================================
-- Migration: ${safe_name}
-- Version:   ${version}
-- Direction: UP
-- Created:   $(date -u +%Y-%m-%dT%H:%M:%SZ)
-- =============================================================================
-- Write your forward migration SQL here.
-- This file runs inside a transaction — if any statement fails, all changes
-- are rolled back automatically.
-- =============================================================================

-- Example:
-- CREATE TABLE IF NOT EXISTS users (
--     id          BIGSERIAL PRIMARY KEY,
--     email       VARCHAR(255) NOT NULL UNIQUE,
--     name        VARCHAR(255) NOT NULL,
--     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
--
-- CREATE INDEX idx_users_email ON users (email);
EOF

    # Create down migration
    cat > "$down_file" << EOF
-- =============================================================================
-- Migration: ${safe_name}
-- Version:   ${version}
-- Direction: DOWN (rollback)
-- Created:   $(date -u +%Y-%m-%dT%H:%M:%SZ)
-- =============================================================================
-- Write your rollback SQL here.
-- This must undo everything done by the corresponding .up.sql file.
-- =============================================================================

-- Example:
-- DROP TABLE IF EXISTS users;
EOF

    ok "Created migration files:"
    echo "  UP:   ${up_file}"
    echo "  DOWN: ${down_file}"
}

# ---------------------------------------------------------------------------
# Command: verify — check schema integrity
# ---------------------------------------------------------------------------
cmd_verify() {
    log "Verifying database schema..."
    echo ""

    init_migrations_table

    local errors=0

    # Check 1: All applied migrations have corresponding files
    log "Checking applied migrations have source files..."
    local applied
    applied=$(get_applied_versions)
    while IFS= read -r version; do
        [[ -z "$version" ]] && continue
        local up_file
        up_file=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "${version}_*.up.sql" 2>/dev/null | head -n1)
        local down_file
        down_file=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "${version}_*.down.sql" 2>/dev/null | head -n1)

        if [[ -z "$up_file" ]]; then
            warn "Applied migration ${version} has no .up.sql file!"
            errors=$((errors + 1))
        fi
        if [[ -z "$down_file" ]]; then
            warn "Applied migration ${version} has no .down.sql file (cannot rollback)"
        fi
    done <<< "$applied"

    # Check 2: No gaps in applied migrations
    log "Checking for gaps in migration sequence..."
    local available_versions
    available_versions=$(get_available_migrations "up" | cut -d'_' -f1)
    local in_sequence=true
    while IFS= read -r version; do
        [[ -z "$version" ]] && continue
        if echo "$applied" | grep -q "^${version}$"; then
            if [[ "$in_sequence" == false ]]; then
                warn "Gap detected: migration ${version} is applied but earlier migrations are not"
                errors=$((errors + 1))
            fi
        else
            in_sequence=false
        fi
    done <<< "$available_versions"

    # Check 3: Database tables exist
    log "Checking database tables..."
    local table_count
    table_count=$(run_sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
    log "  Tables in 'public' schema: ${table_count}"

    # Check 4: Invalid indexes
    log "Checking for invalid indexes..."
    local invalid_indexes
    invalid_indexes=$(run_sql "SELECT count(*) FROM pg_index WHERE NOT indisvalid;")
    if [[ "$invalid_indexes" -gt 0 ]]; then
        warn "${invalid_indexes} invalid index(es) found — run REINDEX"
        errors=$((errors + 1))
    else
        ok "All indexes valid"
    fi

    # Check 5: Unlogged tables (not replicated, data lost on crash)
    log "Checking for unlogged tables..."
    local unlogged_count
    unlogged_count=$(run_sql "SELECT count(*) FROM pg_class WHERE relpersistence = 'u' AND relkind = 'r';")
    if [[ "$unlogged_count" -gt 0 ]]; then
        warn "${unlogged_count} unlogged table(s) found — data will be lost on crash"
    fi

    echo ""
    if [[ "$errors" -eq 0 ]]; then
        ok "Schema verification passed — no issues found"
    else
        warn "Schema verification completed with ${errors} issue(s)"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    parse_args "$@"

    # Verify connectivity
    if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" &>/dev/null; then
        fail "Cannot connect to PostgreSQL at ${PGHOST}:${PGPORT}/${PGDATABASE}"
    fi

    case "$COMMAND" in
        up)       cmd_up ;;
        down)     cmd_down ;;
        status)   cmd_status ;;
        create)   cmd_create ;;
        verify)   cmd_verify ;;
        *)
            fail "Unknown command: '${COMMAND}'. Use: up | down | status | create | verify"
            ;;
    esac
}

main "$@"
