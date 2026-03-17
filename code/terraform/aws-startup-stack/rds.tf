# =============================================================================
# RDS PostgreSQL — Database Layer
# =============================================================================
# Creates a production PostgreSQL instance with:
#   - Multi-AZ for high availability
#   - Encrypted storage (AES-256)
#   - Automated backups with configurable retention
#   - Custom parameter group for tuning
#   - Dedicated subnet group and security group
#   - Auto-generated master password stored in Secrets Manager
# =============================================================================

# ---------------------------------------------------------------------------
# Random password for RDS master user
# ---------------------------------------------------------------------------
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+"
}

# Store the password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}/rds/master-password"
  description             = "RDS master password for ${local.name_prefix}"
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# ---------------------------------------------------------------------------
# DB Subnet Group — private subnets only
# ---------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name        = "${local.name_prefix}-db-subnet"
  description = "Database subnet group for ${local.name_prefix}"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-db-subnet"
  }
}

# ---------------------------------------------------------------------------
# DB Parameter Group — PostgreSQL tuning
# ---------------------------------------------------------------------------
resource "aws_db_parameter_group" "main" {
  name        = "${local.name_prefix}-pg15"
  family      = "postgres15"
  description = "Custom parameter group for ${local.name_prefix}"

  # Logging parameters
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries taking more than 1 second
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # Performance parameters
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  # Connection settings
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000" # 60 seconds
  }

  parameter {
    name  = "statement_timeout"
    value = "30000" # 30 seconds
  }

  tags = {
    Name = "${local.name_prefix}-pg15-params"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# RDS Instance
# ---------------------------------------------------------------------------
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  # Engine
  engine               = "postgres"
  engine_version       = var.db_engine_version
  instance_class       = var.db_instance_class
  parameter_group_name = aws_db_parameter_group.main.name

  # Storage
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  # Backup
  backup_retention_period = var.db_backup_retention_period
  backup_window           = "03:00-04:00"          # UTC
  maintenance_window      = "Mon:04:00-Mon:05:00"  # UTC (after backup window)

  # Monitoring
  monitoring_interval          = var.enable_detailed_monitoring ? 60 : 0
  monitoring_role_arn          = var.enable_detailed_monitoring ? aws_iam_role.rds_monitoring[0].arn : null
  performance_insights_enabled = true
  performance_insights_retention_period = 7

  # Protection
  deletion_protection      = var.db_deletion_protection
  skip_final_snapshot      = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-final-snapshot" : null
  copy_tags_to_snapshot    = true

  # Upgrades
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = var.environment != "prod"

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

# ---------------------------------------------------------------------------
# Enhanced Monitoring IAM Role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "rds_monitoring" {
  count = var.enable_detailed_monitoring ? 1 : 0

  name = "${local.name_prefix}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.enable_detailed_monitoring ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
