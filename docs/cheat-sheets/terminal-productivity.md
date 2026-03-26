---
title: "Terminal Productivity Cheat Sheet"
description: "Master terminal productivity with tmux, zsh, oh-my-zsh, fzf, ripgrep, and jq — sessions, aliases, fuzzy finding, fast code search, and JSON processing on the command line."
tags: [terminal, tmux, zsh, fzf, productivity]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Terminal Productivity Cheat Sheet

The terminal is the fastest interface for software engineering — if you know the tools. This cheat sheet covers the commands, configurations, and workflows that eliminate friction. Each tool builds on the last: tmux gives you sessions, zsh gives you a better shell, fzf gives you fuzzy search, ripgrep gives you fast code search, and jq gives you structured JSON processing.

## tmux — Terminal Multiplexer

tmux lets you create persistent terminal sessions that survive SSH disconnects, split your screen into panes, and switch between window layouts instantly.

### Session Management

| Command | Description |
|---------|-------------|
| `tmux new -s work` | Create a new session named "work" |
| `tmux ls` | List all sessions |
| `tmux attach -t work` | Attach to session "work" |
| `tmux kill-session -t work` | Kill session "work" |
| `tmux kill-server` | Kill all sessions |

### Key Bindings (prefix: `Ctrl+b`)

| Keys | Action |
|------|--------|
| `Ctrl+b d` | Detach from session (session keeps running) |
| `Ctrl+b c` | Create new window |
| `Ctrl+b n` / `Ctrl+b p` | Next / previous window |
| `Ctrl+b 0-9` | Switch to window by number |
| `Ctrl+b ,` | Rename current window |
| `Ctrl+b &` | Close current window |
| `Ctrl+b %` | Split pane vertically |
| `Ctrl+b "` | Split pane horizontally |
| `Ctrl+b arrow` | Move between panes |
| `Ctrl+b z` | Zoom pane (toggle fullscreen) |
| `Ctrl+b x` | Close current pane |
| `Ctrl+b [` | Enter scroll/copy mode (q to exit) |
| `Ctrl+b :` | Command prompt |

### Recommended tmux.conf

```bash
# ~/.tmux.conf

# Remap prefix from Ctrl+b to Ctrl+a (easier to reach)
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Split panes with | and -
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# New window in current directory
bind c new-window -c "#{pane_current_path}"

# Switch panes with Alt+arrow (no prefix needed)
bind -n M-Left select-pane -L
bind -n M-Right select-pane -R
bind -n M-Up select-pane -U
bind -n M-Down select-pane -D

# Mouse mode (scroll, click panes, resize)
set -g mouse on

# Start numbering at 1 (0 is far from the prefix key)
set -g base-index 1
setw -g pane-base-index 1

# Renumber windows when one is closed
set -g renumber-windows on

# Increase scrollback
set -g history-limit 50000

# Faster key recognition
set -sg escape-time 0

# 256 colors
set -g default-terminal "tmux-256color"

# Status bar
set -g status-style bg=colour235,fg=colour136
set -g status-left '#[fg=green]#S '
set -g status-right '#[fg=yellow]%H:%M'
```

### tmux Scripting — Automated Dev Environment

```bash
#!/bin/bash
# ~/bin/dev-session.sh — Launch a full dev environment

SESSION="dev"

tmux new-session -d -s $SESSION -n editor

# Window 1: Editor
tmux send-keys -t $SESSION:1 'cd ~/project && nvim .' C-m

# Window 2: Server
tmux new-window -t $SESSION -n server
tmux send-keys -t $SESSION:2 'cd ~/project && npm run dev' C-m

# Window 3: Tests (split into two panes)
tmux new-window -t $SESSION -n tests
tmux send-keys -t $SESSION:3 'cd ~/project && npm run test:watch' C-m
tmux split-window -h -t $SESSION:3
tmux send-keys -t $SESSION:3.2 'cd ~/project && npm run lint:watch' C-m

# Window 4: Git / terminal
tmux new-window -t $SESSION -n git
tmux send-keys -t $SESSION:4 'cd ~/project && git status' C-m

# Focus on editor
tmux select-window -t $SESSION:1

tmux attach -t $SESSION
```

---

## zsh + oh-my-zsh

### Essential Plugins

```bash
# ~/.zshrc
plugins=(
  git              # git aliases (gst, gco, gp, etc.)
  z                # Jump to frequent directories
  fzf              # Fuzzy finding integration
  zsh-autosuggestions    # Fish-like suggestions
  zsh-syntax-highlighting # Command highlighting
  docker           # Docker completions
  kubectl          # kubectl completions and aliases
  npm              # npm completions
  aws              # AWS CLI completions
)
```

