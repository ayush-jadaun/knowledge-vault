---
title: Terraform Cost Optimization
description: Reserved instances, spot instances, right-sizing, auto-scaling policies, cost tagging strategies, and AWS Cost Explorer integration — all implemented in Terraform for real cost savings.
tags:
  - terraform
  - cost-optimization
  - aws
  - reserved-instances
  - spot-instances
  - auto-scaling
  - infrastructure
difficulty: intermediate
prerequisites:
  - infrastructure/terraform/fundamentals
  - infrastructure/terraform/aws-startup-stack
  - infrastructure/aws/cost-optimization
lastReviewed: "2026-03-17"
---

# Terraform Cost Optimization

Cloud infrastructure costs grow silently. A development database left running over a weekend, NAT gateway data transfer charges, or oversized instances can add hundreds of dollars per month without anyone noticing. This page covers how to use Terraform to build cost-optimized infrastructure from the start, not as an afterthought.

## Cost Tagging Strategy

You cannot optimize what you cannot measure. Tagging is the foundation of cost visibility.

### Mandatory Tags

```hcl
locals {
  required_tags = {
    Project     = var.project_name
    Environment = var.environment
    Team        = var.team_name
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
    Service     = var.service_name
  }
}

# Enforce tags via provider default_tags
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.required_tags
  }
}
```

### Tag Validation

```hcl
variable "cost_center" {
  description = "Cost center for billing allocation"
  type        = string

  validation {
    condition     = can(regex("^CC-[0-9]{4}$", var.cost_center))
    error_message = "Cost center must match pattern CC-XXXX (e.g., CC-1234)."
  }
}

variable "team_name" {
  description = "Team responsible for this infrastructure"
  type        = string

  validation {
    condition     = contains(["platform", "backend", "frontend", "data", "ml", "security"], var.team_name)
    error_message = "Team must be one of: platform, backend, frontend, data, ml, security."
  }
}
```

### AWS Cost Allocation Tags

```hcl
resource "aws_ce_cost_allocation_tag" "project" {
  tag_key = "Project"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "environment" {
  tag_key = "Environment"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "team" {
  tag_key = "Team"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "cost_center" {
  tag_key = "CostCenter"
  status  = "Active"
}

resource "aws_ce_cost_allocation_tag" "service" {
  tag_key = "Service"
  status  = "Active"
}
```

## Right-Sizing

### Environment-Based Sizing

```hcl
locals {
  sizing = {
    dev = {
      ecs_cpu    = 256
      ecs_memory = 512
      ecs_count  = 1
      db_class   = "db.t3.micro"
      db_storage = 20
      db_multi_az = false
      cache_type = "cache.t3.micro"
      cache_nodes = 1
      nat_count  = 1
    }
    staging = {
      ecs_cpu    = 512
      ecs_memory = 1024
      ecs_count  = 2
      db_class   = "db.t3.small"
      db_storage = 50
      db_multi_az = false
      cache_type = "cache.t3.small"
      cache_nodes = 1
      nat_count  = 1
    }
    production = {
      ecs_cpu    = 1024
      ecs_memory = 2048
      ecs_count  = 3
      db_class   = "db.r5.large"
      db_storage = 100
      db_multi_az = true
      cache_type = "cache.r5.large"
      cache_nodes = 3
      nat_count  = 3  # One per AZ
    }
  }

  size = local.sizing[var.environment]
}
```

### Scheduled Scaling for Non-Production

```hcl
# Scale down dev/staging outside business hours
resource "aws_appautoscaling_scheduled_action" "scale_down_evening" {
  count = var.environment != "production" ? 1 : 0

  name               = "${local.name_prefix}-scale-down-evening"
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"

  schedule = "cron(0 19 ? * MON-FRI *)"  # 7 PM UTC weekdays

  scalable_target_action {
    min_capacity = 0
    max_capacity = 0
  }

  depends_on = [aws_appautoscaling_target.ecs]
}

resource "aws_appautoscaling_scheduled_action" "scale_up_morning" {
  count = var.environment != "production" ? 1 : 0

  name               = "${local.name_prefix}-scale-up-morning"
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"

  schedule = "cron(0 7 ? * MON-FRI *)"  # 7 AM UTC weekdays

  scalable_target_action {
    min_capacity = local.size.ecs_count
    max_capacity = var.max_count
  }

  depends_on = [aws_appautoscaling_target.ecs]
}

# Stop RDS dev instances during off-hours
resource "aws_rds_cluster" "dev" {
  count = var.environment == "dev" ? 1 : 0

  # ... configuration ...

  # Enable auto-pause for Aurora Serverless
  scaling_configuration {
    auto_pause               = true
    seconds_until_auto_pause = 300  # Pause after 5 minutes of inactivity
    min_capacity             = 2
    max_capacity             = 8
  }
}
```

