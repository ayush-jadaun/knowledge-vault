---
title: Terraform Fundamentals
description: Complete guide to HCL syntax, providers, resources, data sources, variables, outputs, locals, lifecycle rules, provisioners, and the terraform init/plan/apply/destroy workflow.
tags:
  - terraform
  - hcl
  - iac
  - infrastructure
  - fundamentals
difficulty: beginner
prerequisites:
  - Command-line proficiency
  - Basic understanding of cloud computing concepts
lastReviewed: "2026-03-17"
---

# Terraform Fundamentals

Terraform uses a declarative language called HCL (HashiCorp Configuration Language) to describe infrastructure. You tell Terraform what you want to exist, and it figures out how to create it, what order to create it in, and what dependencies exist between resources. This page covers every foundational concept you need before building real infrastructure.

## HCL Syntax

HCL is not JSON, not YAML, and not a general-purpose programming language. It is a configuration language designed specifically for defining infrastructure. Understanding its syntax deeply will prevent most beginner mistakes.

### Blocks

Everything in HCL is a block. A block has a type, zero or more labels, and a body:

```hcl
# Block type: "resource"
# Labels: "aws_instance" (resource type) and "web" (local name)
resource "aws_instance" "web" {
  # Body: key-value pairs
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  tags = {
    Name = "web-server"
  }
}
```

The block type tells Terraform what kind of thing you are defining. The labels identify it. The body contains its configuration. Every Terraform file is just a collection of blocks.

### Types and Values

HCL has the following primitive types:

```hcl
# String
name = "web-server"

# Number
count = 3

# Boolean
enable_monitoring = true

# Null (explicitly no value)
description = null
```

And complex types:

```hcl
# List (ordered collection)
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Map (key-value pairs)
tags = {
  Environment = "production"
  Team        = "platform"
}

# Set (unordered, unique collection)
# Sets are defined through variable type constraints
# variable "allowed_ports" { type = set(number) }

# Tuple (ordered collection with different types)
# tuple([string, number, bool])

# Object (like map but with defined structure)
# object({ name = string, age = number })
```

### String Interpolation and Templates

Strings in HCL support interpolation with `${}`:

```hcl
# Simple interpolation
name = "web-${var.environment}"

# Expression interpolation
subnet_id = aws_subnet.public[count.index % length(aws_subnet.public)].id

# Heredoc syntax for multi-line strings
user_data = <<-EOF
  #!/bin/bash
  echo "Hello from ${var.environment}"
  apt-get update
  apt-get install -y nginx
EOF

# Directive syntax in templates
user_data = <<-EOF
  %{ for port in var.allowed_ports }
  iptables -A INPUT -p tcp --dport ${port} -j ACCEPT
  %{ endfor }
EOF
```

### Comments

```hcl
# Single-line comment (preferred)

// Also a single-line comment (less common)

/*
  Multi-line comment
  for longer explanations
*/
```

### Operators and Conditionals

```hcl
# Arithmetic
instance_count = var.environment == "production" ? 3 : 1

# Comparison
# ==, !=, <, >, <=, >=

# Logical
# &&, ||, !

# Conditional expression (ternary)
instance_type = var.environment == "production" ? "m5.xlarge" : "t3.micro"

# Conditional resource creation
count = var.create_bastion ? 1 : 0
```

## Providers

Providers are plugins that let Terraform interact with cloud platforms, SaaS services, and other APIs. Every resource type belongs to a provider.

### Provider Configuration

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Project     = var.project_name
      Environment = var.environment
    }
  }
}
```

### Multiple Provider Configurations

You often need the same provider configured differently — for example, AWS in two regions:

```hcl
provider "aws" {
  region = "us-east-1"
}

provider "aws" {
  alias  = "eu"
  region = "eu-west-1"
}

# Use the aliased provider
resource "aws_s3_bucket" "eu_bucket" {
  provider = aws.eu
  bucket   = "my-eu-bucket"
}
```

### Provider Version Constraints

Version constraints are critical. Without them, `terraform init` grabs the latest version, which may have breaking changes:

```hcl
# Exact version (brittle, avoid for most cases)
version = "5.31.0"

