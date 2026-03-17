# =============================================================================
# IAM — Identity and Access Management
# =============================================================================
# Creates minimal-privilege IAM roles for ECS:
#   - Task Execution Role: used by ECS agent to pull images, push logs,
#     read secrets from SSM/Secrets Manager
#   - Task Role: used by the application container at runtime
# =============================================================================

# ---------------------------------------------------------------------------
# ECS Task Execution Role
# ---------------------------------------------------------------------------
# This role is used by the ECS agent (not the application) to:
#   - Pull container images from ECR
#   - Push logs to CloudWatch
#   - Read secrets from SSM Parameter Store and Secrets Manager

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-ecs-execution"
  }
}

# Attach the AWS managed policy for basic ECS task execution
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for reading secrets
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "${local.name_prefix}-execution-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSSMParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${var.project_name}/${var.environment}/*"
      },
      {
        Sid    = "ReadSecretsManager"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}/*"
      },
      {
        Sid    = "DecryptWithKMS"
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${local.region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# ECS Task Role
# ---------------------------------------------------------------------------
# This role is assumed by the application container at runtime.
# Add only the permissions your application actually needs.

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-ecs-task"
  }
}

# Application permissions — S3 access for static assets
resource "aws_iam_role_policy" "ecs_task_s3" {
  count = var.enable_cloudfront ? 1 : 0

  name = "${local.name_prefix}-task-s3"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3StaticAssets"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.static_assets[0].arn,
          "${aws_s3_bucket.static_assets[0].arn}/*"
        ]
      }
    ]
  })
}

# Application permissions — SES for sending emails (common startup need)
resource "aws_iam_role_policy" "ecs_task_ses" {
  name = "${local.name_prefix}-task-ses"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendEmails"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = "noreply@${var.domain_name}"
          }
        }
      }
    ]
  })
}

# Application permissions — CloudWatch metrics (custom metrics from app)
resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  name = "${local.name_prefix}-task-cloudwatch"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PutCustomMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = local.name_prefix
          }
        }
      }
    ]
  })
}

# Application permissions — read own secrets at runtime
resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "${local.name_prefix}-task-secrets"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadAppSecrets"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}/*"
      }
    ]
  })
}

# ECS Exec permissions — for debugging in non-prod environments
resource "aws_iam_role_policy" "ecs_task_exec" {
  count = var.environment != "prod" ? 1 : 0

  name = "${local.name_prefix}-task-exec"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSExec"
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      }
    ]
  })
}
