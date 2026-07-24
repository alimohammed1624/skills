---
name: project-status
description: Use when a product manager (or anyone) wants a status snapshot of the current project plus the wider org — work completed, what's in flight, and how items across repos relate
---

# Project Status

## Overview

A PM-facing status report with two layers: a detailed look at the **current repo** (the one
the session is in), and an **org-wide rollup** across every repo in the org, matching the scope
`start-workday`/`end-workday` already use. Unlike those two skills, this one is explicitly about
"what happened" over a chosen time window, not "what to do today" — so it always starts by
asking (or being told) which window to use.

All GitHub access goes through the `plugin:github:github` MCP server. If translating a `gh`
command, see the [gh-to-mcp](../gh-to-mcp/SKILL.md) skill first.

## When to Use

- A PM (or anyone) wants to know "where do things stand" on the current project and across the org
- You need a work-done summary for a standup, retro, or stakeholder update
- You want to see how issues/PRs across repos map to each other (dependencies, blockers)

## Step 0: Determine the Time Window

**First, read the local state file (see below) — before presenting any options to the user.**
The presence and contents of that file change what you should offer, so the check has to happen
up front, not after the user has already picked "since last check":

- **If a valid `last_checked` timestamp exists**, offer "Since last check" as a real option and
  show the user *when* that was (e.g. "Since last check (2026-07-20 14:30 UTC)") so they can
  judge whether it's a useful window. Don't make them choose it blind and only then find out it's
  stale or missing.
- **If the file is absent or malformed**, do **not** offer "Since last check" as if it will work.
  Say plainly that there's no prior check on record, and present only the other options.

Then ask the user which window to report on, unless they already specified one in their request:

1. **Since last check** — use the timestamp already read from the state file above. (Only offer
   this when that read succeeded; never fabricate a timestamp.)
2. **Past day** — `updated:>=YYYY-MM-DD` for today.
3. **Past week** — `updated:>=YYYY-MM-DD` for 7 days ago.
4. **Custom** — ask for explicit start (and optionally end) dates.

Convert relative language ("since Monday", "yesterday") to absolute `YYYY-MM-DD` before
building any query.

### Local state file (for "since last check")

This skill is the one exception to the "no local snapshot" rule the workday skills follow —
it needs a timestamp, not a data cache, so staleness isn't a concern the same way.

State lives at `.claude/skills/project-status/.state.json` (gitignored, machine-local):
```json
{ "last_checked": "YYYY-MM-DDTHH:MM:SSZ" }
```

- At the **very start** of every run — before you present time-window options to the user —
  read this file. Its state determines which options are valid to offer and lets you show the
  user when the last check was (see Step 0).
- At the **end** of every run (regardless of which window was chosen), overwrite it with the
  current timestamp, so the next "since last check" run has a fresh anchor.
- If the file doesn't exist or is malformed, treat it as "no prior check" — never fabricate a
  timestamp, and don't offer "Since last check" as a working option.

## Step 1: Detect Current Project and Organization

```
git config --get remote.origin.url
  → parse to extract owner (org) and repo (current project)
```

The current repo drives the "Current Project" section (Step 2); the owner drives the org-wide
rollup (Step 3).

## Step 2: Current Project Detail

Scoped to just this repo, for the chosen window:

```
list_issues(owner, repo, state: "all")               → filter/inspect updated_at against window
list_pull_requests(owner, repo, state: "all")         → filter/inspect updated_at against window
search_issues(query: "repo:{owner}/{repo} state:closed closed:{window}")
search_pull_requests(query: "repo:{owner}/{repo} state:merged merged:{window}")
```

For each item in-window, use `issue_read` / `pull_request_read` to get enough detail (title,
labels, Priority/Effort/dates from `issue_fields`, linked issues) to summarize what changed.

Report:
- **Shipped this window** — merged PRs, closed issues
- **In progress** — open issues/PRs touched in the window, with their Priority/Effort/dates
- **Untouched backlog** — open issues not updated in the window (still worth surfacing size, not detail)

## Step 3: Org-Wide Rollup

Same shape as `start-workday`, but scoped to the window instead of "currently open":

```
search_issues(query: "org:{owner} updated:{window}")
search_pull_requests(query: "org:{owner} updated:{window}")
```

Group results by repo. For each repo, note: items shipped, items in progress, and repo-level
activity level (active / quiet) for the window.

## Step 4: Map Dependencies

Across everything gathered in Steps 2–3, look for relationships the same way `start-workday`
does:

- `#N` (same-repo) and `owner/repo#N` (cross-repo) references in bodies/comments
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Whether the current project's open items are blocked by, or blocking, work in other repos

Present this as a short dependency map — plain statements, not a graph. **This section is read
by a product manager who is skimming, not cross-referencing issue numbers.** So identify each
item by its **issue title, rendered as a markdown link to the issue**, not by a bare `#N`. The
number is noise to a PM; the title is the thing they already have a mental model of.

- Use the title as the link text: `[Fix auth bug in login flow](https://github.com/owner/repo/issues/2)`.
- Keep the relationship phrasing plain and human: "X is blocked by Y (still open)".
- Optionally append a bare `#N` in parentheses only when it aids a follow-up lookup — never as
  the primary identifier.
- A PM should be able to read a bullet once and understand the dependency without opening
  GitHub or decoding numbers.

## Step 5: Generate the Report

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
- Any repos with zero activity this window
- Any items whose Priority/Effort/dates are missing (per AGENTS.md, shouldn't happen for
  issues created via this workflow — flag if found)
```

## Tips

- Always fetch live from GitHub — the state file only stores a timestamp, never issue/PR data.
- In the Current Project **tables**, the `#` column can stay a bare number since the row already
  carries the title in its own column. In the **Dependency Map**, always lead with the linked
  title (see Step 4) — a PM shouldn't have to map a number back to a name to follow a bullet.
- When you do need to disambiguate across repos, put the `owner/repo` context in the link URL
  (which you're building anyway) rather than in the visible text; keep the visible text the title.
- If Priority/Effort/Start/Target date fields are missing on an issue, note it under "Notes"
  rather than silently omitting it — it signals a gap in the AGENTS.md enforcement flow.
- This skill reports; it doesn't write anything to GitHub (no comments, no field updates). If
  the user wants updates made based on the report, treat that as a separate follow-up request.
