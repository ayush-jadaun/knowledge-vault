---
title: "Helm Cheat Sheet"
description: "Quick reference for Helm — chart structure, values, templates, install, upgrade, rollback, hooks, and repository management"
tags: [helm, kubernetes, cheat-sheet, reference, devops]
difficulty: intermediate
prerequisites: [kubernetes-basics]
lastReviewed: "2026-03-20"
---

# Helm Cheat Sheet

Quick reference for Helm 3 — the package manager for Kubernetes. Covers chart structure, templating, lifecycle commands, hooks, and common patterns.

**Related**: [Kubernetes Cheat Sheet](/cheat-sheets/kubernetes) | [kubectl Advanced](/cheat-sheets/kubectl-advanced)

---

## Repository Management

| Command | Description |
|---------|-------------|
| `helm repo add bitnami https://charts.bitnami.com/bitnami` | Add a chart repository |
| `helm repo add stable https://charts.helm.sh/stable` | Add legacy stable repo |
| `helm repo update` | Update repo index |
| `helm repo list` | List configured repos |
| `helm repo remove bitnami` | Remove a repo |
| `helm search repo nginx` | Search repos for a chart |
| `helm search repo nginx --versions` | Show all available versions |
| `helm search hub wordpress` | Search Artifact Hub |

---

## Chart Lifecycle

### Install

| Command | Description |
|---------|-------------|
| `helm install my-release bitnami/nginx` | Install a chart |
| `helm install my-release bitnami/nginx -n production` | Install in specific namespace |
| `helm install my-release bitnami/nginx -f values.yaml` | Install with custom values |
| `helm install my-release bitnami/nginx --set replicaCount=3` | Install with inline overrides |
| `helm install my-release bitnami/nginx --set-string image.tag="1.25"` | Force value as string |
| `helm install my-release bitnami/nginx --version 15.0.0` | Install specific chart version |
| `helm install my-release ./my-chart` | Install from local chart directory |
| `helm install my-release my-chart.tgz` | Install from local archive |
| `helm install my-release bitnami/nginx --dry-run --debug` | Dry run (render templates only) |
| `helm install my-release bitnami/nginx --wait --timeout 5m` | Wait for pods to be ready |
| `helm install my-release bitnami/nginx --create-namespace -n new-ns` | Create namespace if missing |

### Upgrade

| Command | Description |
|---------|-------------|
| `helm upgrade my-release bitnami/nginx` | Upgrade a release |
| `helm upgrade my-release bitnami/nginx -f values-prod.yaml` | Upgrade with new values |
| `helm upgrade my-release bitnami/nginx --reuse-values --set replicas=5` | Keep existing values, override one |
| `helm upgrade --install my-release bitnami/nginx` | Install if not exists, upgrade if it does |
| `helm upgrade my-release bitnami/nginx --atomic` | Auto-rollback on failure |
| `helm upgrade my-release bitnami/nginx --force` | Force resource update |

::: warning
`--reuse-values` merges with existing values. Without it, all values reset to chart defaults plus your overrides. This catches people off guard.
:::

### Rollback

| Command | Description |
|---------|-------------|
| `helm rollback my-release` | Rollback to previous revision |
| `helm rollback my-release 3` | Rollback to specific revision |
| `helm rollback my-release 3 --wait` | Rollback and wait for readiness |

### Uninstall

| Command | Description |
|---------|-------------|
| `helm uninstall my-release` | Delete a release |
| `helm uninstall my-release -n production` | Delete from specific namespace |
| `helm uninstall my-release --keep-history` | Delete but keep history |

---

## Inspect & Debug

| Command | Description |
|---------|-------------|
| `helm list` | List installed releases in current namespace |
| `helm list -A` | List releases across all namespaces |
| `helm list --pending` | Show pending releases |
| `helm status my-release` | Show release status |
| `helm history my-release` | Show release revision history |
| `helm get values my-release` | Show user-supplied values |
| `helm get values my-release --all` | Show all computed values |
| `helm get manifest my-release` | Show rendered Kubernetes manifests |
| `helm get notes my-release` | Show release notes |
| `helm get hooks my-release` | Show release hooks |
| `helm show chart bitnami/nginx` | Show chart metadata |
| `helm show values bitnami/nginx` | Show default values.yaml |
| `helm show readme bitnami/nginx` | Show chart README |
| `helm template my-release bitnami/nginx -f values.yaml` | Render templates locally (no install) |

