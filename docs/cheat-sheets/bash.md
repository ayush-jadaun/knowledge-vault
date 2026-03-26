---
title: "Bash Cheat Sheet"
description: "Quick reference for Bash variables, conditionals, loops, text processing, and common one-liners"
tags: [bash, cheat-sheet, reference, shell, linux]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Bash Cheat Sheet

Quick reference for Bash variables, arrays, string manipulation, conditionals, loops, file operations, text processing, and common one-liners.

---

## Variables

```bash
# Assignment (no spaces around =)
name="Alice"
count=42
readonly PI=3.14              # Cannot be reassigned

# Usage
echo "$name"                  # Quoted (preferred)
echo "${name}_suffix"         # With braces for clarity

# Default values
${var:-default}               # Use default if unset/empty
${var:=default}               # Set and use default if unset/empty
${var:+alt}                   # Use alt if var IS set
${var:?error msg}             # Error if unset/empty

# Command substitution
now=$(date +%Y-%m-%d)
files=$(ls *.txt)

# Arithmetic
result=$((5 + 3))
((count++))
((total = a + b * c))
```

### Special Variables

| Variable | Description |
|----------|-------------|
| `$0` | Script name |
| `$1` - `$9` | Positional arguments |
| `$#` | Number of arguments |
| `$@` | All arguments (as separate words) |
| `$*` | All arguments (as single string) |
| `$?` | Exit status of last command |
| `$$` | Current shell PID |
| `$!` | PID of last background process |
| `$_` | Last argument of previous command |

---

## Arrays

```bash
# Indexed arrays
arr=(apple banana cherry)
arr[3]="date"
echo "${arr[0]}"              # apple
echo "${arr[@]}"              # All elements
echo "${#arr[@]}"             # Length: 4
echo "${arr[@]:1:2}"          # Slice: banana cherry

# Append
arr+=("elderberry")

# Iterate
for item in "${arr[@]}"; do
    echo "$item"
done

# Associative arrays (Bash 4+)
declare -A colors
colors[red]="#FF0000"
colors[green]="#00FF00"
echo "${colors[red]}"
echo "${!colors[@]}"          # All keys
```

---

## String Manipulation

```bash
str="Hello, World!"

# Length
echo "${#str}"                # 13

# Substring
echo "${str:7}"               # World!
echo "${str:7:5}"             # World

# Replacement
echo "${str/World/Bash}"      # Hello, Bash! (first match)
echo "${str//l/L}"            # HeLLo, WorLd! (all matches)

# Removal (pattern)
file="archive.tar.gz"
echo "${file#*.}"             # tar.gz (remove shortest from start)
echo "${file##*.}"            # gz (remove longest from start)
echo "${file%.*}"             # archive.tar (remove shortest from end)
echo "${file%%.*}"            # archive (remove longest from end)

# Case conversion (Bash 4+)
echo "${str^^}"               # HELLO, WORLD! (uppercase)
echo "${str,,}"               # hello, world! (lowercase)
echo "${str^}"                # Hello, World! (capitalize first)
```

---

## Conditionals

### test / [ ] / [[ ]]

```bash
# Prefer [[ ]] over [ ] -- safer, more features
if [[ "$name" == "Alice" ]]; then
    echo "Hi Alice"
elif [[ "$name" == "Bob" ]]; then
    echo "Hi Bob"
else
    echo "Who are you?"
fi
```

### String Comparisons

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than (lexicographic) |
| `>` | Greater than (lexicographic) |
| `-z "$str"` | String is empty |
| `-n "$str"` | String is not empty |
| `=~` | Regex match (inside `[[ ]]`) |

### Integer Comparisons

| Operator | Description |
|----------|-------------|
| `-eq` | Equal |
| `-ne` | Not equal |
| `-lt` | Less than |
| `-le` | Less than or equal |
| `-gt` | Greater than |
| `-ge` | Greater than or equal |

### File Tests

