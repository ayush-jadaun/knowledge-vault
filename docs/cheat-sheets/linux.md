---
title: "Linux Cheat Sheet"
description: "Quick reference for Linux commands, file permissions, process management, networking, and systemd"
tags: [cheat-sheet, linux, sysadmin]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Linux Cheat Sheet

Quick reference for essential Linux commands, file permissions, process management, networking, and systemd.

---

## File System

### Navigation & Listing

| Command | Description |
|---------|-------------|
| `pwd` | Print working directory |
| `ls -la` | List all files with details |
| `ls -lah` | Human-readable file sizes |
| `ls -lt` | Sort by modification time |
| `ls -lS` | Sort by file size |
| `cd -` | Go to previous directory |
| `cd ~` | Go to home directory |
| `tree -L 2` | Directory tree, 2 levels deep |

### File Operations

| Command | Description |
|---------|-------------|
| `cp file dest` | Copy file |
| `cp -r dir dest` | Copy directory recursively |
| `mv old new` | Move or rename |
| `rm file` | Delete file |
| `rm -rf dir` | Delete directory recursively |
| `mkdir -p a/b/c` | Create nested directories |
| `touch file` | Create file or update timestamp |
| `ln -s target link` | Create symbolic link |
| `stat file` | Detailed file info |

### File Content

| Command | Description |
|---------|-------------|
| `cat file` | Print entire file |
| `less file` | Paginated viewer |
| `head -n 20 file` | First 20 lines |
| `tail -n 20 file` | Last 20 lines |
| `tail -f file` | Follow file (live logs) |
| `wc -l file` | Count lines |
| `sort file` | Sort lines |
| `uniq` | Remove adjacent duplicates |
| `sort file \| uniq -c` | Count occurrences |
| `cut -d',' -f1,3 file` | Extract CSV columns 1 and 3 |
| `tr 'a-z' 'A-Z'` | Translate characters |
| `diff file1 file2` | Compare files |
| `md5sum file` | MD5 checksum |
| `sha256sum file` | SHA-256 checksum |

### Search

| Command | Description |
|---------|-------------|
| `find / -name "*.log"` | Find files by name |
| `find / -type f -size +100M` | Find files larger than 100MB |
| `find / -mtime -7` | Modified in last 7 days |
| `find / -type f -exec chmod 644 {} \;` | Find and execute command |
| `grep -r "pattern" /path` | Search recursively |
| `grep -rn "pattern" /path` | Search with line numbers |
| `grep -ri "pattern" /path` | Case-insensitive |
| `grep -rl "pattern" /path` | List matching files only |
| `grep -v "pattern"` | Invert match |
| `grep -E "regex" file` | Extended regex |
| `locate filename` | Fast search (uses db) |
| `which command` | Find command path |

---

## File Permissions

### Permission Structure

```
-rwxr-xr-- 1 user group 4096 Jan 1 12:00 file
|[-][-][-]
| |  |  |
| |  |  +-- Others: r-- (read only)
| |  +----- Group:  r-x (read + execute)
| +-------- Owner:  rwx (read + write + execute)
+---------- Type:   - (file), d (directory), l (symlink)
```

### Permission Values

| Symbol | Numeric | Meaning |
|--------|---------|---------|
| `r` | 4 | Read |
| `w` | 2 | Write |
| `x` | 1 | Execute |
| `-` | 0 | No permission |

### Common Permission Patterns

| Numeric | Symbolic | Use Case |
|---------|----------|----------|
| `644` | `-rw-r--r--` | Regular files |
| `755` | `-rwxr-xr-x` | Executables, directories |
| `600` | `-rw-------` | Private files (SSH keys) |
| `700` | `-rwx------` | Private directories |
| `660` | `-rw-rw----` | Group-shared files |
| `775` | `-rwxrwxr-x` | Group-shared directories |

### chmod Commands

```bash
# Numeric
chmod 644 file
chmod 755 script.sh
chmod -R 755 dir/

# Symbolic
chmod u+x file        # Add execute for owner
chmod g+w file        # Add write for group
chmod o-r file        # Remove read for others
chmod a+r file        # Add read for all
chmod u=rwx,g=rx,o=r file
```

### chown Commands

```bash
chown user file           # Change owner
chown user:group file     # Change owner and group
chown -R user:group dir/  # Recursive
chgrp group file          # Change group only
```

### Special Permissions

