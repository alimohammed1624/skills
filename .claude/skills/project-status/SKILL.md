---
name: project-status
description: Use when a product manager (or anyone) wants a status snapshot of the current project plus the wider org — work completed, what's in flight, who did what, and how items across repos relate
---

# Project Status

## Overview

A PM-facing report in three layers: detail on the **current repo**, an **org-wide rollup**, and a **per-developer breakdown** of who did the work. Unlike the workday skills, this one answers "what happened over a window," not "what should I do today" — so it always establishes the window first.

**Core principle:** Report, never write. Read the state file before offering options. Identify work by title, not by number. Attribute work to the people who did it, from the record — never from inference.

**Announce at start:** "I'm using the project-status skill to put together a status report."

## When to Use

- Someone asks "where do things stand" on this project and across the org
- You need a work-done summary for a standup, retro, or stakeholder update
- You want to see how issues and PRs across repos map to each other
- You want to see who contributed what over the window

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

For each in-window item, use `issue_read` / `pull_request_read` to get title, labels, Priority/Effort/dates, linked issues, and **the people on it** — PR author, issue assignees, and PR reviewers.

Report three groups:
- **Shipped this window** — merged PRs, closed issues
- **In progress** — open items touched in the window, with Priority/Effort/dates
- **Untouched backlog** — open issues not updated in the window (surface the count, not the detail)

Every row in the Shipped and In-progress tables carries a **Who** column. For a PR that's the author; for an issue it's the assignee. An item with no assignee is `—`, never a guess.

### Step 3: Org-Wide Rollup

```
search_issues(query: "org:{owner} updated:{window}")
search_pull_requests(query: "org:{owner} updated:{window}")
```

Group by repo. Per repo: items shipped, items in progress, activity level (active / quiet).

Keep each result's author/assignee — Step 4 aggregates across the whole org, not just this repo.

### Step 4: Who Did What

Build the per-developer breakdown from the PRs already gathered in Steps 2–3. For each in-window PR, pull its commits:

```
pull_request_read(owner, repo, pullNumber, method: "get_commits")
```

That gives per-commit author and message — the raw material for "what did this person actually work on." For commits that landed outside a PR (direct pushes to the default branch), fill the gap with:

```
list_commits(owner, repo, since: "{window start}", until: "{window end}")
```

Both are paginated — request 5–10 at a time and stop once the window is covered.

