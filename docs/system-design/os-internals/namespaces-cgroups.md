---
title: "Linux Namespaces & cgroups"
description: "The kernel mechanisms behind containers — how Linux namespaces create isolation (PID, network, mount, user, UTS, IPC) and how cgroups v2 enforce resource limits (CPU, memory, I/O)."
tags: [operating-systems, linux, containers, namespaces, cgroups, docker, kubernetes]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/processes-threads]
lastReviewed: "2026-06-12"
---

# Linux Namespaces & cgroups

A container is not a VM. It's a process (or group of processes) running on the host kernel, isolated via **namespaces** and constrained via **cgroups**. There is no separate guest OS, no hypervisor, no emulated hardware. The container process calls the same kernel as the host. Namespaces make the process believe it's the only thing on the machine; cgroups make sure it can't consume more resources than its share.

Understanding this explains why containers start in milliseconds (not seconds), why they're cheaper than VMs, and why certain workloads (like those needing different kernel versions) genuinely need VMs.

---

## The Two Mechanisms

| Mechanism | What it does |
|-----------|-------------|
| **Namespaces** | Isolation — each namespace wraps a global resource and makes it appear private to the processes inside |
| **cgroups** | Accounting and limits — tracks and enforces how much CPU, memory, I/O, and network a group of processes can use |

A container is: a set of namespaces (isolation) + a cgroup (limits) + a filesystem (union mount via overlay fs).

---

## Linux Namespaces

Linux has 8 namespace types. Each wraps one global resource.

### 1. PID Namespace

Processes inside a PID namespace have their own PID space starting from 1. PID 1 inside the container is the init process for that namespace. From outside the container, the actual PID is visible (e.g., 5432). From inside, it appears as PID 1.

```
Host:      PID 5432 (nginx)  PID 5433 (nginx worker)
Container: PID 1    (nginx)  PID 2    (nginx worker)
```

**Why PID 1 matters:** In Linux, PID 1 has special responsibilities — it must reap orphan processes (call `wait()`). If PID 1 doesn't handle `SIGTERM`, the whole container hangs on shutdown. This is why Docker containers should use `exec` form (`["nginx", "-g", "daemon off;"]`) not shell form (`nginx -g daemon off`), and why Kubernetes uses `tini` or similar as PID 1.

### 2. Network Namespace

Each network namespace has its own:
- Network interfaces (eth0, lo)
- Routing tables
- iptables rules
- Sockets (bound ports)

Two processes in different network namespaces can both bind port 80 — they have separate port spaces.

```bash
# Create a new network namespace
ip netns add myns

# Run a command in the namespace
ip netns exec myns ip addr show  # Only sees lo (loopback)

# Create a veth pair (virtual ethernet cable)
ip link add veth0 type veth peer name veth1
ip link set veth1 netns myns    # Move one end into namespace

# Now myns has veth1; host has veth0 — they're connected
```

Docker creates a veth pair per container. One end in the container's network namespace (renamed to `eth0`), one end in the host namespace, connected to a bridge (`docker0`).

### 3. Mount Namespace

Each mount namespace has its own view of the filesystem hierarchy. Mounting a filesystem in one namespace doesn't affect others.

```bash
unshare --mount bash  # New mount namespace
mount -t tmpfs tmpfs /mnt/test  # Visible only in this namespace
ls /mnt/test  # Visible
exit
ls /mnt/test  # Not visible in host
```

**OverlayFS:** Containers use OverlayFS to layer an image's read-only layers with a writable container layer. Changes go to the writable layer; the image layers are shared across all containers using the same image.

```
Container filesystem:
  Writable layer: /var/lib/docker/overlay2/<id>/diff  (container-specific)
      ↓ merged view
  Lower layer: ubuntu:22.04 image layers (read-only, shared)
```

### 4. UTS Namespace

Isolates hostname and NIS domain name. Each container can have its own hostname without affecting the host.

