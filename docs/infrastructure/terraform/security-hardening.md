---
title: Terraform Security Hardening
description: Least-privilege IAM policies, security group design, encryption at rest and in transit, VPC flow logs, GuardDuty, AWS Config rules, and security-focused Terraform patterns for production infrastructure.
tags:
  - terraform
  - security
  - iam
  - encryption
  - guardduty
  - aws-config
  - infrastructure
difficulty: advanced
prerequisites:
  - infrastructure/terraform/fundamentals
  - infrastructure/terraform/aws-startup-stack
  - infrastructure/aws/iam-deep-dive
lastReviewed: "2026-03-17"
---

# Terraform Security Hardening

Security is not a feature you add later. Every Terraform resource you create either improves or weakens your security posture. This page covers the security controls that should be in every production Terraform configuration — from IAM policies to encryption to threat detection.

## Least-Privilege IAM

The single most important security control. Every IAM role should have exactly the permissions it needs and nothing more.

### Anti-Pattern: Overly Broad Policies

```hcl
# NEVER DO THIS — this gives the ECS task full access to everything
resource "aws_iam_role_policy" "bad_policy" {
  name = "bad-full-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}
```

### Correct Pattern: Scoped Policies

```hcl
# Each policy grants access to one specific service with specific resources
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${local.name_prefix}-ecs-s3-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadWriteAssetsBucket"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.assets.arn}/*"
      },
      {
        Sid    = "ListAssetsBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.assets.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["uploads/*", "assets/*"]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_sqs" {
  name = "${local.name_prefix}-ecs-sqs-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ProcessJobQueue"
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ]
      Resource = aws_sqs_queue.jobs.arn
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "${local.name_prefix}-ecs-secrets-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ReadAppSecrets"
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.name_prefix}/*"
      ]
    }]
  })
}
```

### IAM Permissions Boundary

Prevent privilege escalation by setting a boundary that no role can exceed:

```hcl
resource "aws_iam_policy" "permissions_boundary" {
  name = "${local.name_prefix}-permissions-boundary"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowedServices"
        Effect = "Allow"
        Action = [
          "s3:*",
          "sqs:*",
          "sns:*",
          "dynamodb:*",
          "secretsmanager:GetSecretValue",
          "logs:*",
          "cloudwatch:PutMetricData",
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Sid    = "DenyIAMChanges"
        Effect = "Deny"
        Action = [
          "iam:*",
          "organizations:*",
          "sts:AssumeRole"
        ]
        Resource = "*"
      },
      {
        Sid    = "DenyNetworkChanges"
        Effect = "Deny"
        Action = [
          "ec2:CreateVpc",
          "ec2:DeleteVpc",
          "ec2:ModifyVpcAttribute",
          "ec2:CreateSubnet",
          "ec2:DeleteSubnet",
          "ec2:CreateInternetGateway",
          "ec2:DeleteInternetGateway"
        ]
        Resource = "*"
      }
    ]
  })
}

# Apply boundary to all task roles
resource "aws_iam_role" "ecs_task" {
  name                 = "${local.name_prefix}-ecs-task"
  permissions_boundary = aws_iam_policy.permissions_boundary.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}
```

### Service Control Policies (Organization-Level)

```hcl
resource "aws_organizations_policy" "deny_regions" {
  name        = "deny-unapproved-regions"
  description = "Deny actions in regions outside the approved list"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyUnapprovedRegions"
      Effect    = "Deny"
      NotAction = [
        "a4b:*", "budgets:*", "ce:*", "chime:*",
        "cloudfront:*", "cur:*", "globalaccelerator:*",
        "health:*", "iam:*", "importexport:*",
        "organizations:*", "route53:*", "sts:*",
        "support:*", "waf:*"
      ]
      Resource = "*"
      Condition = {
        StringNotEquals = {
          "aws:RequestedRegion" = ["us-east-1", "eu-west-1"]
        }
      }
    }]
  })
}

resource "aws_organizations_policy_attachment" "deny_regions" {
  policy_id = aws_organizations_policy.deny_regions.id
  target_id = var.organization_unit_id
}
```

