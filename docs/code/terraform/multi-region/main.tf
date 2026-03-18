# =============================================================================
# Multi-Region AWS Infrastructure — Terraform Configuration
# =============================================================================
# Production-grade multi-region setup with:
#   - VPC per region with public/private subnets
#   - Aurora Global Database (PostgreSQL) with cross-region replication
#   - ElastiCache Global Datastore (Redis) for low-latency caching
#   - Global Accelerator for anycast routing
#   - Route53 health checks and DNS failover
#
# Architecture:
#   Primary Region (us-east-1):
#     - VPC with 3 AZs
#     - Aurora PostgreSQL (writer)
#     - ElastiCache Redis (primary)
#     - Application workloads
#
#   Secondary Region (us-west-2):
#     - VPC with 3 AZs
#     - Aurora PostgreSQL (read replica, promotes on failover)
#     - ElastiCache Redis (replica)
#     - Standby application workloads
#
# Usage:
#   terraform init
#   terraform plan -var-file="production.tfvars"
#   terraform apply -var-file="production.tfvars"
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state in S3 with DynamoDB locking
  # backend "s3" {
  #   bucket         = "my-terraform-state"
  #   key            = "multi-region/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used as prefix for all resources"
  type        = string
  default     = "myapp"
}

variable "environment" {
  description = "Environment name (production, staging)"
  type        = string
  default     = "production"
}

variable "primary_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "secondary_region" {
  description = "Secondary AWS region for disaster recovery"
  type        = string
  default     = "us-west-2"
}

variable "primary_vpc_cidr" {
  description = "CIDR block for the primary region VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "secondary_vpc_cidr" {
  description = "CIDR block for the secondary region VPC"
  type        = string
  default     = "10.1.0.0/16"
}

variable "primary_azs" {
  description = "Availability zones for the primary region"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "secondary_azs" {
  description = "Availability zones for the secondary region"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

variable "db_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "app"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_cache_clusters" {
  description = "Number of cache clusters per replication group"
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Domain name for Route53 health checks and DNS"
  type        = string
  default     = "app.example.com"
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Provider configuration — one per region
# ---------------------------------------------------------------------------

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = merge({
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Region      = var.primary_region
    }, var.tags)
  }
}

provider "aws" {
  alias  = "secondary"
  region = var.secondary_region

  default_tags {
    tags = merge({
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Region      = var.secondary_region
    }, var.tags)
  }
}

# ---------------------------------------------------------------------------
# Local values
# ---------------------------------------------------------------------------

locals {
  prefix = "${var.project_name}-${var.environment}"

  # Calculate subnet CIDRs: 3 public + 3 private per VPC
  primary_public_subnets  = [for i in range(3) : cidrsubnet(var.primary_vpc_cidr, 4, i)]
  primary_private_subnets = [for i in range(3) : cidrsubnet(var.primary_vpc_cidr, 4, i + 3)]

  secondary_public_subnets  = [for i in range(3) : cidrsubnet(var.secondary_vpc_cidr, 4, i)]
  secondary_private_subnets = [for i in range(3) : cidrsubnet(var.secondary_vpc_cidr, 4, i + 3)]
}

# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# ===========================================================================
# PRIMARY REGION — VPC
# ===========================================================================

resource "aws_vpc" "primary" {
  cidr_block           = var.primary_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.prefix}-vpc-primary" }
}

resource "aws_internet_gateway" "primary" {
  vpc_id = aws_vpc.primary.id
  tags   = { Name = "${local.prefix}-igw-primary" }
}

# Public subnets (for load balancers, NAT gateways)
resource "aws_subnet" "primary_public" {
  count                   = 3
  vpc_id                  = aws_vpc.primary.id
  cidr_block              = local.primary_public_subnets[count.index]
  availability_zone       = var.primary_azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.prefix}-public-${var.primary_azs[count.index]}" }
}

