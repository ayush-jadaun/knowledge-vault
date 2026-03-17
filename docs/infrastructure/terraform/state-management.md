---
title: Terraform State Management
description: Deep dive into Terraform state — local vs remote backends (S3+DynamoDB, GCS, Terraform Cloud), state locking, state file structure, terraform import, and state manipulation commands.
tags:
  - terraform
  - state
  - iac
  - infrastructure
  - s3
  - dynamodb
difficulty: intermediate
prerequisites:
  - infrastructure/terraform/fundamentals
lastReviewed: "2026-03-17"
---

# Terraform State Management

Terraform state is the mechanism that maps your configuration to real infrastructure. Without state, Terraform has no idea what it has created, what needs updating, and what should be destroyed. State management is the single most important operational concern when running Terraform in a team, and getting it wrong can lead to duplicate resources, data loss, or infrastructure outages.

## What State Is and Why It Exists

When you run `terraform apply`, Terraform creates resources and records their attributes in a state file. This file is a JSON document that contains:

1. **Resource mappings**: Which configuration block maps to which real-world resource (e.g., `aws_instance.web` → `i-0abc123def456`)
2. **Resource attributes**: All known attributes of each resource (IP addresses, ARNs, IDs)
3. **Dependencies**: The dependency graph between resources
4. **Metadata**: Provider versions, Terraform version, serial number

### Why Not Just Query the Cloud API?

You might wonder why Terraform needs state at all. Could it not just query AWS/GCP to see what exists? Three reasons:

**Performance**: A configuration with 500 resources would require 500+ API calls just to check current state. State caching makes `terraform plan` fast.

**Mapping**: There is no universal way to map a Terraform resource name (`aws_instance.web`) to a cloud resource. The state file maintains this mapping.

**Deleted resources**: If you remove a resource from your configuration, Terraform needs to know it previously existed so it can destroy it. Without state, it would just forget about the resource, leaving an orphan in your cloud account.

## State File Structure

A state file looks like this (simplified):

```json
{
  "version": 4,
  "terraform_version": "1.6.0",
  "serial": 42,
  "lineage": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "outputs": {
    "vpc_id": {
      "value": "vpc-0abc123def456",
      "type": "string"
    }
  },
  "resources": [
    {
      "mode": "managed",
      "type": "aws_vpc",
      "name": "main",
      "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
      "instances": [
        {
          "schema_version": 1,
          "attributes": {
            "id": "vpc-0abc123def456",
            "cidr_block": "10.0.0.0/16",
            "enable_dns_support": true,
            "enable_dns_hostnames": true,
            "tags": {
              "Name": "myapp-vpc",
              "Environment": "production"
            }
          }
        }
      ]
    }
  ]
}
```

Key fields:

- **serial**: Incremented on every state change. Used for conflict detection.
- **lineage**: UUID that uniquely identifies this state. Prevents accidentally applying one project's state to another.
- **outputs**: Values exported by `output` blocks, available to other configurations.
- **resources**: The core content — every managed resource and its current attributes.

## Local State

By default, Terraform stores state in a file called `terraform.tfstate` in the working directory:

```
project/
├── main.tf
├── terraform.tfstate          # Current state
└── terraform.tfstate.backup   # Previous state (automatic backup)
```

### When Local State Is Fine

- Personal projects and experiments
- Tutorials and learning
- Single-developer projects with no collaboration
- Temporary infrastructure that will be destroyed soon

### When Local State Breaks Down

- **Two people run `terraform apply` simultaneously** — one overwrites the other's changes, causing duplicate or conflicting resources
- **State file on a laptop** — if the laptop dies, you lose your state and must manually import every resource
- **Secrets in state** — database passwords, API keys, and other sensitive values are stored in plaintext in the state file
- **No locking** — nothing prevents concurrent modifications

## Remote State Backends

Remote backends store state in a shared location with locking support. This is non-negotiable for team use.

### S3 + DynamoDB (AWS)

The most common backend for AWS shops. S3 stores the state file, DynamoDB provides locking.

#### Bootstrap the Backend

You need the S3 bucket and DynamoDB table to exist before you can use them as a backend. This is a chicken-and-egg problem solved by bootstrapping:

