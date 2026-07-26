---
name: snapshot
description: Use when the user explicitly runs /snapshot or asks for a snapshot by name. Do NOT trigger on conversational phrasing like "where do things stand", "what's the status", or "how is the team doing" — answer those directly instead.
---

# /snapshot

## Overview

A three-layer, org-scoped, per-developer report: **current repo detail**, an **org-wide rollup**,
and **who did what**. Each layer joins live GitHub state against timeline history — computed at
report time and cached nowhere.

**Announce at start:** "I'm using the snapshot skill to build your report."

**READ *The Substrate* BELOW FIRST.** It holds the paths, bootstrap procedure, cursor schema, and
event format this skill depends on.

**REQUIRED SUB-SKILL:** Use gh-wrapper before running any `gh` command. It routes GitHub access down
a three-rung ladder — MCP tool, then `gh` flag, then `gh api graphql` — and nothing is reported
impossible until all three have been walked.

## The Iron Law

```
READ, NEVER AUTHOR.
STATE COMES LIVE. HISTORY COMES FROM THE TIMELINE.
REPORT WHICH COMPARISON YOU ACTUALLY RAN.
```

The value is entirely in joining the two sources. A degraded join presented as the full analysis is
worse than no join — it looks complete to the person acting on it.

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

**But it clones a repo that exists; it never creates one.** Cloning is sync, creating is authorship,
and creating a repo is outward-facing. If `{org}/tracking` does not exist, say so, name start-work as
the way to create it, and run the layers that don't need it — reporting the timeline-dependent joins
as not-run rather than quietly omitting them.

If the report surfaces something that should be fixed, surface it and let the user ask. Fixing it is
a separate request.

## The Substrate

<!-- SUBSTRATE: the five principles, paths, bootstrap, tracks.yml, issue fields, and the event
     format are shared with start-work and end-work — keep in sync. Sections marked (snapshot only)
     are not. -->

### The Five Principles

When a case isn't covered, decide by these.

1. **State vs. event.** *State* is what is true now — status, assignee, blockers — and lives only in
   GitHub, fetched live, never cached. *Events* are what happened, when, by whom, and live only in
   the timeline, never re-derived from GitHub. **A report needing both fetches state live and joins
   history against it** — which is this skill's entire job.
2. **Pointer, not content.** A track's registry entry points at its parent issue plus the few facts
   GitHub cannot express.
3. **Append-only.** Timeline events are written once and never rewritten.
4. **No ranking.** Nothing generated compares people. No durations, ever.
5. **Out-of-band.** The record never lives on a branch of the work it describes.

### Paths

Derive org and repo once per run — `git config --get remote.origin.url`. Every path follows
deterministically. **Nothing records these paths and nothing caches them.**

| What | Path |
|---|---|
| Tracking clone | `~/.claude/.tracking/<org>/` |
| Snapshot cursor | `~/.claude/<org>.snapshot.json` |

`~/.claude/<org>.status.json` belongs to start-work and end-work. **Never open it** — its boundaries
mean something else, and this skill's window never comes from there.

### Write surfaces — one, and nowhere else

| Location | Writes permitted |
|---|---|
| `~/.claude/<org>.snapshot.json` | The `last_checked` timestamp. Nothing else, anywhere. |

No events, no commits, no issue comments, no field writes, no labels, no closures.

### Bootstrap *(snapshot variant — clones, never creates)*

**B1.** `git -C ~/.claude/.tracking/<org> rev-parse --git-dir 2>/dev/null`. Present → pull. Missing →
`search_repositories(query: "repo:{org}/tracking")`.

**B2.** Remote exists but no clone → `git clone https://github.com/{org}/tracking.git
~/.claude/.tracking/{org}`, and say where.

**Remote does not exist → do NOT offer to create it.** Cloning is sync; creating is authorship, and
this skill does the first only. Report that `{org}` has no tracking repo, name start-work as the way
to create one, and run degraded — see Step 1.

