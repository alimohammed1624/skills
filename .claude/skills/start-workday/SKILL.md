---
name: start-workday
description: Use when beginning a work session and wanting an overview of open PRs, issues, and pending tasks across the current organization
---

# Start Workday

## Overview

A structured workflow for scanning the whole organization at the start of each day. Produces a prioritized briefing: what needs attention, what is blocked, and how tasks relate — across every repo in the org, not just one.

## When to Use

- You want a daily standup-style overview across the organization before starting work
- You want to understand dependencies between issues and PRs across repos
- You need to identify stale/stalemate items that need attention

## How It Works

The skill uses the GitHub MCP plugin (`plugin:github:github`) to gather data from across the organization (inferred from the git remote origin). It uses the `search_*` tools rather than `list_*`, since `list_issues`/`list_pull_requests` only accept a single `owner`+`repo` and can't span an org — `search_issues`/`search_pull_requests` accept an `org:` qualifier in the query instead. If you're translating any `gh` CLI usage (e.g. from notes, scripts, or a pasted command) into the equivalent MCP tool calls, see the [gh-to-mcp](../gh-to-mcp/SKILL.md) skill.

### Step 1: Detect Current Organization

Extract the org (repository owner) from the git remote:
```
git config --get remote.origin.url
  → parse to extract owner (org) — the repo name itself is no longer needed for scoping
```

### Step 2: Gather Open Issues

Use `search_issues` scoped to the org to collect all open issues across every repo:

```
search_issues(query: "org:{owner} is:issue is:open", sort="updated", order="desc", perPage=20)
  → returns: issues with number, title, repo, state, assignees, labels, created_at, updated_at
```

### Step 3: Gather Open PRs

Use `search_pull_requests` scoped to the org to fetch all open PRs across every repo:

```
search_pull_requests(query: "org:{owner} is:pr is:open", sort="updated", order="desc", perPage=20)
  → returns: PRs with number, title, repo, state, headRefName, createdAt, updatedAt, reviews, assignees, labels
```

### Step 4: Map Dependencies

Each search result carries its own repo, so use that per-item `repo` (not a single fixed repo) when fetching full details via `issue_read` and `pull_request_read`:

```
issue_read(owner, repo, issue_number)
  → returns: full issue body, comments, mentions of dependencies

pull_request_read(owner, repo, pull_request_number)
  → returns: full PR body, linked issues, review comments
```

Cross-references between items in different repos use `owner/repo#N` rather than bare `#N` — watch for both forms.

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

## Output Format

Present the briefing as a structured markdown report:

```
## Start of Day Briefing — YYYY-MM-DD

### Overview
Organization: owner | Open Issues: N | Open PRs: M | Repos with activity: K

### Your Action Items (N)
| # | Repo | Type | Title | Status | Priority |
|----|------|------|-------|--------|----------|
| 3 | owner/repo-a | Issue | Fix X | created 2 days ago | High |
| 5 | owner/repo-b | PR | Add Y | needs review | Medium |

### In Progress / Draft Work
- owner/repo-a#6 (PR): WIP feature name — branch: feat/name
- owner/repo-b#12 (Issue): Work in progress — assigned to you

### Blocked / Dependencies
- owner/repo-a#7: waiting on code review from @someone
- owner/repo-b#4 depends on owner/repo-a#2 being merged first

### Stale Items (no activity 7+ days)
- owner/repo-a#9 (PR) — author hasn't responded to review comments
- owner/repo-b#11 (Issue) — no activity since creation

### Quick Wins (small, ready items)
- owner/repo-a#14 (Issue): labeled "good first issue"
- owner/repo-b#15 (Issue): small bug fix
```

## Tips

- Always fetch live from GitHub (Steps 2-4) rather than relying on any cached/local file — with multiple people and agents working across the org, a stale snapshot is worse than no snapshot
- Always qualify item references with their repo (`owner/repo#N`) since the briefing spans multiple repos — a bare `#N` is ambiguous across the org
- Sort by `updated_at` descending to surface the most active items first
- Pay attention to labels: `blocked`, `needs-review`, `help-wanted`, `good first issue`, `stale`
- Look for draft PRs that may be waiting for feedback
- Identify issues that are dependencies for other work
