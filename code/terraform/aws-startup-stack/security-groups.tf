# =============================================================================
# Security Groups — Network Access Control
# =============================================================================
# Least-privilege security groups for each tier:
#   - ALB:   accepts HTTP/HTTPS from internet, sends to ECS
#   - ECS:   accepts from ALB only, connects to RDS/Redis
#   - RDS:   accepts from ECS only (port 5432)
#   - Redis: accepts from ECS only (port 6379)
# =============================================================================

# ---------------------------------------------------------------------------
# ALB Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for the Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ALB inbound — HTTP from internet (redirects to HTTPS)
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from internet"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"

  tags = { Name = "alb-http-in" }
}

# ALB inbound — HTTPS from internet
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from internet"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"

  tags = { Name = "alb-https-in" }
}

# ALB outbound — to ECS tasks only
resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To ECS tasks"
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id

  tags = { Name = "alb-to-ecs" }
}

# ---------------------------------------------------------------------------
# ECS Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Security group for ECS Fargate tasks"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-ecs-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ECS inbound — from ALB only
resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "From ALB"
  from_port                    = var.app_port
  to_port                      = var.app_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id

  tags = { Name = "ecs-from-alb" }
}

# ECS outbound — to RDS (PostgreSQL)
resource "aws_vpc_security_group_egress_rule" "ecs_to_rds" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "To RDS PostgreSQL"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.rds.id

  tags = { Name = "ecs-to-rds" }
}

# ECS outbound — to Redis
resource "aws_vpc_security_group_egress_rule" "ecs_to_redis" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "To Redis"
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.redis.id

  tags = { Name = "ecs-to-redis" }
}

# ECS outbound — HTTPS to internet (for external APIs, ECR, CloudWatch, etc.)
resource "aws_vpc_security_group_egress_rule" "ecs_to_internet_https" {
  security_group_id = aws_security_group.ecs.id
  description       = "HTTPS to internet (APIs, ECR, CloudWatch)"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"

  tags = { Name = "ecs-https-out" }
}

# ECS outbound — DNS (UDP)
resource "aws_vpc_security_group_egress_rule" "ecs_dns_udp" {
  security_group_id = aws_security_group.ecs.id
  description       = "DNS resolution (UDP)"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
  cidr_ipv4         = var.vpc_cidr

  tags = { Name = "ecs-dns-udp" }
}

# ECS outbound — DNS (TCP)
resource "aws_vpc_security_group_egress_rule" "ecs_dns_tcp" {
  security_group_id = aws_security_group.ecs.id
  description       = "DNS resolution (TCP)"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "tcp"
  cidr_ipv4         = var.vpc_cidr

  tags = { Name = "ecs-dns-tcp" }
}

# ---------------------------------------------------------------------------
# RDS Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# RDS inbound — from ECS tasks only
resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from ECS"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id

  tags = { Name = "rds-from-ecs" }
}

# ---------------------------------------------------------------------------
# Redis Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-redis-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Redis inbound — from ECS tasks only
resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from ECS"
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id

  tags = { Name = "redis-from-ecs" }
}
