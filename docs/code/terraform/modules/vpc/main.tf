# =============================================================================
# Reusable VPC Module — Terraform
# =============================================================================
# Creates a production-ready VPC with:
#   - Public subnets (one per AZ) — for load balancers, bastion hosts
#   - Private subnets (one per AZ) — for application workloads, databases
#   - NAT Gateway (one per AZ for HA, or single for cost savings)
#   - Route tables for public and private subnets
#   - Default security groups (bastion, app, database)
#   - VPC Flow Logs to CloudWatch
#   - Optional VPC endpoints for S3 and DynamoDB
#
# Usage:
#   module "vpc" {
#     source = "./modules/vpc"
#
#     name               = "my-app"
#     environment        = "production"
#     vpc_cidr           = "10.0.0.0/16"
#     availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
#     single_nat_gateway = false  # true for staging (cheaper)
#   }
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "name" {
  description = "Name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment (production, staging, dev)"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid CIDR block (e.g., 10.0.0.0/16)."
  }
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones are required for high availability."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets. If empty, auto-calculated from vpc_cidr."
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets. If empty, auto-calculated from vpc_cidr."
  type        = list(string)
  default     = []
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway instead of one per AZ (saves cost, reduces HA)"
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets (required for internet access)"
  type        = bool
  default     = true
}

variable "enable_vpn_gateway" {
  description = "Create a VPN Gateway for the VPC"
  type        = bool
  default     = false
}

variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs to CloudWatch"
  type        = bool
  default     = true
}

variable "flow_log_retention_days" {
  description = "Number of days to retain VPC Flow Logs"
  type        = number
  default     = 30
}

variable "enable_s3_endpoint" {
  description = "Create a VPC Gateway Endpoint for S3 (free, reduces NAT costs)"
  type        = bool
  default     = true
}

variable "enable_dynamodb_endpoint" {
  description = "Create a VPC Gateway Endpoint for DynamoDB"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Local values
# ---------------------------------------------------------------------------

locals {
  az_count = length(var.availability_zones)

  # Auto-calculate subnet CIDRs if not explicitly provided
  # Split the VPC CIDR into /20 subnets: first N for public, next N for private
  public_subnet_cidrs = length(var.public_subnet_cidrs) > 0 ? var.public_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 4, i)
  ]

  private_subnet_cidrs = length(var.private_subnet_cidrs) > 0 ? var.private_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 4, i + local.az_count)
  ]

  # Number of NAT Gateways: 1 if single_nat_gateway, otherwise one per AZ
  nat_count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : local.az_count) : 0

  common_tags = merge({
    Name        = var.name
    Environment = var.environment
    ManagedBy   = "terraform"
    Module      = "vpc"
  }, var.tags)
}

# ===========================================================================
# VPC
# ===========================================================================

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Enable IPv6 (dual-stack)
  assign_generated_ipv6_cidr_block = true

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-vpc"
  })
}

# ===========================================================================
# Internet Gateway — required for public subnets
# ===========================================================================

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-igw"
  })
}

# ===========================================================================
# Public Subnets — one per AZ
# ===========================================================================

resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  # IPv6
  ipv6_cidr_block                 = cidrsubnet(aws_vpc.this.ipv6_cidr_block, 8, count.index)
  assign_ipv6_address_on_creation = true

  tags = merge(local.common_tags, {
    Name                                    = "${var.name}-${var.environment}-public-${var.availability_zones[count.index]}"
    Tier                                    = "public"
    "kubernetes.io/role/elb"                = "1"  # For EKS ALB Ingress
  })
}

# ===========================================================================
# Private Subnets — one per AZ
# ===========================================================================

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  # IPv6
  ipv6_cidr_block                 = cidrsubnet(aws_vpc.this.ipv6_cidr_block, 8, count.index + local.az_count)
  assign_ipv6_address_on_creation = true

  tags = merge(local.common_tags, {
    Name                                      = "${var.name}-${var.environment}-private-${var.availability_zones[count.index]}"
    Tier                                      = "private"
    "kubernetes.io/role/internal-elb"          = "1"  # For EKS internal ALB
  })
}

# ===========================================================================
# NAT Gateways — allow private subnets to reach the internet
# ===========================================================================

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = local.nat_count
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-nat-eip-${count.index}"
  })

  # EIP may require the IGW to exist
  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = local.nat_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-nat-${var.availability_zones[count.index]}"
  })

  depends_on = [aws_internet_gateway.this]
}

# ===========================================================================
# Route Tables
# ===========================================================================

