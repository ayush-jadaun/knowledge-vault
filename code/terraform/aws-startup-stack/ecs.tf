# =============================================================================
# ECS Fargate — Application Compute Layer
# =============================================================================
# Creates:
#   - ECS Cluster with Container Insights
#   - Task Definition with container, logging, and secrets
#   - ECS Service behind ALB with health checks
#   - Auto Scaling (target tracking on CPU and memory)
# =============================================================================

# ---------------------------------------------------------------------------
# ECS Cluster
# ---------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.enable_detailed_monitoring ? "enabled" : "disabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

# Cluster capacity providers — Fargate and Fargate Spot
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group for ECS tasks
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-ecs-logs"
  }
}

# ---------------------------------------------------------------------------
# ECS Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  # Container definition
  container_definitions = jsonencode([
    {
      name      = "app"
      image     = var.app_image
      essential = true

      # Port mapping
      portMappings = [
        {
          containerPort = var.app_port
          protocol      = "tcp"
        }
      ]

      # Environment variables (non-sensitive)
      environment = concat(
        [
          { name = "NODE_ENV", value = var.environment },
          { name = "PORT", value = tostring(var.app_port) },
          { name = "DB_HOST", value = aws_db_instance.main.address },
          { name = "DB_PORT", value = tostring(aws_db_instance.main.port) },
          { name = "DB_NAME", value = var.db_name },
          { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}" },
        ],
        [for k, v in var.app_environment_variables : { name = k, value = v }]
      )

      # Secrets from SSM Parameter Store or Secrets Manager
      secrets = [for k, v in var.app_secrets : { name = k, valueFrom = v }]

      # Logging configuration — CloudWatch
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "app"
        }
      }

      # Health check at container level
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.app_port}${var.app_health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      # Linux parameters
      linuxParameters = {
        initProcessEnabled = true # Enable tini init process for proper signal handling
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-task-def"
  }
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_desired_count
  launch_type     = "FARGATE"

  # Deployment configuration
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 120

  # Enable deployment circuit breaker with automatic rollback
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Network configuration — private subnets
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  # ALB integration
  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.app_port
  }

  # Ignore changes to desired_count (managed by auto-scaling)
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.https]

  tags = {
    Name = "${local.name_prefix}-ecs-service"
  }
}

# ---------------------------------------------------------------------------
# Auto Scaling
# ---------------------------------------------------------------------------

# Scalable target
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.app_max_count
  min_capacity       = var.app_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based scaling policy
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory-based scaling policy
resource "aws_appautoscaling_policy" "memory" {
  name               = "${local.name_prefix}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
