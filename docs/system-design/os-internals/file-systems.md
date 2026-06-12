---
title: "File Systems"
description: "How file systems work — inodes, VFS, directory traversal, file descriptors, journaling, ext4, and what happens when you open(), read(), and write() a file."
tags: [operating-systems, file-systems, inodes, vfs, ext4, journaling, file-descriptors]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/virtual-memory]
lastReviewed: "2026-06-12"
---

# File Systems

A file system is the layer that translates human-readable names (`/etc/passwd`) into sequences of bytes on a storage device. Understanding file systems demystifies database storage engines, explains why `fsync()` matters for durability, and clarifies why "out of inodes" is a real error you can hit even with free disk space.

---

## The Abstraction Stack

```
Application:  open("/etc/passwd", O_RDONLY)
     ↓
System Call:  sys_open()
     ↓
VFS Layer:    Virtual File System (common interface)
     ↓
File System:  ext4 / XFS / APFS / NTFS / tmpfs
     ↓
Block Layer:  I/O scheduler, block device driver
     ↓
Storage:      SSD / HDD / NVMe
```

The **Virtual File System (VFS)** is the kernel's abstraction layer that presents a uniform interface regardless of the underlying file system. It defines the objects: superblock, inode, dentry, file.

---

## Inodes

An **inode** (index node) is the kernel's representation of a file. It stores all metadata about a file — everything except the filename.

**What an inode contains:**
```
Inode:
  inode number:    2097153       (unique identifier within the filesystem)
  file type:       regular file  (or directory, symlink, socket, pipe, device)
  permissions:     0644 (-rw-r--r--)
  owner UID/GID:   1000/1000
  size:            4096 bytes
  timestamps:
    atime:         2026-06-12 10:30:00  (last access)
    mtime:         2026-06-11 09:00:00  (last modification of content)
    ctime:         2026-06-11 09:00:00  (last change of inode, incl. permissions)
  link count:      1
  block pointers:  [block1, block2, ..., indirect block, double indirect block]
```

**What an inode does NOT contain:**
- The filename — filenames live in directory entries (dentries)
- The file's content — content lives in data blocks

**Checking inodes:**
```bash
ls -li /etc/passwd        # -i shows inode number
stat /etc/passwd          # detailed inode info
df -i /dev/sda1           # inode usage on filesystem
```

**Hard links** work because multiple directory entries can point to the same inode. `link count` tracks how many. `unlink()` decrements the count; when it reaches 0 (and no open file descriptors), the data blocks are freed.

---

## Directories

A directory is a special file whose content is a list of `(filename, inode number)` pairs — called **directory entries** (dentries).

```
Directory: /home/alice/
  .        → inode 2097152  (current directory itself)
  ..       → inode 1048576  (parent directory)
  docs     → inode 2097200
  app.py   → inode 2097153
```

**Path resolution** for `/home/alice/app.py`:
1. Start at root inode (inode 2 on most filesystems)
2. Look up `home` in root directory → inode for `/home`
3. Look up `alice` in `/home` → inode for `/home/alice`
4. Look up `app.py` in `/home/alice` → inode 2097153
5. Read inode 2097153 to get block pointers, permissions, size
6. Read data blocks to get file content

This is why deep directory trees have more path resolution overhead than shallow ones.

---

## Block Allocation

Disk space is allocated in **blocks** (typically 4KB). A file's content is stored across one or more blocks. The inode contains **block pointers** that tell the kernel where to find the file's blocks on disk.

**ext2/ext3 block pointer structure:**
```
Inode block pointers:
  12 direct pointers        → points directly to data blocks (12 × 4KB = 48KB)
  1 single indirect         → points to a block of pointers (4KB/8B = 512 pointers = 2MB)
  1 double indirect         → pointer to block of pointers to blocks of pointers (1TB)
  1 triple indirect         → (rarely needed)
```

For small files (< 48KB), all blocks are directly accessible. For large files, the kernel follows indirect pointers.

**ext4 uses extents instead of block pointers:** An extent is a contiguous range `(start_block, length)`. Instead of one pointer per block, one extent covers thousands of consecutive blocks. Much more efficient for large files and reduces fragmentation.

---

## File Descriptors

A **file descriptor** (fd) is an integer that identifies an open file within a process. When you call `open()`, the kernel:
1. Looks up the path, resolves to an inode
2. Creates a **file table entry** in the kernel (stores current position, mode, inode pointer)
3. Adds an entry to the process's **file descriptor table** pointing to the file table entry
4. Returns the index (the file descriptor integer)

```
Process file descriptor table:
  fd 0 → stdin  (file table entry → terminal inode)
  fd 1 → stdout (file table entry → terminal inode)
  fd 2 → stderr (file table entry → terminal inode)
  fd 3 → /etc/passwd (file table entry → inode 2097153, pos=0, mode=O_RDONLY)
```

**File descriptor limits:**
- Per-process: typically 1024 (soft) / 4096+ (hard). Configurable via `ulimit -n`.
- System-wide: `/proc/sys/fs/file-max`. Running out causes "too many open files" errors.

```bash
lsof -p <pid>        # list open files for a process
cat /proc/<pid>/fd/  # list fd numbers
ulimit -n            # current per-process fd limit
```

