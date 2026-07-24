---
name: end-workday
description: Use when ending a work session and wanting to summarize completed work, update issue/PR statuses, and note carry-over tasks for tomorrow across GitHub repos or orgs
---

# End Workday

## Overview

A structured wrap-up workflow that captures what was accomplished today, updates relevant issues/PRs, and records carry-over items so tomorrow's start is frictionless.

## When to Use

- You are finishing work for the day and want a clean handoff
- You need to update issue statuses before closing them out
- You want to log daily progress for tracking or reporting
- You want tomorrow's start-workday briefing to pick up where you left off

## How It Works

### Step 1: Identify Today's Activity Scope

Determine which repos were worked on today. Options:
- **Manual**: user specifies repos they touched
- **Auto-detect**: check `gh api` for items updated by the user today
- **Session-based**: use Claude's conversation history to infer what was worked on

```bash
USER="alimohammed1624"
TODAY=$(date +%Y-%m-%d)

# Find issues/PRs the user updated today (across owned repos)
for REPO in $(gh repo list --owner "$USER" --limit 100 --json fullName | jq -r '.[].full_name'); do
  gh issue list --repo "$REPO" --state all --json number,title,updated_at,author --limit 200 | \
    jq --arg today "$TODAY" '[.[] | select(.updated_at[:10] == $today)]'
done
```

### Step 2: Capture Completed Work

For each item worked on today, record what changed:

**Closed/Merged:**
```bash
gh issue list --repo "owner/repo" --state closed --since "$TODAY"T00:00:00Z \
  --json number,title,closedAt,closedBy,labels --limit 100

gh pr list --repo "owner/repo" --state merged --since "$TODAY"T00:00:00Z \
  --json number,title,mergedAt,mergedBy,mergeCommit --limit 100
```

**Updated but not closed:**
- Note what was done (commits pushed, comments left, reviews submitted)
- Check recent commits for issue references (`git log --since "$TODAY"T00:00:00Z`)

### Step 3: Update Statuses

For items that are still open but have meaningful progress:

```bash
# Add a comment summarizing today's work on an issue/PR
gh issue comment 3 --repo "owner/repo" --body "Progress today: implemented X, Y. Remaining: Z. Blocking: waiting on review."

# Update labels if status changed (e.g., add 'in-progress', remove 'todo')
gh issue edit 3 --repo "owner/repo" --add-labels in-progress

# Or close if fully resolved
gh issue close 3 --repo "owner/repo" --comment "Resolved today. See commit abc123."
```

### Step 4: Record Carry-Over

Save unfinished work to a local file so start-workday can reference it:

```bash
cat > ~/.claude/workday-today.json << 'EOF'
{
  "date": "2026-07-24",
  "completed": [
    {"repo": "owner/repo", "type": "issue", "number": 3, "title": "Fix auth bug", "status": "closed"},
    {"repo": "owner/repo", "type": "pr", "number": 5, "title": "Add validation", "status": "merged"}
  ],
  "carryOver": [
    {
      "repo": "owner/repo",
      "type": "issue",
      "number": 7,
      "title": "Dashboard metrics",
      "status": "in-progress",
      "notes": "Completed data layer. Still need UI components.",
      "blockedBy": null,
      "blocks": ["#8"]
    },
    {
      "repo": "owner/repo",
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
EOF
```

### Step 5: Generate End-of-Day Report

Produce a structured summary:

```
## End of Day Summary — YYYY-MM-DD

### Completed (N items)
| # | Type | Repo | Title | Status |
|---|------|------|-------|--------|
| 3 | Issue| foo  | Fix auth bug | Closed |
| 5 | PR   | bar  | Add validation | Merged |

### In Progress / Carry-Over (M items)
- #7 in repo/foo — Dashboard metrics
  - Done: data layer implemented
  - Remaining: UI components
  - Blocks: #8, #12

- PR #9 in repo/bar — Rate limiting middleware
  - Status: awaiting review from @reviewer
  - Blocked by: nothing
  - Blocks: issue #4

### Notes for Tomorrow
- Follow up on PR #9 review comments
- Start UI work on dashboard (#7)
- Check if infra change for repo/baz is ready (blocks PR #12)
```

## Tips

- Be specific in carry-over notes — "what was done" and "what's left" are both critical
- Link commits to issues when possible (`see commit abc123`)
- Update labels before closing so tomorrow's scan picks up the right state
- If you left a PR open for review, note who is expected to review it
- The carry-over file becomes tomorrow's start-workday input