| Permission | Numeric | Effect |
|------------|---------|--------|
| SUID | `4xxx` | Execute as file owner |
| SGID | `2xxx` | Execute as file group / inherit group in dir |
| Sticky | `1xxx` | Only owner can delete in directory |

```bash
chmod 4755 file    # SUID
chmod 2755 dir     # SGID
chmod 1755 /tmp    # Sticky bit
```

---

## Process Management

### Viewing Processes

| Command | Description |
|---------|-------------|
| `ps aux` | All processes with details |
| `ps aux --sort=-%mem` | Sort by memory usage |
| `ps aux --sort=-%cpu` | Sort by CPU usage |
| `ps -ef --forest` | Process tree |
| `top` | Interactive process monitor |
| `htop` | Better interactive monitor |
| `pgrep -f "pattern"` | Find PID by name/pattern |
| `pidof nginx` | Find PID by exact name |

### Managing Processes

| Command | Description |
|---------|-------------|
| `kill PID` | Graceful kill (SIGTERM) |
| `kill -9 PID` | Force kill (SIGKILL) |
| `kill -HUP PID` | Reload config (SIGHUP) |
| `killall name` | Kill all by name |
| `pkill -f "pattern"` | Kill by pattern |
| `nohup cmd &` | Run in background, survive logout |
| `cmd &` | Run in background |
| `jobs` | List background jobs |
| `fg %1` | Bring job 1 to foreground |
| `bg %1` | Resume stopped job in background |
| `Ctrl+Z` | Suspend current process |
| `Ctrl+C` | Interrupt current process |

### Signals

| Signal | Number | Meaning |
|--------|--------|---------|
| SIGHUP | 1 | Hangup / reload |
| SIGINT | 2 | Interrupt (Ctrl+C) |
| SIGQUIT | 3 | Quit with core dump |
| SIGKILL | 9 | Force kill (cannot catch) |
| SIGTERM | 15 | Graceful termination |
| SIGSTOP | 19 | Pause (cannot catch) |
| SIGCONT | 18 | Resume |

---

## Disk & Storage

| Command | Description |
|---------|-------------|
| `df -h` | Disk space by filesystem |
| `du -sh dir/` | Directory size |
| `du -h --max-depth=1 /` | Size of top-level directories |
| `du -ah dir/ \| sort -rh \| head -20` | Largest files in directory |
| `lsblk` | Block device list |
| `mount` | Show mounted filesystems |
| `fdisk -l` | List disk partitions |
| `ncdu /` | Interactive disk usage (if installed) |
| `ionice -c 3 cmd` | Run command with low IO priority |

---

## Networking

### Network Information

| Command | Description |
|---------|-------------|
| `ip addr show` | Show IP addresses |
| `ip route show` | Show routing table |
| `ss -tlnp` | Listening TCP ports with PIDs |
| `ss -ulnp` | Listening UDP ports |
| `ss -s` | Socket statistics summary |
| `netstat -tlnp` | Listening ports (legacy) |
| `hostname -I` | Show all IP addresses |
| `cat /etc/resolv.conf` | DNS configuration |
| `ip link show` | Network interfaces |

### Connectivity Testing

| Command | Description |
|---------|-------------|
| `ping -c 4 host` | ICMP ping (4 packets) |
| `traceroute host` | Trace packet route |
| `mtr host` | Combines ping and traceroute |
| `curl -I url` | HTTP headers only |
| `curl -v url` | Verbose HTTP request |
| `curl -o /dev/null -w "%{http_code}" url` | Just status code |
| `wget -q -O - url` | Download to stdout |
| `dig domain` | DNS lookup |
| `dig +short domain` | DNS lookup (short) |
| `nslookup domain` | DNS lookup (simpler) |
| `host domain` | DNS lookup (simplest) |

### Port & Connection Debugging

```bash
# Check if port is open
nc -zv host 80

# Check if port is open (with timeout)
timeout 3 bash -c "echo > /dev/tcp/host/80" && echo open || echo closed

# Listen on a port
nc -l 8080

# Send data to a port
echo "hello" | nc host 8080

# Check what is listening on a port
ss -tlnp | grep :8080
lsof -i :8080
```

### Firewall (iptables/nftables)

```bash
# List rules
iptables -L -n -v

# Allow incoming port 80
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Block an IP
iptables -A INPUT -s 1.2.3.4 -j DROP

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Save rules (Debian/Ubuntu)
iptables-save > /etc/iptables/rules.v4
```

### SSH

