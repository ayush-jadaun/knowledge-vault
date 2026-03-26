---
title: "Terraform Cheat Sheet"
description: "Quick reference for Terraform commands, HCL patterns, state management, and module patterns"
tags: [cheat-sheet, terraform, iac, infrastructure]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Terraform Cheat Sheet

Quick reference for Terraform CLI commands, HCL patterns, state management, and module best practices.

**Deep dive**: [Terraform Section](/infrastructure/terraform/) | [Terraform State](/infrastructure/terraform/state-management) | [Terraform Modules](/infrastructure/terraform/modules)

---

## CLI Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `terraform init` | Initialize working directory, download providers |
| `terraform init -upgrade` | Upgrade provider versions |
| `terraform plan` | Preview changes without applying |
| `terraform plan -out=plan.tfplan` | Save plan to file |
| `terraform apply` | Apply changes (interactive approval) |
| `terraform apply plan.tfplan` | Apply saved plan (no prompt) |
| `terraform apply -auto-approve` | Apply without prompting |
| `terraform destroy` | Destroy all managed resources |
| `terraform destroy -target=aws_s3_bucket.logs` | Destroy specific resource |

### Inspection

| Command | Description |
|---------|-------------|
| `terraform show` | Show current state |
| `terraform show plan.tfplan` | Show saved plan details |
| `terraform output` | Show all outputs |
| `terraform output -json` | Outputs as JSON |
| `terraform output db_endpoint` | Specific output |
| `terraform graph \| dot -Tpng > graph.png` | Resource dependency graph |
| `terraform providers` | Show required providers |
| `terraform version` | Terraform and provider versions |

### State Management

| Command | Description |
|---------|-------------|
| `terraform state list` | List all resources in state |
| `terraform state show aws_s3_bucket.main` | Show resource details |
| `terraform state mv old_name new_name` | Rename resource in state |
| `terraform state rm resource` | Remove from state (keep real resource) |
| `terraform state pull` | Download remote state to stdout |
| `terraform state push` | Upload state (dangerous) |
| `terraform import aws_s3_bucket.main bucket-name` | Import existing resource |
| `terraform refresh` | Sync state with real infrastructure |

### Workspaces

| Command | Description |
|---------|-------------|
| `terraform workspace list` | List workspaces |
| `terraform workspace new staging` | Create workspace |
| `terraform workspace select staging` | Switch workspace |
| `terraform workspace delete staging` | Delete workspace |
| `terraform workspace show` | Current workspace name |

### Formatting & Validation

| Command | Description |
|---------|-------------|
| `terraform fmt` | Format files in current directory |
| `terraform fmt -recursive` | Format all files recursively |
| `terraform fmt -check` | Check formatting (CI use) |
| `terraform validate` | Validate configuration syntax |
| `terraform console` | Interactive expression console |

---

## HCL Patterns

### Variables

```hcl
# String variable
variable "region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region"
}

# Number variable
variable "instance_count" {
  type    = number
  default = 3
}

# Boolean variable
variable "enable_monitoring" {
  type    = bool
  default = true
}

# List variable
variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

# Map variable
variable "tags" {
  type = map(string)
  default = {
    Environment = "production"
    Team        = "platform"
  }
}

# Object variable
variable "database" {
  type = object({
    engine         = string
    instance_class = string
    storage_gb     = number
    multi_az       = bool
  })
  default = {
    engine         = "postgres"
    instance_class = "db.t3.medium"
    storage_gb     = 100
    multi_az       = true
  }
}

# Validation
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

# Sensitive variable
variable "db_password" {
  type      = string
  sensitive = true
}
```

### Setting Variables

```bash
# Command line
terraform apply -var="region=us-west-2"

# Variable file
terraform apply -var-file="production.tfvars"

# Environment variables
export TF_VAR_region="us-west-2"

# Auto-loaded files (no flag needed)
# terraform.tfvars
# terraform.tfvars.json
# *.auto.tfvars
# *.auto.tfvars.json
```

### Outputs

```hcl
output "db_endpoint" {
  value       = aws_db_instance.main.endpoint
  description = "Database connection endpoint"
}

output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = true
}

# Output from child module
output "vpc_id" {
  value = module.vpc.vpc_id
}
```

### Locals

```hcl
locals {
  environment = terraform.workspace
  name_prefix = "${var.project}-${local.environment}"

  common_tags = {
    Project     = var.project
    Environment = local.environment
    ManagedBy   = "terraform"
  }

  # Computed values
  is_production = local.environment == "production"
  instance_type = local.is_production ? "t3.large" : "t3.small"
}
```

---

## Resource Patterns

### Basic Resource