# Private subnets (for application workloads, databases)
resource "aws_subnet" "primary_private" {
  count             = 3
  vpc_id            = aws_vpc.primary.id
  cidr_block        = local.primary_private_subnets[count.index]
  availability_zone = var.primary_azs[count.index]

  tags = { Name = "${local.prefix}-private-${var.primary_azs[count.index]}" }
}

# NAT Gateway (one per AZ for HA)
resource "aws_eip" "primary_nat" {
  count  = 3
  domain = "vpc"
  tags   = { Name = "${local.prefix}-nat-eip-${count.index}-primary" }
}

resource "aws_nat_gateway" "primary" {
  count         = 3
  allocation_id = aws_eip.primary_nat[count.index].id
  subnet_id     = aws_subnet.primary_public[count.index].id

  tags = { Name = "${local.prefix}-nat-${count.index}-primary" }
}

# Route tables
resource "aws_route_table" "primary_public" {
  vpc_id = aws_vpc.primary.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.primary.id
  }

  # Peering route to secondary VPC
  route {
    cidr_block                = var.secondary_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.primary_to_secondary.id
  }

  tags = { Name = "${local.prefix}-rt-public-primary" }
}

resource "aws_route_table_association" "primary_public" {
  count          = 3
  subnet_id      = aws_subnet.primary_public[count.index].id
  route_table_id = aws_route_table.primary_public.id
}

resource "aws_route_table" "primary_private" {
  count  = 3
  vpc_id = aws_vpc.primary.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.primary[count.index].id
  }

  route {
    cidr_block                = var.secondary_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.primary_to_secondary.id
  }

  tags = { Name = "${local.prefix}-rt-private-${count.index}-primary" }
}

resource "aws_route_table_association" "primary_private" {
  count          = 3
  subnet_id      = aws_subnet.primary_private[count.index].id
  route_table_id = aws_route_table.primary_private[count.index].id
}

# ===========================================================================
# SECONDARY REGION — VPC
# ===========================================================================

resource "aws_vpc" "secondary" {
  provider             = aws.secondary
  cidr_block           = var.secondary_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.prefix}-vpc-secondary" }
}

resource "aws_internet_gateway" "secondary" {
  provider = aws.secondary
  vpc_id   = aws_vpc.secondary.id
  tags     = { Name = "${local.prefix}-igw-secondary" }
}

resource "aws_subnet" "secondary_public" {
  count                   = 3
  provider                = aws.secondary
  vpc_id                  = aws_vpc.secondary.id
  cidr_block              = local.secondary_public_subnets[count.index]
  availability_zone       = var.secondary_azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.prefix}-public-${var.secondary_azs[count.index]}" }
}

resource "aws_subnet" "secondary_private" {
  count             = 3
  provider          = aws.secondary
  vpc_id            = aws_vpc.secondary.id
  cidr_block        = local.secondary_private_subnets[count.index]
  availability_zone = var.secondary_azs[count.index]

  tags = { Name = "${local.prefix}-private-${var.secondary_azs[count.index]}" }
}

resource "aws_eip" "secondary_nat" {
  count    = 3
  provider = aws.secondary
  domain   = "vpc"
  tags     = { Name = "${local.prefix}-nat-eip-${count.index}-secondary" }
}

resource "aws_nat_gateway" "secondary" {
  count         = 3
  provider      = aws.secondary
  allocation_id = aws_eip.secondary_nat[count.index].id
  subnet_id     = aws_subnet.secondary_public[count.index].id

  tags = { Name = "${local.prefix}-nat-${count.index}-secondary" }
}

resource "aws_route_table" "secondary_public" {
  provider = aws.secondary
  vpc_id   = aws_vpc.secondary.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.secondary.id
  }

  route {
    cidr_block                = var.primary_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.primary_to_secondary.id
  }

  tags = { Name = "${local.prefix}-rt-public-secondary" }
}

