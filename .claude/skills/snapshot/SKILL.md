---
name: snapshot
description: Explicitly invoked only — use when the user runs /snapshot or asks for a snapshot by name. Produces a three-layer org report joining live GitHub state against timeline history: current repo detail, org rollup, who did what, plus planned-vs-actual, estimate-vs-effort, and declared-vs-encountered dependencies. Do NOT trigger on conversational phrasing like "where do things stand" or "what's the status" — answer those directly instead.
---

# /snapshot

## Overview

A three-layer, org-scoped, per-developer report: **current repo detail**, an **org-wide rollup**,
and **who did what**. Each layer joins live GitHub state against timeline history — computed at
report time and cached nowhere.

**Core principle:** Read, never author. State comes live from GitHub, history comes from the
timeline, and the value is entirely in joining them.

**Announce at start:** "I'm using the snapshot skill to build your report."

**REQUIRED READING — first, before anything else:** `.claude/.tracking/format.md`. It holds the
paths, bootstrap procedure, cursor schemas, and event format this skill depends on.

**REQUIRED SUB-SKILL:** Use gh-wrapper before running any `gh` command.

## Explicitly Invoked Only

This runs when someone asks for it **by name** — `/snapshot`, or "run a snapshot." It does not fire
on conversational phrasing. "Where do things stand?", "what's the status of the payments work?", and
"how's the week looking?" are questions to answer directly, not triggers for a three-layer org
report.

**Don't use for:** opening a work session or triaging what to do next — that's start-work, which is
scoped to open work rather than to a window.

## Read-Only Means It Never Authors

| Never | Only |
|---|---|
| No timeline events | Its own `~/.claude/<org>.snapshot.json` cursor |
| No commits or pushes to the tracking repo | |
| No issue comments, field writes, closures, or labels | |

It **does** clone the tracking repo if missing and pull it before every run — sync is not
authorship, and a report built on a stale clone is wrong.

If the report surfaces something that should be fixed, surface it and let the user ask. Fixing it is
a separate request.

## Step 0: The Window

**Read the cursor before presenting any options.** Its contents change what you may offer, so this
cannot happen after the user has already picked.

`~/.claude/<org>.snapshot.json`:

```json
{ "schema": 1, "org": "msa1624", "last_checked": "2026-07-25T05:26:35Z" }
```

| What you read | What you may offer |
|---|---|
| A valid `last_checked` | "Since last check" — and show *when*, e.g. "Since last check (2026-07-20 14:30 UTC)", so the user can judge whether it's useful |
| Absent or malformed | Say plainly there's no prior check on record. Offer only the other options. |

Then ask which window, unless the request already named one:

1. **Since last check** — only offer when the read succeeded
2. **Past day**
3. **Past week**
4. **Custom** — ask for an explicit start, and optionally an end

Convert relative language ("since Monday", "yesterday") to absolute `YYYY-MM-DD` before building any
query. Never read the window from `<org>.status.json` — that's the workday skills' cursor and its
boundaries mean something else.

At the **end** of every run, whichever window was chosen, overwrite `last_checked` with the current
timestamp.

## The Process

### Step 1: Preflight

Derive org and repo from `git config --get remote.origin.url`. Bootstrap the tracking clone if
missing, then `git pull --rebase`. See **`.claude/.tracking/format.md` → Bootstrap & Access**.
No write-access check — this skill only reads.

Read `tracks.yml` and the timeline files covering the window. One `git pull` plus local file reads
gives you every developer, every track, every repo — rather than API calls fanned out across the
org. That cheapness is the whole point of the tracking repo.

### Step 2: Current Project Detail

Scoped to this repo, for the window:

```
list_issues(owner, repo, state: "all")            → filter updated_at against the window
list_pull_requests(owner, repo, state: "all")     → filter updated_at against the window
search_issues(query: "repo:{owner}/{repo} state:closed closed:>={window}")
search_pull_requests(query: "repo:{owner}/{repo} state:merged merged:>={window}")
```

