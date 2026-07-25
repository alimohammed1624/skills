---
name: end-workday
description: Use when ending a work session, wrapping up for the day, or handing off in-flight work across the current organization
---

# End Workday

## Overview

Wrap up the day across the whole organization: land pending work, record what was accomplished, update the issues and PRs that moved, and leave carry-over notes tomorrow's briefing can pick up.

**Core principle:** Uncommitted and unpushed work blocks the wrap-up. Everything else is reporting.

**Announce at start:** "I'm using the end-workday skill to wrap up the day."

## The Iron Law

```
NO CLEAN HANDOFF WITH UNCOMMITTED OR UNPUSHED WORK
```

Step 2 runs first, every time. If it finds anything, that goes at the top of the report as a blocker — not in a footnote, not "worth mentioning."

## When to Use

- Finishing work for the day and wanting a clean handoff across the org
- Updating issue/PR statuses to reflect today's progress
- Logging daily progress for tracking or reporting
- Setting up tomorrow's start-workday briefing to pick up where you left off

**REQUIRED SUB-SKILL:** Use gh-to-mcp before running any `gh` command. All GitHub access goes through the `plugin:github:github` MCP server.

## The Process

### Step 1: Detect the Organization

```bash
git config --get remote.origin.url
```

Parse out the owner (org). The repo name is not needed — scoping is org-wide.

### Step 2: Check for Pending Changes (BLOCKING)

```bash
git status --short
  → any output = uncommitted changes (blocker)

git log --oneline @{u}.. 2>/dev/null || git log --oneline origin/main..HEAD
  → any output = commits not pushed to remote (blocker)
```

Either result goes in a "Pending Changes (BLOCKING)" section at the very top of the report, with an explicit action-required line. This is what prevents a clean handoff — everything below is reporting.

### Step 3: Determine the Session Window, Then Find Activity

The window is **this work session**, not the calendar day. Those differ whenever you work past midnight or pick up after a weekend, and `TODAY` silently drops the difference.

Read `.claude/state/workday.json` (gitignored, machine-local), shared with start-workday:

```json
{
  "last_started_at": "YYYY-MM-DDTHH:MM:SSZ",
  "last_started_repo": "owner/repo",
  "last_ended_at": "YYYY-MM-DDTHH:MM:SSZ",
  "last_ended_repo": "owner/repo"
}
```

Four values, nothing else — two timestamps and the repos they were recorded from. It's a cursor, not a cache.

| What you read | Window to use |
|---------------|---------------|
| `last_started_at` under 36h old | That timestamp — the real session start |
| `last_started_at` 36h or older | Midnight today, and say in the report that the recorded start was stale so the window was clamped |
| Absent, `null`, or malformed | Midnight today, and note that no session start was on record |

Never span multiple days silently. If the boundary would make the window longer than a day, say so in the report rather than quietly reporting 72 hours as "today."

Use the resolved window for every query below — `{window}` is that date:

```
search_issues(query: "org:{owner} updated:>={window}")
search_pull_requests(query: "org:{owner} updated:>={window}")
```

### Step 4: Capture Completed Work

```
search_issues(query: "org:{owner} state:closed closed:>={window}")
search_pull_requests(query: "org:{owner} state:merged merged:>={window}")
```

For items updated but not closed, use `issue_read` / `pull_request_read` to pull comments and review history, and note what actually changed.

### Step 5: Update Statuses

For open items with meaningful progress:

```
add_issue_comment(owner, repo, issue_number, body: "Progress today: implemented X, Y. Remaining: Z.")
issue_write(owner, repo, issue_number, labels: ["in-progress"])
issue_write(owner, repo, issue_number, state: "CLOSED", state_reason: "COMPLETED")
pull_request_review_write(owner, repo, pull_request_number, method: "create", body: "Summary of progress...")
```

Update labels *before* closing, so tomorrow's scan reads the right state.

### Step 6: Reconcile Push Activity

Every `git push` is supposed to be followed by a progress comment on each issue referenced in the pushed commits, closure when a closing keyword (`Fixes`/`Closes`/`Resolves #N`) was used and the work is genuinely done, and Priority/Start date/Target date updates when the timeline shifted. That doesn't reliably happen at push time. This step catches what slipped.

For each commit pushed in the session window (`git log --since={window} --oneline`, using the window resolved in Step 3), extract `#N` references and repair. Using midnight instead of the real session start is what loses the first half of a past-midnight session:

| Found | Fix |
|-------|-----|
| Commit references an issue, no comment mentions that commit | Add a comment summarizing what it did |
| Closing keyword used, work genuinely complete, issue still open | `issue_write` with the appropriate `state_reason` |
| Work shifted urgency or timeline | Update the relevant issue fields |