resource "aws_route_table_association" "secondary_public" {
  count          = 3
  provider       = aws.secondary
  subnet_id      = aws_subnet.secondary_public[count.index].id
  route_table_id = aws_route_table.secondary_public.id
}

resource "aws_route_table" "secondary_private" {
  count    = 3
  provider = aws.secondary
  vpc_id   = aws_vpc.secondary.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.secondary[count.index].id
  }

  route {
    cidr_block                = var.primary_vpc_cidr
    vpc_peering_connection_id = aws_vpc_peering_connection.primary_to_secondary.id
  }

  tags = { Name = "${local.prefix}-rt-private-${count.index}-secondary" }
}

resource "aws_route_table_association" "secondary_private" {
  count          = 3
  provider       = aws.secondary
  subnet_id      = aws_subnet.secondary_private[count.index].id
  route_table_id = aws_route_table.secondary_private[count.index].id
}

# ===========================================================================
# VPC Peering — cross-region connectivity
# ===========================================================================

resource "aws_vpc_peering_connection" "primary_to_secondary" {
  vpc_id      = aws_vpc.primary.id
  peer_vpc_id = aws_vpc.secondary.id
  peer_region = var.secondary_region
  auto_accept = false

  tags = { Name = "${local.prefix}-peering" }
}

resource "aws_vpc_peering_connection_accepter" "secondary" {
  provider                  = aws.secondary
  vpc_peering_connection_id = aws_vpc_peering_connection.primary_to_secondary.id
  auto_accept               = true

  tags = { Name = "${local.prefix}-peering" }
}

# ===========================================================================
# Aurora Global Database (PostgreSQL)
# ===========================================================================

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# Store password in Secrets Manager (primary region)
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${local.prefix}/db-password"
  description = "Aurora Global Database master password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# Subnet groups for Aurora
resource "aws_db_subnet_group" "primary" {
  name       = "${local.prefix}-aurora-primary"
  subnet_ids = aws_subnet.primary_private[*].id

  tags = { Name = "${local.prefix}-aurora-subnet-primary" }
}

resource "aws_db_subnet_group" "secondary" {
  provider   = aws.secondary
  name       = "${local.prefix}-aurora-secondary"
  subnet_ids = aws_subnet.secondary_private[*].id

  tags = { Name = "${local.prefix}-aurora-subnet-secondary" }
}

# Security groups for Aurora
resource "aws_security_group" "aurora_primary" {
  name_prefix = "${local.prefix}-aurora-"
  vpc_id      = aws_vpc.primary.id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.primary_vpc_cidr, var.secondary_vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-aurora-sg-primary" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "aurora_secondary" {
  provider    = aws.secondary
  name_prefix = "${local.prefix}-aurora-"
  vpc_id      = aws_vpc.secondary.id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.primary_vpc_cidr, var.secondary_vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-aurora-sg-secondary" }

  lifecycle {
    create_before_destroy = true
  }
}

# Global Aurora cluster
resource "aws_rds_global_cluster" "main" {
  global_cluster_identifier = "${local.prefix}-global-db"
  engine                    = "aurora-postgresql"
  engine_version            = "16.1"
  database_name             = var.db_name
  storage_encrypted         = true
  deletion_protection       = var.environment == "production"
}

# Primary Aurora cluster
resource "aws_rds_cluster" "primary" {
  cluster_identifier        = "${local.prefix}-aurora-primary"
  global_cluster_identifier = aws_rds_global_cluster.main.id
  engine                    = aws_rds_global_cluster.main.engine
  engine_version            = aws_rds_global_cluster.main.engine_version
  database_name             = var.db_name
  master_username           = "admin"
  master_password           = random_password.db_password.result
  db_subnet_group_name      = aws_db_subnet_group.primary.name
  vpc_security_group_ids    = [aws_security_group.aurora_primary.id]
  storage_encrypted         = true
  backup_retention_period   = 14
  preferred_backup_window   = "03:00-04:00"
  skip_final_snapshot       = var.environment != "production"
  deletion_protection       = var.environment == "production"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = { Name = "${local.prefix}-aurora-primary" }
}