```hcl
resource "aws_s3_bucket" "logs" {
  bucket = "${local.name_prefix}-logs"
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

### count (Conditional Creation)

```hcl
# Create resource only in production
resource "aws_cloudwatch_metric_alarm" "cpu" {
  count = var.environment == "production" ? 1 : 0
  # ...
}

# Reference count resource
output "alarm_arn" {
  value = var.environment == "production" ? aws_cloudwatch_metric_alarm.cpu[0].arn : null
}
```

### for_each (Multiple Similar Resources)

```hcl
# From a map
variable "buckets" {
  default = {
    logs    = { versioning = true }
    backups = { versioning = true }
    assets  = { versioning = false }
  }
}

resource "aws_s3_bucket" "this" {
  for_each = var.buckets
  bucket   = "${local.name_prefix}-${each.key}"
  tags     = local.common_tags
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = { for k, v in var.buckets : k => v if v.versioning }
  bucket   = aws_s3_bucket.this[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

# From a set
resource "aws_iam_user" "this" {
  for_each = toset(["alice", "bob", "charlie"])
  name     = each.value
}
```

### Dynamic Blocks

```hcl
resource "aws_security_group" "web" {
  name   = "${local.name_prefix}-web"
  vpc_id = var.vpc_id

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = "tcp"
      cidr_blocks = ingress.value.cidr_blocks
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### Lifecycle Rules

```hcl
resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = var.instance_type

  lifecycle {
    create_before_destroy = true  # New resource before destroying old
    prevent_destroy       = true  # Prevent accidental deletion
    ignore_changes        = [tags, ami]  # Ignore external changes
  }
}

# Replacement trigger
resource "aws_instance" "web" {
  # ...
  lifecycle {
    replace_triggered_by = [null_resource.trigger.id]
  }
}
```

---

## Data Sources

```hcl
# Look up existing resources
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["main-vpc"]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-*-22.04-amd64-server-*"]
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Use in resources
resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  subnet_id     = data.aws_vpc.main.id
  instance_type = "t3.micro"
}
```

---

## Module Patterns

### Module Structure

```
modules/
  vpc/
    main.tf          # Resources
    variables.tf     # Input variables
    outputs.tf       # Output values
    versions.tf      # Required providers
    README.md        # Usage docs
```

### Module Definition

```hcl
# modules/vpc/variables.tf
variable "name" { type = string }
variable "cidr" { type = string }
variable "azs"  { type = list(string) }

# modules/vpc/main.tf
resource "aws_vpc" "this" {
  cidr_block = var.cidr
  tags       = { Name = var.name }
}

# modules/vpc/outputs.tf
output "vpc_id"     { value = aws_vpc.this.id }
output "vpc_cidr"   { value = aws_vpc.this.cidr_block }
```

### Module Usage

```hcl
# Use local module
module "vpc" {
  source = "./modules/vpc"
  name   = "main"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b"]
}

# Use registry module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "main"
  cidr    = "10.0.0.0/16"
}

# Use Git module
module "vpc" {
  source = "git::https://github.com/org/modules.git//vpc?ref=v1.0.0"
}

# Reference module outputs
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_ids[0]
}
```

---

## State Management

### Remote Backend (S3)

```hcl
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/vpc/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

### State Locking

DynamoDB table for state locking:

```hcl
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

### State Operations

```bash
# Move resource between state files
terraform state mv -state-out=other.tfstate aws_s3_bucket.old aws_s3_bucket.new

# Import existing resource
terraform import aws_s3_bucket.existing actual-bucket-name

# Remove from state without destroying
terraform state rm aws_s3_bucket.no_longer_managed

# Taint resource to force recreation (deprecated, use -replace)
terraform apply -replace=aws_instance.web
```

---

## Expressions & Functions

### String Functions

```hcl
locals {
  upper       = upper("hello")           # "HELLO"
  lower       = lower("HELLO")           # "hello"
  trimmed     = trimspace(" hi ")        # "hi"
  replaced    = replace("hello", "l", "r") # "herro"
  joined      = join(",", ["a", "b"])    # "a,b"
  split       = split(",", "a,b,c")     # ["a", "b", "c"]
  formatted   = format("Hello, %s!", "world")
  substr      = substr("hello", 0, 3)   # "hel"
  regex_match = regex("^[a-z]+$", "hello") # "hello"
}
```

### Collection Functions

```hcl
locals {
  merged    = merge(var.tags, { Extra = "tag" })
  keys      = keys(var.tags)
  values    = values(var.tags)
  looked_up = lookup(var.tags, "Env", "default")
  flat      = flatten([["a"], ["b", "c"]])  # ["a", "b", "c"]
  distinct  = distinct(["a", "a", "b"])     # ["a", "b"]
  sorted    = sort(["c", "a", "b"])         # ["a", "b", "c"]
  contains  = contains(["a", "b"], "a")     # true
  length    = length(var.list)
  elem      = element(var.list, 0)
  chunked   = chunklist(var.list, 2)
}
```

### Conditional & Loop Expressions

```hcl
# Conditional
locals {
  instance_type = var.env == "production" ? "t3.large" : "t3.micro"
}

# For expression (transform list)
locals {
  upper_names = [for name in var.names : upper(name)]
}

# For expression (transform to map)
locals {
  name_map = { for name in var.names : name => upper(name) }
}

# For expression with filter
locals {
  production_servers = [for s in var.servers : s if s.env == "production"]
}

# Splat expression
locals {
  instance_ids = aws_instance.web[*].id
}
```

---

## Provider Configuration

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Default provider
provider "aws" {
  region = var.region
}

# Aliased provider (multi-region)
provider "aws" {
  alias  = "us_west"
  region = "us-west-2"
}

# Use aliased provider
resource "aws_s3_bucket" "west" {
  provider = aws.us_west
  bucket   = "my-bucket-west"
}
```

---

## CI/CD Integration

```bash
# CI pipeline commands
terraform init -input=false
terraform validate
terraform fmt -check
terraform plan -input=false -out=plan.tfplan

# CD pipeline commands
terraform apply -input=false plan.tfplan
```

### Plan as PR Comment

```bash
# Generate plan and save output
terraform plan -no-color -out=plan.tfplan > plan.txt 2>&1

# Post as PR comment (GitHub Actions)
# Use a GitHub Action like hashicorp/setup-terraform
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Iteration | `count` | `for_each` | Conditional creation | Named instances, maps |
| Config | Variable | Local | User-provided input | Computed/derived values |
| Lookup | Data source | Hard-coded | Resource may change | Known, fixed value |
| Modules | Local | Registry | Custom logic, private | Standard patterns (VPC, EKS) |
| State | S3 + DynamoDB | Terraform Cloud | Self-managed, AWS-only | Multi-cloud, team features |
| Env separation | Workspaces | Directories | Same config, diff vars | Different configs |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| State lock stuck | `terraform force-unlock LOCK_ID` |
| Provider version conflict | `terraform init -upgrade` |
| Resource drift | `terraform plan` to detect, `apply` to reconcile |
| Circular dependency | Refactor resources, use `depends_on` explicitly |
| Slow plan | Split into smaller state files, use `-target` |
| Import fails | Check resource ID format in provider docs |
| Destroy blocked by dependency | Destroy dependent resources first or use `-target` |
| State file corrupted | Restore from backend versioning (S3 versioning) |
| Module source changed | `terraform init -upgrade` |
| Provider auth error | Check env vars, AWS profile, credentials |

---

::: details Test Yourself
1. **What command previews infrastructure changes without applying them?**
   `terraform plan`

2. **How do you import an existing AWS S3 bucket into Terraform state?**
   `terraform import aws_s3_bucket.main bucket-name`

3. **What meta-argument creates multiple similar resources from a map or set?**
   `for_each`

4. **How do you remove a resource from state without destroying the real infrastructure?**
   `terraform state rm resource`

5. **What lifecycle rule prevents accidental deletion of a resource?**
   `prevent_destroy = true`

6. **What command forces recreation of a specific resource (replacing `-taint`)?**
   `terraform apply -replace=aws_instance.web`

7. **How do you set a Terraform variable via an environment variable?**
   `export TF_VAR_region="us-west-2"`

8. **What HCL function merges two maps together?**
   `merge(var.tags, { Extra = "tag" })`

9. **What is the difference between `count` and `for_each`?**
   `count` is for conditional creation (0 or 1) or identical copies; `for_each` is for named instances from a map or set.

10. **How do you unlock a stuck Terraform state lock?**
    `terraform force-unlock LOCK_ID`
:::

::: danger Common Gotchas
- **Forgetting to run `terraform plan` before `apply`.** Always review the plan. An innocent-looking change can trigger a resource replacement that causes downtime.
- **Storing secrets in `.tf` files.** Use `sensitive = true` variables, environment variables, or a secrets manager. Never commit passwords to version control.
- **Using `terraform destroy` without `-target`.** Without a target, it destroys ALL managed resources. Always double-check which workspace and state you are in.
- **Not using remote state with locking.** Without a DynamoDB lock table, two people running `apply` simultaneously can corrupt the state file.
:::

## One-Liner Summary

Terraform lets you define infrastructure as code in HCL, plan changes before applying them, and track everything in state -- master `plan`, `import`, `for_each`, and remote state to manage any cloud.
