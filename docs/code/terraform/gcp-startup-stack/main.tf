# =============================================================================
# GCP Startup Stack — Terraform Configuration
# =============================================================================
# A complete GCP infrastructure for a startup/SaaS application:
#   - Cloud Run service (serverless container hosting)
#   - Cloud SQL PostgreSQL (managed database)
#   - Redis Memorystore (managed cache)
#   - VPC with private networking
#   - Cloud Build trigger (CI/CD)
#   - Secret Manager (secrets storage)
#   - IAM bindings (least-privilege access)
#
# Usage:
#   terraform init
#   terraform plan -var-file="production.tfvars"
#   terraform apply -var-file="production.tfvars"
#
# Prerequisites:
#   - GCP project with billing enabled
#   - gcloud CLI authenticated
#   - Required APIs enabled (done automatically by this config)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state in GCS — uncomment and configure for team use
  # backend "gcs" {
  #   bucket = "my-startup-terraform-state"
  #   prefix = "startup-stack"
  # }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Application name — used as a prefix for all resource names"
  type        = string
  default     = "myapp"
}

variable "cloud_run_image" {
  description = "Container image for Cloud Run (e.g., gcr.io/my-project/app:latest)"
  type        = string
}

variable "cloud_run_min_instances" {
  description = "Minimum number of Cloud Run instances (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "cloud_run_cpu" {
  description = "CPU allocation for Cloud Run (e.g., '1', '2', '4')"
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Memory allocation for Cloud Run (e.g., '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "db_tier" {
  description = "Cloud SQL machine tier (e.g., db-f1-micro, db-custom-2-7680)"
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size_gb" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 10
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "app"
}

variable "redis_memory_gb" {
  description = "Redis Memorystore memory in GB"
  type        = number
  default     = 1
}

variable "redis_tier" {
  description = "Redis tier: BASIC (no replication) or STANDARD_HA (with replication)"
  type        = string
  default     = "BASIC"
}

variable "github_repo" {
  description = "GitHub repository for Cloud Build trigger (owner/repo format)"
  type        = string
  default     = ""
}

variable "github_branch" {
  description = "Branch to trigger Cloud Build on"
  type        = string
  default     = "main"
}

variable "alert_email" {
  description = "Email for budget and monitoring alerts"
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ---------------------------------------------------------------------------
# Local values
# ---------------------------------------------------------------------------

locals {
  # Resource naming convention: {app}-{resource}-{env}
  prefix     = "${var.app_name}-${var.environment}"
  labels = {
    app         = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Enable required GCP APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",            # Cloud Run
    "sqladmin.googleapis.com",       # Cloud SQL
    "redis.googleapis.com",          # Memorystore
    "compute.googleapis.com",        # VPC / Networking
    "vpcaccess.googleapis.com",      # Serverless VPC Access
    "cloudbuild.googleapis.com",     # Cloud Build
    "secretmanager.googleapis.com",  # Secret Manager
    "servicenetworking.googleapis.com", # Private services
    "iam.googleapis.com",            # IAM
  ])

  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

# ---------------------------------------------------------------------------
# VPC Network — private networking for all services
# ---------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                    = "${local.prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name                     = "${local.prefix}-subnet"
  ip_cidr_range            = "10.0.0.0/20"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true  # Allow access to Google APIs without external IP

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Private services access — for Cloud SQL and Memorystore
resource "google_compute_global_address" "private_ip_range" {
  name          = "${local.prefix}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]

  depends_on = [google_project_service.apis]
}

# Serverless VPC Access connector — allows Cloud Run to reach VPC resources
resource "google_vpc_access_connector" "connector" {
  name          = "${local.prefix}-vpc-cx"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 3

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Cloud SQL — PostgreSQL database
# ---------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.prefix}-db"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.db_tier
    disk_size         = var.db_disk_size_gb
    disk_autoresize   = true
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"

    # Private networking — no public IP
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"  # 3 AM UTC
      point_in_time_recovery_enabled = var.environment == "production"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 4  # 4 AM UTC
      update_track = "stable"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"  # Log queries taking > 1 second
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = local.labels
  }

  deletion_protection = var.environment == "production"

  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "app_db" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app_user" {
  name     = "app"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

# ---------------------------------------------------------------------------
# Redis Memorystore — managed cache
# ---------------------------------------------------------------------------

resource "google_redis_instance" "cache" {
  name               = "${local.prefix}-redis"
  tier               = var.redis_tier
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  redis_version      = "REDIS_7_0"
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  # Enable AUTH for security
  auth_enabled = true

  # Redis configuration
  redis_configs = {
    maxmemory-policy = "allkeys-lru"
    notify-keyspace-events = ""  # Disable keyspace notifications by default
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
      }
    }
  }

  labels = local.labels

  depends_on = [google_service_networking_connection.private_vpc]
}