# Pessimistic constraint (allows patch updates)
version = "~> 5.31"     # allows 5.31.x but not 5.32.0

# Greater than or equal
version = ">= 5.0"      # allows any 5.x or later

# Range
version = ">= 5.0, < 6.0"  # any 5.x version
```

The `~>` operator is the most common choice. It allows minor updates that should be backwards-compatible while preventing major version jumps.

## Resources

Resources are the most important element in Terraform. Each resource block describes one or more infrastructure objects.

### Resource Syntax

```hcl
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}
```

The resource type (`aws_vpc`) determines which provider manages it and what kind of infrastructure object it represents. The local name (`main`) is how you refer to it elsewhere in your configuration.

### Resource References

Resources can reference other resources. Terraform automatically determines the dependency order:

```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id          # Reference to the VPC
  cidr_block = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id              # Another reference to the same VPC
}
```

Terraform sees that the subnet and internet gateway both depend on the VPC, so it creates the VPC first. It can create the subnet and internet gateway in parallel because they do not depend on each other.

### Meta-Arguments

Every resource supports these meta-arguments regardless of resource type:

#### count

Creates multiple instances of a resource:

```hcl
resource "aws_subnet" "public" {
  count = 3

  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.project_name}-public-${count.index + 1}"
  }
}

# Reference: aws_subnet.public[0].id, aws_subnet.public[1].id, etc.
```

#### for_each

Creates instances from a map or set (preferred over count when items have meaningful identifiers):

```hcl
variable "subnets" {
  type = map(object({
    cidr_block        = string
    availability_zone = string
    public            = bool
  }))
  default = {
    "public-1" = {
      cidr_block        = "10.0.1.0/24"
      availability_zone = "us-east-1a"
      public            = true
    }
    "public-2" = {
      cidr_block        = "10.0.2.0/24"
      availability_zone = "us-east-1b"
      public            = true
    }
    "private-1" = {
      cidr_block        = "10.0.10.0/24"
      availability_zone = "us-east-1a"
      public            = false
    }
  }
}

resource "aws_subnet" "this" {
  for_each = var.subnets

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value.cidr_block
  availability_zone       = each.value.availability_zone
  map_public_ip_on_launch = each.value.public

  tags = {
    Name = "${var.project_name}-${each.key}"
  }
}

# Reference: aws_subnet.this["public-1"].id
```

The key difference: with `count`, removing an item from the middle causes all subsequent items to shift. With `for_each`, items are addressed by key, so removing one does not affect others.

#### depends_on

Explicitly declares a dependency when Terraform cannot infer it:

```hcl
resource "aws_ecs_service" "web" {
  # ... service configuration ...

  # Terraform cannot see that this service needs the listener rule to exist first
  depends_on = [aws_lb_listener_rule.web]
}
```

Use `depends_on` sparingly. If you need it often, your configuration may have a design problem.

#### provider

Selects a non-default provider configuration:

```hcl
resource "aws_s3_bucket" "logs" {
  provider = aws.eu
  bucket   = "eu-access-logs"
}
```

## Data Sources

Data sources let you read information from your cloud provider or other sources. They do not create anything — they look up existing resources.

```hcl
# Look up the latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Look up current AWS account ID
data "aws_caller_identity" "current" {}

# Look up available AZs
data "aws_availability_zones" "available" {
  state = "available"
}

# Use the data source values
resource "aws_instance" "web" {
  ami               = data.aws_ami.amazon_linux.id
  instance_type     = "t3.micro"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name    = "web-server"
    Account = data.aws_caller_identity.current.account_id
  }
}
```

Data sources are evaluated during `terraform plan`, so they always reflect the current state of your infrastructure.

### Reading from Other Terraform State

One of the most powerful data sources reads outputs from another Terraform state file:

```hcl
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "my-terraform-state"
    key    = "networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.networking.outputs.public_subnet_ids[0]
}
```

## Variables

Variables make your configuration reusable. They are defined in one place and referenced throughout your configuration.

### Variable Declaration

```hcl
# variables.tf