**B3.** `git -C ~/.claude/.tracking/<org> pull --rebase`, every run. There is no stored sync
timestamp and nothing is conditional on one. **No write-access check** — this skill only reads.

### `<org>.snapshot.json`

```json
{ "schema": 1, "org": "msa1624", "last_checked": "2026-07-25T05:26:35Z" }
```

That is the whole file.

### Tracks & threads

```yaml
tracks:
  - id: payments-v2
    parent: msa1624/api#38          # title, owner, dates all live here
    status: active                  # active | paused | done | abandoned
    exit_criteria: "checkout flow live for 100% of traffic"
```

**Four fields, per principle 2.** A track's title, owner, and dates are **not** stored — follow
`parent` and read them live. A track spanning three repos is one entry, which is what the per-repo
table cannot show. A milestone is *not* a track: it is a shipping checkpoint owned by GitHub, and one
track's threads may span several milestones.

### Issue Fields in this org

**Discover at runtime — never hardcode, never recall:**

```
list_issue_fields(owner: "{org}")        → org fields and their valid options
```

At the last check `msa1624` defined exactly these four. **Treat this as the expected result of that
call, not the definition** — if a run discovers a different set, the discovered set wins.

| Field | Type | Valid values |
|---|---|---|
| Priority | single-select | Urgent · High · Medium · Low |
| Effort | single-select | High · Medium · Low |
| Start date | date | `YYYY-MM-DD` — the planned start |
| Target date | date | `YYYY-MM-DD` — the planned finish |

**`Size` and `Estimate` are not defined in this org.** Never report a value for either. Effort is the
only sizing signal, and the sizing join says so in its own label.

**Four** mechanisms sit on the same issue and are read differently: **Issue Fields** (above),
**Milestone** (a native issue field), **Relationships** (the dependencies API), and **Projects v2
board membership** (`issue.projectItems`). **Do not conflate them** — a value read from one and
reported as another is wrong even when it looks right. An issue can carry every field the org
defines and be on no board at all.

**Board membership is worth a Notes line because it fails silently.** Auto-add workflows are usually
scoped to some repos and not others, so issues created outside that scope land nowhere and look
completely normal. Discover the org's projects once, with the fields
(`organization(login:){projectsV2}`, or `user(login:)` on a personal account — projects are **not**
org-only), then report open issues that are on no board. **Report only — this skill never adds one.**

### Event timeline *(reading only)*

`timeline/YYYY-MM/<dev>.jsonl` — one JSON object per line. This skill **reads** it and never appends.

| Field | What it tells you |
|---|---|
| `ts` | UTC, ISO 8601, always |
| `session` | the id shared by every event in one sitting — this is what turns a commit list into "what this person was working on" |
| `dev` | the GitHub handle the work is attributed to |
| `event` | `session_start` · `session_resume` · `branch_created` · `progress` · `blocked` · `unblocked` · `done` · `handoff` · `session_end` |
| `track` · `thread` · `repo` · `branch` | thread-scoped events only; `thread` is always `owner/repo#N` |
| `title` | on `branch_created`: the thread's title **as of when work began**. Never refreshed, never authoritative |
| `commits` | short SHAs — an entry with none is unverified, and renders that way |
| `blocked_by` | `owner/repo#N` — a dependency **actually hit** while working |

**`branch_created` fixes a thread's actual start; `done` fixes its actual finish.** Those two are the
only source for the actual side of any join. Planned dates come from the issue, live. **Swapping them
makes the join meaningless.**

**There is no duration or hours field, by design.** Do not compute one.

### Attribution

Attribute from the record only: commit **author** (not committer — they differ after rebases, merges,
and admin pushes), PR author, assignee, reviewer, and the timeline's `dev`. Honour
`Co-authored-by:` — pair and mob work is shared credit, and an agent-authored commit co-authored to a
person attributes to that person. Exclude bots (`dependabot`, `renovate`, `github-actions`, anything
`[bot]`-suffixed).

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

Derive org and repo from `git config --get remote.origin.url`. Clone the tracking repo if it exists
but isn't cloned, then `git pull --rebase`. See **_The Substrate_ → Bootstrap**, whose B2
table names `/snapshot` explicitly: it clones, and it never offers to create. No write-access check —
this skill only reads.

