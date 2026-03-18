#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Backup Script
# =============================================================================
# Creates a compressed PostgreSQL backup and uploads it to S3:
#   1. Run pg_dump with custom format (compressed)
#   2. Generate SHA-256 checksum for integrity verification
#   3. Upload backup + checksum to S3 with server-side encryption
#   4. Apply retention policy (delete backups older than N days)
#   5. Notify Slack on success or failure
#
# Usage:
#   ./backup.sh [--database <name>] [--retention <days>] [--dry-run]
#
# Environment variables (required):
#   PGHOST          — PostgreSQL host
#   PGPORT          — PostgreSQL port (default: 5432)
#   PGUSER          — PostgreSQL user
#   PGPASSWORD      — PostgreSQL password (or use .pgpass / PGPASSFILE)
#   S3_BUCKET       — S3 bucket name for backups
#   S3_PREFIX       — S3 key prefix (default: backups/postgres)
#
# Environment variables (optional):
#   SLACK_WEBHOOK_URL    — Slack webhook for notifications
#   AWS_REGION           — AWS region (default: us-east-1)
#   BACKUP_DIR           — Local temp directory for backups (default: /tmp/pg-backups)
#   RETENTION_DAYS       — Days to keep backups (default: 30)
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="$(basename "$0")"
readonly TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
readonly HOSTNAME="$(hostname -s 2>/dev/null || echo 'unknown')"

# Database settings
DATABASE="${PGDATABASE:-myapp}"
PGPORT="${PGPORT:-5432}"

# S3 settings
S3_BUCKET="${S3_BUCKET:?'S3_BUCKET environment variable is required'}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Local settings
BACKUP_DIR="${BACKUP_DIR:-/tmp/pg-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Flags
DRY_RUN=false

# Derived
BACKUP_FILE=""
CHECKSUM_FILE=""
BACKUP_SIZE=""

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
fail()   {
    echo -e "${RED}[$(date -u +%H:%M:%S)] FAIL${NC}  $*"
    notify_slack "failure" "$*"
    exit 1
}

# ---------------------------------------------------------------------------
# Parse CLI arguments
# ---------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --database|-d)
                DATABASE="$2"
                shift 2
                ;;
            --retention|-r)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help|-h)
                echo "Usage: $SCRIPT_NAME [--database <name>] [--retention <days>] [--dry-run]"
                exit 0
                ;;
            *)
                warn "Unknown argument: $1"
                shift
                ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# Prerequisites check
# ---------------------------------------------------------------------------
check_prerequisites() {
    log "Checking prerequisites..."

    for tool in pg_dump aws sha256sum; do
        if ! command -v "$tool" &>/dev/null; then
            fail "'${tool}' is required but not found in PATH"
        fi
    done

    # Verify PostgreSQL connectivity
    if ! pg_isready -h "${PGHOST:-localhost}" -p "$PGPORT" -U "${PGUSER:-postgres}" -d "$DATABASE" &>/dev/null; then
        fail "Cannot connect to PostgreSQL at ${PGHOST:-localhost}:${PGPORT}/${DATABASE}"
    fi

    # Verify S3 access
    if ! aws s3 ls "s3://${S3_BUCKET}" --region "$AWS_REGION" &>/dev/null; then
        fail "Cannot access S3 bucket: ${S3_BUCKET}"
    fi

    # Create local backup directory
    mkdir -p "$BACKUP_DIR"

    ok "Prerequisites OK"
}

# ---------------------------------------------------------------------------
# Step 1: Create PostgreSQL backup
# ---------------------------------------------------------------------------
create_backup() {
    BACKUP_FILE="${BACKUP_DIR}/${DATABASE}_${TIMESTAMP}.dump"
    CHECKSUM_FILE="${BACKUP_FILE}.sha256"

    log "Creating backup of database '${DATABASE}'..."
    log "Output file: ${BACKUP_FILE}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run pg_dump for ${DATABASE}"
        return 0
    fi

    # pg_dump with custom format (compressed, supports parallel restore)
    pg_dump \
        --host="${PGHOST:-localhost}" \
        --port="$PGPORT" \
        --username="${PGUSER:-postgres}" \
        --dbname="$DATABASE" \
        --format=custom \
        --compress=9 \
        --verbose \
        --no-owner \
        --no-privileges \
        --file="$BACKUP_FILE" \
        2>&1 | while IFS= read -r line; do log "  pg_dump: $line"; done

    # Verify the backup file was created and is not empty
    if [[ ! -s "$BACKUP_FILE" ]]; then
        fail "Backup file is empty or does not exist: ${BACKUP_FILE}"
    fi

    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    ok "Backup created (${BACKUP_SIZE})"

    # Generate checksum
    log "Generating SHA-256 checksum..."
    sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
    ok "Checksum: $(cat "$CHECKSUM_FILE" | cut -d' ' -f1)"
}