```hcl
# bootstrap/main.tf — Run this ONCE to create the backend infrastructure

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "mycompany-terraform-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name      = "terraform-state-locks"
    ManagedBy = "terraform"
  }
}

output "state_bucket_name" {
  value = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  value = aws_s3_bucket.terraform_state.arn
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.terraform_locks.name
}
```

#### Use the Backend

After bootstrapping, configure your projects to use the remote backend:

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "projects/myapp/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-locks"
    encrypt        = true
    # Optional: use a specific KMS key
    # kms_key_id   = "arn:aws:kms:us-east-1:123456789:key/abc-123"
  }
}
```

The `key` determines the path within the S3 bucket. Use a consistent naming convention:

```
projects/{project-name}/{environment}/terraform.tfstate
# or
{team}/{project}/{environment}/terraform.tfstate
```

#### IAM Policy for State Access

Restrict who can read and write state:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformStateListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::mycompany-terraform-state"
    },
    {
      "Sid": "TerraformStateGetPut",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::mycompany-terraform-state/projects/myapp/*"
    },
    {
      "Sid": "TerraformStateLocking",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/terraform-state-locks"
    },
    {
      "Sid": "TerraformStateEncryption",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

### GCS Backend (Google Cloud)

```hcl
# Bootstrap
resource "google_storage_bucket" "terraform_state" {
  name     = "mycompany-terraform-state"
  location = "US"
  project  = var.project_id

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Usage
terraform {
  backend "gcs" {
    bucket = "mycompany-terraform-state"
    prefix = "projects/myapp/production"
  }
}
```

GCS provides built-in locking — no separate locking table required.

### Terraform Cloud / HCP Terraform Backend

```hcl
terraform {
  cloud {
    organization = "mycompany"

    workspaces {
      name = "myapp-production"
    }
  }
}
```

Terraform Cloud provides state storage, locking, run history, policy enforcement (Sentinel), and a web UI. It is the simplest option if you do not mind the dependency on HashiCorp's SaaS.

### Consul Backend

For organizations already running Consul:

```hcl
terraform {
  backend "consul" {
    address = "consul.example.com:8500"
    scheme  = "https"
    path    = "terraform/myapp/production"
    lock    = true
  }
}
```

### Azure Blob Storage Backend

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "mycompanytfstate"
    container_name       = "tfstate"
    key                  = "myapp/production/terraform.tfstate"
  }
}
```

## State Locking

State locking prevents two processes from modifying state simultaneously. Without locking, concurrent applies can corrupt state or create duplicate resources.

### How Locking Works

1. Before modifying state, Terraform acquires a lock (DynamoDB item, GCS object lock, etc.)
2. If the lock is held by another process, Terraform waits or fails
3. After modification, Terraform releases the lock

### Lock Troubleshooting

Sometimes a lock gets stuck — for example, if Terraform crashes mid-apply or a CI runner is terminated:

```bash
# See who holds the lock
# The error message includes the lock ID

# Force unlock (use with extreme caution)
terraform force-unlock LOCK_ID

# Before force-unlocking, verify:
# 1. No other Terraform process is actually running
# 2. The previous run has definitely terminated
# 3. Check the DynamoDB table or lock storage directly
```

DynamoDB lock entry structure:

```json
{
  "LockID": {
    "S": "mycompany-terraform-state/projects/myapp/production/terraform.tfstate"
  },
  "Info": {
    "S": "{\"ID\":\"abc123\",\"Operation\":\"OperationTypeApply\",\"Info\":\"\",\"Who\":\"user@hostname\",\"Version\":\"1.6.0\",\"Created\":\"2024-01-15T10:30:00Z\",\"Path\":\"\"}"
  }
}
```

## State Manipulation Commands

These commands modify state directly. Use them carefully — a mistake can orphan resources or cause Terraform to try creating resources that already exist.

### terraform state list

Lists all resources in state:

```bash
terraform state list
# aws_vpc.main
# aws_subnet.public[0]
# aws_subnet.public[1]
# aws_subnet.private[0]
# aws_subnet.private[1]
# module.rds.aws_db_instance.main
# module.rds.aws_db_subnet_group.main

# Filter with a pattern
terraform state list 'aws_subnet.*'
# aws_subnet.public[0]
# aws_subnet.public[1]
# aws_subnet.private[0]
# aws_subnet.private[1]

# List resources in a module
terraform state list 'module.rds'
# module.rds.aws_db_instance.main
# module.rds.aws_db_subnet_group.main
```

### terraform state show

Displays detailed attributes of a single resource:

```bash
terraform state show aws_vpc.main
# resource "aws_vpc" "main" {
#     arn                    = "arn:aws:ec2:us-east-1:123456789:vpc/vpc-0abc123"
#     cidr_block             = "10.0.0.0/16"
#     enable_dns_hostnames   = true
#     enable_dns_support     = true
#     id                     = "vpc-0abc123"
#     ...
# }
```

### terraform state mv

Moves a resource within state. Use when you rename a resource or move it into/out of a module:

```bash
# Rename a resource
terraform state mv aws_instance.web_server aws_instance.web

# Move a resource into a module
terraform state mv aws_instance.web module.compute.aws_instance.web

# Move a resource out of a module
terraform state mv module.compute.aws_instance.web aws_instance.web

# Move between module instances
terraform state mv 'module.vpc["us-east-1"]' 'module.vpc["primary"]'

# Rename a module
terraform state mv module.old_name module.new_name

# Move a resource from count to for_each
terraform state mv 'aws_subnet.public[0]' 'aws_subnet.public["us-east-1a"]'
terraform state mv 'aws_subnet.public[1]' 'aws_subnet.public["us-east-1b"]'
```

Important: in modern Terraform (1.1+), prefer `moved` blocks in configuration over `terraform state mv`. The `moved` block is declarative, version-controlled, and works for the whole team:

```hcl
moved {
  from = aws_instance.web_server
  to   = aws_instance.web
}
```

### terraform state rm

Removes a resource from state without destroying the actual infrastructure. The resource continues to exist in the cloud but Terraform forgets about it:

```bash
# Remove a resource from state
terraform state rm aws_instance.web

# Remove a module from state
terraform state rm module.legacy_app

# Remove a specific index
terraform state rm 'aws_subnet.public[2]'
```

Use cases:

- Moving a resource to be managed by a different Terraform configuration
- Removing a resource that was manually deleted
- Splitting one Terraform project into multiple projects

After removing from state, if the resource still exists in your `.tf` files, Terraform will try to create a new one on the next apply. Either remove it from the configuration too, or import it into a different state.

### terraform state pull / push

Directly read or write the raw state file:

```bash
# Download current state to stdout
terraform state pull > current-state.json

# Upload a modified state file (DANGEROUS)
terraform state push modified-state.json

# Force push (even more dangerous — ignores serial number check)
terraform state push -force modified-state.json
```

You should almost never use `state push`. The only legitimate use case is disaster recovery when state has been corrupted and you are restoring from a known-good backup.

### terraform state replace-provider

When a provider changes its registry address:

```bash
terraform state replace-provider \
  "registry.terraform.io/-/aws" \
  "registry.terraform.io/hashicorp/aws"
```

## Terraform Import

`terraform import` brings existing infrastructure under Terraform management. This is essential when adopting Terraform for resources that were created manually (ClickOps) or by another tool.

### Basic Import

```bash
# Step 1: Write the resource configuration (Terraform needs it to exist)
# main.tf
resource "aws_instance" "legacy_web" {
  # You need to fill in required attributes
  # Import will populate the state, not your configuration
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
}

# Step 2: Import the resource
terraform import aws_instance.legacy_web i-0abc123def456

# Step 3: Run terraform plan to see the diff between your config and actual state
terraform plan

# Step 4: Update your configuration to match the imported state
# (fix any differences shown in the plan)
```

### Import Block (Terraform 1.5+)

The modern approach uses `import` blocks, which are declarative and can generate configuration:

```hcl
import {
  to = aws_instance.legacy_web
  id = "i-0abc123def456"
}

import {
  to = aws_s3_bucket.assets
  id = "my-assets-bucket"
}

import {
  to = aws_security_group.web
  id = "sg-0abc123def456"
}
```

Generate the configuration automatically:

```bash
# Generate configuration for imported resources
terraform plan -generate-config-out=generated_imports.tf

# Review the generated configuration
# Clean it up, then apply
terraform apply
```

### Import Complex Resources

Different resource types use different ID formats:

```bash
# VPC
terraform import aws_vpc.main vpc-0abc123

# Subnet
terraform import aws_subnet.public subnet-0abc123

# Security Group
terraform import aws_security_group.web sg-0abc123

# Security Group Rule (compound ID)
terraform import aws_security_group_rule.web_http \
  "sg-0abc123_ingress_tcp_80_80_0.0.0.0/0"

# RDS Instance
terraform import aws_db_instance.main mydb-instance

# IAM Role
terraform import aws_iam_role.web_role web-server-role

# IAM Role Policy Attachment (compound ID)
terraform import aws_iam_role_policy_attachment.web_role_policy \
  "web-server-role/arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"

# Route53 Record (compound ID)
terraform import aws_route53_record.www \
  "Z1234567890_www.example.com_A"

# Lambda Function
terraform import aws_lambda_function.api api-handler

# ECS Service
terraform import aws_ecs_service.web \
  "arn:aws:ecs:us-east-1:123456789:service/my-cluster/my-service"
```

### Bulk Import Strategy

For large-scale imports, follow this process:

```bash
# 1. List existing resources using AWS CLI
aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId, Tags]' --output table
aws ec2 describe-subnets --query 'Subnets[*].[SubnetId, VpcId, CidrBlock, AvailabilityZone]' --output table
aws ec2 describe-security-groups --query 'SecurityGroups[*].[GroupId, GroupName, VpcId]' --output table

# 2. Create import blocks for each resource
# 3. Run terraform plan -generate-config-out=generated.tf
# 4. Review and clean up generated configuration
# 5. Run terraform plan to verify no changes
# 6. Remove import blocks (they are one-time use)
```

## Sensitive Data in State

State files contain sensitive data. Database passwords, API keys, and other secrets are stored in plaintext in the state file. This is a fundamental design limitation of Terraform.

### What Gets Stored

```hcl
resource "aws_db_instance" "main" {
  identifier     = "myapp-db"
  engine         = "postgres"
  instance_class = "db.t3.medium"
  username       = "admin"
  password       = var.db_password  # This is stored in plaintext in state
}

resource "aws_secretsmanager_secret_version" "api_key" {
  secret_id     = aws_secretsmanager_secret.api_key.id
  secret_string = var.api_key  # Also stored in plaintext in state
}
```

Even if you mark variables as `sensitive`, the values are still in the state file — the `sensitive` flag only prevents them from appearing in plan output.

### Mitigation Strategies

**Encrypt state at rest**:

```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "myapp/production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:123456789:key/abc-123"
    dynamodb_table = "terraform-state-locks"
  }
}
```

**Restrict access to state**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyStateAccessExceptCI",
      "Effect": "Deny",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::mycompany-terraform-state/*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": [
            "arn:aws:iam::123456789:role/terraform-ci",
            "arn:aws:iam::123456789:role/terraform-admin"
          ]
        }
      }
    }
  ]
}
```

**Generate secrets outside Terraform**:

```hcl
# Instead of passing a password as a variable,
# let AWS generate it and store it in Secrets Manager
resource "aws_rds_cluster" "main" {
  master_username             = "admin"
  manage_master_user_password = true  # AWS generates and manages the password
}

# Or use the random provider and immediately store the secret
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "myapp/db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# The password is still in state, but it was never in a tfvars file
# or environment variable that might be logged
```

**Use ephemeral resources (Terraform 1.8+)**:

```hcl
# Ephemeral resources are not stored in state
ephemeral "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "myapp/db-password"
}

resource "aws_db_instance" "main" {
  password = ephemeral.aws_secretsmanager_secret_version.db_password.secret_string
}
```

## State Environments Pattern

### Directory-Based (Recommended for Most Teams)

```
infrastructure/
├── modules/
│   ├── vpc/
│   ├── ecs/
│   └── rds/
├── environments/
│   ├── dev/
│   │   ├── main.tf          # Uses modules with dev-specific values
│   │   ├── backend.tf       # key = "dev/terraform.tfstate"
│   │   └── terraform.tfvars
│   ├── staging/
│   │   ├── main.tf
│   │   ├── backend.tf       # key = "staging/terraform.tfstate"
│   │   └── terraform.tfvars
│   └── production/
│       ├── main.tf
│       ├── backend.tf       # key = "production/terraform.tfstate"
│       └── terraform.tfvars
```

Each environment has its own state file and can be applied independently. This provides the strongest isolation — a bad change in dev cannot affect production state.

### Workspace-Based

```hcl
# Single configuration, different workspaces
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "myapp/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-locks"
  }
}

# The workspace name becomes part of the state path
# dev:        myapp/env:/dev/terraform.tfstate
# production: myapp/env:/production/terraform.tfstate

locals {
  environment_config = {
    dev = {
      instance_type = "t3.micro"
      instance_count = 1
      multi_az = false
    }
    staging = {
      instance_type = "t3.small"
      instance_count = 2
      multi_az = false
    }
    production = {
      instance_type = "m5.large"
      instance_count = 3
      multi_az = true
    }
  }

  config = local.environment_config[terraform.workspace]
}
```

See the [Workspaces](./workspaces) page for when this approach is and is not appropriate.

## State Recovery

### Recovering from Corrupted State

```bash
# Option 1: Restore from S3 versioning
aws s3api list-object-versions \
  --bucket mycompany-terraform-state \
  --prefix "myapp/production/terraform.tfstate" \
  --query 'Versions[0:5].[VersionId, LastModified, Size]' \
  --output table

# Download a previous version
aws s3api get-object \
  --bucket mycompany-terraform-state \
  --key "myapp/production/terraform.tfstate" \
  --version-id "abc123" \
  restored-state.json

# Push the restored state
terraform state push restored-state.json
```

### Recovering from Lost State

If state is completely lost, you must reimport everything:

```bash
# 1. List all resources that should be managed
# 2. Create import blocks or run terraform import for each
# 3. Generate configuration with terraform plan -generate-config-out=
# 4. Verify with terraform plan (should show no changes)
```

### Splitting State

When a monolithic Terraform project becomes too large:

```bash
# 1. In the original project, remove resources from state
terraform state rm module.database
terraform state rm module.cache

# 2. In the new project, import those resources
cd ../database-project
terraform import aws_db_instance.main mydb-instance
terraform import aws_db_subnet_group.main mydb-subnet-group

# 3. Use data sources or remote state to reference across projects
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "mycompany-terraform-state"
    key    = "networking/terraform.tfstate"
    region = "us-east-1"
  }
}
```

## State Best Practices

### DO

1. **Always use remote state for team projects** — even a two-person team
2. **Enable versioning on state storage** — S3 versioning, GCS versioning
3. **Encrypt state at rest and in transit** — KMS encryption, TLS
4. **Use state locking** — DynamoDB for S3, built-in for GCS
5. **Use consistent key naming conventions** — `{project}/{environment}/terraform.tfstate`
6. **Keep state files small** — split large projects into focused state files
7. **Commit `.terraform.lock.hcl`** — ensures consistent provider versions
8. **Back up state before risky operations** — `terraform state pull > backup.json`

### DO NOT

1. **Never commit state files to git** — they contain secrets
2. **Never edit state files manually** — use `terraform state` commands
3. **Never share state files over email or Slack** — they contain secrets
4. **Never use `terraform state push -force`** — unless it is a true emergency
5. **Never disable state locking** — even if it slows you down
6. **Never store state in the same account as the infrastructure** — a compromised account loses both infrastructure and state
7. **Never ignore state drift** — if `terraform plan` shows unexpected changes, investigate before applying

## Monitoring State

### Detecting Drift

Run `terraform plan` regularly (e.g., in a scheduled CI job) to detect drift between your configuration and actual infrastructure:

```yaml
# .github/workflows/drift-detection.yml
name: Terraform Drift Detection
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init

      - name: Terraform Plan
        id: plan
        run: terraform plan -detailed-exitcode -no-color
        continue-on-error: true

      - name: Notify on Drift
        if: steps.plan.outcome == 'failure' && steps.plan.outputs.exitcode == '2'
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H 'Content-type: application/json' \
            -d '{"text":"Terraform drift detected in production!"}'
```

### State File Size

Monitor state file size. A state file over 10 MB is a sign that your project should be split:

```bash
# Check state file size
terraform state pull | wc -c

# Count resources
terraform state list | wc -l
```

## What to Learn Next

- **[Modules](./modules)** — organize your Terraform code into reusable, testable components
- **[Workspaces](./workspaces)** — understand when workspace-based environments make sense
- **[AWS Startup Stack](./aws-startup-stack)** — see state management in action with a real production setup