**If `{org}/tracking` does not exist**, run degraded rather than stopping: Steps 2–4 work against
GitHub alone, and the planned-vs-actual, sizing-vs-actual, and declared-vs-encountered joins each
report *"could not run — no timeline for this org."* Say once, near the top, that the org has no
tracking repo and that start-work will offer to create one.

Read `tracks.yml` and the timeline files covering the window. One `git pull` plus local file reads
gives you every developer, every track, every repo — rather than API calls fanned out across the
org. That cheapness is the whole point of the tracking repo.

**Discover the fields once, here, before dispatching anything:**

```
list_issue_fields(owner: "{org}")   → the fields, their types, and single-select options
```

**This runs exactly once per run and the result is passed to every agent.** No agent discovers
fields for itself. Four agents discovering independently can return four different mappings, and the
report would render them as one schema — wrong with no visible symptom. It also makes "read at call
time, never from memory" checkable from outside: any field name in a payload that isn't in this
result is rejected.

Map what comes back onto the roles in target-workflow §5 — ordering, planned start, planned finish,
sizing. A role with no field is recorded as unfilled here, and every join that needs it will report
itself not-run.

### Step 1.5: Dispatch the Research Wave

**Spawn four `Explore` subagents in one message, in parallel.** All read-only; all receive the single
field discovery above, plus whatever local reads they need — they must not open the tracking clone
themselves.

#### Shared preamble — goes in every brief

```
You are a READ-ONLY research agent. Return findings; never act on them.

NEVER call issue_write, add_issue_comment, sub_issue_write, setIssueFieldValue, any
GraphQL mutation, or gh issue edit/create/close/comment. You CAN call these tools;
not calling them is the rule you are being held to. This report writes NOTHING to
GitHub — if something seems to need a write, return it in asks[].
DO NOT read the timeline, tracks.yml, or status.json. Everything you must compare
against is supplied in your INPUT. Sourcing both sides of a comparison yourself
turns it into a set compared with itself, which looks fine and means nothing.
DO NOT run list_issue_fields. The field set is supplied. Several agents discovering
independently can return several mappings, which the report would render as one.

Ladder: MCP tool → gh flag → gh api graphql. Never report something unreachable
without walking all three and naming all three. MCP missing is not a capability gap:
say so once (rung_reason "mcp_absent") and work rungs 2-3 for the whole run.
Cross-repo rollups start at rung 3 by ROUTING — one GraphQL query costs 1 point where
the REST equivalent is 18 requests. Say rung_reason "routing".
NEVER read issue_dependencies_summary to decide whether something is blocked.
The fields are blockedBy / blocking on Issue — NOT blockedByIssues.
search_* takes dedicated sort/order params — never `sort:` inside the query string.
list_* cannot span an org; org scope needs search_* with org:{org}.
HTTP 200 can carry an "errors" key. Nulls under errors are FAILURES, not absences.

NO RANKING. Never sort by a count. Never emit a key named rank, score, total,
percentile, top_*, productivity, or velocity. Never write an evaluative word about a
person or their week — not "light", "heavy", "slow", "quiet", "impressive".
Attribute from the record only: commit author (never committer), PR author, assignee,
reviewer. Never infer from a title, a file path, or who usually works where.

Every reference is owner/repo#N. Return exactly one fenced json block as your LAST
message, in this envelope:
{ "agent","status":"ok|partial|failed","rung","rung_reason","covered":[],
  "not_covered":[],"surface_log":[{"call","rung","class":"read","ok"}],
  "asks":[],"unavailable":[],"data":{} }
covered/not_covered are MANDATORY. A repo you could not read is NOT a repo with no
activity — it goes in not_covered.
```

#### Brief 1 — repo detail and org rollup *(Steps 2–3)*

