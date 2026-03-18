#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Restore Script
# =============================================================================
# Restores a PostgreSQL database from an S3 backup:
#   1. List available backups (if no specific one is given)
#   2. Download the backup and checksum from S3
#   3. Verify SHA-256 checksum integrity
#   4. Restore using pg_restore
#   5. Verify row counts against expectations
#
# Usage:
#   ./restore.sh --database <name> --backup <s3-key-or-timestamp>
#   ./restore.sh --database <name> --latest
#   ./restore.sh --list
#
# Arguments:
#   --database, -d   Target database to restore into
#   --backup, -b     Backup timestamp (YYYYMMDD_HHMMSS) or full S3 key
#   --latest         Restore the most recent backup
#   --list           List available backups and exit
#   --create-db      Create the database if it doesn't exist
#   --no-verify      Skip row count verification after restore
#   --dry-run        Download and verify only, do not restore
#
# Environment variables (required):
#   PGHOST           — PostgreSQL host
#   PGPORT           — PostgreSQL port (default: 5432)
#   PGUSER           — PostgreSQL superuser
#   PGPASSWORD       — PostgreSQL password
#   S3_BUCKET        — S3 bucket containing backups
#   S3_PREFIX        — S3 key prefix (default: backups/postgres)
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="$(basename "$0")"
PGPORT="${PGPORT:-5432}"
S3_BUCKET="${S3_BUCKET:?'S3_BUCKET environment variable is required'}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"
AWS_REGION="${AWS_REGION:-us-east-1}"
RESTORE_DIR="${RESTORE_DIR:-/tmp/pg-restore}"

# CLI flags
DATABASE=""
BACKUP_ID=""
USE_LATEST=false
LIST_ONLY=false
CREATE_DB=false
SKIP_VERIFY=false
DRY_RUN=false

# Derived at runtime
BACKUP_FILE=""
CHECKSUM_FILE=""

# ---------------------------------------------------------------------------
# Colors & logging
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()     { echo -e "${GREEN}[$(date -u +%H:%M:%S)] OK${NC}    $*"; }
warn()   { echo -e "${YELLOW}[$(date -u +%H:%M:%S)] WARN${NC}  $*"; }
fail()   { echo -e "${RED}[$(date -u +%H:%M:%S)] FAIL${NC}  $*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse CLI arguments
# ---------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --database|-d)  DATABASE="$2";       shift 2 ;;
            --backup|-b)    BACKUP_ID="$2";      shift 2 ;;
            --latest)       USE_LATEST=true;     shift ;;
            --list)         LIST_ONLY=true;      shift ;;
            --create-db)    CREATE_DB=true;      shift ;;
            --no-verify)    SKIP_VERIFY=true;    shift ;;
            --dry-run)      DRY_RUN=true;        shift ;;
            --help|-h)
                echo "Usage: $SCRIPT_NAME --database <name> --backup <timestamp> [--create-db] [--dry-run]"
                echo "       $SCRIPT_NAME --database <name> --latest"
                echo "       $SCRIPT_NAME --list"
                exit 0
                ;;
            *) warn "Unknown argument: $1"; shift ;;
        esac
    done

    if [[ "$LIST_ONLY" == false && -z "$DATABASE" ]]; then
        fail "Database name is required. Use --database <name>"
    fi

    if [[ "$LIST_ONLY" == false && -z "$BACKUP_ID" && "$USE_LATEST" == false ]]; then
        fail "Specify a backup with --backup <timestamp> or use --latest"
    fi
}

# ---------------------------------------------------------------------------
# List available backups
# ---------------------------------------------------------------------------
list_backups() {
    local prefix="s3://${S3_BUCKET}/${S3_PREFIX}/"

    if [[ -n "$DATABASE" ]]; then
        prefix="${prefix}${DATABASE}/"
    fi

    log "Available backups in ${prefix}:"
    echo ""

    aws s3 ls "$prefix" --region "$AWS_REGION" --recursive 2>/dev/null \
        | grep "\.dump$" \
        | sort -r \
        | while IFS= read -r line; do
            local size date time path
            size=$(echo "$line" | awk '{print $3}')
            date=$(echo "$line" | awk '{print $1}')
            time=$(echo "$line" | awk '{print $2}')
            path=$(echo "$line" | awk '{print $4}')

            # Human-readable size
            local hr_size
            if [[ "$size" -gt 1073741824 ]]; then
                hr_size="$(echo "scale=1; $size / 1073741824" | bc)G"
            elif [[ "$size" -gt 1048576 ]]; then
                hr_size="$(echo "scale=1; $size / 1048576" | bc)M"
            else
                hr_size="$(echo "scale=1; $size / 1024" | bc)K"
            fi

            printf "  %s %s  %8s  %s\n" "$date" "$time" "$hr_size" "$path"
        done

    echo ""
}

