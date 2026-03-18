---
title: "Git Cheat Sheet"
description: "Quick reference for Git commands, branching strategies, undo operations, and rebase workflows"
tags: [cheat-sheet, git, version-control]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Git Cheat Sheet

Quick reference for Git commands, branching strategies, undo operations, and rebase workflows.

---

## Setup & Config

| Command | Description |
|---------|-------------|
| `git config --global user.name "Name"` | Set your name |
| `git config --global user.email "email"` | Set your email |
| `git config --global core.editor "code --wait"` | Set editor to VS Code |
| `git config --global init.defaultBranch main` | Default branch name |
| `git config --global pull.rebase true` | Rebase on pull by default |
| `git config --global fetch.prune true` | Auto-prune on fetch |
| `git config --global diff.algorithm histogram` | Better diff algorithm |
| `git config --list --show-origin` | Show all config with source |

---

## Daily Workflow

### Basic Commands

| Command | Description |
|---------|-------------|
| `git status` | Show working tree status |
| `git add file` | Stage specific file |
| `git add -p` | Stage hunks interactively |
| `git add .` | Stage all changes in current dir |
| `git commit -m "msg"` | Commit with message |
| `git commit -am "msg"` | Stage tracked files and commit |
| `git commit --amend` | Amend last commit |
| `git commit --amend --no-edit` | Amend without changing message |
| `git push` | Push to remote |
| `git push -u origin branch` | Push and set upstream |
| `git pull` | Fetch and merge (or rebase) |
| `git fetch` | Fetch without merging |
| `git fetch --all --prune` | Fetch all remotes, prune deleted |

### Branching

| Command | Description |
|---------|-------------|
| `git branch` | List local branches |
| `git branch -a` | List all branches (local + remote) |
| `git branch feature` | Create branch |
| `git checkout feature` | Switch to branch |
| `git checkout -b feature` | Create and switch |
| `git switch feature` | Switch to branch (modern) |
| `git switch -c feature` | Create and switch (modern) |
| `git branch -d feature` | Delete merged branch |
| `git branch -D feature` | Force delete branch |
| `git push origin --delete feature` | Delete remote branch |
| `git branch -m old new` | Rename branch |

### Merge & Rebase

| Command | Description |
|---------|-------------|
| `git merge feature` | Merge feature into current |
| `git merge --no-ff feature` | Merge with merge commit |
| `git merge --squash feature` | Squash all commits, do not commit |
| `git rebase main` | Rebase current onto main |
| `git rebase --onto main A B` | Rebase B onto main from A |
| `git rebase --continue` | Continue after resolving conflicts |
| `git rebase --abort` | Abort rebase |
| `git cherry-pick abc123` | Apply specific commit |
| `git cherry-pick A..B` | Apply range of commits |

---

## Viewing History

| Command | Description |
|---------|-------------|
| `git log --oneline` | Compact log |
| `git log --oneline --graph` | Log with branch graph |
| `git log --oneline -20` | Last 20 commits |
| `git log --author="Name"` | Commits by author |
| `git log --since="2 weeks ago"` | Commits in timeframe |
| `git log --follow file` | File history across renames |
| `git log -p file` | File history with diffs |
| `git log main..feature` | Commits in feature not in main |
| `git diff` | Unstaged changes |
| `git diff --staged` | Staged changes |
| `git diff main..feature` | Diff between branches |
| `git diff --stat` | Summary of changes |
| `git blame file` | Line-by-line attribution |
| `git show abc123` | Show commit details |
| `git shortlog -sn` | Commit count by author |

---

## Undo Operations

This is the most critical section. Choose carefully.

### Undo Staged Changes

```bash
# Unstage a file (keep changes in working tree)
git restore --staged file

# Unstage all files
git restore --staged .

# Legacy syntax
git reset HEAD file
```

### Undo Working Tree Changes

```bash
# Discard changes to a file
git restore file

# Discard all working tree changes
git restore .

# Legacy syntax
git checkout -- file
```

### Undo Commits

| Scenario | Command | Effect |
|----------|---------|--------|
| Undo last commit, keep changes staged | `git reset --soft HEAD~1` | Commit removed, changes staged |
| Undo last commit, keep changes unstaged | `git reset HEAD~1` | Commit removed, changes in working tree |
| Undo last commit, discard changes | `git reset --hard HEAD~1` | Commit and changes gone |
| Undo a pushed commit (safe) | `git revert abc123` | New commit that undoes the changes |
| Undo multiple pushed commits | `git revert A..B` | Revert range |

### Recovery

```bash
# Find lost commits (reset, rebase, etc.)
git reflog

# Restore to a reflog entry
git reset --hard HEAD@{3}

# Recover a deleted branch
git reflog
git checkout -b recovered abc123
```

::: warning
`git reset --hard` permanently discards uncommitted changes. There is no undo. Always `git stash` first if unsure.
:::

---

## Stash