> **INPUT you supply:** `current_repo`, window, `fields[]`, and `tracks[]` + `track_threads{}` read
> from `tracks.yml` and the timeline.
>
> Follow each track's `parent` and read its title, owner, and dates **live** — that is what keeps
> "pointer, not content" true across the boundary. Never echo back a stored copy of live state.
>
> **`data`:** `repo_detail{repo, counts{shipped, in_progress, backlog_untouched}, rows[]}` where each
> row is `{ref, kind, title, who, status, fields[], url}`; `org_rollup[]` —
> `{repo, shipped, in_progress, contributors[], activity}`; `track_rollup[]` —
> `{track, parent, parent_title, parent_owner, parent_fields[], threads{total,done,active,blocked},
> repos_spanned[], registry_status}`.
>
> **`who: null` when unassigned — never a guess.** `fields[].value: null` means the item lacks that
> field, which is a finding, not a row to omit. `activity` is `active`/`quiet`/`none` and describes
> **volume, not people**. `backlog_untouched` is a count only — never enumerate it.

#### Brief 2 — who did what *(Step 4)*

> **INPUT you supply:** window, repo list, and `timeline_activity{}` per dev (sessions, threads,
> tracks) read from the timeline.
>
> Run your own org-scoped PR search rather than waiting on Brief 1 — one extra cheap search buys a
> fully parallel wave. Echo `timeline_activity`'s counts; never recompute them.
>
> **`data`:** `people{}` — **a map keyed by handle, emitted in alphabetical order, never an array**,
> each `{prs_authored[], prs_reviewed[], commits[], issues_assigned[], issues_closed[], themes[],
> timeline_sessions, timeline_tracks[]}`. Plus `bots_excluded[]`, `identity_questions[]`,
> `unattributed[]`.
>
> **This is a contribution record, not a scoreboard.** The map shape exists so there is no ordering a
> renderer could mistake for a leaderboard. `themes` is **at most five noun phrases lifted from
> commit messages** — describe the work, never the worker. One person with several handles goes in
> `identity_questions` with `phrased_as_question` filled in, **never silently merged**. A commit whose
> author isn't on the record stays in `unattributed`. The handle is the identifier: don't guess a real
> name from it, and don't guess pronouns — write "they."

#### Brief 3 — planned vs. actual, and sizing vs. actual

> **INPUT you supply:** `roles{planned_start, planned_finish, sizing}`, `fields[]`, threads, and
> `actuals[]` built **only** from `branch_created` and `done` events —
> `{thread, first_branch_created, done, latest_event, session_count, event_count, has_commit_shas}`.
>
> **One source per side, and they are not interchangeable.** Planned dates and sizing come from a
> **live issue fetch**; actuals come from `actuals[]`. Building planned dates from the timeline, or
> actuals from the issue, makes the whole join meaningless.
>
> **A `null` role means that join does not run.** You have no other date field to reach for and no way
> to invent one — return `ran: false` with a `reason` and a `phrase`, and `substituted: false`.
>
> **`data`:** `join_planned_vs_actual{ran, planned_source, actual_source, rows[], skipped[]}` with
> `verdict` from the closed enum `on_plan` · `started_late` · `started_early` · `ran_long` ·
> `finished_early` · `planned_never_started` · `no_planned_dates` · `no_actuals`; and
> `join_sizing_vs_actual{ran, comparison_label, caveat, rows[], cross_person_comparison}`.
>
> **`comparison_label` is required and must name the fields actually passed in** — "Effort against
> sessions the timeline shows", never "estimate vs. actual". Presenting one signal as two is the
> failure this join is most prone to. **`cross_person_comparison: false` is a required literal.**
> "Planned but never started" — dates on the issue, no `branch_created` — is one of the most useful
> things you produce; always report it.

#### Brief 4 — declared vs. encountered dependencies

> **INPUT you supply:** threads, and `encountered[]` built **only** from timeline `blocked_by` events.
>
> `encountered` is ground truth about what a session hit. You cannot verify it and must not try.
>
> **`data`:** `declared[]`, `prose_hints[]`, `diff{hit_not_declared[], declared_not_hit[]}`,
> `ready_now[]`, `still_blocked[]`.
>
> **Both directions of disagreement matter**: a dependency hit in practice but never declared, and a
> declared relationship no session ever ran into. Never infer a dependency from a shared label, a
> shared milestone, a similar title, or two issues touching the same file.