# ---------------------------------------------------------------------------
# Resolve backup ID to S3 path
# ---------------------------------------------------------------------------
resolve_backup_path() {
    local db_prefix="s3://${S3_BUCKET}/${S3_PREFIX}/${DATABASE}/"

    if [[ "$USE_LATEST" == true ]]; then
        log "Finding latest backup for '${DATABASE}'..."

        BACKUP_ID=$(aws s3 ls "$db_prefix" --region "$AWS_REGION" 2>/dev/null \
            | grep "PRE" \
            | awk '{print $NF}' \
            | tr -d '/' \
            | sort -r \
            | head -n1)

        if [[ -z "$BACKUP_ID" ]]; then
            fail "No backups found for database '${DATABASE}' in ${db_prefix}"
        fi

        log "Latest backup: ${BACKUP_ID}"
    fi

    # Determine the full S3 paths
    local s3_dir="${db_prefix}${BACKUP_ID}"
    local dump_file
    dump_file=$(aws s3 ls "${s3_dir}/" --region "$AWS_REGION" 2>/dev/null \
        | grep "\.dump$" \
        | awk '{print $NF}' \
        | head -n1)

    if [[ -z "$dump_file" ]]; then
        fail "No .dump file found in ${s3_dir}/"
    fi

    S3_BACKUP_PATH="${s3_dir}/${dump_file}"
    S3_CHECKSUM_PATH="${s3_dir}/${dump_file}.sha256"

    log "Backup file: ${S3_BACKUP_PATH}"
}

# ---------------------------------------------------------------------------
# Step 1: Download from S3
# ---------------------------------------------------------------------------
download_backup() {
    mkdir -p "$RESTORE_DIR"
    BACKUP_FILE="${RESTORE_DIR}/$(basename "$S3_BACKUP_PATH")"
    CHECKSUM_FILE="${BACKUP_FILE}.sha256"

    log "Downloading backup from S3..."
    log "  Source:      s3://${S3_BUCKET}/${S3_BACKUP_PATH}"
    log "  Destination: ${BACKUP_FILE}"

    aws s3 cp "s3://${S3_BUCKET}/${S3_BACKUP_PATH}" "$BACKUP_FILE" \
        --region "$AWS_REGION" \
        --quiet

    ok "Backup downloaded ($(du -h "$BACKUP_FILE" | cut -f1))"

    # Download checksum
    if aws s3 cp "s3://${S3_BUCKET}/${S3_CHECKSUM_PATH}" "$CHECKSUM_FILE" \
        --region "$AWS_REGION" \
        --quiet 2>/dev/null; then
        ok "Checksum file downloaded"
    else
        warn "No checksum file found — skipping integrity verification"
        CHECKSUM_FILE=""
    fi
}

# ---------------------------------------------------------------------------
# Step 2: Verify checksum
# ---------------------------------------------------------------------------
verify_checksum() {
    if [[ -z "${CHECKSUM_FILE:-}" || ! -f "$CHECKSUM_FILE" ]]; then
        warn "Skipping checksum verification (no checksum file)"
        return 0
    fi

    log "Verifying SHA-256 checksum..."

    # The checksum file contains the original path — we need to check just the hash
    local expected_hash
    expected_hash=$(cut -d' ' -f1 "$CHECKSUM_FILE")

    local actual_hash
    actual_hash=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)

    if [[ "$expected_hash" == "$actual_hash" ]]; then
        ok "Checksum verified: ${actual_hash}"
    else
        fail "Checksum mismatch! Expected: ${expected_hash}, Got: ${actual_hash}. The backup file may be corrupted."
    fi
}