# ---------------------------------------------------------------------------
# Step 2: Upload to S3
# ---------------------------------------------------------------------------
upload_to_s3() {
    local s3_key="${S3_PREFIX}/${DATABASE}/${TIMESTAMP}"
    local s3_backup="s3://${S3_BUCKET}/${s3_key}/$(basename "$BACKUP_FILE")"
    local s3_checksum="s3://${S3_BUCKET}/${s3_key}/$(basename "$CHECKSUM_FILE")"

    log "Uploading backup to S3..."
    log "  Destination: ${s3_backup}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would upload to ${s3_backup}"
        return 0
    fi

    # Upload backup file with server-side encryption
    aws s3 cp "$BACKUP_FILE" "$s3_backup" \
        --region "$AWS_REGION" \
        --sse aws:kms \
        --storage-class STANDARD_IA \
        --metadata "database=${DATABASE},timestamp=${TIMESTAMP},host=${HOSTNAME}" \
        --quiet

    # Upload checksum file
    aws s3 cp "$CHECKSUM_FILE" "$s3_checksum" \
        --region "$AWS_REGION" \
        --sse aws:kms \
        --quiet

    ok "Upload complete: ${s3_backup}"
}

# ---------------------------------------------------------------------------
# Step 3: Apply retention policy
# ---------------------------------------------------------------------------
apply_retention() {
    log "Applying retention policy (keep ${RETENTION_DAYS} days)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would delete backups older than ${RETENTION_DAYS} days"
        return 0
    fi

    local cutoff_date
    cutoff_date=$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null \
        || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)  # macOS fallback

    local prefix="s3://${S3_BUCKET}/${S3_PREFIX}/${DATABASE}/"
    local deleted_count=0

    # List all backup prefixes and delete old ones
    aws s3 ls "$prefix" --region "$AWS_REGION" 2>/dev/null | while IFS= read -r line; do
        # Extract the directory name (format: YYYYMMDD_HHMMSS/)
        local dir_name
        dir_name=$(echo "$line" | awk '{print $NF}' | tr -d '/')
        local dir_date
        dir_date=$(echo "$dir_name" | cut -d'_' -f1)

        if [[ -n "$dir_date" && "$dir_date" < "$cutoff_date" ]]; then
            log "  Deleting old backup: ${dir_name}"
            aws s3 rm "${prefix}${dir_name}/" \
                --region "$AWS_REGION" \
                --recursive \
                --quiet
            deleted_count=$((deleted_count + 1))
        fi
    done

    # Clean up local backup files older than 1 day
    find "$BACKUP_DIR" -name "*.dump" -mtime +1 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.sha256" -mtime +1 -delete 2>/dev/null || true

    ok "Retention applied (deleted ${deleted_count} old backups)"
}

# ---------------------------------------------------------------------------
# Step 4: Notify Slack
# ---------------------------------------------------------------------------
notify_slack() {
    local status="$1"
    local message="${2:-}"
    local webhook="${SLACK_WEBHOOK_URL:-}"

    [[ -z "$webhook" ]] && return 0

    local color icon text
    if [[ "$status" == "success" ]]; then
        color="good"
        icon=":white_check_mark:"
        text="${icon} *PostgreSQL backup succeeded*\n*Database:* \`${DATABASE}\`\n*Size:* ${BACKUP_SIZE:-unknown}\n*Bucket:* \`${S3_BUCKET}\`\n*Host:* \`${HOSTNAME}\`"
    else
        color="danger"
        icon=":x:"
        text="${icon} *PostgreSQL backup FAILED*\n*Database:* \`${DATABASE}\`\n*Error:* ${message}\n*Host:* \`${HOSTNAME}\`"
    fi

    curl -s -X POST "$webhook" \
        -H 'Content-Type: application/json' \
        -d "{
            \"attachments\": [{
                \"color\": \"${color}\",
                \"text\": \"${text}\",
                \"footer\": \"pg-backup | $(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }]
        }" >/dev/null 2>&1 || warn "Failed to send Slack notification"
}

# ---------------------------------------------------------------------------
# Cleanup local temp files on exit
# ---------------------------------------------------------------------------
cleanup() {
    # Keep the backup file around briefly for debugging if there was an error
    if [[ $? -eq 0 && -f "${BACKUP_FILE:-}" ]]; then
        rm -f "$BACKUP_FILE" "$CHECKSUM_FILE" 2>/dev/null || true
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
    echo "  PostgreSQL Backup"
    echo "  Database:   ${DATABASE}"
    echo "  S3 Bucket:  ${S3_BUCKET}"
    echo "  Retention:  ${RETENTION_DAYS} days"
    echo "  Dry run:    ${DRY_RUN}"
    echo "======================================================"
    echo ""

    check_prerequisites
    create_backup
    upload_to_s3
    apply_retention

    echo ""
    ok "Backup completed successfully!"
    notify_slack "success"
}

main "$@"