#### The return gate — run before rendering a line

| Gate | On failure |
|---|---|
| **Envelope** parses and carries every required field | Treat as no-return. **Never scrape values out of prose.** |
| **Write-class** — every `surface_log[].class == "read"`, no `call` matching `issue_write`, `add_issue_comment`, `setIssueFieldValue`, `^mutation`, `gh issue (edit\|create\|close\|comment)` | **Discard the whole payload** and say a read-only agent attempted a write — in a skill whose Iron Law is READ, NEVER AUTHOR, that is the loudest possible finding. |
| **No ranking** — `people` keys alphabetical; no `rank`/`score`/`total`/`percentile`/`top_*`/`velocity` key; nothing sorted by a count; `themes` free of evaluative words | **Drop the layer.** Say the contribution layer could not be rendered safely. |
| **Comparison label** names the roles you actually passed in | Reject the join; print it as not-run. |
| **Discovery** — every field name is in this run's `list_issue_fields` | Drop it; report that field unset, naming it. |
| **Existence** — every `owner/repo#N` resolves | Drop the ref. If it was load-bearing — one side of a dependency edge, a track's parent — **the containing join reports itself not-run** rather than rendering with a hole. `data: null` with an `errors` block at HTTP 200 is a permissions failure, **not** a hallucination. |
| **Ladder honesty** — unreachability claims backed by rungs 1, 2 **and** 3, or `mcp_absent` | Unproven. **Re-walk the ladder yourself.** |
| **Coverage** — `not_covered[]` printed | Never omit it. |

**Agents return rows; you render them.** That is what keeps principle 4 enforceable — you cannot
reliably strip editorializing out of a paragraph after the fact, but you can refuse to accept
anything that isn't structured.

**You write the "which comparison I ran" line, never the agent.** An agent that ran a partial join is
the worst-placed thing in the system to describe how partial it was. Build it from the union of every
brief's `covered` / `not_covered`, and print `phrase` verbatim for any join that came back
`ran: false`.

**If a brief fails**, retry once narrowed, then run that layer's inline procedure below yourself and
say which layer ran degraded. Steps 2–5 remain both the specification and the fallback.

### Step 2: Current Project Detail