variable "project_name" {
  description = "Name of the project, used as a prefix for all resources"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,28}[a-z0-9]$", var.project_name))
    error_message = "Project name must be 4-30 characters, lowercase alphanumeric with hyphens."
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the web servers"
  type        = string
  default     = "t3.micro"
}

variable "enable_monitoring" {
  description = "Whether to enable detailed CloudWatch monitoring"
  type        = bool
  default     = false
}

variable "allowed_cidrs" {
  description = "List of CIDR blocks allowed to access the application"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "database_config" {
  description = "Database configuration"
  type = object({
    engine         = string
    engine_version = string
    instance_class = string
    storage_gb     = number
    multi_az       = bool
  })
  default = {
    engine         = "postgres"
    engine_version = "15.4"
    instance_class = "db.t3.medium"
    storage_gb     = 50
    multi_az       = false
  }
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true  # Prevents the value from appearing in plan output
}
```

### Variable Precedence

Terraform loads variable values in this order (later sources override earlier ones):

1. Default values in variable declarations
2. `terraform.tfvars` file
3. `*.auto.tfvars` files (alphabetical order)
4. `-var-file` command-line flag
5. `-var` command-line flag
6. `TF_VAR_` environment variables

```bash
# terraform.tfvars (automatically loaded)
project_name = "myapp"
environment  = "production"

# production.tfvars (loaded with -var-file)
instance_type = "m5.xlarge"
enable_monitoring = true

# Command line
terraform apply -var-file="production.tfvars" -var="db_password=secret123"

# Environment variable
export TF_VAR_db_password="secret123"
terraform apply
```

### Variable Validation

Custom validation rules catch errors before Terraform tries to create resources:

```hcl
variable "instance_type" {
  type = string

  validation {
    condition     = can(regex("^(t3|t3a|m5|m5a|c5|r5)\\.", var.instance_type))
    error_message = "Instance type must be from the t3, t3a, m5, m5a, c5, or r5 families."
  }
}

variable "cidr_block" {
  type = string

  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "Must be a valid CIDR block."
  }

  validation {
    condition     = tonumber(split("/", var.cidr_block)[1]) >= 16 && tonumber(split("/", var.cidr_block)[1]) <= 24
    error_message = "CIDR block prefix must be between /16 and /24."
  }
}
```

## Outputs

Outputs expose values from your configuration, making them available to other Terraform configurations, scripts, or human operators.

```hcl
# outputs.tf

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "database_endpoint" {
  description = "Connection endpoint for the RDS instance"
  value       = aws_db_instance.main.endpoint
  sensitive   = true  # Hide from plan output
}

output "load_balancer_dns" {
  description = "DNS name of the application load balancer"
  value       = aws_lb.main.dns_name
}

# Conditional output
output "bastion_ip" {
  description = "Public IP of the bastion host"
  value       = var.create_bastion ? aws_instance.bastion[0].public_ip : null
}
```

Outputs are displayed after `terraform apply` and can be queried with `terraform output`:

```bash
terraform output vpc_id
terraform output -json public_subnet_ids
terraform output -raw load_balancer_dns  # No quotes, useful for scripting
```

## Locals

Locals are computed values that you use to avoid repeating expressions. Think of them as constants or intermediate variables:

```hcl
locals {
  # Common tags applied to all resources
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    CostCenter  = var.cost_center
  }

  # Computed values
  name_prefix = "${var.project_name}-${var.environment}"

  # Conditional logic
  is_production = var.environment == "production"

  # Complex transformations
  private_subnets = {
    for idx, az in data.aws_availability_zones.available.names :
    az => cidrsubnet(var.vpc_cidr, 8, idx + 10)
    if idx < 3  # Limit to 3 AZs
  }

  # Merging maps
  all_tags = merge(local.common_tags, {
    Timestamp = timestamp()
  })
}

