---
name: start-workday
description: Use when beginning a work session and wanting an overview of open PRs, issues, and pending tasks across GitHub repos or orgs — to understand what needs attention, what is blocked, and how items connect
---

# Start Workday

## Overview

A structured workflow for scanning your GitHub workspace at the start of each day. Produces a prioritized briefing: what you own, what blocks you, what needs review, and how tasks relate.

## When to Use

- You want a daily standup-style overview before starting work
- You are onboarding or taking over a project and need context
- You want to understand dependencies between issues and PRs
- You need to identify stale/stalemate items that need attention

## How It Works

The skill uses the GitHub MCP tools (or `gh` CLI as fallback) to gather data from one or more repos. If no specific repo is given, scan all repos in the user's org(s).

### Step 1: Discover Repositories

Pick the scope:
- **Single repo**: `owner/repo`
- **Org-wide**: list all repos under `org_name`
- **All owned**: list all repos where the user has write access

```bash
# Single repo
gh repo view owner/repo

# Org-wide (paginate through all)
curl -s "https://api.github.com/orgs/ORG/repos?per_page=100&sort=updated" \
  -H "Authorization: Bearer $(gh auth token)" | jq '.[].full_name'

# All owned repos
gh repo list --owner USER --limit 100 --json fullName,updatedAt
```

### Step 2: Gather Open Issues

For each target repo, collect open issues assigned to or mentioning the user:

```bash
REPO="owner/repo"
USER="alimohammed1624"

# Assigned issues
gh issue list --repo "$REPO" --state open --assignee "$USER" --json number,title,state,assignees,labels,created_at,updated_at,milestone,body --limit 100

# Mentioned issues (user may need to comment)
gh issue list --repo "$REPO" --state open --json number,title,state,assignees,labels,created_at,updated_at,milestone,body --limit 100
```

### Step 3: Gather Open PRs

```bash
# User's open PRs (as author or reviewer)
gh pr list --repo "$REPO" --state open --reviewer "$USER" --json number,title,state,headRefName,mergedAt,closedAt,createdAt,updatedAt,reviews,comments,assignees,labels,body --limit 100

# All open PRs (scan for user mentions or related issues)
gh pr list --repo "$REPO" --state open --json number,title,state,headRefName,mergedAt,closedAt,createdAt,updatedAt,reviews,assignees,labels,body --limit 100
```

### Step 4: Map Dependencies

Look for cross-references in issue/PR bodies and comments:
- `#N` references (links to other issues/PRs)
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Branch naming conventions that hint at related work (`feat/#4-something`)

```bash
# Get comments on an issue for dependency context
gh issue view 3 --repo "$REPO" --comments --json comments,body,author

# Check if a PR references issues
gh pr view 5 --repo "$REPO" --json body,closesIssues,title
```

### Step 5: Synthesize the Briefing

Produce a structured summary with these sections:

1. **Your Action Items** — PRs needing your review, issues assigned to you that are urgent/stale
2. **Blocked / Waiting on Others** — items where someone else needs to act first
3. **Dependencies Map** — how your work connects to others' (e.g., "PR #5 blocks issue #3")
4. **Stale Items** — PRs/issues with no activity in 7+ days that may need attention
5. **Quick Wins** — small issues/PRs ready for quick closure

### Step 6: Identify Carry-Over from Yesterday (Optional)

If a `~/.claude/workday-yesterday.json` or similar file exists, compare yesterday's carry-over against today's state to surface resolved items.

## Output Format

Present the briefing as a structured markdown report:

```
## Start of Day Briefing — YYYY-MM-DD

### Your Action Items (N)
| # | Type | Repo | Title | Due/Updated | Priority |
|---|------|------|-------|-------------|----------|
| 3 | Issue| foo  | Fix X | 2 days ago  | High     |
| 5 | PR   | bar  | Add Y | needs review| Medium   |

### Blocked / Waiting (M)
- #7 in repo/foo: waiting on code review from @someone
- PR #12 in repo/bar: blocked by infra change in repo/baz

### Dependencies
- PR #5 → closes #3, which blocks dashboard work (#8)
- Issue #4 depends on auth fix (#2) being merged first

### Stale (no activity 7+ days)
- PR #9 in repo/foo — author hasn't responded to review comments
```

## Tips

- Sort by `updated_at` descending to surface the most active items first
- Pay attention to labels: `blocked`, `needs-review`, `help-wanted`, `stale`
- Cross-reference branch names with issue numbers for implicit links
- For large orgs, start with recently-updated repos (last 7 days)