| Operator | Description |
|----------|-------------|
| `-f file` | Regular file exists |
| `-d dir` | Directory exists |
| `-e path` | Path exists (any type) |
| `-r file` | File is readable |
| `-w file` | File is writable |
| `-x file` | File is executable |
| `-s file` | File is non-empty |
| `-L file` | File is symlink |
| `f1 -nt f2` | f1 is newer than f2 |
| `f1 -ot f2` | f1 is older than f2 |

### Logical Operators

```bash
# Inside [[ ]]
[[ $a == 1 && $b == 2 ]]     # AND
[[ $a == 1 || $b == 2 ]]     # OR
[[ ! -f file ]]              # NOT
```

---

## Loops

```bash
# for loop
for i in 1 2 3 4 5; do
    echo "$i"
done

# C-style for
for ((i = 0; i < 10; i++)); do
    echo "$i"
done

# Range
for i in {1..10}; do echo "$i"; done
for i in {0..100..5}; do echo "$i"; done  # Step by 5

# while loop
while [[ $count -lt 10 ]]; do
    ((count++))
done

# Read lines from file
while IFS= read -r line; do
    echo "$line"
done < file.txt

# Read lines from command
while IFS= read -r line; do
    echo "$line"
done < <(find . -name "*.log")

# Infinite loop
while true; do
    check_status || break
    sleep 5
done

# until loop
until [[ $status == "ready" ]]; do
    status=$(get_status)
    sleep 1
done
```

### Case Statement

```bash
case "$action" in
    start)
        start_service
        ;;
    stop|kill)
        stop_service
        ;;
    restart)
        stop_service
        start_service
        ;;
    *)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
        ;;
esac
```

---

## Functions

```bash
# Function definition
greet() {
    local name="$1"           # Local variable
    local greeting="${2:-Hello}"
    echo "${greeting}, ${name}!"
    return 0                  # Exit status
}

# Call
greet "Alice"                 # Hello, Alice!
greet "Bob" "Hey"             # Hey, Bob!

# Capture output
result=$(greet "Alice")

# Return values via exit status
is_even() {
    (( $1 % 2 == 0 ))
}
if is_even 4; then echo "even"; fi
```

---

## File Operations & Redirection

### Redirection

```bash
cmd > file                    # stdout to file (overwrite)
cmd >> file                   # stdout to file (append)
cmd 2> file                   # stderr to file
cmd &> file                   # stdout + stderr to file
cmd > /dev/null 2>&1          # Discard all output
cmd1 | cmd2                   # Pipe stdout to next command
cmd1 |& cmd2                  # Pipe stdout + stderr
cmd <<< "string"              # Here-string input
```

### Here Document

```bash
cat <<EOF
Hello $name
Today is $(date)
EOF

# No variable expansion
cat <<'EOF'
Literal $variable and $(command)
EOF
```

### Common File Operations

```bash
# Find files
find . -name "*.log" -type f
find . -mtime -7 -name "*.tmp" -delete
find . -size +100M -type f

# Compare files
diff file1 file2
diff -u old new > patch.diff  # Unified diff
```

---

## Text Processing

### grep

```bash
grep "pattern" file           # Search in file
grep -r "pattern" dir/        # Recursive search
grep -i "pattern" file        # Case insensitive
grep -n "pattern" file        # Show line numbers
grep -c "pattern" file        # Count matches
grep -l "pattern" dir/*       # List files with matches
grep -v "pattern" file        # Invert match (exclude)
grep -E "regex" file          # Extended regex (egrep)
grep -o "pattern" file        # Only matching part
grep -A 3 "pattern" file      # 3 lines after match
grep -B 3 "pattern" file      # 3 lines before match
grep -P "\d{3}-\d{4}" file    # Perl regex
```

### sed