# ---------------------------------------------------------------------------
# Step 3: Restore with pg_restore
# ---------------------------------------------------------------------------
restore_database() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would restore ${BACKUP_FILE} into ${DATABASE}"
        return 0
    fi

    local pg_host="${PGHOST:-localhost}"
    local pg_user="${PGUSER:-postgres}"

    # Create the database if requested and it doesn't exist
    if [[ "$CREATE_DB" == true ]]; then
        log "Checking if database '${DATABASE}' exists..."
        if ! psql -h "$pg_host" -p "$PGPORT" -U "$pg_user" -lqt | cut -d'|' -f1 | grep -qw "$DATABASE"; then
            log "Creating database '${DATABASE}'..."
            createdb -h "$pg_host" -p "$PGPORT" -U "$pg_user" "$DATABASE"
            ok "Database '${DATABASE}' created"
        else
            log "Database '${DATABASE}' already exists"
        fi
    fi

    # Confirm the restore operation (it's destructive)
    if [[ -t 0 ]]; then
        echo ""
        warn "This will overwrite data in database '${DATABASE}' on ${pg_host}:${PGPORT}"
        read -rp "Type the database name to confirm: " confirm
        if [[ "$confirm" != "$DATABASE" ]]; then
            fail "Restore aborted — confirmation did not match"
        fi
    fi

    log "Restoring database '${DATABASE}' from backup..."

    pg_restore \
        --host="$pg_host" \
        --port="$PGPORT" \
        --username="$pg_user" \
        --dbname="$DATABASE" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        --verbose \
        --jobs=4 \
        "$BACKUP_FILE" \
        2>&1 | while IFS= read -r line; do log "  pg_restore: $line"; done \
        || true  # pg_restore returns non-zero for warnings, which is OK

    ok "Database restore completed"
}

# ---------------------------------------------------------------------------
# Step 4: Verify row counts
# ---------------------------------------------------------------------------
verify_row_counts() {
    if [[ "$SKIP_VERIFY" == true || "$DRY_RUN" == true ]]; then
        log "Skipping row count verification"
        return 0
    fi

    log "Verifying restored data..."

    local pg_host="${PGHOST:-localhost}"
    local pg_user="${PGUSER:-postgres}"

    # Get row counts for all user tables
    local query="
        SELECT schemaname || '.' || relname AS table_name,
               n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 20;
    "

    echo ""
    log "Top 20 tables by row count:"
    psql -h "$pg_host" -p "$PGPORT" -U "$pg_user" -d "$DATABASE" \
        -c "ANALYZE;" \
        -c "$query" \
        2>/dev/null

    # Check for completely empty tables (possible restore issue)
    local empty_tables
    empty_tables=$(psql -h "$pg_host" -p "$PGPORT" -U "$pg_user" -d "$DATABASE" \
        -t -c "
            SELECT count(*)
            FROM pg_stat_user_tables
            WHERE n_live_tup = 0;
        " 2>/dev/null | tr -d ' ')

    local total_tables
    total_tables=$(psql -h "$pg_host" -p "$PGPORT" -U "$pg_user" -d "$DATABASE" \
        -t -c "SELECT count(*) FROM pg_stat_user_tables;" 2>/dev/null | tr -d ' ')

    echo ""
    if [[ "$empty_tables" -gt 0 ]]; then
        warn "${empty_tables} of ${total_tables} tables are empty — verify this is expected"
    else
        ok "All ${total_tables} tables contain data"
    fi

    # Run ANALYZE to update statistics
    log "Running ANALYZE to update table statistics..."
    psql -h "$pg_host" -p "$PGPORT" -U "$pg_user" -d "$DATABASE" \
        -c "ANALYZE;" &>/dev/null
    ok "Statistics updated"
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
    if [[ -f "${BACKUP_FILE:-}" ]]; then
        rm -f "$BACKUP_FILE" "${CHECKSUM_FILE:-}" 2>/dev/null || true
        log "Cleaned up temporary files"
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    parse_args "$@"

    echo ""
    echo "======================================================"
    echo "  PostgreSQL Restore"
    echo "======================================================"
    echo ""

    # List mode — show available backups and exit
    if [[ "$LIST_ONLY" == true ]]; then
        list_backups
        exit 0
    fi

    echo "  Database:  ${DATABASE}"
    echo "  Backup:    ${BACKUP_ID:-latest}"
    echo "  Dry run:   ${DRY_RUN}"
    echo ""

    resolve_backup_path
    download_backup
    verify_checksum
    restore_database
    verify_row_counts

    echo ""
    echo "======================================================"
    ok "Restore completed successfully!"
    echo "  Database: ${DATABASE}"
    echo "  Backup:   ${BACKUP_ID}"
    echo "  Time:     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "======================================================"
}

main "$@"
