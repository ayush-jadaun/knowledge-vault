---
title: Terraform Workspaces
description: Workspace-based environments vs directory-based environments — workspace naming conventions, when workspaces are appropriate, and patterns for managing multiple environments safely.
tags:
  - terraform
  - workspaces
  - environments
  - iac
  - infrastructure
difficulty: intermediate
prerequisites:
  - infrastructure/terraform/fundamentals
  - infrastructure/terraform/state-management
lastReviewed: "2026-03-17"
---

# Terraform Workspaces

Terraform workspaces allow you to maintain multiple state files from a single configuration. Each workspace has its own state, so `terraform apply` in the `dev` workspace creates dev infrastructure, and the same `terraform apply` in the `production` workspace creates production infrastructure. The configuration is shared; the state is separate.

This sounds elegant, but workspaces are not the right tool for every situation. This page covers how they work, when to use them, and when to use the directory-based alternative instead.

## How Workspaces Work

Every Terraform configuration starts with a workspace called `default`. You create additional workspaces with `terraform workspace new`:

```bash
# See current workspace
terraform workspace show
# default

# List all workspaces
terraform workspace list
# * default

# Create a new workspace
terraform workspace new dev
# Created and switched to workspace "dev"

terraform workspace new staging
terraform workspace new production

# Switch between workspaces
terraform workspace select production

# Delete a workspace (must switch away first)
terraform workspace select default
terraform workspace delete dev
```

### State File Location

With the S3 backend, workspace state files are organized like this:

```
s3://mycompany-terraform-state/
├── myapp/terraform.tfstate                           # default workspace
└── env:/
    ├── dev/myapp/terraform.tfstate                   # dev workspace
    ├── staging/myapp/terraform.tfstate               # staging workspace
    └── production/myapp/terraform.tfstate             # production workspace
```

The `env:` prefix is added automatically by Terraform. You configure only the base key:

```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "myapp/terraform.tfstate"     # Base key
    region         = "us-east-1"
    dynamodb_table = "terraform-state-locks"
  }
}
```

### Using the Workspace Name

The current workspace name is available as `terraform.workspace`:

```hcl
locals {
  environment = terraform.workspace

  # Environment-specific configuration
  config = {
    dev = {
      instance_type  = "t3.micro"
      instance_count = 1
      multi_az       = false
      db_class       = "db.t3.micro"
      db_storage     = 20
      enable_waf     = false
      domain         = "dev.myapp.com"
    }
    staging = {
      instance_type  = "t3.small"
      instance_count = 2
      multi_az       = false
      db_class       = "db.t3.small"
      db_storage     = 50
      enable_waf     = false
      domain         = "staging.myapp.com"
    }
    production = {
      instance_type  = "m5.large"
      instance_count = 3
      multi_az       = true
      db_class       = "db.r5.large"
      db_storage     = 200
      enable_waf     = true
      domain         = "myapp.com"
    }
  }

  env_config = local.config[terraform.workspace]
}

# Use workspace-specific values
resource "aws_instance" "web" {
  count         = local.env_config.instance_count
  instance_type = local.env_config.instance_type
  # ...

  tags = {
    Name        = "myapp-web-${terraform.workspace}-${count.index + 1}"
    Environment = terraform.workspace
  }
}

resource "aws_db_instance" "main" {
  identifier     = "myapp-${terraform.workspace}"
  instance_class = local.env_config.db_class
  allocated_storage = local.env_config.db_storage
  multi_az       = local.env_config.multi_az
  # ...
}
```

### Resource Naming with Workspaces

Every resource must include the workspace name to avoid naming collisions:

```hcl
resource "aws_s3_bucket" "assets" {
  bucket = "myapp-${terraform.workspace}-assets"
}

resource "aws_ecs_cluster" "main" {
  name = "myapp-${terraform.workspace}"
}

resource "aws_db_instance" "main" {
  identifier = "myapp-${terraform.workspace}-db"
}

resource "aws_security_group" "web" {
  name = "myapp-${terraform.workspace}-web-sg"
  # ...
}
```

If you forget to include the workspace name, creating a second workspace will fail because the resource names already exist.

## Workspace-Based vs Directory-Based Environments

This is the key decision. Both approaches work, but they have different trade-offs.

### Directory-Based (Separate State Per Environment)