Report every gap you repaired under "Compliance gaps found" in Step 8 — that line is the signal that the push-time self-check needs attention.

### Step 7: Identify Carry-Over

```
search_issues(query: "org:{owner} is:issue is:open", sort="updated", order="desc")
search_pull_requests(query: "org:{owner} is:pr is:open", sort="updated", order="desc")
```

For each open item, note what's done and what's left, drawn from the comments and review history gathered in Step 4. This goes in the report only — there is no local carry-over file. The state file is not an exception: it holds timestamps, never carry-over.

### Step 8: Generate the Report

### Step 9: Record the Boundary

Last thing, after the report is delivered: write `last_ended_at` (current UTC timestamp) and `last_ended_repo` (this repo, `owner/repo`) to `.claude/state/workday.json`. Preserve the existing `last_started_at` / `last_started_repo` values — this step updates two fields, it does not rewrite the file.

Write it even when Step 2 found blocking changes. The boundary records when you stopped, not whether the handoff was clean.

## Output Format

```
## End of Day Summary — YYYY-MM-DD
Organization: owner

### Pending Changes (BLOCKING)
**Uncommitted changes:**
- file1.js
- file2.md

**Unpushed commits:**
- abc1234 — Fix bug in auth flow
- def5678 — Add new feature

**Action required**: commit and push all changes before ending the workday.

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

- owner/repo-b#9 (PR) — Rate limiting middleware
  - Status: awaiting review from @reviewer
  - Blocks: owner/repo-a#4

### Notes for Tomorrow
- Follow up on owner/repo-b#9 review comments
- Start UI work on dashboard (owner/repo-a#7)
- Check if owner/repo-a#4 is ready to move forward

### Compliance gaps found
- owner/repo-a#11 was missing its push progress comment — added just now
```

Omit the Pending Changes section entirely when Step 2 comes back clean.

## Red Flags — STOP

- About to write the report without having run `git status --short`
- Uncommitted changes found, and you're putting them anywhere but the top
- Describing unpushed commits as "minor" or "just local"
- Writing carry-over notes to a local file — including into `workday.json`, which takes timestamps only
- Putting anything in `workday.json` beyond its four fields
- Finishing the run without recording `last_ended_at`
- Referencing an item as bare `#N` in a multi-repo summary
- Closing an issue because a commit said `Fixes #N`, without checking the work is actually done

## Quick Reference

| Situation | Action |
|-----------|--------|
| Start of every run | `git status --short` and the unpushed-commits check, before anything else |
| Pending changes exist | Top-of-report BLOCKING section with an action-required line |
| Need org-wide activity | `search_*` with an `org:` qualifier and a date filter |
| Item made progress but isn't done | `add_issue_comment` + `issue_write` labels |
| Item is genuinely done | `issue_write` with `state: "CLOSED"`, `state_reason: "COMPLETED"` |
| Carry-over *content* (what's done, what's left) | Report + GitHub status updates. Never a local file. |
| Session boundary *timestamps* | `.claude/state/workday.json` — four fields, timestamps and repos only |
| Resolving the session window | `last_started_at` if under 36h old, else midnight today with a note |
| End of every run | Write `last_ended_at` / `last_ended_repo`, preserving the `started` fields |
| Referencing an item | Always `owner/repo#N` |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The uncommitted changes are trivial, I'll note them at the bottom" | Trivial changes are exactly what gets lost overnight. Top of report, marked blocking. |
| "The commits are local, that still counts as done" | Unpushed work is invisible to everyone else. It isn't handed off until it's pushed. |
| "I'll write carry-over to a file so tomorrow is faster" | start-workday re-fetches live. A file goes stale the moment someone else pushes — the Step 5 status updates are what actually carry forward. |
| "There's a state file now, so I can cache the carry-over notes in it" | It holds two timestamps and two repo names. That's the whole schema. A timestamp can't go stale — only the local clock writes it. Work state can, and does. The two aren't comparable. |
| "The window came out to three days, I'll just report it as today" | Say the window was three days. A silently stretched window makes the whole report wrong in a way nobody can see. |
| "The commit said `Fixes #N`, so close it" | Closing keywords state intent, not completion. Verify the work is genuinely done first. |
| "Push reconciliation is redundant, I commented at push time" | Step 6 exists because that check demonstrably doesn't always fire. Run it and report what you find. |
| "Bare `#N` reads fine" | The summary spans repos. Qualify with `owner/repo#N`. |
