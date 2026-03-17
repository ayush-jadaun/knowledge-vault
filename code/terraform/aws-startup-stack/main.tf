# =============================================================================
# AWS Startup Stack — Root Module
# =============================================================================
# Production-ready AWS infrastructure for a typical startup:
#   VPC + ECS Fargate + RDS PostgreSQL + ElastiCache Redis + ALB + CloudFront
#
# Usage:
#   terraform init
#   terraform plan -var-file="terraform.tfvars"
#   terraform apply -var-file="terraform.tfvars"
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

  # ---------------------------------------------------------------------------
  # Remote state backend — S3 + DynamoDB for state locking
  # Create the S3 bucket and DynamoDB table before running terraform init:
  #   aws s3api create-bucket --bucket <your-state-bucket> --region <region>
  #   aws dynamodb create-table --table-name terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST
  # ---------------------------------------------------------------------------
  backend "s3" {
    bucket         = "my-startup-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

# ---------------------------------------------------------------------------
# AWS Provider
# ---------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Secondary provider for CloudFront (must be us-east-1 for ACM certs)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Fetch available AZs in the region
data "aws_availability_zones" "available" {
  state = "available"
}

# ---------------------------------------------------------------------------
# Random suffix for globally unique resource names
# ---------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

# ---------------------------------------------------------------------------
# Local values used throughout the stack
# ---------------------------------------------------------------------------
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name

  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