## Security Group Design

### Defense in Depth

```hcl
# ─── ALB Security Group (Public-Facing) ────────────────────────────────────────
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  description = "ALB - allows HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from internet"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

# Only allow HTTP for redirect — the ALB will 301 to HTTPS
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from internet (redirect to HTTPS)"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To ECS tasks only"
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
}

# ─── ECS Security Group (Private) ──────────────────────────────────────────────
resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  description = "ECS tasks - allows traffic from ALB only"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "App port from ALB only"
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

# Egress restricted to specific destinations
resource "aws_vpc_security_group_egress_rule" "ecs_to_rds" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "PostgreSQL to RDS"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.rds.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_redis" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Redis to ElastiCache"
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.redis.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_https" {
  security_group_id = aws_security_group.ecs.id
  description       = "HTTPS to internet (API calls, package downloads)"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

# ─── RDS Security Group (Isolated) ─────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  description = "RDS - allows PostgreSQL from ECS only"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from ECS tasks only"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
}

# NO egress rules — RDS does not need outbound access
```

### VPC Endpoints (Avoid Internet for AWS API Calls)

```hcl
# Interface endpoints for AWS services
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = { Name = "${local.name_prefix}-s3-endpoint" }
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${local.name_prefix}-ecr-api-endpoint" }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${local.name_prefix}-ecr-dkr-endpoint" }
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${local.name_prefix}-secretsmanager-endpoint" }
}

resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${local.name_prefix}-logs-endpoint" }
}

resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${local.name_prefix}-vpce-"
  description = "VPC Endpoints - HTTPS from VPC"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
    description = "HTTPS from VPC"
  }
}
```

## Encryption at Rest

```hcl
# ─── KMS Keys ──────────────────────────────────────────────────────────────────

resource "aws_kms_key" "main" {
  description             = "Main encryption key for ${local.name_prefix}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RootAccountFullAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowECSTaskDecrypt"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowRDSEncrypt"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
            "kms:ViaService"    = "rds.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-main-key"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name_prefix}-main"
  target_key_id = aws_kms_key.main.key_id
}

# ─── Encrypted Resources ───────────────────────────────────────────────────────

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_db_instance" "main" {
  # ...
  storage_encrypted = true
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_elasticache_replication_group" "main" {
  # ...
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.main.arn
}

resource "aws_cloudwatch_log_group" "app" {
  # ...
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_sqs_queue" "jobs" {
  name              = "${local.name_prefix}-jobs"
  kms_master_key_id = aws_kms_key.main.id
}

resource "aws_sns_topic" "alerts" {
  name              = "${local.name_prefix}-alerts"
  kms_master_key_id = aws_kms_key.main.id
}
```

## Encryption in Transit

```hcl
# ALB: TLS 1.2+ only
resource "aws_lb_listener" "https" {
  # ...
  ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

# RDS: Enforce SSL connections
resource "aws_db_parameter_group" "main" {
  # ...
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

# ElastiCache: Transit encryption
resource "aws_elasticache_replication_group" "main" {
  # ...
  transit_encryption_enabled = true
}

# S3: Deny unencrypted uploads
resource "aws_s3_bucket_policy" "enforce_encryption" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.assets.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid    = "DenyHTTPAccess"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.assets.arn,
          "${aws_s3_bucket.assets.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
```

## VPC Flow Logs

```hcl
resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.vpc_flow_logs.arn
  iam_role_arn         = aws_iam_role.vpc_flow_logs.arn

  max_aggregation_interval = 60

  tags = {
    Name = "${local.name_prefix}-vpc-flow-logs"
  }
}

# Also send to S3 for long-term analysis
resource "aws_flow_log" "vpc_s3" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = "${aws_s3_bucket.security_logs.arn}/vpc-flow-logs/"

  destination_options {
    file_format        = "parquet"
    per_hour_partition = true
  }

  tags = {
    Name = "${local.name_prefix}-vpc-flow-logs-s3"
  }
}

resource "aws_s3_bucket" "security_logs" {
  bucket = "${local.name_prefix}-security-logs"

  tags = {
    Name = "${local.name_prefix}-security-logs"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "security_logs" {
  bucket = aws_s3_bucket.security_logs.id

  rule {
    id     = "transition-and-expire"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}
```