```bash
sed 's/old/new/' file         # Replace first per line
sed 's/old/new/g' file        # Replace all
sed -i 's/old/new/g' file     # Edit in place
sed -n '5,10p' file           # Print lines 5-10
sed '/pattern/d' file         # Delete matching lines
sed '/^$/d' file              # Delete empty lines
sed 's/^/    /' file          # Add indent
sed -E 's/([0-9]+)/[\1]/g'   # Extended regex with groups
```

### awk

```bash
awk '{print $1}' file         # Print first column
awk '{print $NF}' file        # Print last column
awk -F: '{print $1}' /etc/passwd  # Custom delimiter
awk 'NR==5' file              # Print line 5
awk 'NR>=5 && NR<=10' file    # Print lines 5-10
awk '{sum += $1} END {print sum}' file  # Sum column
awk '{print NR": "$0}' file   # Add line numbers
awk '/pattern/ {print $2}'    # Print col 2 of matching lines
awk '!seen[$0]++' file        # Remove duplicate lines
```

### jq (JSON Processing)

```bash
jq '.' file.json              # Pretty print
jq '.name' file.json          # Get field
jq '.users[0]' file.json      # Array index
jq '.users[].name' file.json  # Iterate array
jq '.[] | select(.age > 30)'  # Filter
jq '{name: .first, age: .years}' # Reshape
jq -r '.name' file.json       # Raw output (no quotes)
jq 'length' file.json         # Array/object length
jq 'keys' file.json           # Object keys
jq 'map(.price * .qty)'       # Map over array
jq '[.[] | select(.active)]'  # Filter into array
```

### sort, uniq, cut, tr

```bash
sort file                     # Sort alphabetically
sort -n file                  # Sort numerically
sort -r file                  # Reverse sort
sort -k2 -t, file             # Sort by column 2, comma delimited
sort -u file                  # Sort and deduplicate

uniq file                     # Remove consecutive duplicates
uniq -c file                  # Count occurrences
sort file | uniq -c | sort -rn  # Frequency count

cut -d: -f1 /etc/passwd       # Extract field 1
cut -c1-10 file               # Extract chars 1-10

tr 'a-z' 'A-Z' < file         # Uppercase
tr -d '\r' < file              # Remove carriage returns
tr -s ' ' < file               # Squeeze repeated spaces
```

---

## Process Management

| Command | Description |
|---------|-------------|
| `cmd &` | Run in background |
| `jobs` | List background jobs |
| `fg %1` | Bring job 1 to foreground |
| `bg %1` | Continue job 1 in background |
| `Ctrl+Z` | Suspend current process |
| `Ctrl+C` | Kill current process (SIGINT) |
| `kill PID` | Terminate process (SIGTERM) |
| `kill -9 PID` | Force kill (SIGKILL) |
| `pkill -f pattern` | Kill by name pattern |
| `nohup cmd &` | Run immune to hangup |
| `disown %1` | Detach job from shell |
| `wait` | Wait for all background jobs |
| `wait $PID` | Wait for specific process |
| `xargs -P 4` | Run 4 parallel processes |

### Trap (Signal Handling)

```bash
cleanup() {
    rm -f "$tmpfile"
    echo "Cleaned up"
}
trap cleanup EXIT             # Run on script exit
trap cleanup SIGINT SIGTERM   # Run on Ctrl+C or kill
```

---

## Common One-Liners

```bash
# Watch a command every 2 seconds
watch -n 2 'kubectl get pods'

# Parallel execution with xargs
find . -name "*.png" | xargs -P 4 -I{} convert {} -resize 50% {}

# Find and replace across files
find . -name "*.py" -exec sed -i 's/old/new/g' {} +

# Count lines of code
find . -name "*.go" | xargs wc -l | tail -1

# Monitor log file for errors
tail -f /var/log/app.log | grep --line-buffered "ERROR"

# List top 10 largest files
find . -type f -exec du -h {} + | sort -rh | head -10

# Show disk usage by directory
du -sh */ | sort -rh

# HTTP request with curl
curl -s https://api.example.com/data | jq '.'

# Generate random password
openssl rand -base64 32

# Show open ports
ss -tlnp

# Archive with progress
tar cf - dir/ | pv | gzip > dir.tar.gz

# Diff two commands
diff <(sort file1) <(sort file2)

# Repeat a command until it succeeds
until curl -sf http://localhost:8080/health; do sleep 1; done

# CSV to columns
column -t -s, data.csv

# Remove all but the 5 most recent files
ls -t | tail -n +6 | xargs rm -f
```