## Spot Instances and Fargate Spot

### ECS with Fargate Spot

```hcl
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    # Base tasks run on regular Fargate (guaranteed availability)
    base              = local.size.ecs_count
    weight            = 1
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    # Scale-out tasks use Fargate Spot (up to 70% cheaper)
    base              = 0
    weight            = 3
    capacity_provider = "FARGATE_SPOT"
  }
}
```

Fargate Spot pricing is approximately 70% less than on-demand Fargate. The trade-off is that AWS can terminate Spot tasks with a 30-second warning. For stateless web services behind a load balancer, this is perfectly acceptable because the load balancer routes traffic to remaining tasks.

### EC2 Spot Instances (for ECS EC2 launch type)

```hcl
resource "aws_launch_template" "ecs_spot" {
  name_prefix   = "${local.name_prefix}-ecs-spot-"
  image_id      = data.aws_ami.ecs_optimized.id
  instance_type = "m5.large"

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    echo "ECS_ENABLE_SPOT_INSTANCE_DRAINING=true" >> /etc/ecs/ecs.config
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.name_prefix}-ecs-spot"
    })
  }
}

resource "aws_autoscaling_group" "ecs_spot" {
  name_prefix         = "${local.name_prefix}-ecs-spot-"
  desired_capacity    = 3
  min_size            = 0
  max_size            = 10
  vpc_zone_identifier = aws_subnet.private[*].id

  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = 1   # 1 on-demand for stability
      on_demand_percentage_above_base_capacity = 0   # Rest is Spot
      spot_allocation_strategy                 = "capacity-optimized"
      spot_max_price                           = ""  # Use on-demand price cap
    }

    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.ecs_spot.id
        version            = "$Latest"
      }

      # Multiple instance types for better Spot availability
      override {
        instance_type     = "m5.large"
        weighted_capacity = "2"
      }
      override {
        instance_type     = "m5a.large"
        weighted_capacity = "2"
      }
      override {
        instance_type     = "m5d.large"
        weighted_capacity = "2"
      }
      override {
        instance_type     = "m4.large"
        weighted_capacity = "2"
      }
      override {
        instance_type     = "c5.large"
        weighted_capacity = "2"
      }
    }
  }

  capacity_rebalance = true

  tag {
    key                 = "AmazonECSManaged"
    value               = true
    propagate_at_launch = true
  }
}
```

## Reserved Instances and Savings Plans

Terraform cannot purchase Reserved Instances directly, but it can manage the infrastructure that benefits from them and track commitments.

### Reserved Instance Tracking

```hcl
# Track RI coverage with CloudWatch
resource "aws_cloudwatch_metric_alarm" "ri_coverage" {
  alarm_name          = "${local.name_prefix}-ri-coverage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 80  # Alert if RI coverage drops below 80%

  metric_query {
    id          = "coverage"
    return_data = true

    metric {
      metric_name = "ReservedInstanceCoverage"
      namespace   = "AWS/Billing"
      period      = 86400
      stat        = "Average"
    }
  }

  alarm_actions = [aws_sns_topic.cost_alerts.arn]
}
```

### Savings Plans Alignment

When using Savings Plans (recommended over RIs for flexibility), align your Terraform resource types:

```hcl
# Compute Savings Plans cover:
# - EC2 instances (any family, size, region, OS)
# - Fargate tasks
# - Lambda functions

# Use consistent instance families across environments
# so Savings Plans coverage is maximized

locals {
  # All environments use the same instance family
  # Savings Plans cover the family, not the specific size
  instance_families = {
    compute = "m5"    # General purpose
    memory  = "r5"    # Memory optimized (databases)
    cpu     = "c5"    # Compute optimized
  }
}
```

## Auto-Scaling Policies

### Target Tracking (Recommended)

```hcl
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_count
  min_capacity       = local.size.ecs_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based scaling
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300    # Wait 5 min before scaling in
    scale_out_cooldown = 60     # Scale out quickly
  }
}

# Request count per target scaling
resource "aws_appautoscaling_policy" "requests" {
  name               = "${local.name_prefix}-request-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.app.arn_suffix}"
    }
    target_value       = 500   # 500 requests per task before scaling
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### RDS Storage Auto-Scaling

```hcl
resource "aws_db_instance" "main" {
  # ...
  allocated_storage     = 50    # Start small
  max_allocated_storage = 500   # Allow auto-scaling up to 500GB

  # Storage auto-scaling kicks in when:
  # - Free storage is less than 10% of allocated
  # - It has been at least 6 hours since the last scaling
  # - Storage has been at the threshold for at least 5 minutes
}
```

## NAT Gateway Cost Reduction

NAT gateways are one of the most expensive "hidden" costs in AWS. They charge $0.045/hour per gateway PLUS $0.045/GB of data processed.

### Single NAT Gateway for Non-Production

```hcl
locals {
  nat_count = var.environment == "production" ? length(var.availability_zones) : 1
}

