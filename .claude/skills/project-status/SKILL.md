---
name: project-status
description: Use when a product manager (or anyone) wants a status snapshot of the current project plus the wider org — work completed, what's in flight, and how items across repos relate
---

# Project Status

## Overview

A PM-facing report in two layers: detail on the **current repo**, then an **org-wide rollup**. Unlike the workday skills, this one answers "what happened over a window," not "what should I do today" — so it always establishes the window first.

**Core principle:** Report, never write. Read the state file before offering options. Identify work by title, not by number.

**Announce at start:** "I'm using the project-status skill to put together a status report."

## When to Use

- Someone asks "where do things stand" on this project and across the org
- You need a work-done summary for a standup, retro, or stakeholder update
- You want to see how issues and PRs across repos map to each other

**Don't use for:** today's open-work triage — use start-workday, which is scoped to what's open rather than to a time window.

**This skill never writes to GitHub.** No comments, no field updates, no closures. If the user wants changes made based on the report, that's a separate follow-up request.

**REQUIRED SUB-SKILL:** Use gh-to-mcp before running any `gh` command. All GitHub access goes through the `plugin:github:github` MCP server.

## Step 0: Determine the Time Window

**Read the state file before presenting any options to the user.** Its contents change what you may offer, so this cannot happen after the user has already picked.

State lives at `.claude/state/project-status.json` (gitignored, machine-local):
```json
{ "last_checked": "YYYY-MM-DDTHH:MM:SSZ" }
```

This is a **report cursor** — when this report was last run. It is not a workday boundary. `.claude/state/workday.json` in the same directory belongs to the workday skills; never read your window from it, and never write to it.

| State file | What you may offer |
|------------|--------------------|
| Valid `last_checked` timestamp | "Since last check" — and show *when* that was, e.g. "Since last check (2026-07-20 14:30 UTC)", so the user can judge whether it's useful |
| Absent or malformed | Say plainly there's no prior check on record. Offer only the other options. |

Then ask which window, unless the request already specified one:

1. **Since last check** — the timestamp read above. Only offer when that read succeeded.
2. **Past day** — `updated:>=YYYY-MM-DD` for today
3. **Past week** — `updated:>=YYYY-MM-DD` for 7 days ago
4. **Custom** — ask for explicit start, and optionally end, dates

Convert relative language ("since Monday", "yesterday") to absolute `YYYY-MM-DD` before building any query.

At the **end** of every run, whichever window was chosen, overwrite the state file with the current timestamp so the next "since last check" has a fresh anchor.

## The Process

### Step 1: Detect Project and Organization

```bash
git config --get remote.origin.url
```

Parse out both owner (org) and repo. The repo drives Step 2; the owner drives Step 3.

### Step 2: Current Project Detail

Scoped to this repo, for the chosen window:

```
list_issues(owner, repo, state: "all")          → filter updated_at against window
list_pull_requests(owner, repo, state: "all")   → filter updated_at against window
search_issues(query: "repo:{owner}/{repo} state:closed closed:{window}")
search_pull_requests(query: "repo:{owner}/{repo} state:merged merged:{window}")
```

For each in-window item, use `issue_read` / `pull_request_read` to get title, labels, Priority/Effort/dates, and linked issues.

Report three groups:
- **Shipped this window** — merged PRs, closed issues
- **In progress** — open items touched in the window, with Priority/Effort/dates
- **Untouched backlog** — open issues not updated in the window (surface the count, not the detail)

### Step 3: Org-Wide Rollup

```
search_issues(query: "org:{owner} updated:{window}")
search_pull_requests(query: "org:{owner} updated:{window}")
```

Group by repo. Per repo: items shipped, items in progress, activity level (active / quiet).

### Step 4: Map Dependencies

Across everything from Steps 2–3:
- `#N` (same-repo) and `owner/repo#N` (cross-repo) references in bodies and comments
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Whether this project's open items are blocked by, or blocking, work elsewhere

**This section is read by a PM who is skimming, not cross-referencing.** Identify each item by its **title, rendered as a markdown link**, never by a bare number:

- Link text is the title: `[Fix auth bug in login flow](https://github.com/owner/repo/issues/2)`
- Phrase relationships plainly: "X is blocked by Y (still open)"
- Append a bare `#N` in parentheses only as a lookup aid, never as the primary identifier
- Put `owner/repo` disambiguation in the URL you're building anyway, not in the visible text

A PM should understand each bullet on one read, without opening GitHub.

### Step 5: Generate the Report

## Output Format

```
## Project Status — {window description} (as of YYYY-MM-DD)

### Current Project: owner/repo
Shipped: N merged PRs, M closed issues
In progress: K items

| # | Type | Title | Status | Priority | Effort |
|---|------|-------|--------|----------|--------|
| 12 | PR | Add rate limiting | merged | High | Medium |
| 9 | Issue | Dashboard metrics | in progress | Medium | High |

Backlog untouched this window: J open issues

### Org Rollup: owner
| Repo | Shipped | In Progress | Activity |
|------|---------|-------------|----------|
| repo-a | 3 | 2 | active |
| repo-b | 0 | 1 | quiet |

### Dependency Map
- [Rework auth token storage](https://github.com/owner/repo-a/issues/7) blocks [Add SSO login](https://github.com/owner/repo-b/issues/4) — still open
- [Add user dashboard with metrics](https://github.com/owner/repo/issues/9) depends on [Stabilize metrics API](https://github.com/owner/repo-c/issues/2) — merged, so now unblocked

### Notes
- Repos with zero activity this window
- Items missing Priority/Effort/dates (every issue should carry all four — flag if found)
```

## Red Flags — STOP

- About to offer "Since last check" without having read the state file
- Filling in a `last_checked` value you didn't read from the file
- Reading the window from `workday.json` — that's the workday skills' file, and its boundaries mean something else
- A Dependency Map bullet whose primary identifier is a number
- About to add a comment, set a field, or close something — this skill reads only
- Finishing the run without overwriting the state file

## Quick Reference

| Situation | Action |
|-----------|--------|
| Very start of every run | Read `.claude/state/project-status.json` before offering window options |
| State file missing or malformed | Say there's no prior check; don't offer "Since last check" |
| Relative window ("since Monday") | Convert to absolute `YYYY-MM-DD` before querying |
| Current-project scope | `list_*` / `search_*` with `repo:{owner}/{repo}` |
| Org scope | `search_*` with `org:{owner}` |
| Identifying an item in a table | Bare `#N` is fine — the row carries the title |
| Identifying an item in the Dependency Map | Linked title, always |
| Missing Priority/Effort/dates | Flag under Notes, don't silently omit |
| End of every run | Overwrite `.claude/state/project-status.json` with the current timestamp |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll offer the window options first, then read the state file" | The file's contents determine which options are valid. Reading it after means offering a window that may not exist. |
| "There's no state file, I'll estimate when the last check was" | Never fabricate a timestamp. Say there's no prior check on record. |
| "The report found a stale issue, I'll just fix it while I'm here" | This skill reports only. Surface it and let the user ask for the change. |
| "The window was 'since last check', so no need to update the file" | Every run updates it, whichever window was used. |