# ---------------------------------------------------------------------------
# Secret Manager — store sensitive configuration
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${local.prefix}-db-password"

  replication {
    auto {}
  }

  labels = local.labels
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "${local.prefix}-redis-auth"

  replication {
    auto {}
  }

  labels = local.labels
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "redis_auth" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = google_redis_instance.cache.auth_string
}

# ---------------------------------------------------------------------------
# IAM — Service account for Cloud Run
# ---------------------------------------------------------------------------

resource "google_service_account" "cloud_run" {
  account_id   = "${var.app_name}-run-sa"
  display_name = "${var.app_name} Cloud Run Service Account"
}

# Grant the Cloud Run SA access to read secrets
resource "google_secret_manager_secret_iam_member" "db_password_access" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "redis_auth_access" {
  secret_id = google_secret_manager_secret.redis_auth.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Grant the Cloud Run SA access to connect to Cloud SQL
resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Grant Cloud Run SA logging & tracing
resource "google_project_iam_member" "cloud_run_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_tracing" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run — application service
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "app" {
  name     = "${local.prefix}-app"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"  # Allow public access

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = var.cloud_run_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.cloud_run_image

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
        cpu_idle          = true   # Scale to zero when idle
        startup_cpu_boost = true   # Extra CPU during startup
      }

      # Application environment variables
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "DATABASE_HOST"
        value = google_sql_database_instance.postgres.private_ip_address
      }

      env {
        name  = "DATABASE_NAME"
        value = var.db_name
      }

      env {
        name  = "DATABASE_USER"
        value = "app"
      }

      # Database password from Secret Manager
      env {
        name = "DATABASE_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.cache.host
      }

      env {
        name  = "REDIS_PORT"
        value = tostring(google_redis_instance.cache.port)
      }

      # Redis auth string from Secret Manager
      env {
        name = "REDIS_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_auth.secret_id
            version = "latest"
          }
        }
      }

      # Health check
      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }

    labels = local.labels
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.db_password,
    google_secret_manager_secret_version.redis_auth,
  ]
}

# Allow unauthenticated access to Cloud Run (public API)
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Cloud Build — CI/CD trigger (optional, when github_repo is set)
# ---------------------------------------------------------------------------

resource "google_cloudbuild_trigger" "deploy" {
  count    = var.github_repo != "" ? 1 : 0
  name     = "${local.prefix}-deploy"
  location = var.region

  github {
    owner = split("/", var.github_repo)[0]
    name  = split("/", var.github_repo)[1]

    push {
      branch = "^${var.github_branch}$"
    }
  }

  build {
    # Step 1: Build the Docker image
    step {
      name = "gcr.io/cloud-builders/docker"
      args = [
        "build",
        "-t", "gcr.io/${var.project_id}/${var.app_name}:$COMMIT_SHA",
        "-t", "gcr.io/${var.project_id}/${var.app_name}:latest",
        ".",
      ]
    }

    # Step 2: Push to Container Registry
    step {
      name = "gcr.io/cloud-builders/docker"
      args = ["push", "--all-tags", "gcr.io/${var.project_id}/${var.app_name}"]
    }

    # Step 3: Deploy to Cloud Run
    step {
      name = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      args = [
        "gcloud", "run", "deploy", google_cloud_run_v2_service.app.name,
        "--image", "gcr.io/${var.project_id}/${var.app_name}:$COMMIT_SHA",
        "--region", var.region,
        "--quiet",
      ]
    }

    options {
      logging = "CLOUD_LOGGING_ONLY"
    }

    timeout = "600s"
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "cloud_run_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (for Cloud SQL Proxy)"
  value       = google_sql_database_instance.postgres.connection_name
}

output "cloud_sql_private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "redis_host" {
  description = "Redis Memorystore host"
  value       = google_redis_instance.cache.host
}

output "redis_port" {
  description = "Redis Memorystore port"
  value       = google_redis_instance.cache.port
}

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run.email
}

output "db_password_secret_id" {
  description = "Secret Manager secret ID for database password"
  value       = google_secret_manager_secret.db_password.secret_id
}