```
infrastructure/
├── modules/
│   ├── vpc/
│   ├── ecs/
│   └── rds/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── backend.tf          # key = "dev/terraform.tfstate"
│   │   ├── variables.tf
│   │   └── terraform.tfvars    # dev-specific values
│   ├── staging/
│   │   ├── main.tf
│   │   ├── backend.tf          # key = "staging/terraform.tfstate"
│   │   ├── variables.tf
│   │   └── terraform.tfvars    # staging-specific values
│   └── production/
│       ├── main.tf
│       ├── backend.tf          # key = "production/terraform.tfstate"
│       ├── variables.tf
│       └── terraform.tfvars    # production-specific values
```

**Advantages:**
- Each environment can have different resources (e.g., production has WAF, dev does not)
- Changes are explicit and visible in code review
- Production can use different provider versions than dev
- Different IAM permissions per environment directory
- Harder to accidentally apply to the wrong environment
- Environments can evolve independently

**Disadvantages:**
- Duplication across environment directories (mitigated by modules)
- Changes must be applied in each directory separately
- More files to manage

### Workspace-Based (Shared Configuration, Separate State)

```
infrastructure/
├── modules/
│   ├── vpc/
│   ├── ecs/
│   └── rds/
├── app/
│   ├── main.tf               # Shared configuration
│   ├── backend.tf            # Single backend config
│   ├── variables.tf
│   └── workspace-configs/
│       ├── dev.tfvars
│       ├── staging.tfvars
│       └── production.tfvars
```

**Advantages:**
- Single source of truth — all environments use the same configuration
- Changes propagate to all environments automatically
- Less file duplication
- Simpler CI/CD pipeline

**Disadvantages:**
- All environments must have the same resources (conditional logic gets complex)
- Easy to accidentally apply to the wrong workspace
- Cannot have different provider versions per environment
- Conditional logic in configuration reduces readability
- A syntax error blocks all environments

### Decision Framework

| Factor | Use Workspaces | Use Directories |
|---|---|---|
| Environments are structurally identical | Yes | Overkill |
| Environments differ significantly | No | Yes |
| Team size | Small (1-3) | Any size |
| Blast radius tolerance | Can afford mistakes | Zero tolerance |
| CI/CD complexity budget | Low | Medium |
| Compliance requirements | Low | High |
| Number of environments | 2-4 | Any |
| Ephemeral environments needed | Yes | Cumbersome |

### The Hybrid Approach

Many teams use directories for the main environments and workspaces for ephemeral ones:

```
infrastructure/
├── modules/
├── environments/
│   ├── dev/                    # Permanent dev environment (directory)
│   ├── staging/                # Permanent staging (directory)
│   └── production/             # Permanent production (directory)
└── ephemeral/                  # Feature branch environments (workspaces)
    ├── main.tf                 # Uses workspaces: feature-123, pr-456
    └── backend.tf
```

## Workspace Naming Conventions

### Standard Environments

```bash
terraform workspace new dev
terraform workspace new staging
terraform workspace new production
```

### Feature Branch Environments

```bash
# Named after the feature branch or PR number
terraform workspace new feature-auth-redesign
terraform workspace new pr-456

# Or with a prefix for sorting
terraform workspace new ephemeral-feature-auth
terraform workspace new ephemeral-pr-456
```

### Regional Environments

```bash
terraform workspace new us-east-1-production
terraform workspace new eu-west-1-production
terraform workspace new ap-southeast-1-production
```

### Validation

Prevent invalid workspace names:

```hcl
locals {
  valid_workspaces = toset(["dev", "staging", "production"])
}

resource "null_resource" "workspace_check" {
  count = contains(local.valid_workspaces, terraform.workspace) ? 0 : "ERROR: Invalid workspace '${terraform.workspace}'. Must be one of: ${join(", ", local.valid_workspaces)}"
}

# Or using a precondition (Terraform 1.2+)
resource "aws_vpc" "main" {
  cidr_block = local.env_config.vpc_cidr

  lifecycle {
    precondition {
      condition     = contains(["dev", "staging", "production"], terraform.workspace)
      error_message = "Workspace must be dev, staging, or production."
    }
  }
}
```

## Complete Workspace Example

Here is a full configuration that uses workspaces properly:

```hcl
# versions.tf
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "myapp/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-locks"
    encrypt        = true
  }
}
```