### Must-Know oh-my-zsh Git Aliases

| Alias | Full Command |
|-------|-------------|
| `gst` | `git status` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gc` | `git commit` |
| `gc!` | `git commit --amend` |
| `gco` | `git checkout` |
| `gcb` | `git checkout -b` |
| `gp` | `git push` |
| `gpf` | `git push --force-with-lease` |
| `gl` | `git pull` |
| `glog` | `git log --oneline --decorate --graph` |
| `gd` | `git diff` |
| `gds` | `git diff --staged` |
| `grb` | `git rebase` |
| `gsta` | `git stash` |
| `gstp` | `git stash pop` |

### z — Directory Jumping

`z` learns your most-used directories and lets you jump to them with partial names.

```bash
# After visiting directories normally, z remembers them
cd ~/projects/knowledge-vault
cd ~/projects/api-server
cd /var/log

# Later, jump by partial match
z vault    # → ~/projects/knowledge-vault
z api      # → ~/projects/api-server
z log      # → /var/log
```

### Custom Aliases Worth Adding

```bash
# ~/.zshrc

# Quick edit
alias zshrc="$EDITOR ~/.zshrc"
alias reload="source ~/.zshrc"

# Better defaults
alias ls="ls --color=auto"
alias ll="ls -alFh"
alias grep="grep --color=auto"
alias df="df -h"
alias du="du -sh"

# Safety
alias rm="rm -i"
alias cp="cp -i"
alias mv="mv -i"

# Modern replacements
alias cat="bat"        # cat with syntax highlighting
alias ls="eza"         # ls with git integration
alias find="fd"        # faster, friendlier find
alias top="btop"       # better process viewer

# Docker shortcuts
alias dps="docker ps --format 'table {​{.ID}}\t{​{.Names}}\t{​{.Status}}\t{​{.Ports}}'"
alias dlog="docker logs -f"
alias dex="docker exec -it"

# Kubernetes shortcuts
alias k="kubectl"
alias kgp="kubectl get pods"
alias kgs="kubectl get svc"
alias klog="kubectl logs -f"
alias kctx="kubectx"
alias kns="kubens"

# Quick server
alias serve="python3 -m http.server 8080"

# IP addresses
alias myip="curl -s ifconfig.me"
alias localip="hostname -I | awk '{print \$1}'"

# Port finder
alias ports="lsof -i -P -n | grep LISTEN"

# JSON pretty print
alias json="jq ."
```

::: tip zsh-autosuggestions Is Life-Changing
This plugin suggests commands as you type based on your history. Press the right arrow key to accept the suggestion. After a week, you will wonder how you ever lived without it.
:::

---

## fzf — Fuzzy Finder

fzf is a general-purpose fuzzy finder that integrates with everything. It transforms interactive selection from "scroll through a list" to "type a few characters and find it instantly."

### Installation & Shell Integration

```bash
# Install
brew install fzf     # macOS
sudo apt install fzf  # Debian/Ubuntu

# Enable key bindings (add to ~/.zshrc)
source /usr/share/fzf/key-bindings.zsh
source /usr/share/fzf/completion.zsh
```

### Key Bindings

| Binding | Action |
|---------|--------|
| `Ctrl+R` | Fuzzy search command history |
| `Ctrl+T` | Fuzzy find files and insert path |
| `Alt+C` | Fuzzy find directories and cd into them |
| `**<Tab>` | Trigger fzf completion (e.g., `cd **<Tab>`) |

### Powerful fzf Recipes

```bash
# Preview files while searching
fzf --preview 'bat --color=always --line-range :500 {}'

# Search and open in editor
vim $(fzf --preview 'bat --color=always {}')

# Git branch switcher with preview
git checkout $(git branch --all | fzf --preview 'git log --oneline -20 {}')

# Kill process interactively
kill -9 $(ps aux | fzf | awk '{print $2}')

# Docker: exec into container
docker exec -it $(docker ps --format '{​{.Names}}' | fzf) /bin/sh

# SSH to server
ssh $(grep "Host " ~/.ssh/config | awk '{print $2}' | fzf)

# Search environment variables
env | fzf
```

### fzf Configuration

```bash
# ~/.zshrc — fzf defaults
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_DEFAULT_OPTS='
  --height 40%
  --layout=reverse
  --border
  --info=inline
  --preview "bat --color=always --line-range :300 {}"
  --bind "ctrl-/:toggle-preview"
