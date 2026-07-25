---
name: start-workday
description: Use when beginning a work session and wanting an overview of open PRs, issues, and pending tasks across the current organization
---

# Start Workday

## Overview

Scan every repo in the organization and produce a prioritized briefing: what needs your attention, what is blocked, and how the work connects.

**Core principle:** Fetch live, scope to the org, qualify every reference with its repo.

**Announce at start:** "I'm using the start-workday skill to build your daily briefing."

## When to Use

- Starting the day and wanting a standup-style overview across the organization
- Needing to see dependencies between issues and PRs across repos
- Looking for stale or stalemated items that need a nudge

**Don't use for:** "what happened over the last N days" retrospectives — use the project-status skill, which is window-scoped rather than open-work-scoped.

**REQUIRED SUB-SKILL:** Use gh-to-mcp before running any `gh` command. All GitHub access goes through the `plugin:github:github` MCP server.

## The Process

### Step 0: Read the Session Boundary

State lives at `.claude/state/workday.json` (gitignored, machine-local), shared with end-workday:

```json
{
  "last_started_at": "YYYY-MM-DDTHH:MM:SSZ",
  "last_started_repo": "owner/repo",
  "last_ended_at": "YYYY-MM-DDTHH:MM:SSZ",
  "last_ended_repo": "owner/repo"
}
```

This file holds **four values and nothing else** — two timestamps and the repos they were recorded from. It is a cursor, not a cache. Carry-over content, work summaries, and issue state never go here; they live in GitHub.

Read `last_ended_at` and apply the guard:

| What you read | What you do |
|---------------|-------------|
| Timestamp under 36h old | Use it as the "since you left off" boundary, and show it: "Since you wrapped up 2026-07-24 18:40 UTC" |
| Timestamp 36h or older | Say how old it is and that you're treating it as advisory — report against it, but don't call it "since yesterday" |
| `last_ended_repo` differs from this repo | Still usable — scoping is org-wide — but say which repo recorded it |
| Absent, `null`, or malformed | Say there's no prior wrap-up on record. Skip the "Since You Left Off" section entirely. |

Never fabricate a boundary you didn't read. A missing file means the section is omitted, not estimated.

### Step 1: Detect the Organization

```bash
git config --get remote.origin.url
```

Parse out the owner (org). The repo name is not needed — scoping is org-wide.

### Step 2: Gather Open Issues

```
search_issues(query: "org:{owner} is:issue is:open", sort="updated", order="desc", perPage=20)
  → number, title, repo, state, assignees, labels, created_at, updated_at
```

### Step 3: Gather Open PRs

```
search_pull_requests(query: "org:{owner} is:pr is:open", sort="updated", order="desc", perPage=20)
  → number, title, repo, state, headRefName, createdAt, updatedAt, reviews, assignees, labels
```

### Step 4: Map Dependencies

Each search result carries its own repo. Use that per-item `repo` — never a single fixed repo — when fetching detail:

```
issue_read(owner, repo, issue_number)              → body, comments, dependency mentions
pull_request_read(owner, repo, pull_request_number) → body, linked issues, review comments
```

Look for:
- `#N` (same-repo) and `owner/repo#N` (cross-repo) references in bodies and comments
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Branch names hinting at related work (`feat/#4-something`)

### Step 5: Synthesize the Briefing

Six sections, in this order:

1. **Since You Left Off** — activity after `last_ended_at`. Omit entirely when Step 0 found no usable boundary.
2. **Your Action Items** — PRs needing your review, urgent or stale issues assigned to you
3. **Blocked / Waiting on Others** — someone else must act first
4. **Dependencies Map** — how your work connects to others'
5. **Stale Items** — no activity in 7+ days
6. **Quick Wins** — small items ready for closure

For section 1, re-query with the boundary as the filter — this is what separates *new since you left* from *open for three weeks*:

```
search_issues(query: "org:{owner} updated:>={last_ended_at date}", sort="updated", order="desc")
search_pull_requests(query: "org:{owner} updated:>={last_ended_at date}", sort="updated", order="desc")
```

Lead with what moved while you were away — reviews that landed, comments awaiting a reply, items others closed. That's the part the rest of the briefing can't show.

### Step 6: Record the Boundary

Last thing, after the briefing is delivered: write `last_started_at` (current UTC timestamp) and `last_started_repo` (this repo, `owner/repo`) to `.claude/state/workday.json`. Preserve the existing `last_ended_at` / `last_ended_repo` values — this step updates two fields, it does not rewrite the file.

## Output Format

```
## Start of Day Briefing — YYYY-MM-DD

### Overview
Organization: owner | Open Issues: N | Open PRs: M | Repos with activity: K

### Since You Left Off (2026-07-24 18:40 UTC)
- owner/repo-a#5 (PR): @reviewer approved — ready to merge
- owner/repo-b#12 (Issue): closed by @someone while you were away
- owner/repo-a#7 (PR): new review comment awaiting your reply

### Your Action Items (N)
| # | Repo | Type | Title | Status | Priority |
|---|------|------|-------|--------|----------|
| 3 | owner/repo-a | Issue | Fix X | created 2 days ago | High |
| 5 | owner/repo-b | PR | Add Y | needs review | Medium |

### In Progress / Draft Work
- owner/repo-a#6 (PR): WIP feature name — branch: feat/name
- owner/repo-b#12 (Issue): assigned to you

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

## Quick Reference

| Situation | Action |
|-----------|--------|
| Very start of every run | Read `.claude/state/workday.json` before building the briefing |
| Boundary missing or malformed | Say there's no prior wrap-up; omit "Since You Left Off". Never estimate one. |
| Boundary 36h or older | Report against it, but say how old it is |
| End of every run | Write `last_started_at` / `last_started_repo`, preserving the `ended` fields |
| Tempted to store carry-over in the state file | Four fields, timestamps and repos only. Carry-over lives in GitHub. |
| Need org-wide issues or PRs | `search_issues` / `search_pull_requests` with an `org:` qualifier — `list_*` takes one `owner`+`repo` and cannot span an org |
| Need detail on a result | `issue_read` / `pull_request_read` using **that item's own repo** — results span repos, so a fixed repo reads the wrong issue |
| Sorting results | Use the `sort`/`order` params, never `sort:` inside the query string |
| Referencing an item in the briefing | Always `owner/repo#N` — bare `#N` is ambiguous across the org |
| Ordering the scan | `updated_at` descending — most active first |
| Labels worth flagging | `blocked`, `needs-review`, `help-wanted`, `good first issue`, `stale` |
| Tempted to reuse yesterday's briefing | Fetch live — people and agents move work across this org continuously |
| About to run a `gh` command | Stop, use gh-to-mcp |