# Usage
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags       = merge(local.common_tags, { Name = "${local.name_prefix}-vpc" })
}
```

### When to Use Locals vs Variables

- **Variables** are for values that change between deployments (environment, region, instance size)
- **Locals** are for computed values derived from variables, data sources, or other resources
- If a value is used in more than two places, put it in a local
- If a value needs to be set by the person running Terraform, it is a variable

## Lifecycle Rules

Lifecycle rules modify the default behavior of resource creation, update, and deletion:

```hcl
resource "aws_instance" "web" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type

  lifecycle {
    # Create replacement before destroying current
    # Essential for zero-downtime deployments
    create_before_destroy = true

    # Prevent accidental deletion of critical resources
    prevent_destroy = true

    # Ignore changes made outside Terraform
    # Common for auto-scaling groups where the desired count changes
    ignore_changes = [
      tags["LastModified"],
      desired_count,
    ]

    # Custom condition that must be true for the plan to succeed
    precondition {
      condition     = data.aws_ami.amazon_linux.architecture == "x86_64"
      error_message = "AMI must be x86_64 architecture."
    }

    postcondition {
      condition     = self.public_ip != ""
      error_message = "Instance must have a public IP address."
    }

    # Replace resource when this value changes
    replace_triggered_by = [
      aws_security_group.web.id,
    ]
  }
}
```

### Lifecycle Rules in Practice

**create_before_destroy**: Critical for load-balanced instances. Without it, Terraform destroys the old instance before creating the new one, causing downtime. With it, the new instance is created and healthy before the old one is removed.

**prevent_destroy**: Use on databases, S3 buckets with important data, and any resource where accidental deletion would be catastrophic. Terraform will refuse to destroy the resource even if you run `terraform destroy`. You must remove the lifecycle rule first.

**ignore_changes**: Use when external systems modify resource attributes. For example, an ECS service's desired count might be managed by auto-scaling, so Terraform should not reset it on every apply.

## Provisioners (and Why to Avoid Them)

Provisioners execute scripts on a local or remote machine as part of resource creation or destruction. They exist in Terraform, but they are considered a last resort.

### The Problem with Provisioners

1. **They break the declarative model.** Terraform cannot track what a provisioner did. If a script fails halfway through, Terraform does not know the state of the machine.
2. **They are not idempotent by default.** Running `terraform apply` twice may run the script twice, potentially breaking things.
3. **They make plans unreliable.** `terraform plan` cannot show you what a provisioner will do.
4. **They create timing dependencies.** A provisioner might fail because a service is not ready yet, even though the resource exists.

### What Provisioners Look Like

```hcl
# DO NOT USE THIS IN PRODUCTION — example only
resource "aws_instance" "web" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = "t3.micro"
  key_name      = aws_key_pair.deploy.key_name

  # Remote provisioner — runs on the created instance
  provisioner "remote-exec" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y nginx",
      "sudo systemctl start nginx",
    ]

    connection {
      type        = "ssh"
      user        = "ubuntu"
      private_key = file("~/.ssh/deploy_key")
      host        = self.public_ip
    }
  }

  # Local provisioner — runs on the machine running Terraform
  provisioner "local-exec" {
    command = "echo ${self.private_ip} >> inventory.txt"
  }

  # Destroy-time provisioner
  provisioner "local-exec" {
    when    = destroy
    command = "echo 'Instance ${self.id} is being destroyed' >> destruction-log.txt"
  }
}
```

### What to Use Instead

| Provisioner Use Case | Better Alternative |
|---|---|
| Install software on EC2 | User data scripts, AMI baking with Packer |
| Configure application | Configuration management (Ansible, Chef, Puppet) |
| Run database migrations | CI/CD pipeline step after infrastructure apply |
| Register instance with service | Cloud-init, instance metadata, auto-discovery |
| Copy files to instance | S3 + user data download, or bake into AMI |

The one legitimate use of `local-exec` is triggering external systems that have no Terraform provider — and even then, a `null_resource` with `triggers` is usually cleaner.

## The Terraform Workflow

### terraform init

Initializes a working directory. Downloads provider plugins, initializes the backend, and downloads modules:

```bash
# First-time initialization
terraform init

# Re-initialize after changing backend configuration
terraform init -reconfigure

# Upgrade providers to latest version within constraints
terraform init -upgrade