## GuardDuty

```hcl
resource "aws_guardduty_detector" "main" {
  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  finding_publishing_frequency = "FIFTEEN_MINUTES"

  tags = {
    Name = "${local.name_prefix}-guardduty"
  }
}

# Publish findings to SNS
resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  name        = "${local.name_prefix}-guardduty-findings"
  description = "GuardDuty findings of medium or higher severity"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", 4] }]
    }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  rule = aws_cloudwatch_event_rule.guardduty_findings.name
  arn  = aws_sns_topic.security_alerts.arn

  input_transformer {
    input_paths = {
      title       = "$.detail.title"
      description = "$.detail.description"
      severity    = "$.detail.severity"
      account     = "$.detail.accountId"
      region      = "$.detail.region"
      type        = "$.detail.type"
    }
    input_template = "\"GuardDuty Finding: <title>\\nSeverity: <severity>\\nType: <type>\\nAccount: <account>\\nRegion: <region>\\n\\n<description>\""
  }
}

resource "aws_sns_topic" "security_alerts" {
  name              = "${local.name_prefix}-security-alerts"
  kms_master_key_id = aws_kms_key.main.id
}

resource "aws_sns_topic_subscription" "security_email" {
  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.security_alert_email
}
```

## AWS Config Rules

```hcl
resource "aws_config_configuration_recorder" "main" {
  name     = "${local.name_prefix}-config-recorder"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "main" {
  name           = "${local.name_prefix}-config-channel"
  s3_bucket_name = aws_s3_bucket.config.id

  snapshot_delivery_properties {
    delivery_frequency = "TwentyFour_Hours"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_configuration_recorder_status" "main" {
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.main]
}

# ─── Config Rules ───────────────────────────────────────────────────────────────

resource "aws_config_config_rule" "s3_bucket_encryption" {
  name = "${local.name_prefix}-s3-bucket-encryption"

  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "s3_bucket_public_read" {
  name = "${local.name_prefix}-s3-no-public-read"

  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "rds_encryption" {
  name = "${local.name_prefix}-rds-encryption"

  source {
    owner             = "AWS"
    source_identifier = "RDS_STORAGE_ENCRYPTED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "rds_public_access" {
  name = "${local.name_prefix}-rds-no-public-access"

  source {
    owner             = "AWS"
    source_identifier = "RDS_INSTANCE_PUBLIC_ACCESS_CHECK"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "encrypted_volumes" {
  name = "${local.name_prefix}-encrypted-volumes"

  source {
    owner             = "AWS"
    source_identifier = "ENCRYPTED_VOLUMES"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "iam_root_mfa" {
  name = "${local.name_prefix}-root-account-mfa"

  source {
    owner             = "AWS"
    source_identifier = "ROOT_ACCOUNT_MFA_ENABLED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "cloudtrail_enabled" {
  name = "${local.name_prefix}-cloudtrail-enabled"

  source {
    owner             = "AWS"
    source_identifier = "CLOUD_TRAIL_ENABLED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "vpc_flow_logs" {
  name = "${local.name_prefix}-vpc-flow-logs-enabled"

  source {
    owner             = "AWS"
    source_identifier = "VPC_FLOW_LOGS_ENABLED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

resource "aws_config_config_rule" "restricted_ssh" {
  name = "${local.name_prefix}-restricted-ssh"

  source {
    owner             = "AWS"
    source_identifier = "INCOMING_SSH_DISABLED"
  }

  depends_on = [aws_config_configuration_recorder.main]
}

# IAM role for Config
resource "aws_iam_role" "config" {
  name = "${local.name_prefix}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "config.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "config" {
  role       = aws_iam_role.config.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_s3_bucket" "config" {
  bucket = "${local.name_prefix}-config-logs"
}
```

