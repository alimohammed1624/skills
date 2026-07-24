---
name: end-workday
description: Use when ending a work session to summarize completed work, update issue/PR statuses, and note carry-over tasks for tomorrow in the current repository
---

# End Workday

## Overview

A structured wrap-up workflow for the current repository that captures what was accomplished today, updates relevant issues/PRs, and records carry-over items so tomorrow's start is frictionless.

## When to Use

- You are finishing work for the day and want a clean handoff for the current repository
- You need to update issue/PR statuses to reflect progress made today
- You want to log daily progress for tracking or reporting
- You want tomorrow's start-workday briefing to pick up where you left off

## How It Works

### Step 1: Detect Current Repository

Extract the repository owner and name from the git remote:
```
git config --get remote.origin.url
  → parse to extract owner/repo
```

### Step 2: Find Today's Activity

Use `search_issues` and `search_pull_requests` with date filters to find items worked on:
```
search_issues(query: "repo:owner/repo updated:TODAY")
  → returns: all issues in current repo updated today

search_pull_requests(query: "repo:owner/repo updated:TODAY")
  → returns: all PRs in current repo updated today
```

### Step 3: Capture Completed Work

For each item worked on today, record what changed:

**Closed/Merged items:**
```
search_issues(query: "repo:owner/repo state:closed closed:TODAY")
  → returns: issues closed today in current repo

search_pull_requests(query: "repo:owner/repo state:merged merged:TODAY")
  → returns: PRs merged today in current repo
```

**Updated but not closed:**
- Use `issue_read` / `pull_request_read` to fetch full details
- Note what was done from comments and review history
- Reference commits in issue bodies

### Step 4: Update Statuses

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

### Step 5: Record Carry-Over

Save unfinished work to a local file so start-workday can reference it:

Gather carry-over items using GitHub MCP tools:
```
list_issues(owner, repo, state="open", sort="updated", direction="desc")
  → returns: open issues in current repo

list_pull_requests(owner, repo, state="open", sort="updated", direction="desc")
  → returns: open PRs in current repo
```

Compile results into a structured JSON file (~/.claude/workday-today.json):
```json
{
  "date": "2026-07-24",
  "repo": "owner/repo",
  "completed": [
    {"type": "issue", "number": 3, "title": "Fix auth bug", "status": "closed"},
    {"type": "pr", "number": 5, "title": "Add validation", "status": "merged"}
  ],
  "carryOver": [
    {
      "type": "issue",
      "number": 7,
      "title": "Dashboard metrics",
      "status": "in-progress",
      "notes": "Completed data layer. Still need UI components.",
      "blockedBy": null,
      "blocks": ["#8"]
    },
    {
      "type": "pr",
      "number": 9,
      "title": "Rate limiting middleware",
      "status": "review-pending",
      "notes": "Pushed v2 addressing review comments. Waiting on @reviewer.",
      "blockedBy": null,
      "blocks": ["#4"]
    }
  ]
}
```

### Step 6: Generate End-of-Day Report

Produce a structured summary:

```
## End of Day Summary — YYYY-MM-DD
Repository: owner/repo

### Completed (N items)
| # | Type | Title | Status |
|---|------|-------|--------|
| 3 | Issue | Fix auth bug | Closed |
| 5 | PR | Add validation | Merged |

### In Progress / Carry-Over (M items)
- #7 — Dashboard metrics
  - Done: data layer implemented
  - Remaining: UI components
  - Blocks: #8

- PR #9 — Rate limiting middleware
  - Status: awaiting review from @reviewer
  - Blocks: issue #4

### Notes for Tomorrow
- Follow up on PR #9 review comments
- Start UI work on dashboard (#7)
- Check if #4 is ready to move forward
```

## Tips

- Be specific in carry-over notes — "what was done" and "what's left" are both critical
- Link commits to issues when possible (`see commit abc123`)
- Update labels before closing so tomorrow's scan picks up the right state
- If you left a PR open for review, note who is expected to review it
- The carry-over file becomes tomorrow's start-workday input