'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
```

---

## ripgrep (rg) — Fast Code Search

ripgrep is the fastest code search tool. It respects `.gitignore`, searches compressed files, and supports full regex — all at speeds that make `grep -r` feel broken.

### Basic Usage

| Command | Description |
|---------|-------------|
| `rg "pattern"` | Search current directory recursively |
| `rg "pattern" src/` | Search specific directory |
| `rg -i "pattern"` | Case-insensitive search |
| `rg -w "word"` | Match whole words only |
| `rg -l "pattern"` | List files containing matches (no content) |
| `rg -c "pattern"` | Count matches per file |
| `rg --type js "pattern"` | Search only JavaScript files |
| `rg -g "*.ts" "pattern"` | Search files matching glob |
| `rg -g "!*.test.*" "pattern"` | Exclude test files |
| `rg -A 3 -B 2 "pattern"` | Show 3 lines after, 2 lines before |
| `rg -e "p1" -e "p2"` | Match multiple patterns (OR) |
| `rg "pattern" --json` | Output as JSON (for piping) |

### Real-World Searches

```bash
# Find all TODO/FIXME comments
rg "TODO|FIXME|HACK|XXX" --type-add 'code:*.{js,ts,py,go,rs}'

# Find function definitions
rg "function\s+\w+" --type js
rg "def \w+" --type py
rg "func \w+" --type go

# Find imports of a specific module
rg "import.*from.*react" --type ts

# Find all API endpoints
rg "app\.(get|post|put|delete|patch)\(" --type js

# Find environment variable usage
rg "process\.env\.\w+" --type ts

# Search for a pattern, replace with sed
rg -l "oldFunction" --type ts | xargs sed -i 's/oldFunction/newFunction/g'

# Find large files with many matches (potential refactor targets)
rg -c "any" --type ts | sort -t: -k2 -rn | head -20
```

::: tip ripgrep + fzf = Superpower
```bash
# Interactive code search with preview
rg --line-number --color=always "" | fzf --ansi --preview 'bat --color=always --highlight-line {2} {1}' --delimiter :
```
This lets you search your entire codebase interactively with a live preview of each match in context.
:::

---

## jq — JSON Processing

jq is the command-line JSON processor. It filters, transforms, and extracts data from JSON — essential for working with APIs, logs, and configuration files.

### Basic Operations

```bash
# Pretty print
echo '{"name":"Alice","age":30}' | jq .

# Get a field
echo '{"name":"Alice","age":30}' | jq '.name'
# "Alice"

# Get nested field
echo '{"user":{"name":"Alice"}}' | jq '.user.name'
# "Alice"

# Get array element
echo '[1,2,3]' | jq '.[0]'
# 1

# Get array length
echo '[1,2,3]' | jq 'length'
# 3
```

### Filtering and Transforming

```bash
# Filter array elements
echo '[{"name":"Alice","age":30},{"name":"Bob","age":25}]' | \
  jq '.[] | select(.age > 28)'
# {"name":"Alice","age":30}

# Map — transform each element
echo '[{"name":"Alice"},{"name":"Bob"}]' | \
  jq '[.[] | .name]'
# ["Alice", "Bob"]

# Create new structure
echo '{"first":"Alice","last":"Smith","age":30}' | \
  jq '{full_name: (.first + " " + .last), age}'
# {"full_name": "Alice Smith", "age": 30}

# Sort by field
echo '[{"name":"Bob","age":25},{"name":"Alice","age":30}]' | \
  jq 'sort_by(.age)'

# Group by field
echo '[{"dept":"eng","name":"A"},{"dept":"eng","name":"B"},{"dept":"sales","name":"C"}]' | \
  jq 'group_by(.dept) | map({dept: .[0].dept, count: length})'
# [{"dept":"eng","count":2},{"dept":"sales","count":1}]
```

### Real-World jq Recipes

```bash
# Parse AWS CLI output — get instance IDs of running instances
aws ec2 describe-instances | \
  jq -r '.Reservations[].Instances[] | select(.State.Name == "running") | .InstanceId'

# Parse Kubernetes pods — get non-running pods
kubectl get pods -o json | \
  jq -r '.items[] | select(.status.phase != "Running") | .metadata.name'

# Parse Docker inspect
docker inspect mycontainer | \
  jq '.[0] | {id: .Id[:12], image: .Config.Image, ports: .NetworkSettings.Ports}'

# Parse npm package.json — list all dependencies
jq -r '.dependencies // {} | keys[]' package.json

# Merge JSON files
jq -s '.[0] * .[1]' defaults.json overrides.json

# Convert JSON to CSV
echo '[{"name":"Alice","age":30},{"name":"Bob","age":25}]' | \
  jq -r '["name","age"], (.[] | [.name, .age]) | @csv'