---

## Chart Structure

```
my-chart/
├── Chart.yaml          # Chart metadata (name, version, dependencies)
├── Chart.lock          # Locked dependency versions
├── values.yaml         # Default configuration values
├── values.schema.json  # JSON Schema for values validation
├── templates/
│   ├── _helpers.tpl    # Template helpers and partials
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── hpa.yaml
│   ├── serviceaccount.yaml
│   ├── NOTES.txt       # Post-install instructions
│   └── tests/
│       └── test-connection.yaml
├── charts/             # Dependency chart archives
├── crds/               # Custom Resource Definitions
└── .helmignore         # Files to exclude from packaging
```

### Chart.yaml

```yaml
apiVersion: v2
name: my-app
description: My application Helm chart
type: application          # application or library
version: 1.2.0             # Chart version (SemVer)
appVersion: "3.5.1"        # Application version
dependencies:
  - name: postgresql
    version: "12.x.x"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
  - name: redis
    version: "17.x.x"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
```

---

## Templating Essentials

### Built-in Objects

| Object | Description |
|--------|-------------|
| `.Release.Name` | Release name |
| `.Release.Namespace` | Release namespace |
| `.Release.IsUpgrade` | True if upgrade/rollback |
| `.Release.IsInstall` | True if install |
| `.Release.Revision` | Revision number |
| `.Chart.Name` | Chart name |
| `.Chart.Version` | Chart version |
| `.Chart.AppVersion` | App version |
| `.Values` | Values from values.yaml and overrides |
| `.Capabilities.KubeVersion` | Kubernetes version |
| `.Template.Name` | Current template file path |

### Common Template Functions

```yaml
# String functions
name: {​{ .Values.name | upper }}
name: {​{ .Values.name | lower }}
name: {​{ .Values.name | title }}
name: {​{ .Values.name | quote }}
name: {​{ .Values.name | trim }}
name: {​{ .Values.name | replace "old" "new" }}
name: {​{ printf "%s-%s" .Release.Name .Chart.Name }}

# Default values
image: {​{ .Values.image | default "nginx:latest" }}

# Required values (fails if missing)
password: {​{ required "password is required" .Values.password }}

# Conditionals
{​{- if .Values.ingress.enabled }}
  # ingress resources
{​{- end }}

# Ternary
replicas: {​{ ternary 3 1 .Values.production }}

# Loops
{​{- range .Values.env }}
- name: {​{ .name }}
  value: {​{ .value | quote }}
{​{- end }}

# With (change scope)
{​{- with .Values.nodeSelector }}
nodeSelector:
  {​{- toYaml . | nindent 2 }}
{​{- end }}
```

### Helper Templates (_helpers.tpl)

```yaml
{​{/* Generate standard labels */}}
{​{- define "my-app.labels" -}}
helm.sh/chart: {​{ include "my-app.chart" . }}
app.kubernetes.io/name: {​{ include "my-app.name" . }}
app.kubernetes.io/instance: {​{ .Release.Name }}
app.kubernetes.io/managed-by: {​{ .Release.Service }}
{​{- end }}

{​{/* Generate a fullname with release */}}
{​{- define "my-app.fullname" -}}
{​{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{​{- end }}

{​{/* Usage in templates */}}
metadata:
  name: {​{ include "my-app.fullname" . }}
  labels:
    {​{- include "my-app.labels" . | nindent 4 }}
```

---

## Hooks

Hooks run at specific points in the release lifecycle.

| Annotation Value | When It Runs |
|------------------|-------------|
| `pre-install` | Before any resources are installed |
| `post-install` | After all resources are installed |
| `pre-upgrade` | Before any resources are upgraded |
| `post-upgrade` | After all resources are upgraded |
| `pre-delete` | Before any resources are deleted |
| `post-delete` | After all resources are deleted |
| `pre-rollback` | Before a rollback |
| `post-rollback` | After a rollback |
| `test` | When `helm test` is run |