```hcl
# locals.tf
locals {
  environment = terraform.workspace

  workspace_config = {
    dev = {
      aws_region     = "us-east-1"
      vpc_cidr       = "10.10.0.0/16"
      instance_type  = "t3.micro"
      desired_count  = 1
      min_count      = 1
      max_count      = 2
      db_class       = "db.t3.micro"
      db_storage     = 20
      db_multi_az    = false
      cache_type     = "cache.t3.micro"
      cache_nodes    = 1
      enable_waf     = false
      alarm_actions  = []
      domain_prefix  = "dev"
    }
    staging = {
      aws_region     = "us-east-1"
      vpc_cidr       = "10.20.0.0/16"
      instance_type  = "t3.small"
      desired_count  = 2
      min_count      = 2
      max_count      = 4
      db_class       = "db.t3.medium"
      db_storage     = 50
      db_multi_az    = false
      cache_type     = "cache.t3.small"
      cache_nodes    = 1
      enable_waf     = false
      alarm_actions  = []
      domain_prefix  = "staging"
    }
    production = {
      aws_region     = "us-east-1"
      vpc_cidr       = "10.0.0.0/16"
      instance_type  = "m5.large"
      desired_count  = 3
      min_count      = 3
      max_count      = 10
      db_class       = "db.r5.large"
      db_storage     = 200
      db_multi_az    = true
      cache_type     = "cache.r5.large"
      cache_nodes    = 3
      enable_waf     = true
      alarm_actions  = ["arn:aws:sns:us-east-1:123456789:production-alerts"]
      domain_prefix  = ""
    }
  }

  config = local.workspace_config[terraform.workspace]

  name_prefix = "myapp-${local.environment}"

  common_tags = {
    Project     = "myapp"
    Environment = local.environment
    ManagedBy   = "terraform"
    Workspace   = terraform.workspace
  }

  azs = ["${local.config.aws_region}a", "${local.config.aws_region}b", "${local.config.aws_region}c"]

  public_subnets  = [for i in range(3) : cidrsubnet(local.config.vpc_cidr, 8, i)]
  private_subnets = [for i in range(3) : cidrsubnet(local.config.vpc_cidr, 8, i + 10)]
  db_subnets      = [for i in range(3) : cidrsubnet(local.config.vpc_cidr, 8, i + 20)]
}
```

```hcl
# main.tf
provider "aws" {
  region = local.config.aws_region

  default_tags {
    tags = local.common_tags
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name                  = local.name_prefix
  cidr_block            = local.config.vpc_cidr
  availability_zones    = local.azs
  public_subnet_cidrs   = local.public_subnets
  private_subnet_cidrs  = local.private_subnets
  database_subnet_cidrs = local.db_subnets

  enable_nat_gateway = true
  single_nat_gateway = local.environment != "production"
  enable_flow_logs   = true

  tags = local.common_tags
}

module "ecs" {
  source = "../../modules/ecs"

  name          = local.name_prefix
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = module.vpc.private_subnet_ids
  instance_type = local.config.instance_type
  desired_count = local.config.desired_count
  min_count     = local.config.min_count
  max_count     = local.config.max_count

  tags = local.common_tags
}

module "rds" {
  source = "../../modules/rds"

  name           = local.name_prefix
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.database_subnet_ids
  instance_class = local.config.db_class
  storage_gb     = local.config.db_storage
  multi_az       = local.config.db_multi_az

  tags = local.common_tags
}
```

## CI/CD with Workspaces

### GitHub Actions Workflow

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  TF_WORKING_DIR: infrastructure/app

