---
name: start-workday
description: Use when beginning a work session and wanting an overview of open PRs, issues, and pending tasks in the current repository
---

# Start Workday

## Overview

A structured workflow for scanning the current repository at the start of each day. Produces a prioritized briefing: what needs attention, what is blocked, and how tasks relate.

## When to Use

- You want a daily standup-style overview of the current repository before starting work
- You want to understand dependencies between issues and PRs in this project
- You need to identify stale/stalemate items that need attention

## How It Works

The skill uses the GitHub MCP plugin (`plugin:github:github`) to gather data from the current repository (inferred from the git remote origin).

### Step 1: Detect Current Repository

Extract the repository owner and name from the git remote:
```
git config --get remote.origin.url
  → parse to extract owner/repo
```

### Step 2: Gather Open Issues

Use `list_issues` to collect all open issues in the repository:

```
list_issues(owner, repo, state="open", sort="updated", direction="desc", perPage=20)
  → returns: issues with number, title, state, assignees, labels, created_at, updated_at
```

### Step 3: Gather Open PRs

Use `list_pull_requests` to fetch all open PRs:

```
list_pull_requests(owner, repo, state="open", sort="updated", direction="desc", perPage=20)
  → returns: PRs with number, title, state, headRefName, createdAt, updatedAt, reviews, assignees, labels
```

### Step 4: Map Dependencies

Use `issue_read` and `pull_request_read` to fetch full details including body/comments:

```
issue_read(owner, repo, issue_number)
  → returns: full issue body, comments, mentions of dependencies

pull_request_read(owner, repo, pull_request_number)
  → returns: full PR body, linked issues, review comments
```

Look for cross-references:
- `#N` references in body/comments (links to other issues/PRs)
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Branch naming conventions that hint at related work (`feat/#4-something`)

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

### Overview
Repository: owner/repo | Open Issues: N | Open PRs: M

### Your Action Items (N)
| # | Type | Title | Status | Priority |
|----|------|-------|--------|----------|
| 3 | Issue | Fix X | created 2 days ago | High |
| 5 | PR | Add Y | needs review | Medium |

### In Progress / Draft Work
- #6 (PR): WIP feature name — branch: feat/name
- #12 (Issue): Work in progress — assigned to you

### Blocked / Dependencies
- #7: waiting on code review from @someone
- #4 depends on fix #2 being merged first

### Stale Items (no activity 7+ days)
- #9 (PR) — author hasn't responded to review comments
- #11 (Issue) — no activity since creation

### Quick Wins (small, ready items)
- #14 (Issue): labeled "good first issue"
- #15 (Issue): small bug fix
```

## Tips

- Sort by `updated_at` descending to surface the most active items first
- Pay attention to labels: `blocked`, `needs-review`, `help-wanted`, `good first issue`, `stale`
- Look for draft PRs that may be waiting for feedback
- Identify issues that are dependencies for other work