### Hook Example — Database Migration

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {​{ include "my-app.fullname" . }}-migrate
  annotations:
    "helm.sh/hook": pre-upgrade
    "helm.sh/hook-weight": "0"
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: {​{ .Values.image.repository }}:{​{ .Values.image.tag }}
          command: ["npm", "run", "migrate"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {​{ include "my-app.fullname" . }}-secrets
                  key: database-url
```

### Hook Delete Policies

| Policy | Description |
|--------|-------------|
| `hook-succeeded` | Delete after hook succeeds |
| `hook-failed` | Delete after hook fails |
| `before-hook-creation` | Delete previous hook before launching new one |

---

## Dependencies

```bash
# Update dependencies (downloads to charts/)
helm dependency update ./my-chart

# List dependencies
helm dependency list ./my-chart

# Build (rebuild Chart.lock)
helm dependency build ./my-chart
```

### Conditional Dependencies in values.yaml

```yaml
# values.yaml
postgresql:
  enabled: true
  auth:
    postgresPassword: "secret"
    database: "myapp"

redis:
  enabled: false
```

---

## Chart Development

```bash
# Create a new chart scaffold
helm create my-chart

# Lint a chart for errors
helm lint ./my-chart

# Lint with specific values
helm lint ./my-chart -f values-prod.yaml

# Package a chart
helm package ./my-chart

# Package with specific version
helm package ./my-chart --version 2.0.0

# Push to OCI registry
helm push my-chart-2.0.0.tgz oci://registry.example.com/charts

# Template (render locally without install)
helm template my-release ./my-chart -f values.yaml --debug

# Run chart tests
helm test my-release
```

::: tip
Always run `helm lint` and `helm template` before pushing chart changes. Catch YAML errors locally, not in production.
:::

---

## OCI Registry Support

```bash
# Login to OCI registry
helm registry login registry.example.com

# Push chart to OCI
helm push my-chart-1.0.0.tgz oci://registry.example.com/charts

# Pull chart from OCI
helm pull oci://registry.example.com/charts/my-chart --version 1.0.0

# Install from OCI
helm install my-release oci://registry.example.com/charts/my-chart --version 1.0.0
```

---

---

::: details Test Yourself
1. **What command installs a chart with a dry run to preview rendered templates?**
   `helm install my-release bitnami/nginx --dry-run --debug`

2. **How do you upgrade a release and automatically rollback if it fails?**
   `helm upgrade my-release bitnami/nginx --atomic`

3. **What command shows the user-supplied values of an installed release?**
   `helm get values my-release`

4. **How do you render templates locally without installing?**
   `helm template my-release ./my-chart -f values.yaml`

5. **What hook annotation runs a Job before resources are upgraded?**
   `"helm.sh/hook": pre-upgrade`

6. **How do you force a value to be treated as a string in `--set`?**
   `--set-string image.tag="1.25"`

7. **What does `--reuse-values` do during an upgrade?**
   It merges new overrides with existing values. Without it, all values reset to chart defaults plus your overrides.

8. **What command checks a chart for errors before deploying?**
   `helm lint ./my-chart`

9. **How do you keep release history after uninstalling?**
   `helm uninstall my-release --keep-history`

10. **What built-in object gives you the current release name in a template?**
    `.Release.Name`
:::

::: danger Common Gotchas
- **`--reuse-values` silently keeps old values.** If a chart adds new required values in an upgrade, `--reuse-values` will not include them. Review chart changelogs before upgrading.
- **Forgetting `helm lint` before pushing.** A YAML indentation error in templates will not show up until install time. Always lint and template-render locally first.
- **Hook resources are not managed by the release.** Hooks are created and deleted based on their delete policy. If a hook Job fails, it may linger and block future upgrades.
- **`helm upgrade` without `--install` fails if the release does not exist.** Use `helm upgrade --install` for idempotent CI/CD pipelines.
:::

## One-Liner Summary

Helm is the package manager for Kubernetes -- master `install`, `upgrade --atomic`, `template`, hooks, and `values.yaml` overrides to deploy and manage complex applications repeatably.

*Last updated: 2026-03-20*