---

## Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail             # Exit on error, unset var, pipe fail
IFS=$'\n\t'                   # Safer word splitting

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "$0")"

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [options] <argument>

Options:
    -h, --help     Show this help
    -v, --verbose  Enable verbose output
    -d, --dry-run  Show what would be done
EOF
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

main() {
    local verbose=false
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help) usage; exit 0 ;;
            -v|--verbose) verbose=true; shift ;;
            -d|--dry-run) dry_run=true; shift ;;
            *) break ;;
        esac
    done

    [[ $# -lt 1 ]] && { usage; exit 1; }

    log "Starting $SCRIPT_NAME"
    # Main logic here
}

main "$@"
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Test | `[[ ]]` | `[ ]` | Bash scripts (safer) | POSIX portability needed |
| Shell | `bash` | `sh` | Need arrays, `[[ ]]`, etc | Max portability |
| Loop input | `while read` | `for f in $(cmd)` | Lines with spaces, large output | Simple word lists |
| Quotes | `"$var"` | `$var` | Almost always | Never (causes word splitting) |
| Subshell | `$(cmd)` | `` `cmd` `` | Always (nestable, readable) | Legacy scripts only |
| Text search | `grep` | `awk` | Simple pattern matching | Column extraction, transforms |
| Text replace | `sed` | `awk` | Simple substitutions | Complex field-based logic |
| JSON | `jq` | `grep/sed` | Structured JSON data | Trivial extraction only |

---

::: details Test Yourself
1. **What does `$?` contain?**
   The exit status of the last executed command.

2. **How do you assign a default value to a variable if it is unset?**
   `${var:-default}` (use default) or `${var:=default}` (set and use default).

3. **What `set` flags should every production script start with?**
   `set -euo pipefail` (exit on error, unset variable error, pipe failure).

4. **How do you remove the file extension from a variable?**
   `${file%.*}` (shortest from end) or `${file%%.*}` (longest from end).

5. **What is the difference between `$@` and `$*`?**
   `$@` expands each argument as a separate word; `$*` expands all arguments as a single string.

6. **How do you redirect both stdout and stderr to a file?**
   `cmd &> file` or `cmd > file 2>&1`

7. **What command reads a file line by line safely (handling spaces)?**
   `while IFS= read -r line; do ... done < file.txt`

8. **How do you run a command immune to hangup signals in the background?**
   `nohup cmd &`

9. **What jq command filters array elements where age is greater than 30?**
   `jq '.[] | select(.age > 30)'`

10. **How do you run cleanup code when a script exits, regardless of success or failure?**
    `trap cleanup EXIT`
:::

::: danger Common Gotchas
- **Unquoted variables cause word splitting.** `$var` splits on spaces; `"$var"` does not. Always quote your variables.
- **`[ ]` vs `[[ ]]`.** Use `[[ ]]` in Bash scripts -- it handles spaces in variables, supports `&&`/`||`, and does regex matching. `[ ]` is POSIX but fragile.
- **Spaces around `=` in assignment.** `name = "Alice"` tries to run `name` as a command. Assignment has no spaces: `name="Alice"`.
- **`for f in $(cmd)` breaks on spaces.** If filenames have spaces, this breaks. Use `while IFS= read -r` instead.
:::

## One-Liner Summary

Bash is the glue language of Unix -- master variables, conditionals, `set -euo pipefail`, pipes, and `trap` to write scripts that automate anything and fail gracefully.