**Aggregate per person:**
- PRs authored, and which ones merged
- Commit count across those PRs, and the themes those commits touch (read the messages; don't just count)
- Issues assigned and closed
- PRs reviewed

**Attribution rules — these matter more than the numbers:**

- Attribute from the record only: commit author, PR author, assignee, reviewer. Never infer who "probably" did something from a title, a file path, or a code style.
- A commit's **author** is who wrote it; the **committer** may be someone else entirely (rebases, merges, admin pushes). Report the author. Honor `Co-authored-by:` trailers — pair and mob work is shared credit, not the committer's alone.
- One person can appear under several identities (a work handle, a personal handle, a `noreply` email). If two identities are plainly the same person, say so as a question in Notes rather than silently merging them.
- Exclude bots (`dependabot`, `renovate`, `github-actions`, anything with a `[bot]` suffix) from the per-developer breakdown. Note their volume separately if it's material.
- Use the GitHub handle as the identifier. A handle is not a person's name — don't guess a real name, and don't guess pronouns; write "they."

**This is a contribution record, not a scoreboard.** Report what each person worked on. Do not rank developers, compute productivity metrics, editorialize about output ("light week for X"), or draw performance conclusions — commit and PR counts measure none of that, and a PM reading a ranked list will act on it as if they did. If the user explicitly asks for a ranking, give the counts and say plainly what they do and don't measure.

### Step 5: Map Dependencies

Across everything from Steps 2–4:
- `#N` (same-repo) and `owner/repo#N` (cross-repo) references in bodies and comments
- Keywords: "blocks", "blocked by", "depends on", "relates to", "duplicate of"
- Whether this project's open items are blocked by, or blocking, work elsewhere

**This section is read by a PM who is skimming, not cross-referencing.** Identify each item by its **title, rendered as a markdown link**, never by a bare number:

- Link text is the title: `[Fix auth bug in login flow](https://github.com/owner/repo/issues/2)`
- Phrase relationships plainly: "X is blocked by Y (still open)"
- Append a bare `#N` in parentheses only as a lookup aid, never as the primary identifier
- Put `owner/repo` disambiguation in the URL you're building anyway, not in the visible text

A PM should understand each bullet on one read, without opening GitHub.

### Step 6: Generate the Report

## Output Format

```
## Project Status — {window description} (as of YYYY-MM-DD)

### Current Project: owner/repo
Shipped: N merged PRs, M closed issues
In progress: K items

| # | Type | Title | Who | Status | Priority | Effort |
|---|------|-------|-----|--------|----------|--------|
| 12 | PR | Add rate limiting | @alice | merged | High | Medium |
| 9 | Issue | Dashboard metrics | @bob | in progress | Medium | High |
| 14 | Issue | Flaky nightly build | — | in progress | Low | Low |

Backlog untouched this window: J open issues

### Org Rollup: owner
| Repo | Shipped | In Progress | Contributors | Activity |
|------|---------|-------------|--------------|----------|
| repo-a | 3 | 2 | @alice, @bob | active |
| repo-b | 0 | 1 | @carol | quiet |

### Who Did What

**@alice** — 2 PRs merged, 9 commits
- [Add rate limiting](https://github.com/owner/repo/pull/12) — 6 commits, middleware and config plumbing
- [Fix memory leak in background worker](https://github.com/owner/repo-a/pull/5) — 3 commits
- Reviewed [Add SSO login](https://github.com/owner/repo-b/pull/4)

**@bob** — 1 PR open, 4 commits
- [Dashboard metrics](https://github.com/owner/repo/pull/11) — 4 commits, still in review
- Closed [Stale session tokens](https://github.com/owner/repo/issues/8)

### Dependency Map
- [Rework auth token storage](https://github.com/owner/repo-a/issues/7) blocks [Add SSO login](https://github.com/owner/repo-b/issues/4) — still open
- [Add user dashboard with metrics](https://github.com/owner/repo/issues/9) depends on [Stabilize metrics API](https://github.com/owner/repo-c/issues/2) — merged, so now unblocked

### Notes
- Repos with zero activity this window
- Items missing Priority/Effort/dates (every issue should carry all four — flag if found)
- Open items with no assignee — nobody is attributed, flag rather than guess
- Possible duplicate identities (e.g. @alice and alice-work may be the same person — confirm?)
- Bot activity excluded from Who Did What (e.g. 7 dependabot PRs)
```

## Red Flags — STOP

- About to offer "Since last check" without having read the state file
- Filling in a `last_checked` value you didn't read from the file
- Reading the window from `workday.json` — that's the workday skills' file, and its boundaries mean something else
- A Dependency Map bullet whose primary identifier is a number
- About to add a comment, set a field, or close something — this skill reads only
- Attributing work to someone the record doesn't name — an unassigned item is `—`
- Reporting the committer as the author, or dropping a `Co-authored-by:` collaborator
- Ranking developers, scoring output, or characterizing anyone's week — contribution record, not scoreboard
- Guessing a real name or pronouns from a GitHub handle
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
| Per-PR commit authorship | `pull_request_read(method: "get_commits")` |
| Commits with no PR | `list_commits` with `since`/`until` on the default branch |
| Item has no assignee | `—` in the Who column, flagged under Notes |
| Commit author ≠ committer | Credit the author; add `Co-authored-by:` names too |
| Bot accounts (`[bot]`, dependabot, renovate) | Excluded from Who Did What; volume noted separately |
| Same person, two handles | Ask in Notes; never merge identities silently |
| Missing Priority/Effort/dates | Flag under Notes, don't silently omit |
| End of every run | Overwrite `.claude/state/project-status.json` with the current timestamp |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll offer the window options first, then read the state file" | The file's contents determine which options are valid. Reading it after means offering a window that may not exist. |
| "There's no state file, I'll estimate when the last check was" | Never fabricate a timestamp. Say there's no prior check on record. |
| "The report found a stale issue, I'll just fix it while I'm here" | This skill reports only. Surface it and let the user ask for the change. |
| "The window was 'since last check', so no need to update the file" | Every run updates it, whichever window was used. |
| "The PR touches the auth module, and @alice owns auth — I'll credit her" | Attribution comes from the record, not from who usually works where. Unassigned is `—`. |
| "Counting commits per dev is just data, the PM can interpret it" | A ranked list gets acted on as a performance signal. Report what each person worked on; if asked to rank, say what the counts don't measure. |
| "The merge commit is under @bob, so it's his work" | The committer is often not the author. Credit commit authors and `Co-authored-by:` trailers. |
| "@alice and alice-work are obviously the same person, I'll combine them" | Probably — but say so as a question in Notes. Silently merging identities puts words in someone's mouth. |
