#!/usr/bin/env bash
# =============================================================================
# Generic Deployment Script
# =============================================================================
# Deploys a containerized application to Kubernetes:
#   1. Build Docker image
#   2. Tag with git SHA + timestamp
#   3. Push to container registry
#   4. Apply Kubernetes manifests (kustomize or plain YAML)
#   5. Wait for rollout to complete
#   6. Run smoke tests against the deployed service
#   7. Rollback automatically on failure
#
# Usage:
#   ./deploy.sh [environment]
#
# Arguments:
#   environment   Target environment: staging | production (default: staging)
#
# Environment variables:
#   REGISTRY          — Container registry (default: ghcr.io)
#   IMAGE_NAME        — Image name (default: from git remote)
#   K8S_NAMESPACE     — Kubernetes namespace (default: from environment)
#   K8S_DEPLOYMENT    — Deployment name (default: app)
#   KUBECONFIG        — Path to kubeconfig file
#   HEALTH_CHECK_URL  — URL to check after deploy (auto-detected if not set)
#   DRY_RUN           — Set to "true" to skip actual deployment
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly ENVIRONMENT="${1:-staging}"
readonly TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"

# Git metadata
readonly GIT_SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
readonly GIT_BRANCH="$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
readonly GIT_DIRTY="$(git -C "$PROJECT_ROOT" diff --quiet 2>/dev/null && echo '' || echo '-dirty')"

# Container image
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-$(git -C "$PROJECT_ROOT" remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]||;s|\.git$||' || echo 'app')}"
readonly IMAGE_TAG="${GIT_SHA}${GIT_DIRTY}"
readonly FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

# Kubernetes
K8S_NAMESPACE="${K8S_NAMESPACE:-$ENVIRONMENT}"
K8S_DEPLOYMENT="${K8S_DEPLOYMENT:-app}"
readonly K8S_MANIFESTS_DIR="${PROJECT_ROOT}/k8s/${ENVIRONMENT}"
readonly ROLLOUT_TIMEOUT="300s"
readonly SMOKE_TEST_RETRIES=20
readonly SMOKE_TEST_INTERVAL=10

# Flags
DRY_RUN="${DRY_RUN:-false}"

# ---------------------------------------------------------------------------
# Colors & logging
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()      { echo -e "${BLUE}[$(date -u +%H:%M:%S)]${NC} $*"; }
ok()       { echo -e "${GREEN}[$(date -u +%H:%M:%S)] OK${NC}    $*"; }
warn()     { echo -e "${YELLOW}[$(date -u +%H:%M:%S)] WARN${NC}  $*"; }
fail()     { echo -e "${RED}[$(date -u +%H:%M:%S)] FAIL${NC}  $*"; exit 1; }

# Track the deployment phase for rollback decisions
DEPLOY_PHASE="init"

# ---------------------------------------------------------------------------
# Cleanup & rollback handler
# ---------------------------------------------------------------------------
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 && "$DEPLOY_PHASE" == "deployed" ]]; then
        echo ""
        warn "Deployment failed — initiating rollback..."
        rollback
    fi
    exit "$exit_code"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Validate environment and prerequisites
# ---------------------------------------------------------------------------
validate() {
    log "Validating deployment to '${ENVIRONMENT}'..."

    # Validate environment name
    case "$ENVIRONMENT" in
        staging|production) ;;
        *)
            fail "Invalid environment '${ENVIRONMENT}'. Use: staging | production"
            ;;
    esac

    # Production safety checks
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ "$GIT_BRANCH" != "main" ]]; then
            fail "Production deploys must be from the 'main' branch (currently on '${GIT_BRANCH}')"
        fi
        if [[ -n "$GIT_DIRTY" ]]; then
            fail "Production deploys require a clean working tree (uncommitted changes detected)"
        fi
        # Confirm production deploy
        if [[ "$DRY_RUN" == "false" && -t 0 ]]; then
            echo ""
            warn "You are about to deploy to PRODUCTION"
            read -rp "Type 'yes' to confirm: " confirm
            if [[ "$confirm" != "yes" ]]; then
                fail "Deployment aborted by user"
            fi
        fi
    fi

    # Check required tools
    for tool in docker kubectl; do
        if ! command -v "$tool" &>/dev/null; then
            fail "'${tool}' is required but not found in PATH"
        fi
    done

    # Verify kubectl can reach the cluster
    if ! kubectl cluster-info &>/dev/null 2>&1; then
        fail "Cannot connect to Kubernetes cluster. Check KUBECONFIG."
    fi

    # Verify the namespace exists
    if ! kubectl get namespace "$K8S_NAMESPACE" &>/dev/null 2>&1; then
        fail "Kubernetes namespace '${K8S_NAMESPACE}' does not exist"
    fi

    ok "Validation passed"
}

# ---------------------------------------------------------------------------
# Step 1: Build Docker image
# ---------------------------------------------------------------------------
build_image() {
    log "Building Docker image: ${FULL_IMAGE}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would build: ${FULL_IMAGE}"
        return 0
    fi

    docker build \
        --tag "${FULL_IMAGE}" \
        --tag "${REGISTRY}/${IMAGE_NAME}:latest" \
        --build-arg "BUILD_DATE=${TIMESTAMP}" \
        --build-arg "GIT_SHA=${GIT_SHA}" \
        --build-arg "ENVIRONMENT=${ENVIRONMENT}" \
        --file "${PROJECT_ROOT}/Dockerfile" \
        "${PROJECT_ROOT}"

    ok "Image built: ${FULL_IMAGE}"
}