resource "aws_rds_cluster_instance" "primary" {
  count                = 2
  identifier           = "${local.prefix}-aurora-primary-${count.index}"
  cluster_identifier   = aws_rds_cluster.primary.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.primary.engine
  engine_version       = aws_rds_cluster.primary.engine_version
  db_subnet_group_name = aws_db_subnet_group.primary.name

  performance_insights_enabled = true

  tags = { Name = "${local.prefix}-aurora-primary-${count.index}" }
}

# Secondary Aurora cluster (read replica, auto-promotes on failover)
resource "aws_rds_cluster" "secondary" {
  provider                  = aws.secondary
  cluster_identifier        = "${local.prefix}-aurora-secondary"
  global_cluster_identifier = aws_rds_global_cluster.main.id
  engine                    = aws_rds_global_cluster.main.engine
  engine_version            = aws_rds_global_cluster.main.engine_version
  db_subnet_group_name      = aws_db_subnet_group.secondary.name
  vpc_security_group_ids    = [aws_security_group.aurora_secondary.id]
  storage_encrypted         = true
  skip_final_snapshot       = true
  deletion_protection       = var.environment == "production"

  # No master credentials needed — inherits from global cluster
  depends_on = [aws_rds_cluster.primary]

  tags = { Name = "${local.prefix}-aurora-secondary" }

  lifecycle {
    ignore_changes = [master_username, master_password]
  }
}

resource "aws_rds_cluster_instance" "secondary" {
  provider             = aws.secondary
  count                = 1  # Single reader in secondary for cost savings
  identifier           = "${local.prefix}-aurora-secondary-${count.index}"
  cluster_identifier   = aws_rds_cluster.secondary.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.secondary.engine
  engine_version       = aws_rds_cluster.secondary.engine_version
  db_subnet_group_name = aws_db_subnet_group.secondary.name

  performance_insights_enabled = true

  tags = { Name = "${local.prefix}-aurora-secondary-${count.index}" }
}

# ===========================================================================
# ElastiCache Global Datastore (Redis)
# ===========================================================================

# Subnet groups
resource "aws_elasticache_subnet_group" "primary" {
  name       = "${local.prefix}-redis-primary"
  subnet_ids = aws_subnet.primary_private[*].id
}

resource "aws_elasticache_subnet_group" "secondary" {
  provider   = aws.secondary
  name       = "${local.prefix}-redis-secondary"
  subnet_ids = aws_subnet.secondary_private[*].id
}

# Security groups for Redis
resource "aws_security_group" "redis_primary" {
  name_prefix = "${local.prefix}-redis-"
  vpc_id      = aws_vpc.primary.id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.primary_vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-redis-sg-primary" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "redis_secondary" {
  provider    = aws.secondary
  name_prefix = "${local.prefix}-redis-"
  vpc_id      = aws_vpc.secondary.id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.secondary_vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-redis-sg-secondary" }

  lifecycle {
    create_before_destroy = true
  }
}