# Initialize without downloading modules (useful in CI)
terraform init -get=false
```

What `terraform init` actually does:

1. Reads `required_providers` blocks
2. Downloads provider binaries to `.terraform/providers/`
3. Creates `.terraform.lock.hcl` (the dependency lock file — commit this)
4. Initializes the state backend
5. Downloads any referenced modules

### terraform plan

Shows what Terraform will do without doing it:

```bash
# Standard plan
terraform plan

# Save plan to a file (recommended for CI/CD)
terraform plan -out=tfplan

# Plan for a specific variable file
terraform plan -var-file="production.tfvars"

# Plan to destroy
terraform plan -destroy

# Target specific resources
terraform plan -target=aws_instance.web

# Show detailed output including unchanged attributes
terraform plan -detailed-exitcode
# Exit code 0: no changes
# Exit code 1: error
# Exit code 2: changes present
```

The plan output uses these symbols:

```
+ create      (new resource)
- destroy     (remove resource)
~ update      (modify in-place)
-/+ replace   (destroy and recreate)
+/- replace   (create new before destroying old — create_before_destroy)
<= read       (data source will be read)
```

### terraform apply

Executes the planned changes:

```bash
# Apply with interactive approval
terraform apply

# Apply a saved plan (no approval prompt)
terraform apply tfplan

# Auto-approve (use in CI/CD only)
terraform apply -auto-approve

# Apply with specific variables
terraform apply -var="environment=production" -var-file="production.tfvars"

# Apply specific resources only
terraform apply -target=aws_instance.web
```

**Never use `-target` in production workflows.** It exists for debugging and exceptional recovery situations. Regular use of `-target` leads to drift between your configuration and actual infrastructure.

### terraform destroy

Removes all resources managed by the current configuration:

```bash
# Destroy with interactive approval
terraform destroy

# Auto-approve (dangerous)
terraform destroy -auto-approve

# Destroy specific resources
terraform destroy -target=aws_instance.web

# See what will be destroyed without doing it
terraform plan -destroy
```

### Other Essential Commands

```bash
# Format all HCL files
terraform fmt -recursive

# Validate configuration syntax
terraform validate

# Show current state
terraform show

# List resources in state
terraform state list

# Show a specific resource in state
terraform state show aws_instance.web

# Open interactive console for testing expressions
terraform console
# > cidrsubnet("10.0.0.0/16", 8, 1)
# "10.0.1.0/24"
# > length(["a", "b", "c"])
# 3

# Import existing infrastructure into state
terraform import aws_instance.web i-1234567890abcdef0