For each in-window item, `issue_read` / `pull_request_read` for title, labels, Priority, Effort,
Start date, Target date, linked issues, and **the people on it** — PR author, issue assignees, PR
reviewers.

Three groups: **shipped this window**, **in progress**, and **untouched backlog** (a count, not
detail). Every row carries a **Who** column — PR author, or issue assignee. No assignee is `—`,
never a guess.

### Step 3: Org Rollup

```
search_issues(query: "org:{org} updated:>={window}", sort="updated", order="desc")
search_pull_requests(query: "org:{org} updated:>={window}", sort="updated", order="desc")
```

Group by repo: shipped, in progress, contributors, activity level. Then group by **track**, joining
`tracks.yml` against the timeline — a track spanning three repos is one row, which the per-repo
table cannot show. Follow each track's `parent` and read its title, owner, and dates **live**.

Milestone is available on every issue and is the natural grouping for a release-shaped report, which
cuts across tracks rather than following them. Offer it when the user asks about a release.

### Step 4: Who Did What

Build from the PRs gathered in Steps 2–3:

```
pull_request_read(owner, repo, pullNumber, method: "get_commits")
list_commits(owner, repo, since: "{start}", until: "{end}")   → commits that landed outside a PR
```

Both paginate — request 5–10 at a time and stop once the window is covered. Cross-reference against
the timeline: the events show which sessions touched which threads, which is what turns a commit
list into "what this person was actually working on."

**Aggregate per person:** PRs authored and which merged; commits and the themes they touch (read the
messages, don't just count); issues assigned and closed; PRs reviewed.

**Attribution rules — these matter more than the numbers:**

- Attribute from the record only: commit author, PR author, assignee, reviewer, and the timeline's
  `dev`. Never infer who "probably" did something from a title, a file path, or a code style.
- A commit's **author** wrote it; the **committer** may be someone else entirely (rebases, merges,
  admin pushes). Report the author. Honor `Co-authored-by:` trailers — pair and mob work is shared
  credit. An agent-authored commit co-authored to a person attributes to that person.
- One person can appear under several identities. If two are plainly the same person, say so as a
  **question** in Notes rather than silently merging them.
- Exclude bots (`dependabot`, `renovate`, `github-actions`, anything `[bot]`-suffixed). Note their
  volume separately if it's material.
- Use the GitHub handle as the identifier. A handle is not a name — don't guess a real name, and
  don't guess pronouns; write "they."

**This is a contribution record, not a scoreboard.** Report what each person worked on. Do not rank
developers, compute productivity metrics, editorialize about output ("light week for X"), or draw
performance conclusions — commit and PR counts measure none of that, and a PM reading a ranked list
will act on it as if they did. If the user explicitly asks for a ranking, give the counts and say
plainly what they do and don't measure.

### Step 5: The Four Joins

This is what neither source can produce alone, and what `/snapshot` exists for.

#### Planned vs. actual

| Side | Source |
|---|---|
| Planned | Start date / Target date, **fetched live** from the issue |
| Actual | The timeline — `branch_created` for the real start, `done` for the real finish, latest event for still-open work |

The committed Gantt charts actuals only, precisely so the planned side is never cached. Report
started-late, ran-long, finished-early, and **planned but never started** (an issue with dates and
no `branch_created`).

#### Estimate vs. effort

This org defines **Effort** but no Estimate or Size field
(see **`.claude/.tracking/format.md` → Issue Fields**).
So the comparison available is Effort against **what the timeline shows the work actually took** —
sessions, elapsed days, event count. Report the mismatches: a Low-effort thread spanning two weeks
of sessions, a High-effort thread closed in one.

This is how estimates get calibrated. It is **never** compared across people.

#### Declared vs. encountered dependencies

| Side | Source |
|---|---|
| Declared | Live issue state — whatever `issue_read` surfaces, plus `#N` references and "blocks"/"depends on"/"relates to" prose in bodies and comments |
| Encountered | The timeline's `blocked_by` — what a session actually ran into |

