---
title: "AWS CLI Cheat Sheet"
description: "Quick reference for AWS CLI commands — EC2, S3, IAM, Lambda, RDS, ECS, and common patterns"
tags: [aws, cli, cheat-sheet, reference, cloud]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# AWS CLI Cheat Sheet

Quick reference for the most common AWS CLI commands across core services. Assumes AWS CLI v2 is installed and configured.

**Related**: [Terraform Cheat Sheet](/cheat-sheets/terraform) | [Docker Cheat Sheet](/cheat-sheets/docker)

---

## Setup & Configuration

| Command | Description |
|---------|-------------|
| `aws configure` | Interactive setup (access key, secret, region, output) |
| `aws configure --profile staging` | Configure a named profile |
| `aws configure list` | Show current config values |
| `aws sts get-caller-identity` | Verify who you are authenticated as |
| `aws configure set region us-west-2` | Set default region |
| `export AWS_PROFILE=staging` | Switch active profile via env var |
| `export AWS_DEFAULT_REGION=eu-west-1` | Override region via env var |

::: tip
Always verify your identity with `aws sts get-caller-identity` before running destructive commands. You might be in the wrong account.
:::

---

## EC2 (Elastic Compute Cloud)

### Instance Management

| Command | Description |
|---------|-------------|
| `aws ec2 describe-instances` | List all EC2 instances |
| `aws ec2 describe-instances --filters "Name=instance-state-name,Values=running"` | List only running instances |
| `aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]' --output table` | Clean tabular output |
| `aws ec2 start-instances --instance-ids i-1234567890abcdef0` | Start an instance |
| `aws ec2 stop-instances --instance-ids i-1234567890abcdef0` | Stop an instance |
| `aws ec2 reboot-instances --instance-ids i-1234567890abcdef0` | Reboot an instance |
| `aws ec2 terminate-instances --instance-ids i-1234567890abcdef0` | Terminate (delete) an instance |

### Security Groups

| Command | Description |
|---------|-------------|
| `aws ec2 describe-security-groups` | List all security groups |
| `aws ec2 authorize-security-group-ingress --group-id sg-xxx --protocol tcp --port 443 --cidr 0.0.0.0/0` | Allow HTTPS from anywhere |
| `aws ec2 revoke-security-group-ingress --group-id sg-xxx --protocol tcp --port 22 --cidr 0.0.0.0/0` | Remove SSH access |

### Key Pairs

| Command | Description |
|---------|-------------|
| `aws ec2 create-key-pair --key-name my-key --query 'KeyMaterial' --output text > my-key.pem` | Create and save key pair |
| `aws ec2 describe-key-pairs` | List key pairs |
| `aws ec2 delete-key-pair --key-name my-key` | Delete key pair |

---

## S3 (Simple Storage Service)

### Bucket Operations

| Command | Description |
|---------|-------------|
| `aws s3 ls` | List all buckets |
| `aws s3 ls s3://my-bucket` | List top-level objects in bucket |
| `aws s3 ls s3://my-bucket --recursive --human-readable` | List all objects with human-readable sizes |
| `aws s3 mb s3://my-new-bucket` | Create a bucket |
| `aws s3 rb s3://my-bucket` | Remove an empty bucket |
| `aws s3 rb s3://my-bucket --force` | Remove bucket and all contents |

### File Operations

| Command | Description |
|---------|-------------|
| `aws s3 cp file.txt s3://bucket/path/` | Upload file |
| `aws s3 cp s3://bucket/path/file.txt .` | Download file |
| `aws s3 cp s3://bucket/a.txt s3://bucket/b.txt` | Copy within S3 |
| `aws s3 mv file.txt s3://bucket/path/` | Move file to S3 |
| `aws s3 rm s3://bucket/path/file.txt` | Delete file |
| `aws s3 sync ./local-dir s3://bucket/path/` | Sync local directory to S3 |
| `aws s3 sync s3://bucket/path/ ./local-dir` | Sync S3 to local directory |
| `aws s3 sync . s3://bucket/ --exclude "*.log"` | Sync excluding patterns |
| `aws s3 sync . s3://bucket/ --delete` | Sync and remove deleted files |

