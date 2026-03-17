# =============================================================================
# ElastiCache Redis — Caching & Session Layer
# =============================================================================
# Creates a Redis replication group with:
#   - Automatic failover (Multi-AZ)
#   - Encryption at rest and in transit
#   - Custom parameter group
#   - Dedicated subnet group and security group
#   - Automatic snapshots
# =============================================================================

# ---------------------------------------------------------------------------
# ElastiCache Subnet Group — private subnets only
# ---------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "main" {
  name        = "${local.name_prefix}-redis-subnet"
  description = "Redis subnet group for ${local.name_prefix}"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-redis-subnet"
  }
}

# ---------------------------------------------------------------------------
# ElastiCache Parameter Group
# ---------------------------------------------------------------------------
resource "aws_elasticache_parameter_group" "main" {
  name        = "${local.name_prefix}-redis7"
  family      = "redis7"
  description = "Custom Redis parameter group for ${local.name_prefix}"

  # Memory management — evict least recently used keys when memory is full
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  # Keyspace notifications for pub/sub
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  # Slow log — log commands slower than 10ms
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  # Max slow log entries
  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = {
    Name = "${local.name_prefix}-redis7-params"
  }
}

# ---------------------------------------------------------------------------
# Auth token for Redis (password)
# ---------------------------------------------------------------------------
resource "random_password" "redis_auth_token" {
  length           = 64
  special          = false # Redis AUTH token has character restrictions
}

resource "aws_secretsmanager_secret" "redis_auth_token" {
  name                    = "${local.name_prefix}/redis/auth-token"
  description             = "Redis AUTH token for ${local.name_prefix}"
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-redis-auth"
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id     = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = random_password.redis_auth_token.result
}

# ---------------------------------------------------------------------------
# ElastiCache Replication Group (Redis Cluster Mode Disabled)
# ---------------------------------------------------------------------------
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Redis replication group for ${local.name_prefix}"

  # Engine
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.main.name
  port                 = 6379

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # High availability
  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled           = var.redis_num_cache_nodes > 1

  # Security — encryption at rest and in transit
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  # Snapshots
  snapshot_retention_limit = var.redis_snapshot_retention
  snapshot_window          = "02:00-03:00" # UTC, before RDS backup

  # Maintenance
  maintenance_window = "Sun:05:00-Sun:06:00"

  # Upgrades
  auto_minor_version_upgrade = true
  apply_immediately          = var.environment != "prod"

  # Notifications
  notification_topic_arn = aws_sns_topic.alerts.arn

  tags = {
    Name = "${local.name_prefix}-redis"
  }

  lifecycle {
    ignore_changes = [num_cache_clusters]
  }
}