# ---------------------------------------------------------------------------
# Step 2: Push image to registry
# ---------------------------------------------------------------------------
push_image() {
    log "Pushing image to registry..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would push: ${FULL_IMAGE}"
        return 0
    fi

    docker push "${FULL_IMAGE}"
    docker push "${REGISTRY}/${IMAGE_NAME}:latest"

    ok "Image pushed: ${FULL_IMAGE}"
}

# ---------------------------------------------------------------------------
# Step 3: Apply Kubernetes manifests
# ---------------------------------------------------------------------------
apply_manifests() {
    log "Applying Kubernetes manifests..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would apply manifests from ${K8S_MANIFESTS_DIR}"
        return 0
    fi

    # Record the pre-deploy revision for rollback
    PRE_DEPLOY_REVISION=$(kubectl rollout history "deployment/${K8S_DEPLOYMENT}" \
        -n "$K8S_NAMESPACE" \
        --output=jsonpath='{.metadata.generation}' 2>/dev/null || echo "0")
    log "Pre-deploy revision: ${PRE_DEPLOY_REVISION}"

    # Apply manifests — supports both kustomize and plain YAML
    if [[ -f "${K8S_MANIFESTS_DIR}/kustomization.yaml" || -f "${K8S_MANIFESTS_DIR}/kustomization.yml" ]]; then
        log "Using kustomize..."
        kubectl apply -k "${K8S_MANIFESTS_DIR}" -n "$K8S_NAMESPACE"
    elif [[ -d "$K8S_MANIFESTS_DIR" ]]; then
        log "Applying YAML manifests..."
        kubectl apply -f "${K8S_MANIFESTS_DIR}/" -n "$K8S_NAMESPACE"
    else
        warn "No manifest directory found at ${K8S_MANIFESTS_DIR}"
        log "Falling back to image update on existing deployment..."
    fi

    # Update the deployment image
    kubectl set image "deployment/${K8S_DEPLOYMENT}" \
        app="${FULL_IMAGE}" \
        -n "$K8S_NAMESPACE"

    # Annotate with deployment metadata
    kubectl annotate "deployment/${K8S_DEPLOYMENT}" \
        -n "$K8S_NAMESPACE" \
        kubernetes.io/change-cause="Deploy ${IMAGE_TAG} at ${TIMESTAMP} from ${GIT_BRANCH}" \
        --overwrite

    DEPLOY_PHASE="deployed"
    ok "Manifests applied"
}

# ---------------------------------------------------------------------------
# Step 4: Wait for rollout
# ---------------------------------------------------------------------------
wait_for_rollout() {
    log "Waiting for rollout (timeout: ${ROLLOUT_TIMEOUT})..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would wait for rollout"
        return 0
    fi

    if kubectl rollout status "deployment/${K8S_DEPLOYMENT}" \
        -n "$K8S_NAMESPACE" \
        --timeout="$ROLLOUT_TIMEOUT"; then
        ok "Rollout completed successfully"
    else
        fail "Rollout failed or timed out"
    fi
}

# ---------------------------------------------------------------------------
# Step 5: Smoke tests
# ---------------------------------------------------------------------------
run_smoke_tests() {
    log "Running smoke tests..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run smoke tests"
        return 0
    fi

    # Determine health check URL
    local health_url="${HEALTH_CHECK_URL:-}"
    if [[ -z "$health_url" ]]; then
        # Try to auto-detect from the service
        local service_ip
        service_ip=$(kubectl get svc "${K8S_DEPLOYMENT}" \
            -n "$K8S_NAMESPACE" \
            -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

        if [[ -z "$service_ip" ]]; then
            # Try hostname (e.g., AWS ELB)
            service_ip=$(kubectl get svc "${K8S_DEPLOYMENT}" \
                -n "$K8S_NAMESPACE" \
                -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
        fi

        if [[ -z "$service_ip" ]]; then
            warn "Could not determine service URL — skipping smoke tests"
            return 0
        fi

        health_url="http://${service_ip}/healthz"
    fi

    log "Health check URL: ${health_url}"

    for i in $(seq 1 "$SMOKE_TEST_RETRIES"); do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "$health_url" --max-time 5 2>/dev/null || echo "000")

        if [[ "$http_code" == "200" ]]; then
            ok "Smoke test passed (HTTP ${http_code})"
            return 0
        fi

        log "Attempt ${i}/${SMOKE_TEST_RETRIES} — HTTP ${http_code}, retrying in ${SMOKE_TEST_INTERVAL}s..."
        sleep "$SMOKE_TEST_INTERVAL"
    done

    fail "Smoke tests failed after ${SMOKE_TEST_RETRIES} attempts"
}

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------
rollback() {
    log "Rolling back deployment..."

    kubectl rollout undo "deployment/${K8S_DEPLOYMENT}" -n "$K8S_NAMESPACE"

    if kubectl rollout status "deployment/${K8S_DEPLOYMENT}" \
        -n "$K8S_NAMESPACE" \
        --timeout=120s; then
        warn "Rollback completed. Previous version restored."
    else
        fail "Rollback also failed! Manual intervention required."
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo ""
    echo "======================================================"
    echo "  Deploying to: ${ENVIRONMENT}"
    echo "  Image:        ${FULL_IMAGE}"
    echo "  Branch:       ${GIT_BRANCH}"
    echo "  Namespace:    ${K8S_NAMESPACE}"
    echo "  Dry run:      ${DRY_RUN}"
    echo "======================================================"
    echo ""

    validate
    build_image
    push_image
    apply_manifests
    wait_for_rollout
    run_smoke_tests

    echo ""
    echo "======================================================"
    ok "Deployment to '${ENVIRONMENT}' completed successfully!"
    echo "  Image: ${FULL_IMAGE}"
    echo "  Time:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "======================================================"
}

main