**Both directions of disagreement are worth surfacing:**
- A dependency hit in practice but never declared on the issue
- A declared relationship no session ever ran into

This is the only view that can show them disagreeing — `views/dependencies.md` is built from the
encountered side alone.

#### The complete org rollup, cheaply

One `git pull` plus local file reads covers every developer, track, and repo. Say what the timeline
covers: a repo with no timeline events isn't inactive, it's untracked, and those are different.

### Step 6: Report, Then Write the Cursor

Deliver the report, then overwrite `last_checked`. That is the only file this skill writes.

## Identifying Items

In **tables**, a bare `#N` is fine — the row carries the title.

In the **dependency and planned-vs-actual sections**, which are read by someone skimming rather than
cross-referencing, identify each item by its **title, rendered as a markdown link**:

- Link text is the title: `[Fix auth bug in login flow](https://github.com/owner/repo/issues/2)`
- Phrase relationships plainly: "X is blocked by Y (still open)"
- Append a bare `#N` in parentheses only as a lookup aid, never as the primary identifier
- Put `owner/repo` disambiguation in the URL you're building anyway, not in the visible text

Someone should understand each bullet on one read, without opening GitHub.

## Output Format

```
## Snapshot — {window description} (as of 2026-07-25)
Org: msa1624 | Repo: msa1624/api | Timeline: 3 developers, 2 tracks

### Current Project: msa1624/api
Shipped: 2 merged PRs, 1 closed issue | In progress: 3 | Backlog untouched: 11

| # | Type | Title | Who | Status | Priority | Effort |
|---|------|-------|-----|--------|----------|--------|
| 47 | PR | Refund endpoint | @nilendu | merged | High | Medium |
| 43 | Issue | Refund flow | @nilendu | in progress | High | Medium |
| 51 | Issue | Flaky nightly build | — | in progress | Low | Low |

### Org Rollup
| Repo | Shipped | In Progress | Contributors | Activity |
|------|---------|-------------|--------------|----------|
| api | 2 | 3 | @nilendu, @ali | active |
| web | 0 | 1 | @priya | quiet |

| Track | Parent | Owner | Target | Threads | Status |
|-------|--------|-------|--------|---------|--------|
| payments-v2 | api#38 | @nilendu | 2026-08-15 | 3 (1 done, 1 active, 1 blocked) | active |
| auth-hardening | platform#12 | @ali | 2026-08-01 | 1 (done) | active |

### Who Did What
**@nilendu** — 1 PR merged, 4 commits, 3 sessions
- [Refund endpoint](https://github.com/msa1624/api/pull/47) — 3 commits, refund state machine
- Sessions on payments-v2 across api and web

**@ali** — 1 PR merged, 6 commits, 2 sessions
- [Rate limiter](https://github.com/msa1624/platform/pull/19) — 6 commits, middleware and config
- Reviewed [Refund endpoint](https://github.com/msa1624/api/pull/47)

Bot activity excluded: 7 dependabot PRs.

### Planned vs. Actual
- [Refund flow](https://github.com/msa1624/api/issues/43) — planned 2026-07-20 → 2026-07-28,
  actually started 2026-07-25. Five days late starting; target unchanged.
- [Payment UI](https://github.com/msa1624/web/issues/22) — planned to start 2026-07-18,
  no branch_created yet. Planned but never started.

### Effort vs. Reality
- [Refund flow](https://github.com/msa1624/api/issues/43) — Effort: Medium, but 3 sessions across
  8 days and still open. Worth a second look at the estimate.

### Dependencies — declared vs. encountered
**Hit but never declared:**
- [Payment UI](https://github.com/msa1624/web/issues/22) was blocked by
  [Refund flow](https://github.com/msa1624/api/issues/43) on 2026-07-25 — no relationship recorded
  on either issue.

**Declared but never encountered:**
- [Checkout endpoint](https://github.com/msa1624/api/issues/41) declares a dependency on
  [Rate limiter](https://github.com/msa1624/platform/issues/12) — no session ever hit it.

### Notes
- Repos with no timeline coverage: msa1624/web-legacy (untracked, not inactive)
- Items missing Priority/Effort/dates
- Open items with no assignee — flagged, not guessed
- Possible duplicate identities (@ali and ali-work — confirm?)
```