# Count occurrences in log file
cat app.log | \
  jq -r '.level' | sort | uniq -c | sort -rn
```

### jq Cheat Table

| Expression | Description |
|-----------|-------------|
| `.` | Identity (whole input) |
| `.field` | Get object field |
| `.[0]` | Get array element |
| `.[]` | Iterate array elements |
| `\| ` | Pipe to next filter |
| `select(condition)` | Filter elements |
| `map(expr)` | Transform each element |
| `length` | String/array/object length |
| `keys` | Object keys as array |
| `values` | Object values as array |
| `to_entries` | Object to `[{key, value}]` |
| `from_entries` | `[{key, value}]` to object |
| `group_by(.field)` | Group array by field |
| `sort_by(.field)` | Sort array by field |
| `unique_by(.field)` | Deduplicate by field |
| `@csv` | Format as CSV |
| `@tsv` | Format as TSV |
| `@base64` | Base64 encode |
| `-r` flag | Raw output (no quotes) |
| `-s` flag | Slurp (read all input as one array) |

---

## Common Workflows

### Git Interactive Workflow

```bash
# Interactive add with preview
git add $(git diff --name-only | fzf --preview 'git diff --color=always {}' -m)

# Interactive branch delete
git branch | fzf -m | xargs git branch -d

# Interactive cherry-pick from another branch
git log --oneline other-branch | fzf | awk '{print $1}' | xargs git cherry-pick

# Search git history for deleted code
git log -p --all -S 'functionThatWasDeleted' | head -50
```

### Quick File Operations

```bash
# Find and edit all files containing a pattern
rg -l "deprecated_function" | xargs $EDITOR

# Rename files matching a pattern
fd "\.jpeg$" | while read f; do mv "$f" "${f%.jpeg}.jpg"; done

# Find large files
fd --type f --size +10m

# Count lines of code by file type
fd --type f --extension ts | xargs wc -l | sort -rn | head -20
```

### API Testing from Terminal

```bash
# Quick API test with timing
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" https://api.example.com/health

# POST with JSON body, pretty-print response
curl -s -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}' | jq .

# Follow redirects, show headers
curl -sLI https://example.com
```

---

## Related Pages

- [Bash Cheat Sheet](/cheat-sheets/bash) — Shell scripting fundamentals
- [Git Cheat Sheet](/cheat-sheets/git) — Version control commands
- [Linux Cheat Sheet](/cheat-sheets/linux) — System administration
- [HTTP Client Tools](/cheat-sheets/http-clients) — curl, httpie, wget in depth
- [Docker Cheat Sheet](/cheat-sheets/docker) — Container operations

---

::: details Test Yourself
1. **What tmux key binding splits the current pane vertically (with default prefix)?**
   `Ctrl+b %`

2. **How do you detach from a tmux session without closing it?**
   `Ctrl+b d`

3. **What zsh plugin provides fish-like command suggestions as you type?**
   `zsh-autosuggestions`

4. **What `z` command jumps to a frequently used directory by partial name?**
   `z partial-name` (e.g., `z vault` to jump to `~/projects/knowledge-vault`)

5. **What fzf key binding fuzzy-searches your command history?**
   `Ctrl+R`

6. **How do you search only TypeScript files with ripgrep?**
   `rg "pattern" --type ts` or `rg -g "*.ts" "pattern"`

7. **What jq expression filters array elements based on a condition?**
   `.[] | select(.field > value)`

8. **What ripgrep flag shows only filenames containing matches?**
   `rg -l "pattern"`

9. **What tmux command creates a new session named "work"?**
   `tmux new -s work`

10. **What jq flag gives raw output without quotes?**
    `-r`
:::

::: danger Common Gotchas
- **tmux prefix collision with readline.** The default `Ctrl+b` conflicts with backward-char in some shells. Remap to `Ctrl+a` for easier reach.
- **fzf without `fd` as backend.** The default `find` command is slow and includes `.git` directories. Set `FZF_DEFAULT_COMMAND` to use `fd` for much faster results.
- **ripgrep searches binary files.** By default rg skips binaries, but if you pass `--no-ignore`, it may match in node_modules or build artifacts. Use `-g '!node_modules'` to exclude.
- **jq silently returns nothing on invalid paths.** If you query `.nonexistent`, jq returns `null` without error. Pipe through `select(. != null)` to catch missing fields.
:::

## One-Liner Summary

Terminal productivity is a multiplier -- tmux gives you persistent sessions, fzf gives you fuzzy search, ripgrep gives you instant code search, and jq gives you structured JSON processing, all without leaving the command line.