*(Delegated to Brief 1. This section is what it returns, and your fallback if it doesn't.)*

Scoped to this repo, for the window:

```
list_issues(owner, repo, state: "all")            → filter updated_at against the window
list_pull_requests(owner, repo, state: "all")     → filter updated_at against the window
search_issues(query: "repo:{owner}/{repo} state:closed closed:>={window}")
search_pull_requests(query: "repo:{owner}/{repo} state:merged merged:>={window}")
```

Field values come from the **single discovery in Step 1**, passed down — never a second
`list_issue_fields` call and never a remembered list of names.

Then for each in-window item, `issue_read` / `pull_request_read` for title, labels, **the discovered
field values**, linked issues, and **the people on it** — PR author, issue assignees, PR reviewers.

Three mechanisms sit on the same issue and are read differently: **Issue Fields** (discovered
above), **Milestone** (a native issue field), and **Relationships** (the dependencies API). Do not
conflate them — a value read from one and reported as another is wrong even when it looks right.

Three groups: **shipped this window**, **in progress**, and **untouched backlog** (a count, not
detail). Every row carries a **Who** column — PR author, or issue assignee. No assignee is `—`,
never a guess.

### Step 3: Org Rollup

*(Delegated to Brief 1, in the same call as Step 2.)*

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

*(Delegated to Brief 2, which runs its own PR search rather than waiting on
Brief 1 — one extra cheap search buys a fully parallel wave.)*

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

*(Joins 1–2 are delegated to Brief 3, join 3 to Brief 4.
Join 4 stays here — delegating a `git pull` plus local file reads would cost more than it saves.)*

**You write the "which comparison I ran" line, not the agent.** An agent that ran a partial join is
the worst-placed thing in the system to describe how partial it was. Build that line from the union
of every agent's `covered` / `not_covered`, and print `phrase` verbatim for any join that came back
`ran: false`.

#### Planned vs. actual

| Side | Source |
|---|---|
| Planned | The planned-start and planned-finish fields — `Start date` / `Target date` in this org — **fetched live** from the issue |
| Actual | The timeline — `branch_created` for the real start, `done` for the real finish, latest event for still-open work |

The committed Gantt charts actuals only, precisely so the planned side is never cached. Report
started-late, ran-long, finished-early, and **planned but never started** (an issue with dates and
no `branch_created`).

If either role has no field in this org, say the join could not run rather than substituting a
different date.

#### Sizing vs. actual

This org defines **Effort** but no Estimate or Size field
(see *The Substrate* → Issue Fields in this org).
So the comparison available is the sizing field against **what the timeline shows the work actually
took** — sessions, elapsed days, event count. Report the mismatches: a Low-effort thread spanning
two weeks of sessions, a High-effort thread closed in one.

**Name the comparison you ran.** Write "Effort vs. sessions the timeline shows", not "estimate vs.
actual" — the report must not imply an estimate that was never recorded. One signal is one signal;
presenting it as two is the failure this join is most prone to.

This is how estimates get calibrated. It is **never** compared across people.

#### Declared vs. encountered dependencies

| Side | Source |
|---|---|
| Declared | Live issue state — the Relationships dependencies API, plus `#N` references and "blocks"/"depends on"/"relates to" prose in bodies and comments |
| Encountered | The timeline's `blocked_by` — what a session actually ran into |

**Both directions of disagreement are worth surfacing:**
- A dependency hit in practice but never declared on the issue
- A declared relationship no session ever ran into

This is the only view that can show them disagreeing — `views/dependencies.md` is built from the
encountered side alone, **by design**. The declared side is readable and writable (rung 2); it is
excluded from the committed view because the timeline owns what a session actually hit, not because
the Relationship could not be reached.

Read the dependency list endpoint, never `issue_dependencies_summary` — the counter lags a write by
about a second and reads as "no dependencies" when there are some. See gh-wrapper's Read-After-Write
Trap.

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

The field columns below are **this org's discovered fields at the time of writing**, not a fixed
schema. Build the columns from what `list_issue_fields` returned this run.

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

### Sizing vs. actual — Effort against sessions the timeline shows
*(This org records no Estimate or Size field, so this is one signal against the timeline, not a
planned-vs-recorded comparison.)*
- [Refund flow](https://github.com/msa1624/api/issues/43) — Effort: Medium, but 3 sessions across
  8 days and still open. Worth a second look at the sizing.

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
- Items missing one or more discovered field values
- Open items on no Projects v2 board: msa1624/api#6, msa1624/web#2 (payments-board exists;
  its auto-add appears scoped to msa1624/api only — reported, not changed)
- Open items with no assignee — flagged, not guessed
- Possible duplicate identities (@ali and ali-work — confirm?)
```

## Red Flags — STOP

- Firing on "where do things stand" — that's a question, not a `/snapshot` invocation
- Offering to create the tracking repo — `/snapshot` clones what exists and creates nothing
- Offering "since last check" without having read the cursor
- Filling in a `last_checked` you didn't read
- Reading the window from `<org>.status.json`
- Appending a timeline event, committing to the tracking repo, or touching an issue
- Building planned dates from the timeline, or actual dates from the issue — they come from opposite
  sources, and swapping them makes the whole join meaningless
- Reporting a `Size` or `Estimate` value in an org that defines neither
- Reading field names from memory instead of `list_issue_fields`
- Letting a research agent run its own `list_issue_fields` instead of receiving the one discovery
- Letting an agent write the "which comparison I ran" line — it is the worst-placed thing in the
  system to describe how partial its own join was
- Reporting a join as run when the agent that produced it reported partial coverage
- Passing agent prose into the report instead of re-rendering its rows
- Rendering any agent payload before it has passed the return gate
- Dropping `not_covered[]` because the report already looks long
- Presenting a degraded join as the full analysis, without naming the comparison you ran
- Substituting a different field when a role has no field, instead of saying the join couldn't run
- Reading `issue_dependencies_summary` to decide whether something is blocked
- A dependency bullet whose primary identifier is a number
- Attributing work to someone the record doesn't name
- Reporting the committer as the author, or dropping a `Co-authored-by:` collaborator
- Ranking developers, scoring output, or characterizing anyone's week
- Guessing a real name or pronouns from a GitHub handle
- Calling a repo with no timeline events "inactive"
- Adding anything to a Projects v2 board — this skill reports membership, never writes it
- Treating an issue's Issue Field values as evidence it is on a board; they are separate
  mechanisms and an issue can have every field and no board
- Concluding a personal account has no projects from an empty `organization(...)` query
- Finishing without overwriting the cursor

**The first group means: you are about to run when you shouldn't, or write when you must not. The
rest mean: you are about to put something in a report that the sources do not support.**

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
| Which fields exist | `list_issue_fields` **once**, in Step 1, passed to every agent |
| Which boards exist | `organization(login:){projectsV2}` **once**, in Step 1, passed down |
| Issue is on no board | Notes line. Report it; never add it. |
| Research | Four agents, one message, in parallel — then the return gate before rendering |
| An agent failed | Retry once narrowed, then run that layer's inline procedure and say it ran degraded |
| No tracking repo for the org | Report it, name start-work, run the GitHub-only layers. Never offer to create it. |
| Planned dates | Live from the planned-start / planned-finish fields on the issue |
| Actual dates | The timeline's `branch_created` and `done` |
| A role has no field | Say the join couldn't run. Never substitute a different field. |
| "Is this blocked?" | The dependency list endpoint, never `issue_dependencies_summary` |
| Per-PR commit authorship | `pull_request_read(method: "get_commits")` |
| Commits with no PR | `list_commits` with `since`/`until` |
| Item has no assignee | `—`, flagged in Notes |
| Commit author ≠ committer | Credit the author, plus `Co-authored-by:` names |
| Bot accounts | Excluded from Who Did What; volume noted separately |
| Same person, two handles | Ask in Notes; never merge identities silently |
| Repo with no timeline events | Untracked, not inactive. Say which. |
| End of every run | Overwrite `last_checked` |
| About to run a `gh` command | Stop, use gh-wrapper |

## Rationalization Prevention

| Excuse | Reality |
|---|---|
| "They asked how things are going, close enough to /snapshot" | It's explicitly invoked. A three-layer org report nobody asked for is noise. Answer the question. |
| "I know this org's fields, discovery is a wasted call" | Recall is not discovery. An admin can change the set and the report would be wrong with no sign of it. |
| "Each agent can discover the fields it needs" | Four discoveries can disagree, and the report would show one schema built from four. Discover once, pass it down. |
| "The agent's summary paragraph reads well, I'll use it" | Then principle 4 is enforced by hoping a subagent chose its adjectives carefully. Take rows, render them yourself. |
| "The dependency agent only covered 4 of 7 threads, but the join still says something" | It says something about 4 threads. Print `not_covered` next to it, or the reader will take it for all 7. |
| "There's no tracking repo, so /snapshot can't run" | Three layers work off GitHub alone. Run them, and report the three timeline joins as not-run. |
| "There's no tracking repo — I'll create it while I'm here" | Cloning is sync; creating is authorship. This skill does the first only. Name start-work and move on. |
| "One of the joins can't run, I'll just present the other three" | Present them, and say the fourth didn't run and why. A silently missing join reads as "nothing to report there." |
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

## The Bottom Line

**Read, never author. Name the comparison you ran.**

A report is only worth what its least-supported line is worth. A guessed attribution, a cached
planned date, and a one-signal join presented as two all mislead the person acting on it — and none
of them look wrong on the page.