# --- Public route table (shared by all public subnets) ---
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  # IPv4 route to the internet via IGW
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  # IPv6 route to the internet via IGW
  route {
    ipv6_cidr_block = "::/0"
    gateway_id      = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-rt-public"
  })
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --- Private route tables (one per AZ for independent routing via NAT) ---
resource "aws_route_table" "private" {
  count  = local.az_count
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-rt-private-${var.availability_zones[count.index]}"
  })
}

# Route through NAT Gateway for internet access from private subnets
resource "aws_route" "private_nat" {
  count = var.enable_nat_gateway ? local.az_count : 0

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  # If single NAT, all private subnets route through NAT Gateway 0
  nat_gateway_id = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ===========================================================================
# Security Groups
# ===========================================================================

# --- Default security group (restrictive, deny all by default) ---
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.this.id

  # No ingress or egress rules — effectively disables the default SG
  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-default-sg-DO-NOT-USE"
  })
}

# --- Bastion / SSH security group ---
resource "aws_security_group" "bastion" {
  name_prefix = "${var.name}-${var.environment}-bastion-"
  description = "Security group for bastion / jump hosts"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "SSH from anywhere (restrict in production)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-bastion-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# --- Application security group ---
resource "aws_security_group" "application" {
  name_prefix = "${var.name}-${var.environment}-app-"
  description = "Security group for application workloads"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description     = "SSH from bastion"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-app-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# --- Database security group ---
resource "aws_security_group" "database" {
  name_prefix = "${var.name}-${var.environment}-db-"
  description = "Security group for database instances"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "PostgreSQL from application"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
  }

  ingress {
    description     = "Redis from application"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
  }

  # No egress by default — databases shouldn't initiate outbound connections
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]  # Only within VPC
  }

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-db-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ===========================================================================
# VPC Flow Logs — network traffic monitoring
# ===========================================================================

resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name              = "/vpc/${var.name}-${var.environment}/flow-logs"
  retention_in_days = var.flow_log_retention_days

  tags = local.common_tags
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name_prefix = "${var.name}-${var.environment}-flow-logs-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name_prefix = "flow-logs-"
  role        = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
      ]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "this" {
  count = var.enable_flow_logs ? 1 : 0

  vpc_id                   = aws_vpc.this.id
  traffic_type             = "ALL"
  iam_role_arn             = aws_iam_role.flow_logs[0].arn
  log_destination          = aws_cloudwatch_log_group.flow_logs[0].arn
  max_aggregation_interval = 60  # 1-minute aggregation

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-flow-log"
  })
}

# ===========================================================================
# VPC Endpoints — reduce NAT costs for AWS service traffic
# ===========================================================================

# S3 Gateway Endpoint (free)
resource "aws_vpc_endpoint" "s3" {
  count = var.enable_s3_endpoint ? 1 : 0

  vpc_id       = aws_vpc.this.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-s3-endpoint"
  })
}

# DynamoDB Gateway Endpoint (free)
resource "aws_vpc_endpoint" "dynamodb" {
  count = var.enable_dynamodb_endpoint ? 1 : 0

  vpc_id       = aws_vpc.this.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.dynamodb"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = merge(local.common_tags, {
    Name = "${var.name}-${var.environment}-dynamodb-endpoint"
  })
}

# Data source to get current region
data "aws_region" "current" {}

# ===========================================================================
# Outputs
# ===========================================================================

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.this.cidr_block
}

output "vpc_ipv6_cidr_block" {
  description = "IPv6 CIDR block of the VPC"
  value       = aws_vpc.this.ipv6_cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "public_subnet_cidrs" {
  description = "List of public subnet CIDR blocks"
  value       = aws_subnet.public[*].cidr_block
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "private_subnet_cidrs" {
  description = "List of private subnet CIDR blocks"
  value       = aws_subnet.private[*].cidr_block
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = aws_nat_gateway.this[*].id
}

output "nat_gateway_public_ips" {
  description = "List of NAT Gateway public (Elastic) IP addresses"
  value       = aws_eip.nat[*].public_ip
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.this.id
}

output "public_route_table_id" {
  description = "ID of the public route table"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "List of private route table IDs (one per AZ)"
  value       = aws_route_table.private[*].id
}

output "bastion_security_group_id" {
  description = "ID of the bastion / SSH security group"
  value       = aws_security_group.bastion.id
}

output "application_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.application.id
}

output "database_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.database.id
}

output "availability_zones" {
  description = "List of availability zones used"
  value       = var.availability_zones
}