**After `fork()`:** The child inherits the parent's fd table. Both parent and child share the same file table entries — including the file position pointer. If the parent reads, the position advances for both. Use `O_CLOEXEC` to close fds automatically after `exec()`.

---

## Journaling

Without journaling, a crash during a write operation can leave the file system in an inconsistent state (partial write, updated inode pointing to stale blocks). `fsck` had to scan the entire disk to find and fix inconsistencies — could take hours.

**Journaling** maintains a write-ahead log (the journal) that records intended operations before committing them to the filesystem. On crash, the kernel replays the journal to restore consistency. Recovery takes seconds, not hours.

**ext4 journaling modes:**
- **journal** (safest): data AND metadata written to journal first, then to disk. Survives crashes but highest I/O overhead.
- **ordered** (default): metadata journaled, data written to disk first before metadata is committed. Data written before crash may be lost, but filesystem is consistent.
- **writeback** (fastest): only metadata journaled. Data may appear after metadata update, so a crash can expose old data. Not safe for databases.

**Why this matters for databases:**
Databases implement their own WAL (Write-Ahead Log) precisely because they can't rely on file system ordering guarantees. PostgreSQL, MySQL InnoDB, SQLite all use WAL to ensure crash recovery without depending on the file system journal.

---

## Page Cache

The kernel doesn't read directly from disk on every `read()` call. It maintains a **page cache** — recently read file pages cached in RAM. `read()` checks the cache first; only on a miss does it read from disk.

```
read(fd, buf, size):
  1. Check page cache for requested pages
     Cache hit: copy from cache to buf → return (microseconds)
     Cache miss: read from disk → load into cache → copy to buf (milliseconds)

write(fd, buf, size):
  1. Copy buf to page cache (write is immediate from app's view)
  2. Mark page dirty
  3. Return (async — data not on disk yet)
  4. Kernel periodically flushes dirty pages to disk (every 30s by default)
     or when dirty ratio threshold is exceeded
```

**`fsync(fd)`:** Forces all dirty pages for this fd to be flushed to disk immediately. Returns only after the storage device confirms the write. Essential for database durability — without `fsync`, a crash after `write()` but before the kernel flush loses data.

**`O_DIRECT`:** Bypass the page cache entirely. Data goes directly between user buffer and disk. Used by databases that want to manage their own caching (more efficient than double-caching: db buffer pool + page cache).

---

## What Happens When You `open()` a File

```c
int fd = open("/etc/passwd", O_RDONLY);
```

1. `open()` → `sys_open()` syscall
2. Kernel resolves path: root inode → `/etc` directory → `passwd` dentry → inode 2097153
3. Permission check: does the calling process's UID/GID have read permission?
4. Allocate a `struct file` (file table entry): stores inode pointer, current position=0, mode=O_RDONLY
5. Add to the process's fd table; find the lowest available index (e.g., 3)
6. Return 3

```c
ssize_t n = read(fd, buf, 4096);
```

1. `read()` → `sys_read()` syscall
2. Look up fd 3 → file table entry → current position, inode
3. Check page cache for this inode's pages at the current position
4. Cache miss: read 4KB block from disk, load into page cache
5. Copy 4096 bytes from page cache to `buf` in user space
6. Advance file position by 4096
7. Return number of bytes read

---

## Common File System Operations

```bash
# Inode usage
df -i /                          # inode usage for root filesystem
find / -xdev -type f | wc -l    # count files (uses inodes)

# File descriptor debugging
lsof | wc -l                     # total open file descriptors system-wide
lsof -u username                 # per user
/proc/sys/fs/file-nr             # [used, 0, max] system-wide fd count

# Block allocation
filefrag -v file.txt             # show extent map (fragmentation)
tune2fs -l /dev/sda1             # ext4 filesystem info

# Journaling and sync
sync                             # flush all dirty pages
fsync(fd)                        # flush specific file's dirty pages
echo 3 > /proc/sys/vm/drop_caches  # drop page cache (testing only)
```

---

## Interview Questions

**"What is an inode?"**
A kernel data structure that stores all metadata about a file (permissions, timestamps, size, block pointers) except the filename. The filename lives in a directory entry that points to the inode. Hard links work by having multiple directory entries point to the same inode.

**"What happens when you run out of inodes?"**
The file system can't create new files even if disk space is free. Each file (and directory) consumes one inode. Filesystems allocate a fixed number of inodes at creation time. Common on systems with millions of small files (mail servers, temp file directories). Fix: delete files or reformat with more inodes.

**"Why does `fsync()` exist? Why not rely on `write()`?"**
`write()` only writes to the kernel's page cache. The kernel flushes dirty pages to disk asynchronously (up to 30 seconds later). A crash between `write()` and the flush loses data. `fsync()` blocks until the storage device confirms the write is on persistent storage. Databases call `fsync()` after writing WAL entries to guarantee durability.

**"What is the page cache?"**
The kernel's in-RAM cache of recently read/written file pages. `read()` checks the cache first; `write()` goes to the cache (returns immediately), with pages flushed to disk asynchronously. This is why Linux memory usage appears high — the kernel aggressively caches file data, releasing it only when applications need RAM.