jobs:
  plan:
    name: Plan (${{ matrix.workspace }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [dev, staging, production]
      fail-fast: false

    permissions:
      contents: read
      pull-requests: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/terraform-ci
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init

      - name: Select Workspace
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform workspace select ${{ matrix.workspace }} || terraform workspace new ${{ matrix.workspace }}

      - name: Terraform Plan
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform plan -no-color -out=tfplan
        continue-on-error: true

      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            // Post plan output as PR comment

  apply:
    name: Apply (${{ matrix.workspace }})
    needs: plan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [dev, staging, production]
      max-parallel: 1  # Apply sequentially: dev → staging → production

    environment:
      name: ${{ matrix.workspace }}

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/terraform-ci
          aws-region: us-east-1

      - name: Terraform Init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init

      - name: Select Workspace
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform workspace select ${{ matrix.workspace }}

      - name: Terraform Apply
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform apply -auto-approve
```

### Safety Checks

Add workspace-aware safety checks:

```hcl
# Prevent accidental production changes
resource "null_resource" "production_safety" {
  count = terraform.workspace == "production" ? 1 : 0

  lifecycle {
    precondition {
      condition     = var.i_understand_this_is_production == true
      error_message = "You must set i_understand_this_is_production = true to apply to production."
    }
  }
}

variable "i_understand_this_is_production" {
  type    = bool
  default = false
}
```

## When Workspaces Are NOT Appropriate

### 1. Significantly Different Infrastructure

If production has a WAF, CloudFront, and multi-AZ RDS but dev has none of these, the conditional logic becomes unreadable:

```hcl
# This is too complex — use directory-based environments instead
resource "aws_wafv2_web_acl" "main" {
  count = terraform.workspace == "production" ? 1 : 0
  # ...
}

resource "aws_cloudfront_distribution" "main" {
  count = contains(["staging", "production"], terraform.workspace) ? 1 : 0
  # ...50 lines of config with workspace conditionals...
}

resource "aws_db_instance" "replica" {
  count = terraform.workspace == "production" ? 2 : 0
  # ...
}
```

### 2. Different AWS Accounts Per Environment

Workspaces all share the same provider configuration. If dev is in account 111, staging in 222, and production in 333, workspaces do not work cleanly.

### 3. Different Teams Own Different Environments

If the platform team owns production and developers own dev, the access control model for workspaces is awkward — both teams need access to the same configuration directory.

### 4. Compliance Requirements

Auditors want to see exactly what is deployed in production. With workspaces, the configuration is shared and the differences are in variables. With directories, the production configuration is explicit and reviewable.

## Ephemeral Environments with Workspaces

The strongest use case for workspaces is ephemeral environments — temporary environments created for feature branches, load testing, or demos:

```bash
# Create environment for a feature branch
terraform workspace new feature-payment-v2

# Apply the feature branch infrastructure
terraform apply -var-file="ephemeral.tfvars"

# Test the feature
# ...

# Tear down
terraform destroy -auto-approve
terraform workspace select dev
terraform workspace delete feature-payment-v2
```

### Automated Ephemeral Environments

```yaml
# .github/workflows/ephemeral.yml
name: Ephemeral Environment

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Create Ephemeral Environment
        run: |
          cd infrastructure/app
          terraform init
          terraform workspace select pr-${{ github.event.pull_request.number }} || \
            terraform workspace new pr-${{ github.event.pull_request.number }}
          terraform apply -auto-approve -var-file="ephemeral.tfvars"

      - name: Post URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Ephemeral environment deployed at: https://pr-${context.issue.number}.dev.myapp.com`
            })

  destroy:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Destroy Ephemeral Environment
        run: |
          cd infrastructure/app
          terraform init
          terraform workspace select pr-${{ github.event.pull_request.number }}
          terraform destroy -auto-approve
          terraform workspace select dev
          terraform workspace delete pr-${{ github.event.pull_request.number }}
```

## Workspace Anti-Patterns

### 1. Checking terraform.workspace Everywhere

```hcl
# Anti-pattern: scattered workspace checks
resource "aws_instance" "web" {
  instance_type = terraform.workspace == "production" ? "m5.large" : (
    terraform.workspace == "staging" ? "t3.small" : "t3.micro"
  )
}

# Better: centralized config map (shown above)
resource "aws_instance" "web" {
  instance_type = local.env_config.instance_type
}
```

### 2. Using Default Workspace for Real Infrastructure

```hcl
# Anti-pattern: the default workspace is production
# What if someone forgets to switch workspaces?

# Better: prevent use of default workspace
resource "null_resource" "no_default_workspace" {
  lifecycle {
    precondition {
      condition     = terraform.workspace != "default"
      error_message = "Do not use the default workspace. Use: terraform workspace select dev|staging|production"
    }
  }
}
```

### 3. Too Many Workspaces

If you have 20 workspaces, you have 20 state files that can drift, 20 apply operations to manage, and 20 potential points of failure. Consider whether you need that many active environments.

## What to Learn Next

- **[Modules](./modules)** — structure your Terraform code for reuse across workspaces
- **[AWS Startup Stack](./aws-startup-stack)** — a complete production infrastructure that can use either workspace or directory-based environments
- **[State Management](./state-management)** — understand how workspace state files are stored and managed