# Primary Redis replication group
resource "aws_elasticache_replication_group" "primary" {
  replication_group_id = "${local.prefix}-redis-primary"
  description          = "Primary Redis cluster for ${var.project_name}"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_cache_clusters
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.primary.name
  security_group_ids   = [aws_security_group.redis_primary.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = true
  multi_az_enabled           = true

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-05:00"
  maintenance_window       = "sun:05:00-sun:07:00"

  tags = { Name = "${local.prefix}-redis-primary" }
}

# Global Datastore for cross-region replication
resource "aws_elasticache_global_replication_group" "main" {
  global_replication_group_id_suffix = "${local.prefix}-global"
  primary_replication_group_id       = aws_elasticache_replication_group.primary.id
  global_replication_group_description = "Global Redis for ${var.project_name}"
}

# Secondary Redis replication group
resource "aws_elasticache_replication_group" "secondary" {
  provider                      = aws.secondary
  replication_group_id          = "${local.prefix}-redis-secondary"
  description                   = "Secondary Redis cluster for ${var.project_name}"
  global_replication_group_id   = aws_elasticache_global_replication_group.main.global_replication_group_id
  num_cache_clusters            = 1  # Single node in secondary for cost
  subnet_group_name             = aws_elasticache_subnet_group.secondary.name
  security_group_ids            = [aws_security_group.redis_secondary.id]
  automatic_failover_enabled    = true

  tags = { Name = "${local.prefix}-redis-secondary" }
}

# ===========================================================================
# Global Accelerator — anycast IP for global routing
# ===========================================================================

resource "aws_globalaccelerator_accelerator" "main" {
  name            = "${local.prefix}-accelerator"
  ip_address_type = "IPV4"
  enabled         = true

  attributes {
    flow_logs_enabled   = true
    flow_logs_s3_bucket = "${local.prefix}-flow-logs"
    flow_logs_s3_prefix = "global-accelerator/"
  }

  tags = { Name = "${local.prefix}-accelerator" }
}

resource "aws_globalaccelerator_listener" "http" {
  accelerator_arn = aws_globalaccelerator_accelerator.main.id
  protocol        = "TCP"

  port_range {
    from_port = 80
    to_port   = 80
  }

  port_range {
    from_port = 443
    to_port   = 443
  }
}

# ===========================================================================
# Route53 Health Checks and DNS Failover
# ===========================================================================

resource "aws_route53_health_check" "primary" {
  fqdn              = "primary.${var.domain_name}"
  port               = 443
  type               = "HTTPS"
  resource_path      = "/healthz"
  failure_threshold  = 3
  request_interval   = 10
  measure_latency    = true

  tags = { Name = "${local.prefix}-health-primary" }
}

resource "aws_route53_health_check" "secondary" {
  fqdn              = "secondary.${var.domain_name}"
  port               = 443
  type               = "HTTPS"
  resource_path      = "/healthz"
  failure_threshold  = 3
  request_interval   = 10
  measure_latency    = true

  tags = { Name = "${local.prefix}-health-secondary" }
}

# ===========================================================================
# Outputs
# ===========================================================================

output "primary_vpc_id" {
  description = "Primary region VPC ID"
  value       = aws_vpc.primary.id
}

output "secondary_vpc_id" {
  description = "Secondary region VPC ID"
  value       = aws_vpc.secondary.id
}

output "aurora_primary_endpoint" {
  description = "Aurora primary cluster writer endpoint"
  value       = aws_rds_cluster.primary.endpoint
}

output "aurora_primary_reader_endpoint" {
  description = "Aurora primary cluster reader endpoint"
  value       = aws_rds_cluster.primary.reader_endpoint
}

output "aurora_secondary_endpoint" {
  description = "Aurora secondary cluster endpoint (read-only, promotes on failover)"
  value       = aws_rds_cluster.secondary.endpoint
}

output "redis_primary_endpoint" {
  description = "Redis primary replication group endpoint"
  value       = aws_elasticache_replication_group.primary.primary_endpoint_address
}

output "redis_secondary_endpoint" {
  description = "Redis secondary replication group endpoint"
  value       = aws_elasticache_replication_group.secondary.primary_endpoint_address
}

output "global_accelerator_ips" {
  description = "Global Accelerator static anycast IP addresses"
  value       = aws_globalaccelerator_accelerator.main.ip_sets[*].ip_addresses
}

output "global_accelerator_dns" {
  description = "Global Accelerator DNS name"
  value       = aws_globalaccelerator_accelerator.main.dns_name
}

output "peering_connection_id" {
  description = "VPC peering connection ID between primary and secondary"
  value       = aws_vpc_peering_connection.primary_to_secondary.id
}

output "db_password_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the DB password"
  value       = aws_secretsmanager_secret.db_password.arn
}