| Command | Description |
|---------|-------------|
| `git stash` | Stash working changes |
| `git stash -u` | Stash including untracked files |
| `git stash push -m "msg"` | Stash with description |
| `git stash list` | List all stashes |
| `git stash pop` | Apply and remove latest stash |
| `git stash apply` | Apply without removing |
| `git stash apply stash@{2}` | Apply specific stash |
| `git stash drop stash@{0}` | Delete specific stash |
| `git stash clear` | Delete all stashes |
| `git stash show -p` | Show stash diff |

---

## Branching Strategies

### GitHub Flow (Simple)

Best for: Teams shipping frequently, single production branch.

```
main ─────●─────●─────●─────●─────
           \         /
  feature   ●───●───●
```

Rules:
1. `main` is always deployable
2. Branch from `main` for features
3. Open a Pull Request
4. Merge to `main` after review
5. Deploy `main`

### Git Flow (Complex)

Best for: Versioned releases, multiple environments.

```
main    ─────●───────────────●─────
              \             /
release        ●───●───●───●
              /         \
develop ─●───●───●───●───●───●─────
          \     /
  feature  ●───●
```

Branches: `main`, `develop`, `feature/*`, `release/*`, `hotfix/*`

### Trunk-Based Development

Best for: CI/CD-mature teams, continuous deployment.

```
main ─●─●─●─●─●─●─●─●─●─●─●─●─
       \/ \/ \/
  short-lived branches (< 1 day)
```

Rules:
1. `main` is the trunk
2. Feature branches live less than 1 day
3. Feature flags for incomplete work
4. All commits pass CI before merge

### When to Use Which

| Strategy | Team Size | Release Cadence | Complexity |
|----------|-----------|-----------------|------------|
| GitHub Flow | 1-10 | Continuous | Low |
| Trunk-Based | 5-100+ | Continuous | Low |
| Git Flow | 5-50 | Scheduled releases | High |

---

## Rebase Workflows

### Interactive Rebase

```bash
# Rebase last 5 commits
git rebase -i HEAD~5
```

Commands in the editor:

| Command | Effect |
|---------|--------|
| `pick` | Keep commit as is |
| `reword` | Keep commit, change message |
| `edit` | Pause to amend commit |
| `squash` | Merge into previous, keep message |
| `fixup` | Merge into previous, discard message |
| `drop` | Remove commit |
| `reorder` | Move lines to reorder commits |

### Common Rebase Patterns

```bash
# Clean up feature branch before merging
git rebase -i main

# Squash fixup commits
# Mark fixup commits as "fixup" in the editor

# Move a branch to the latest main
git checkout feature
git rebase main

# If conflicts occur during rebase
git status                  # See conflicted files
# Fix the conflicts
git add .
git rebase --continue
```

### Rebase vs Merge

| Aspect | Rebase | Merge |
|--------|--------|-------|
| History | Linear, clean | Preserves branch history |
| Conflicts | Resolved per-commit | Resolved once |
| Safety | Rewrites history | Non-destructive |
| Shared branches | NEVER rebase shared branches | Always safe |
| When | Before merging feature to main | When merging to main |

::: danger Golden Rule
**Never rebase commits that have been pushed to a shared branch.** Rebase is for cleaning up local commits before pushing or merging.
:::

---

## Tags

| Command | Description |
|---------|-------------|
| `git tag v1.0.0` | Lightweight tag |
| `git tag -a v1.0.0 -m "Release 1.0.0"` | Annotated tag |
| `git tag -a v1.0.0 abc123` | Tag a specific commit |
| `git push origin v1.0.0` | Push specific tag |
| `git push origin --tags` | Push all tags |
| `git tag -d v1.0.0` | Delete local tag |
| `git push origin --delete v1.0.0` | Delete remote tag |
| `git tag -l "v1.*"` | List tags matching pattern |

---

## Worktrees

| Command | Description |
|---------|-------------|
| `git worktree add ../hotfix hotfix-branch` | Create worktree for branch |
| `git worktree list` | List worktrees |
| `git worktree remove ../hotfix` | Remove worktree |

Use worktrees to work on multiple branches simultaneously without stashing.

---

## Troubleshooting

### Common Problems

| Problem | Solution |
|---------|----------|
| Committed to wrong branch | `git reset --soft HEAD~1`, switch branch, commit |
| Need to split a commit | `git reset HEAD~1`, stage and commit in parts |
| Merge conflict on binary file | `git checkout --theirs file` or `--ours` |
| Accidentally deleted a branch | `git reflog`, find the commit, recreate branch |
| Push rejected (non-fast-forward) | `git pull --rebase` then push |
| Large file accidentally committed | `git filter-branch` or `git-filter-repo` |
| Need to find which commit introduced a bug | `git bisect start`, `git bisect bad`, `git bisect good v1.0` |

### .gitignore Not Working

```bash
# If files are already tracked, .gitignore won't help
# Remove from tracking (keep file on disk)
git rm --cached file

# Remove directory from tracking
git rm -r --cached dir/

# Regenerate index
git rm -r --cached .
git add .
git commit -m "fix: apply .gitignore"
```

---

## Useful Aliases

```bash
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.last 'log -1 HEAD'
git config --global alias.lg 'log --oneline --graph --all --decorate'
git config --global alias.undo 'reset --soft HEAD~1'
git config --global alias.wip 'commit -am "WIP"'
```