### Presigned URLs

| Command | Description |
|---------|-------------|
| `aws s3 presign s3://bucket/file.txt --expires-in 3600` | Generate presigned URL (1 hour) |

::: warning
`aws s3 sync --delete` will remove files in the destination that do not exist in the source. Double-check direction before running.
:::

---

## IAM (Identity and Access Management)

### Users & Groups

| Command | Description |
|---------|-------------|
| `aws iam list-users` | List all IAM users |
| `aws iam create-user --user-name dev-user` | Create a user |
| `aws iam delete-user --user-name dev-user` | Delete a user |
| `aws iam list-groups` | List all groups |
| `aws iam add-user-to-group --user-name dev-user --group-name developers` | Add user to group |
| `aws iam create-access-key --user-name dev-user` | Create access key for user |
| `aws iam list-access-keys --user-name dev-user` | List user's access keys |
| `aws iam delete-access-key --user-name dev-user --access-key-id AKIAXXXXXXX` | Delete access key |

### Roles & Policies

| Command | Description |
|---------|-------------|
| `aws iam list-roles` | List all roles |
| `aws iam list-policies --scope Local` | List customer-managed policies |
| `aws iam attach-role-policy --role-name my-role --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess` | Attach policy to role |
| `aws iam list-attached-role-policies --role-name my-role` | List policies attached to role |
| `aws iam get-policy --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess` | Get policy details |
| `aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456:user/dev --action-names s3:GetObject` | Test permissions |

---

## Lambda

| Command | Description |
|---------|-------------|
| `aws lambda list-functions` | List all Lambda functions |
| `aws lambda get-function --function-name my-func` | Get function details |
| `aws lambda invoke --function-name my-func --payload '{"key":"val"}' output.json` | Invoke function synchronously |
| `aws lambda invoke --function-name my-func --invocation-type Event --payload '{}' output.json` | Invoke asynchronously |
| `aws lambda update-function-code --function-name my-func --zip-file fileb://function.zip` | Deploy new code from zip |
| `aws lambda update-function-configuration --function-name my-func --memory-size 512 --timeout 30` | Update config |
| `aws lambda publish-version --function-name my-func` | Publish a version |
| `aws lambda list-versions-by-function --function-name my-func` | List versions |
| `aws lambda create-alias --function-name my-func --name prod --function-version 5` | Create alias pointing to version |
| `aws lambda get-function-configuration --function-name my-func` | Get runtime config |

### Lambda Logs

```bash
# Get recent log streams
aws logs describe-log-streams \
  --log-group-name /aws/lambda/my-func \
  --order-by LastEventTime \
  --descending \
  --limit 5

# Tail live logs
aws logs tail /aws/lambda/my-func --follow
```

---

## RDS (Relational Database Service)

| Command | Description |
|---------|-------------|
| `aws rds describe-db-instances` | List all RDS instances |
| `aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]' --output table` | Clean table output |
| `aws rds create-db-snapshot --db-instance-identifier mydb --db-snapshot-identifier mydb-snap` | Create snapshot |
| `aws rds describe-db-snapshots --db-instance-identifier mydb` | List snapshots |
| `aws rds restore-db-instance-from-db-snapshot --db-instance-identifier mydb-restored --db-snapshot-identifier mydb-snap` | Restore from snapshot |
| `aws rds stop-db-instance --db-instance-identifier mydb` | Stop instance (saves cost) |
| `aws rds start-db-instance --db-instance-identifier mydb` | Start instance |
| `aws rds modify-db-instance --db-instance-identifier mydb --db-instance-class db.r5.large --apply-immediately` | Change instance type |

::: danger
`--apply-immediately` causes downtime for most modifications. Use `--no-apply-immediately` to defer to the next maintenance window.
:::