# Generate dependency graph (Graphviz DOT format)
terraform graph | dot -Tpng > graph.png
```

## Expressions and Functions

Terraform includes a rich set of built-in functions. Here are the most commonly used:

### String Functions

```hcl
locals {
  # Join list into string
  az_string = join(", ", data.aws_availability_zones.available.names)
  # "us-east-1a, us-east-1b, us-east-1c"

  # Split string into list
  parts = split("-", "us-east-1")
  # ["us", "east", "1"]

  # Format string
  bucket_name = format("%s-%s-%s", var.project, var.env, "assets")
  # "myapp-prod-assets"

  # Replace
  safe_name = replace(var.project_name, "/[^a-zA-Z0-9]/", "-")

  # Upper/lower
  upper_env = upper(var.environment)
  lower_env = lower(var.environment)

  # Trim
  clean_input = trimspace(var.raw_input)
}
```

### Collection Functions

```hcl
locals {
  # Length
  subnet_count = length(var.subnet_cidrs)

  # Flatten nested lists
  all_rules = flatten([var.ingress_rules, var.extra_rules])

  # Merge maps
  all_tags = merge(var.default_tags, var.extra_tags)

  # Keys and values from a map
  tag_keys = keys(var.tags)
  tag_values = values(var.tags)

  # Lookup with default
  instance_type = lookup(var.instance_types, var.environment, "t3.micro")

  # Element (wraps around)
  az = element(data.aws_availability_zones.available.names, count.index)

  # Chunklist
  subnet_pairs = chunklist(var.subnet_cidrs, 2)

  # Distinct (remove duplicates)
  unique_regions = distinct(var.regions)

  # Contains
  is_production = contains(["production", "prod"], var.environment)

  # Coalesce (first non-null, non-empty)
  name = coalesce(var.custom_name, "${var.project}-default")

  # Compact (remove empty strings from list)
  clean_list = compact(var.possibly_empty_strings)

  # Zipmap (create map from two lists)
  subnet_map = zipmap(var.subnet_names, aws_subnet.this[*].id)
}
```

### For Expressions

```hcl
locals {
  # Transform a list
  upper_names = [for name in var.names : upper(name)]

  # Filter a list
  production_instances = [
    for instance in aws_instance.web :
    instance.id
    if instance.tags["Environment"] == "production"
  ]

  # Transform a map
  tagged_subnets = {
    for key, subnet in aws_subnet.this :
    key => subnet.id
  }

  # Create a map from a list
  instance_ips = {
    for instance in aws_instance.web :
    instance.tags["Name"] => instance.private_ip
  }

  # Nested for expressions
  all_ports_per_sg = flatten([
    for sg_name, sg_rules in var.security_group_rules : [
      for rule in sg_rules : {
        sg_name   = sg_name
        from_port = rule.from_port
        to_port   = rule.to_port
        protocol  = rule.protocol
      }
    ]
  ])
}
```

### Dynamic Blocks

Dynamic blocks generate repeated nested blocks:

```hcl
resource "aws_security_group" "web" {
  name   = "${local.name_prefix}-web-sg"
  vpc_id = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.ingress_rules

    content {
      description = ingress.value.description
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
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

# Variable definition for the above
variable "ingress_rules" {
  type = list(object({
    description = string
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
  }))
  default = [
    {
      description = "HTTP"
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    },
    {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    },
  ]
}
```

## File Organization

A well-organized Terraform project follows this structure:

```
project/
├── main.tf              # Primary resources
├── variables.tf         # All variable declarations
├── outputs.tf           # All output declarations
├── providers.tf         # Provider configuration
├── versions.tf          # Required providers and Terraform version
├── terraform.tfvars     # Default variable values (do not commit secrets)
├── locals.tf            # Local values
├── data.tf              # Data sources
├── backend.tf           # Backend configuration
├── .terraform.lock.hcl  # Dependency lock file (commit this)
├── .gitignore           # Ignore .terraform/, *.tfstate, *.tfvars
└── README.md            # Documentation
```

The `.gitignore` for Terraform projects:

```gitignore
# Terraform
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
crash.log
crash.*.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Sensitive variable files
*.tfvars
!example.tfvars

# IDE
.idea/
.vscode/
*.swp
*.swo
```

## Common Patterns

### Conditional Resource Creation

```hcl
variable "create_bastion" {
  type    = bool
  default = false
}

resource "aws_instance" "bastion" {
  count = var.create_bastion ? 1 : 0

  ami           = data.aws_ami.amazon_linux.id
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public[0].id
}

# Reference a conditionally created resource
output "bastion_ip" {
  value = var.create_bastion ? aws_instance.bastion[0].public_ip : "No bastion created"
}
```

### Tagging Strategy

```hcl
locals {
  required_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.team_name
    CostCenter  = var.cost_center
  }
}

# Apply to every resource
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags       = merge(local.required_tags, { Name = "${local.name_prefix}-vpc" })
}

# Or use provider-level default tags (AWS provider 3.38+)
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.required_tags
  }
}
```

### Moved Blocks for Refactoring

When you rename resources, use `moved` blocks to preserve state:

```hcl
# Old name
# resource "aws_instance" "web_server" { ... }

# New name
resource "aws_instance" "web" {
  # ... same configuration ...
}

moved {
  from = aws_instance.web_server
  to   = aws_instance.web
}
```

This tells Terraform that the resource was renamed, not destroyed and recreated. Remove the `moved` block after everyone on your team has applied the change.

## What to Learn Next

With these fundamentals solid, move to:

- **[State Management](./state-management)** — how Terraform tracks your infrastructure and how to manage state files safely across a team
- **[Modules](./modules)** — how to organize and reuse your Terraform code
- **[AWS Startup Stack](./aws-startup-stack)** — apply these fundamentals to build a complete production environment
