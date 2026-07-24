---
name: end-workday
description: Use when ending a work session to summarize completed work, update issue/PR statuses, and note carry-over tasks for tomorrow across the current organization
---

# End Workday

## Overview

A structured wrap-up workflow across the whole organization that captures what was accomplished today, updates relevant issues/PRs, and records carry-over items so tomorrow's start is frictionless. All GitHub access below goes through the `plugin:github:github` MCP server — if you're translating a `gh` CLI command into the equivalent tool call, see the [gh-to-mcp](../gh-to-mcp/SKILL.md) skill.

## When to Use

- You are finishing work for the day and want a clean handoff across the organization
- You need to update issue/PR statuses to reflect progress made today
- You want to log daily progress for tracking or reporting
- You want tomorrow's start-workday briefing to pick up where you left off

## How It Works

### Step 1: Detect Current Organization

Extract the org (repository owner) from the git remote:
```
git config --get remote.origin.url
  → parse to extract owner (org) — the repo name itself is no longer needed for scoping
```

### Step 2: Check for Pending Changes (⚠️ PRIORITY)

Before proceeding, check for uncommitted work and unpushed commits — these are **blocking items** that must be addressed before wrapping up:

```bash
git status --short
  → any output = uncommitted changes exist (critical blocker)

git log --oneline @{u}.. 2>/dev/null || git log --oneline origin/main..HEAD
  → any output = commits exist locally but not pushed to remote (must push before end-of-day)
```

If either check returns results:
- **Uncommitted changes**: List them in a prominent "⚠️ Pending Changes" section at the top of the report
- **Unpushed commits**: List the commits and note they must be pushed to complete the day's work

This step is highest priority — these are the things that prevent a clean handoff.

### Step 3: Find Today's Activity

Use `search_issues` and `search_pull_requests` scoped to the org with date filters to find items worked on anywhere in the org:
```
search_issues(query: "org:{owner} updated:TODAY")
  → returns: all issues across the org updated today

search_pull_requests(query: "org:{owner} updated:TODAY")
  → returns: all PRs across the org updated today
```

### Step 4: Capture Completed Work

For each item worked on today, record what changed:

**Closed/Merged items:**
```
search_issues(query: "org:{owner} state:closed closed:TODAY")
  → returns: issues closed today across the org

search_pull_requests(query: "org:{owner} state:merged merged:TODAY")
  → returns: PRs merged today across the org
```

**Updated but not closed:**
- Use `issue_read` / `pull_request_read` to fetch full details
- Note what was done from comments and review history
- Reference commits in issue bodies

### Step 5: Update Statuses

For items that are still open but have meaningful progress:

Use `add_issue_comment` to summarize work:
```
add_issue_comment(owner, repo, issue_number, body: "Progress today: implemented X, Y. Remaining: Z.")
```

Use `issue_write` to update labels and status:
```
issue_write(owner, repo, issue_number, labels: ["in-progress"])
```

Close if fully resolved using `issue_write` with `state_reason`:
```
issue_write(owner, repo, issue_number, state: "CLOSED", state_reason: "COMPLETED")
```

Add review comments on PRs using `pull_request_review_write`:
```
pull_request_review_write(owner, repo, pull_request_number, method: "create", body: "Summary of progress...")
```

### Step 5a: Reconcile Push Activity Against AGENTS.md

`AGENTS.md` requires that every `git push` be followed by: a progress comment on each
issue referenced in the pushed commits, closing the issue if a closing keyword
(`Fixes`/`Closes`/`Resolves #N`) was used and the work is genuinely done, and updates to
Priority/Start date/Target date if the timeline or urgency shifted. That check doesn't
always happen at push time — this step catches and repairs anything that slipped through.

For each local commit pushed today (`git log --since=midnight --oneline`), extract any
`#N` issue references:

- If the commit references an issue but no comment mentioning that commit exists on the
  issue, add one now summarizing what it did.
- If the commit used a closing keyword and the work is genuinely complete but the issue
  is still open, close it via `issue_write` with the appropriate `state_reason`.
- If the work shifts urgency or timeline, update the relevant issue fields.

Note any discrepancy you find and fix in the end-of-day report (see Step 7) under a
"Compliance gaps found" line — this is the signal that the push-time self-check in
`AGENTS.md` isn't reliably firing on its own and needs attention.

### Step 6: Identify Carry-Over

Gather still-open work using GitHub MCP tools — this is presented directly in the report
(Step 6), not persisted anywhere. There is no local carry-over file: with multiple people
and agents working across the org, a cached snapshot goes stale immediately, so every run
of start-workday and end-workday re-fetches live state from GitHub instead.

```
search_issues(query: "org:{owner} is:issue is:open", sort="updated", order="desc")
  → returns: open issues across the org

search_pull_requests(query: "org:{owner} is:pr is:open", sort="updated", order="desc")
  → returns: open PRs across the org
```

For each open item, note what's done and what's left based on its comments/review
history (from Step 3) so the report is useful without needing yesterday's file.

### Step 7: Generate End-of-Day Report

Produce a structured summary, **starting with pending changes if any exist**:

```
## End of Day Summary — YYYY-MM-DD
Organization: owner

### ⚠️ Pending Changes (BLOCKING)
**Uncommitted changes:**
- file1.js
- file2.md

**Unpushed commits:**
- abc1234 — Fix bug in auth flow
- def5678 — Add new feature

⚠️ **Action required**: Commit and push all changes before ending the workday.

### Completed (N items)
| # | Repo | Type | Title | Status |
|---|------|------|-------|--------|
| 3 | owner/repo-a | Issue | Fix auth bug | Closed |
| 5 | owner/repo-b | PR | Add validation | Merged |

### In Progress / Carry-Over (M items)
- owner/repo-a#7 — Dashboard metrics
  - Done: data layer implemented
  - Remaining: UI components
  - Blocks: owner/repo-a#8

- owner/repo-b PR #9 — Rate limiting middleware
  - Status: awaiting review from @reviewer
  - Blocks: owner/repo-a#4

### Notes for Tomorrow
- Follow up on owner/repo-b#9 review comments
- Start UI work on dashboard (owner/repo-a#7)
- Check if owner/repo-a#4 is ready to move forward

### Compliance gaps found
- owner/repo-a#11 was missing its push progress comment — added just now
```

## Tips

- **Pending changes take priority** — if uncommitted changes or unpushed commits exist, these must be resolved before any end-workday wrap-up is complete
- Be specific in carry-over notes — "what was done" and "what's left" are both critical
- Link commits to issues when possible (`see commit abc123`)
- Update labels before closing so tomorrow's scan picks up the right state
- If you left a PR open for review, note who is expected to review it
- Don't write carry-over to a local file — start-workday re-fetches open issues/PRs live, so status updates and labels made here (Step 5) are what actually carry information forward
- Always qualify item references with their repo (`owner/repo#N`) since the summary spans multiple repos — a bare `#N` is ambiguous across the org