```bash
unshare --uts bash
hostname mycontainer
hostname  # → mycontainer (inside)
# host still shows original hostname
```

### 5. IPC Namespace

Isolates System V IPC objects (shared memory segments, message queues, semaphores) and POSIX message queues. Prevents containers from communicating via shared memory accidentally.

### 6. User Namespace

Maps user/group IDs. UID 0 (root) inside a user namespace can map to a non-root UID outside. Enables rootless containers — a process can appear as root inside the container but runs as an unprivileged user on the host.

```bash
# Map host UID 1000 to UID 0 inside the namespace
unshare --user --map-root-user bash
id  # → uid=0(root) gid=0(root) — appears as root inside
# But host sees this process running as UID 1000
```

### 7. Network (again) + Time Namespace

**Time namespace** (Linux 5.6): Isolates CLOCK_MONOTONIC and CLOCK_BOOTTIME. Allows containers to have different views of elapsed time (useful for migration and checkpointing).

### 8. Cgroup Namespace

A process in a cgroup namespace sees its cgroup root as `/`, hiding the host's cgroup hierarchy. Prevents containers from seeing or escaping to parent cgroups.

---

## cgroups v2

Control groups (cgroups) organize processes into a hierarchy and enforce resource limits. Every process belongs to exactly one cgroup.

**cgroups v2** (unified hierarchy, Linux 4.5+, default since kernel 5.8, required by Kubernetes 1.25+) exposes the cgroup filesystem at `/sys/fs/cgroup/`.

### CPU Limits

```bash
# Create a cgroup
mkdir /sys/fs/cgroup/myapp

# Limit to 0.5 CPU cores (50ms out of every 100ms)
echo "50000 100000" > /sys/fs/cgroup/myapp/cpu.max
#    ↑ quota  ↑ period (microseconds)

# Move a process into the cgroup
echo $PID > /sys/fs/cgroup/myapp/cgroup.procs
```

**CPU shares (weight-based):** `cpu.weight` (default 100). A cgroup with weight 200 gets 2× the CPU of a cgroup with weight 100 when both are CPU-constrained.

**Kubernetes CPU requests/limits map to:**
- CPU request → `cpu.weight` (scheduling priority)
- CPU limit → `cpu.max` (hard cap via CFS bandwidth throttling)

### Memory Limits

```bash
# Limit to 512MB RSS
echo $((512 * 1024 * 1024)) > /sys/fs/cgroup/myapp/memory.max

# Limit swap usage
echo 0 > /sys/fs/cgroup/myapp/memory.swap.max  # No swap

# Current usage
cat /sys/fs/cgroup/myapp/memory.current
```

**OOM killer:** When a cgroup exceeds `memory.max`, the kernel's OOM killer selects a process in the cgroup to kill. With Kubernetes, this results in a pod OOMKilled exit. The process with the highest "badness score" (memory usage × priority) is selected.

**memory.low (soft limit):** The kernel tries to protect this cgroup's memory from reclamation under global memory pressure — a "memory reservation."

### I/O Limits

```bash
# Limit I/O bandwidth (device 8:0 = /dev/sda)
echo "8:0 rbps=10485760 wbps=10485760" > /sys/fs/cgroup/myapp/io.max
#                ↑ 10MB/s read          ↑ 10MB/s write

# View I/O statistics
cat /sys/fs/cgroup/myapp/io.stat
```

### Process Limits

```bash
# Limit number of processes (prevents fork bombs)
echo 100 > /sys/fs/cgroup/myapp/pids.max
```

---

## How Docker Uses Namespaces + cgroups

When you run `docker run --memory=512m --cpus=0.5 nginx`:

1. Docker creates a new set of namespaces (PID, net, mount, UTS, IPC, user optional)
2. Creates a cgroup at `/sys/fs/cgroup/docker/<container-id>/`
3. Writes `memory.max = 536870912` (512MB)
4. Writes `cpu.max = 50000 100000` (0.5 CPU)
5. Sets up OverlayFS mount for the container's rootfs
6. Forks the container process into all the namespaces
7. Writes the container's PID to `cgroup.procs`
8. Sets up veth pair for networking

The nginx process runs on the host kernel, but sees its own PID 1, its own network interfaces, its own hostname, and cannot use more than 512MB or 0.5 CPU.

---

## The `clone()` System Call

Namespaces are created with the `clone()` syscall (or `unshare()` in an existing process). `clone()` is `fork()` on steroids:

```c
// This is essentially what Docker/containerd does:
int flags = CLONE_NEWPID    // New PID namespace
          | CLONE_NEWNET    // New network namespace
          | CLONE_NEWNS     // New mount namespace
          | CLONE_NEWUTS    // New UTS namespace
          | CLONE_NEWIPC;   // New IPC namespace

pid_t pid = clone(container_main, stack_top, flags | SIGCHLD, arg);
```

`unshare()` creates new namespaces for the calling process without forking.

---

## Security Implications

**Namespaces provide isolation, NOT security.** A process running as root inside a container (with no user namespace) is root from the kernel's perspective — it can load kernel modules, use raw sockets, and escape the container via various kernel exploits.

**Hardening:**
- **Seccomp:** filters the syscalls a container can make (Docker's default seccomp profile blocks ~44 dangerous syscalls)
- **AppArmor/SELinux:** MAC (mandatory access control) policies that restrict file access and capabilities
- **Capabilities:** break root's omnipotence into ~40 fine-grained capabilities. Drop unneeded ones (e.g., `CAP_NET_ADMIN`).
- **User namespaces + rootless containers:** container's root maps to an unprivileged UID on the host

**Privilege escalation attacks:** `runc` CVE-2019-5736 allowed a container to overwrite the host's runc binary. Fixed by making runc anonymous-file-based. Container escapes require kernel vulns or misconfigurations — not as common as VM escapes but not impossible.

---

## Observability

```bash
# List namespaces of a process
ls -la /proc/<pid>/ns/

# Check which cgroup a process is in
cat /proc/<pid>/cgroup

# Inspect a container's cgroup limits (Docker)
docker inspect <container> | jq '.[0].HostConfig.Memory'

# Enter a container's namespace (for debugging)
nsenter --target <pid> --pid --net --mount bash

# Kubernetes: cgroup v2 paths
cat /sys/fs/cgroup/kubepods/burstable/pod<id>/<container-id>/memory.current
```

---

## Interview Questions

**"What is a container at the OS level?"**
A process (or process group) running on the host kernel, isolated via Linux namespaces (PID, network, mount, UTS, IPC) and constrained via cgroups. No separate OS, no hypervisor. The container shares the host kernel. Start time is milliseconds vs seconds for VMs because there's no OS to boot.

**"Why can a container have PID 1 if there's already a PID 1 on the host?"**
PID namespaces create a separate PID number space. Inside the container's PID namespace, PIDs start at 1. From the host, the same process has a different PID (e.g., 5432). The kernel maps between them; they don't conflict.

**"What happens when a container exceeds its memory limit?"**
The kernel's OOM killer fires within the cgroup. It selects the process with the highest badness score (roughly: most memory used) and sends it SIGKILL. In Kubernetes, this manifests as a pod with `OOMKilled` exit reason. The fix is either to increase the memory limit or to reduce the application's memory usage.

**"What's the difference between CPU requests and limits in Kubernetes?"**
CPU request maps to `cpu.weight` — it's a scheduling hint that guarantees relative CPU priority when the node is saturated. CPU limit maps to `cpu.max` (CFS bandwidth throttling) — it's a hard cap. A pod will be throttled (not killed) if it exceeds its CPU limit. A pod WILL be killed if it exceeds its memory limit (OOM).