```bash
# Connect
ssh user@host

# Connect with specific key
ssh -i ~/.ssh/key.pem user@host

# Port forwarding (local)
ssh -L 8080:localhost:3000 user@host

# Port forwarding (remote)
ssh -R 8080:localhost:3000 user@host

# SOCKS proxy
ssh -D 1080 user@host

# Copy SSH key to server
ssh-copy-id user@host

# Generate SSH key
ssh-keygen -t ed25519 -C "email@example.com"

# SSH config (~/.ssh/config)
# Host myserver
#   HostName 1.2.3.4
#   User deploy
#   IdentityFile ~/.ssh/deploy_key
#   Port 22
```

---

## systemd

### Service Management

| Command | Description |
|---------|-------------|
| `systemctl start service` | Start service |
| `systemctl stop service` | Stop service |
| `systemctl restart service` | Restart service |
| `systemctl reload service` | Reload config without restart |
| `systemctl status service` | Service status and recent logs |
| `systemctl enable service` | Start on boot |
| `systemctl disable service` | Do not start on boot |
| `systemctl is-active service` | Check if running |
| `systemctl is-enabled service` | Check if enabled |
| `systemctl list-units --type=service` | List all services |
| `systemctl list-units --failed` | List failed services |
| `systemctl daemon-reload` | Reload unit files after changes |

### Journal (Logs)

| Command | Description |
|---------|-------------|
| `journalctl -u service` | Logs for a service |
| `journalctl -u service -f` | Follow logs |
| `journalctl -u service --since "1 hour ago"` | Recent logs |
| `journalctl -u service --since today` | Today's logs |
| `journalctl -p err` | Error-level and above |
| `journalctl --disk-usage` | Journal disk usage |
| `journalctl --vacuum-size=500M` | Limit journal to 500MB |

### Unit File Template

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/server
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/myapp/.env
LimitNOFILE=65535

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/myapp/data

[Install]
WantedBy=multi-user.target
```

---

## Text Processing Pipeline

```bash
# Count HTTP status codes from access log
cat access.log | awk '{print $9}' | sort | uniq -c | sort -rn

# Find top 10 IP addresses
cat access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -10

# Extract unique errors
grep "ERROR" app.log | awk -F']' '{print $NF}' | sort -u

# Sum a numeric column
awk '{sum += $3} END {print sum}' data.txt

# Replace text in multiple files
find . -name "*.conf" -exec sed -i 's/old/new/g' {} +

# Watch a log file for a pattern
tail -f app.log | grep --line-buffered "ERROR"

# Monitor file changes
watch -n 2 'ls -la /var/log/app.log'
```

---

## User Management

| Command | Description |
|---------|-------------|
| `useradd -m -s /bin/bash user` | Create user with home dir |
| `userdel -r user` | Delete user and home dir |
| `usermod -aG group user` | Add user to group |
| `passwd user` | Set password |
| `groups user` | Show user's groups |
| `id user` | Show UID, GID, groups |
| `su - user` | Switch user |
| `sudo cmd` | Run as root |
| `visudo` | Edit sudoers safely |

---

## System Information

| Command | Description |
|---------|-------------|
| `uname -a` | Kernel and OS info |
| `cat /etc/os-release` | Distribution info |
| `uptime` | System uptime and load |
| `free -h` | Memory usage |
| `nproc` | Number of CPU cores |
| `lscpu` | CPU details |
| `dmesg \| tail` | Kernel messages |
| `cat /proc/meminfo` | Detailed memory info |
| `cat /proc/cpuinfo` | CPU info |
| `vmstat 1` | Virtual memory stats (every 1s) |
| `iostat -x 1` | IO stats (every 1s) |
| `sar -u 1 10` | CPU usage (10 samples, 1s interval) |

---

## Troubleshooting Quick Fixes

| Problem | Command |
|---------|---------|
| High CPU | `top`, `htop`, sort by CPU |
| High memory | `ps aux --sort=-%mem \| head -10` |
| Disk full | `du -h --max-depth=1 / \| sort -rh \| head` |
| Cannot connect to port | `ss -tlnp \| grep :PORT` |
| DNS not resolving | `cat /etc/resolv.conf`, `dig domain` |
| Permission denied | `ls -la file`, check owner/group/permissions |
| Service won't start | `systemctl status service`, `journalctl -u service` |
| High IO wait | `iostat -x 1`, `iotop` |
| Too many open files | `ulimit -n`, `lsof -p PID \| wc -l` |
| OOM killer | `dmesg \| grep -i oom`, `journalctl -k \| grep oom` |