## CloudTrail

```hcl
resource "aws_cloudtrail" "main" {
  name                          = "${local.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cloudwatch.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3"]
    }
  }

  insight_selectors {
    insight_type = "ApiCallRateInsight"
  }

  insight_selectors {
    insight_type = "ApiErrorRateInsight"
  }

  tags = {
    Name = "${local.name_prefix}-cloudtrail"
  }
}

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${local.name_prefix}"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.main.arn
}

# Alert on root account usage
resource "aws_cloudwatch_log_metric_filter" "root_login" {
  name           = "${local.name_prefix}-root-login"
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  metric_transformation {
    name      = "RootAccountUsage"
    namespace = "${local.name_prefix}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_login" {
  alarm_name          = "${local.name_prefix}-root-account-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountUsage"
  namespace           = "${local.name_prefix}/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 0

  alarm_actions = [aws_sns_topic.security_alerts.arn]
}

# Alert on console login without MFA
resource "aws_cloudwatch_log_metric_filter" "no_mfa_login" {
  name           = "${local.name_prefix}-no-mfa-login"
  pattern        = "{ $.eventName = \"ConsoleLogin\" && $.additionalEventData.MFAUsed != \"Yes\" }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  metric_transformation {
    name      = "ConsoleLoginWithoutMFA"
    namespace = "${local.name_prefix}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "no_mfa_login" {
  alarm_name          = "${local.name_prefix}-console-login-without-mfa"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ConsoleLoginWithoutMFA"
  namespace           = "${local.name_prefix}/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 0

  alarm_actions = [aws_sns_topic.security_alerts.arn]
}

# Alert on unauthorized API calls
resource "aws_cloudwatch_log_metric_filter" "unauthorized_api" {
  name           = "${local.name_prefix}-unauthorized-api"
  pattern        = "{ $.errorCode = \"*UnauthorizedAccess*\" || $.errorCode = \"AccessDenied*\" }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  metric_transformation {
    name      = "UnauthorizedAPICalls"
    namespace = "${local.name_prefix}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_api" {
  alarm_name          = "${local.name_prefix}-unauthorized-api-calls"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnauthorizedAPICalls"
  namespace           = "${local.name_prefix}/Security"
  period              = 300
  statistic           = "Sum"
  threshold           = 10

  alarm_actions = [aws_sns_topic.security_alerts.arn]
}
```

## Security Checklist

Every production Terraform deployment should have:

- [ ] All IAM policies follow least-privilege (no `*` actions or resources)
- [ ] Permissions boundaries on all application roles
- [ ] Security groups reference other security groups, not CIDR blocks where possible
- [ ] No security groups with `0.0.0.0/0` ingress on sensitive ports (SSH, RDP, databases)
- [ ] All storage encrypted at rest (S3, RDS, EBS, ElastiCache, CloudWatch Logs)
- [ ] All communication encrypted in transit (TLS 1.2+, SSL on RDS, transit encryption on Redis)
- [ ] VPC flow logs enabled
- [ ] CloudTrail enabled for all regions
- [ ] GuardDuty enabled
- [ ] AWS Config rules monitoring compliance
- [ ] S3 buckets block public access
- [ ] RDS instances not publicly accessible
- [ ] KMS keys with rotation enabled
- [ ] VPC endpoints for AWS service calls (avoid traversing internet)
- [ ] SNS alerts for security events
- [ ] Root account usage alerts

## What to Learn Next

- **[Cost Optimization](./cost-optimization)** — security and cost optimization often complement each other
- **[AWS IAM Deep Dive](/infrastructure/aws/iam-deep-dive)** — comprehensive IAM policy design
- **[Multi-Region](./multi-region)** — secure multi-region deployments