resource "aws_nat_gateway" "main" {
  count = local.nat_count
  # ...
}

# Route all private subnets through a single NAT in non-production
resource "aws_route" "private_nat" {
  count = length(var.availability_zones)

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[var.environment == "production" ? count.index : 0].id
}
```

### VPC Endpoints to Bypass NAT

Every API call to S3, ECR, CloudWatch, etc. goes through the NAT gateway unless you have VPC endpoints. Each endpoint eliminates data processing charges for that service.

```hcl
# These VPC endpoints eliminate NAT gateway data charges for AWS API calls

# S3 Gateway endpoint (free)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )
}

# DynamoDB Gateway endpoint (free)
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
}

# Interface endpoints ($0.01/hour each + $0.01/GB, but still cheaper than NAT for high-volume)
# ECR (Docker image pulls are large and frequent)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}

# CloudWatch Logs (high volume)
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
}
```

## S3 Cost Optimization

```hcl
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "intelligent-tiering"
    status = "Enabled"

    # Move infrequently accessed objects to cheaper tiers
    transition {
      days          = 30
      storage_class = "STANDARD_IA"       # ~40% cheaper
    }

    transition {
      days          = 90
      storage_class = "INTELLIGENT_TIERING"  # Automatic tiering
    }

    transition {
      days          = 180
      storage_class = "GLACIER_IR"        # ~68% cheaper, minutes retrieval
    }

    # Delete old versions after 30 days
    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-temp-uploads"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 1
    }
  }
}

# S3 Intelligent-Tiering configuration
resource "aws_s3_bucket_intelligent_tiering_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  name   = "full-bucket"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}
```

## CloudWatch Logs Cost Control

CloudWatch Logs charges for ingestion ($0.50/GB) and storage ($0.03/GB/month). Uncontrolled logging can cost hundreds of dollars.

```hcl
# Set appropriate retention periods
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/ecs/${local.name_prefix}/app"
  retention_in_days = local.is_production ? 90 : 7   # Not 'Never Expire'
}

resource "aws_cloudwatch_log_group" "alb_access" {
  name              = "/aws/alb/${local.name_prefix}"
  retention_in_days = local.is_production ? 30 : 3
}

# Use log subscription filters to send only important logs to expensive destinations
resource "aws_cloudwatch_log_subscription_filter" "errors_only" {
  name            = "${local.name_prefix}-error-filter"
  log_group_name  = aws_cloudwatch_log_group.app.name
  filter_pattern  = "ERROR"
  destination_arn = aws_kinesis_firehose_delivery_stream.error_logs.arn
  role_arn        = aws_iam_role.log_subscription.arn
}
```

## AWS Budgets and Alerts

```hcl
resource "aws_budgets_budget" "monthly_total" {
  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name = "TagKeyValue"
    values = [
      "user:Project$${var.project_name}"
    ]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

# Per-service budgets for the big cost items
resource "aws_budgets_budget" "rds" {
  name         = "${local.name_prefix}-rds-budget"
  budget_type  = "COST"
  limit_amount = "500"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name = "Service"
    values = ["Amazon Relational Database Service"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 90
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

resource "aws_budgets_budget" "data_transfer" {
  name         = "${local.name_prefix}-data-transfer-budget"
  budget_type  = "COST"
  limit_amount = "200"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name = "Service"
    values = ["AWS Data Transfer"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
```

## Cost Optimization Checklist

| Category | Action | Typical Savings |
|---|---|---|
| Compute | Use Fargate Spot for scale-out tasks | 50-70% |
| Compute | Scheduled scaling for non-prod | 60-70% |
| Compute | Right-size instances | 20-40% |
| Database | Use appropriate instance class per env | 50-80% |
| Database | Enable storage auto-scaling | Prevents over-provisioning |
| Storage | S3 lifecycle policies | 40-90% |
| Storage | S3 Intelligent-Tiering | 20-40% |
| Networking | Single NAT gateway for non-prod | 66% on NAT costs |
| Networking | VPC endpoints for S3, ECR, Logs | 30-50% on data transfer |
| Logging | Appropriate log retention | 50-90% on CloudWatch |
| Monitoring | Budget alerts | Prevents surprise bills |
| Commitment | Savings Plans for steady-state | 30-40% |
| Tagging | Cost allocation tags on everything | Enables optimization |

## What to Learn Next

- **[Security Hardening](./security-hardening)** — security controls that also reduce cost (e.g., VPC endpoints)
- **[AWS Cost Optimization](/infrastructure/aws/cost-optimization)** — detailed AWS-specific cost strategies
- **[Multi-Region](./multi-region)** — understand the cost implications before going multi-region