---

## ECS (Elastic Container Service)

### Cluster & Service Management

| Command | Description |
|---------|-------------|
| `aws ecs list-clusters` | List all ECS clusters |
| `aws ecs describe-clusters --clusters my-cluster` | Get cluster details |
| `aws ecs list-services --cluster my-cluster` | List services in a cluster |
| `aws ecs describe-services --cluster my-cluster --services my-svc` | Get service details |
| `aws ecs update-service --cluster my-cluster --service my-svc --desired-count 3` | Scale service |
| `aws ecs update-service --cluster my-cluster --service my-svc --force-new-deployment` | Force redeploy |

### Tasks

| Command | Description |
|---------|-------------|
| `aws ecs list-tasks --cluster my-cluster --service-name my-svc` | List running tasks |
| `aws ecs describe-tasks --cluster my-cluster --tasks arn:aws:ecs:...` | Get task details |
| `aws ecs stop-task --cluster my-cluster --task arn:aws:ecs:...` | Stop a task |
| `aws ecs run-task --cluster my-cluster --task-definition my-td:3` | Run a one-off task |
| `aws ecs execute-command --cluster my-cluster --task arn --container app --interactive --command "/bin/sh"` | Shell into running container |

### Task Definitions

| Command | Description |
|---------|-------------|
| `aws ecs list-task-definitions` | List all task definitions |
| `aws ecs describe-task-definition --task-definition my-td:3` | Get task definition |
| `aws ecs register-task-definition --cli-input-json file://task-def.json` | Register new task definition |
| `aws ecs deregister-task-definition --task-definition my-td:1` | Deregister old revision |

---

## CloudWatch

| Command | Description |
|---------|-------------|
| `aws logs describe-log-groups` | List log groups |
| `aws logs tail /ecs/my-service --follow` | Tail logs in real time |
| `aws logs filter-log-events --log-group-name /ecs/my-svc --filter-pattern "ERROR"` | Search for errors |
| `aws cloudwatch list-metrics --namespace AWS/EC2` | List available metrics |
| `aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value=i-xxx --start-time 2024-01-01T00:00:00Z --end-time 2024-01-02T00:00:00Z --period 3600 --statistics Average` | Get CPU stats |

---

## Useful Patterns

### Find Expensive Resources

```bash
# Large S3 buckets
aws s3api list-buckets --query 'Buckets[*].Name' --output text | \
  xargs -I {} aws s3api head-bucket --bucket {} 2>/dev/null

# Running EC2 instances and their types
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,LaunchTime]' \
  --output table
```

### Multi-Account Operations

```bash
# Assume role in another account
CREDS=$(aws sts assume-role \
  --role-arn arn:aws:iam::TARGET_ACCOUNT:role/CrossAccountRole \
  --role-session-name my-session \
  --query 'Credentials')

export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r '.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r '.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r '.SessionToken')
```

### Output Formatting

```bash
# Table output
aws ec2 describe-instances --output table

# JSON with jq
aws ec2 describe-instances | jq '.Reservations[].Instances[] | {id: .InstanceId, state: .State.Name}'

# Text output (great for scripting)
aws ec2 describe-instances --query 'Reservations[*].Instances[*].InstanceId' --output text

# YAML output
aws ec2 describe-instances --output yaml
```

::: tip
Use `--query` (JMESPath) for server-side filtering, and `jq` for client-side transformation. Combine both for complex queries.
:::

---

## Common Flags

| Flag | Description |
|------|-------------|
| `--profile name` | Use a named profile |
| `--region us-east-1` | Override region |
| `--output json\|table\|text\|yaml` | Output format |
| `--query 'JMESPath'` | Filter/transform output |
| `--no-cli-pager` | Disable pager for scripting |
| `--dry-run` | Test permissions without executing (EC2) |
| `--debug` | Full debug output |

---

*Last updated: 2026-03-20*