## Red Flags — STOP

- Firing on "where do things stand" — that's a question, not a `/snapshot` invocation
- Offering "since last check" without having read the cursor
- Filling in a `last_checked` you didn't read
- Reading the window from `<org>.status.json`
- Appending a timeline event, committing to the tracking repo, or touching an issue
- Building planned dates from the timeline, or actual dates from the issue — they come from opposite
  sources, and swapping them makes the whole join meaningless
- Reporting a `Size` or `Estimate` value in an org that defines neither
- A dependency bullet whose primary identifier is a number
- Attributing work to someone the record doesn't name
- Reporting the committer as the author, or dropping a `Co-authored-by:` collaborator
- Ranking developers, scoring output, or characterizing anyone's week
- Guessing a real name or pronouns from a GitHub handle
- Calling a repo with no timeline events "inactive"
- Finishing without overwriting the cursor

## Quick Reference

| Situation | Action |
|---|---|
| Invoked conversationally | Don't run. Answer the question directly. |
| Very start of every run | Read `<org>.snapshot.json` before offering window options |
| Cursor missing or malformed | Say there's no prior check; don't offer "since last check" |
| Relative window | Convert to absolute `YYYY-MM-DD` first |
| Current-repo scope | `list_*` / `search_*` with `repo:{owner}/{repo}` |
| Org scope | `search_*` with `org:{org}` — `list_*` can't span an org |
| Track scope | `tracks.yml` + timeline, following `parent` for live title/owner/dates |
| Release-shaped report | Group by Milestone, which cuts across tracks |
| Planned dates | Live from the issue's Start/Target date |
| Actual dates | The timeline's `branch_created` and `done` |
| Per-PR commit authorship | `pull_request_read(method: "get_commits")` |
| Commits with no PR | `list_commits` with `since`/`until` |
| Item has no assignee | `—`, flagged in Notes |
| Commit author ≠ committer | Credit the author, plus `Co-authored-by:` names |
| Bot accounts | Excluded from Who Did What; volume noted separately |
| Same person, two handles | Ask in Notes; never merge identities silently |
| Repo with no timeline events | Untracked, not inactive. Say which. |
| End of every run | Overwrite `last_checked` |
| About to run a `gh` command | Stop, use gh-wrapper |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "They asked how things are going, close enough to /snapshot" | It's explicitly invoked. A three-layer org report nobody asked for is noise. Answer the question. |
| "I'll offer the window options first, then read the cursor" | The cursor's contents determine which options are valid. Reading it after means offering a window that may not exist. |
| "No cursor file, I'll estimate when the last check was" | Never fabricate a timestamp. Say there's no prior check on record. |
| "The report found a stale issue, I'll just fix it while I'm here" | This skill reports. Surface it and let the user ask for the change. |
| "The timeline has the target date on it too, I'll read it from there" | It doesn't, by design — that would be a cached copy of live state. Planned comes from the issue, always. |
| "There's no Estimate field, so I'll compare Effort to Effort" | Compare Effort to what the timeline shows the work took. That's the calibration signal available here. |
| "The window was 'since last check', so no need to update the cursor" | Every run updates it, whichever window was used. |
| "This PR touches auth, and @ali owns auth — I'll credit them" | Attribution comes from the record, not from who usually works where. Unassigned is `—`. |
| "Counting commits per dev is just data, the PM can interpret it" | A ranked list gets acted on as a performance signal. Report what each person worked on. |
| "@ali and ali-work are obviously the same person, I'll combine them" | Probably — but say so as a question. Silently merging identities puts words in someone's mouth. |
| "repo-legacy has no events, so it's been quiet" | It has no events because nobody ran these skills there. Untracked ≠ inactive. |
