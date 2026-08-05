---
name: end-work
description: Use when ending a work session, wrapping up, stopping for the day, or handing off in-flight work — before reporting that a session is finished or that work is ready for someone else to pick up
---

# End Work

## Overview

Close the session: land the record of what happened, update the issues that moved, regenerate the
org views, and leave the developer knowing exactly what is still uncommitted and where.

**Core principle:** Uncommitted or unpushed work blocks a clean handoff. Everything else is
reporting.

**Announce at start:** "I'm using the end-work skill to wrap up your session."

**Two entry points, one behaviour.** A developer wraps up, *or* start-work found a session 36h+ old
that was never closed and invoked this skill to recover it (start-work → *Step 2.5*). **Nothing here
changes between the two.** The cursor is the whole interface: you read `<org>.status.json`, find the
session, and derive the window from `session.started_at` — which on a recovery run is simply further
back than usual. Take no arguments, special-case nothing, and above all **never invoke start-work**:
recovery runs one way only, and a skill that called back would loop.

**READ *The Substrate* BELOW FIRST.** It holds the paths, bootstrap procedure, cursor schema, event
format, and view-generation rules this skill depends on.

**REQUIRED SUB-SKILL:** Use gh-wrapper before running any `gh` command. It routes GitHub access down
a two-rung ladder — a `gh` flag, then `gh api graphql` — and nothing is reported
impossible until both have been walked.

**Write surfaces, per target-workflow §2:** the tracking clone and cursor files; issue comments,
labels, state, assignees, and field values on issues the session touched; and **new PRs over
commits the developer already pushed**. **Never an issue body, never an existing PR, never a
product repo's file contents.**

**The PR surface is creation only.** Never merge, never review, never approve, never rewrite an
open PR's body or title. A PR opened too early is caught by its reviewer; a merge is caught by
nobody, and that difference is the whole licence for this write.

## The Iron Law

```
NO CLEAN HANDOFF WITH UNCOMMITTED OR UNPUSHED WORK
```

Checked first, on every run, and reported at the top. Not a footnote, not "worth mentioning."

**The check runs over the worktree set derived in Step 1** — every worktree the session touched
**plus the repo set** (the repo the developer is standing in, or every repo in their workspace when
they're standing above them), and with no session open, the repo set plus every repo on their
timeline since the window. A session that branched in three repos leaves work in three trees, and the
developer wraps up in one of them.

**It is never `session.threads[]` alone, and never empty.** On a no-session run that list is empty,
and iterating it silently checks nothing — on precisely the run where nobody opened a session and
work is likeliest to be sitting uncommitted.

**And it is never delegated.** A subagent the skill cannot see into reporting "clean" is exactly the
failure that ships someone's uncommitted work. It runs here, before any research is dispatched.

## The Substrate

<!-- SUBSTRATE: the five principles, paths, bootstrap, tracks.yml, issue fields, and the event
     format are shared with start-work and snapshot — keep in sync. Sections marked (end-work only)
     are not. -->

### The Five Principles

When a case isn't covered, decide by these.

1. **State vs. event.** *State* is what is true now — status, assignee, blockers — and lives only in
   GitHub, fetched live, never cached. *Events* are what happened, when, by whom, and live only in
   the timeline, never re-derived from GitHub, because the past does not change.
2. **Pointer, not content.** A track's registry entry points at its parent issue plus the few facts
   GitHub cannot express. If a field exists on the issue, the registry does not store it.
3. **Append-only.** Timeline events are written once and never rewritten. A correction is a new event.
4. **No ranking.** Nothing generated compares people. No durations, ever.
5. **Out-of-band.** The record never lives on a branch of the work it describes. Branch identity is
   *data on an event*, never the *location* of one.

### Paths

Resolve three things once per run, before touching anything. Every path below follows
deterministically from them. **Nothing records these paths and nothing caches them.**

**1. The base** — the working directory the skill was invoked in, as an **absolute** path (`pwd`).
Resolve it once and reuse that absolute form everywhere. A bare relative path is not good enough:
this skill iterates `session.threads[].worktree` and `cd`s between product repos, and a relative
base silently retargets the moment it does.

**2. The layout and the repo set.** The base is one of two shapes, and one command tells you which:

```bash
git -C <base> rev-parse --show-toplevel 2>/dev/null
```

| Result | Layout | Repo set | Current repo |
|---|---|---|---|
| A path | **R** — the base is, or sits inside, an org repo | that one repo | it |
| Nothing | **P** — the base is a parent of org repo clones | every depth-1 child holding a `.git`, mapped to `owner/repo` from its remote | **none** |

**Layout R is the one-element case of layout P, not a separate mode.** Scan one level down, never
recursively — a workspace's repos are its children, and walking deeper turns a vendored checkout into
a candidate product repo. **In layout P every child belongs to the org**; a child whose owner differs
is a violated premise to name, not a case to resolve silently.

The repo set matters here for one reason: it is what keeps **the worktree set** non-empty in layout
P, where there is no current repo to fall back on. See *The worktree set* in Step 1.

**3. The org** — in this order, stopping at the first that answers:

| Source | How |
|---|---|
| The current repo's remote *(layout R)* | `git config --get remote.origin.url`, parsed for the owner |
| The repo set's remotes *(layout P)* | the owner they agree on. **They disagree → ask; never pick a majority** |
| A recorded answer | `<base>/.claude/tracking-org`, one line, the org login |
| The developer | Ask once, then **write it to `<base>/.claude/tracking-org`** so no later run asks again |

**A base with no git remote is normal, not an error.** In layout P the base never has one — the org
comes from its children. Falling back to the recorded answer is the designed path, not a degraded one.

| What | Path |
|---|---|
| Tracking clone | `<base>/.claude/.tracking/<org>/` |
| Session cursor | `<base>/.claude/<org>.status.json` |
| Org record | `<base>/.claude/tracking-org` |

The cursor lives **outside** the clone deliberately: a file that must survive a reclone, a
`git clean`, or a bad rebase inside that clone cannot live where the clone's own git operations reach
it. `<base>/.claude/<org>.snapshot.json` belongs to `/snapshot` — **never open it.**

**The record is per working directory, not per machine.** This matters more here than anywhere else
in the workflow: **end-work must run from the same base that start-work ran from.** A different
directory has a different cursor, so the session you are trying to close will simply not be there.
Before concluding a session was never opened or was already closed, confirm you are in the base it
was opened from. The *Resolve the session* step below covers how to tell the two apart.

**The two layouts are the common way this goes wrong**, because both are legitimate places for one
developer to start from — the repo, or its parent. Step 1 checks the neighbouring one before
reporting a session absent.

### When the base is inside a git repo *(layout R)*

The record is **out-of-band** (principle 5) — it must never be committed into the work it describes.
So when `<base>` sits inside a git repo, exclude it, **using `.git/info/exclude`, not `.gitignore`**:

```bash
git -C <base> rev-parse --show-toplevel        # is there a repo, and where is its root?
# if there is, ensure these lines exist in <toplevel>/.git/info/exclude:
.claude/.tracking/
.claude/*.status.json
.claude/*.snapshot.json
.claude/snapshots/
.claude/tracking-org
```

`.claude/snapshots/` holds `/snapshot`'s report documents. This skill never writes one, but the
exclusion block is shared and is kept identical across all three skills — whichever runs first in a
repo excludes everything, so no later run leaves a file exposed.

**`.git/info/exclude` rather than `.gitignore` is the whole point.** `.gitignore` is a tracked file;
writing it would modify the product repo's contents and land in someone's commit — and this skill's
iron law is that it never modifies product-repo files. `.git/info/exclude` is local-only and
untracked, so the exclusion costs the repo nothing and that law stays intact.

Note what is **not** excluded: `.claude/skills/` and other project Claude config are ordinary
tracked files and none of this applies to them.

**In layout P there is nothing to exclude and nothing to check** — `<base>/.claude/` sits in no repo,
so the record is already out-of-band. **Never write exclusion lines into the child repos.**

### Write surfaces

| Location | Writes permitted |
|---|---|
| `<base>/.claude/.tracking/<org>/` | The only place anything is committed or pushed — always after showing the diff. The yes was given at the confirmation block, not at the push. |
| `<base>/.claude/<org>.status.json` | Local cursor writes. No git involved. |
| Issues the session touched | Comments, labels, state, assignees, and field values — this skill's documented job. |
| PRs in the session's repos | **Creation only**, over already-pushed commits, with the closing keyword in the body. Never merged, reviewed, approved, or rewritten. |

**Never an issue body, never an existing PR, never a product repo's file contents.**

### Bootstrap & access — every run, in this order

**B0. Resolve the base, the layout, the repo set, the org, and the exclusion.** All of it before any
path is used — the clone and cursor paths are not computable until the org answers, and the org's
first two sources are the layout's.

```bash
pwd                                            # the base, absolute
git -C <base> rev-parse --show-toplevel        # layout R or P — and, in R, where to check the exclusion
git -C <base>/*/ config --get remote.origin.url  # layout P: the repo set, one level down
cat <base>/.claude/tracking-org                # org, recorded fallback
```

If no org source answers, **ask once and record the answer** — do not guess an org from a directory
name.

**B1. Is the clone present?**

```bash
git -C <base>/.claude/.tracking/<org> rev-parse --git-dir 2>/dev/null
```

Present → pull (B3). Missing → `gh repo view {org}/tracking` (a 404 means it does not exist).

**B2. Bootstrap.** Remote exists but no clone → `git clone https://github.com/{org}/tracking.git
<base>/.claude/.tracking/{org}`, and say where. **Remote does not exist → offer to create it and wait for
a clear yes**; creating a repo is outward-facing and never happens implicitly. Seed `README.md`
(explaining the format for anyone opening the repo cold), `.gitattributes` containing exactly
`*.jsonl merge=union`, and an empty `tracks.yml`, in one commit.

**B3. Pull, every run.**

```bash
git -C <base>/.claude/.tracking/<org> pull --rebase
```

A clone left dirty by a previous run gets **its own report line** — never merged into the developer's
uncommitted-work blocker. Different problems, different fixes.

**B4. Write access *(end-work only)* — after B3, before writing anything.**

```bash
git -C <base>/.claude/.tracking/<org> push --dry-run
```

**B4 never runs before B3.** A clone behind its remote fails with a non-fast-forward rejection, which
is *not* a permission failure and must not be read as one.

| Result | Behaviour |
|---|---|
| Succeeds | Proceed. |
| **Rejected, non-fast-forward** | **Not a permissions result.** B3 didn't run, or the remote moved mid-run. Pull and re-check once, then judge on the second result. |
| Failure **naming** permission or authentication | **Stop before writing anything.** Do not bank events nobody will see. Say plainly they lack push access. `--local-only` exists for someone knowingly accepting an unshared record — never the default, never silent. |

### The tracking repo

```
{org}/tracking
├── README.md          ├── tracks.yml          ├── views/          (generated, means "now")
├── .gitattributes     ├── status-policy.yml   │   gantt.md
                       └── timeline/           │   dependencies.md
                           YYYY-MM/<dev>.jsonl └── reports/        (/snapshot, means "then")
                                                   YYYY-MM/YYYY-MM-DD-HHMM.md
```

**`reports/` belongs to `/snapshot` alone** — this skill never writes, reads, regenerates, or
cleans one, and a report is never a source for a view. Each is written once and never rewritten,
which is what lets it carry the live issue state `views/` may not: a view is read as *now*, a report
is stamped with *then*.

**One branch, always** — never branched, force-pushed, squashed, or rebased. That linearity is what
lets principle 3 hold.

**`merge=union` applies to `*.jsonl` and nothing else.** Timeline files are append-only, so a union
merge of two developers' appends is always correct. It is deliberately **not** extended to `views/` —
union-merging two generated Markdown files produces a document that is neither.

### `<org>.status.json`

```json
{ "schema": 1, "org": "msa1624",
  "last_session": { "started_at": "2026-07-25T09:00:00Z", "started_repo": "msa1624/api",
                    "ended_at": "2026-07-25T18:20:00Z", "ended_repo": "msa1624/api" },
  "session": { "id": "2026-07-25-nilendu-01", "started_at": "2026-07-25T09:00:00Z",
    "threads": [ { "track": "payments-v2", "thread": "msa1624/api#43", "repo": "msa1624/api",
                   "branch": "feat/api-43-refunds", "worktree": "/Users/x/work/api" } ] } }
```

`session.threads[].worktree` seeds the worktree set. Paths are **absolute**, never `~`-relative.
end-work moves the closing session into `last_session` and clears `session`.

### Tracks & threads

```yaml
tracks:
  - id: payments-v2
    parent: msa1624/api#38          # title, owner, dates all live here
    status: active                  # active | paused | done | abandoned
    exit_criteria: "checkout flow live for 100% of traffic"
```

**Four fields, per principle 2.** Follow `parent` and read title, owner, and dates live. If
`tracks.yml` accumulates statuses or assignees it has become a second issue tracker.

### Issue Fields in this org

**Discover at runtime — never hardcode, and never write a field name you did not discover this run:**

```bash
gh api /orgs/{org}/issue-fields   # org fields and their valid options
```

At the last check `msa1624` defined exactly these four. **Treat this as the expected result of that
call, not the definition.**

| Field | Type | Valid values |
|---|---|---|
| Priority | single-select | Urgent · High · Medium · Low |
| Effort | single-select | High · Medium · Low |
| Start date | date | `YYYY-MM-DD` — planned start |
| Target date | date | `YYYY-MM-DD` — planned finish |

**`Size` and `Estimate` are not defined in this org. Do not invent them.** If a role has no field,
**say so** — never approximate it with a neighbouring field that happens to accept a write.

**Relationships** is the dependencies API, writable at rung 2 (`gh issue edit --add-blocked-by`, URL
form for cross-repo). **A dependency research *found* is not one a session *hit*:** discovered
blockers go on the issue only; `blocked_by` events record what a session actually ran into.

### Board `Status` — the transition policy

**A card that never moves is worse than no card.** An item still reading `In Progress` after its PR
merged tells everyone planning off that board something false, and unlike a missing field there is no
blank to notice. Wrap-up is where most of a thread's real transitions happen, so this skill fires
most of them.

`Status` is a board-native single-select (gh-wrapper → *Projects v2 Item Fields*), and the Iron Law
forbids guessing one. **A policy is what makes it not a guess.** `status-policy.yml` in the tracking
repo maps this workflow's lifecycle moments to option names on one board:

```yaml
project: 2                  # the board number this policy governs
field: Status               # the board-native field it drives
transitions:
  issue_created:  Backlog        # start-work
  branch_created: In Progress    # start-work
  resumed:        In Progress    # start-work
  blocked:        Blocked        # end-work
  unblocked:      In Progress    # end-work
  pr_opened:      In Review      # end-work
  handoff:        In Review      # end-work
  done:           Done           # end-work
```

**end-work owns `blocked`, `unblocked`, `pr_opened`, `handoff`, and `done`.** The first three are
start-work's, and neither skill fires the other's moments.

| Situation | Rule |
|---|---|
| The file is **absent** | The policy is undefined. Render the transition `— ask`, with a suggestion built from the board's **actual** option list, and write the file once the developer says yes. A one-time cost, not a per-session question. |
| A **key** is absent | **Leave `Status` alone at that moment.** Absent means "no transition here" — never "work it out". A board with no `Blocked` column is normal, not a gap to fill. |
| A value names an option the board **no longer returns** | **Stale policy.** Report it by name, write nothing, and re-ask that one key. Never substitute a neighbouring option that happens to accept the write. |
| Several boards carry the item | One policy per board — `project` keys it. A board with no policy gets no transition and one report line. |
| The item is **already** at the target option | No-op. Don't write it, and don't report it as a change that happened. |
| The item is on **no** board | Nothing to transition. Report it the way an unlinked issue is reported. |

**The policy stores option names; the API takes option ids.** Resolve one to the other from *this
run's* discovery (gh-wrapper → *Discover the board's fields at call time*) — a name that doesn't
resolve is the stale-policy row, not a reason to guess an id.

**A policy-derived transition is `derived`, not inferred.** The policy is a source, so the line
renders `← status-policy.yml` and is covered by the single yes like every other line in the block —
**with one exception, and it is the same exception closure already carries.** `done` moves a card to
the column everyone reads as finished, so it rides the *named yes* that closing the issue requires,
not the blanket one. A transition never happens silently: a `Status` that moves without appearing in
the block is exactly the fabrication the Iron Law exists to prevent.

**One transition per item per run.** A thread that got blocked at 11:00 and unblocked at 16:00 ends
the day in progress, and writing both in sequence would record a state the board never needed to
show. Fire the **last** moment the session reached, and let the timeline carry the intermediate
events — that is what the timeline is for.

### Established vs. guessed

A value is **established** when it has a **source**, the source is **shown to the developer** beside
it, and the developer **said yes after seeing it** — all three. Missing any one, it is **guessed**,
and a guessed value is asked for, never written. **Source first, then value. Never value, then
rationale.**

### Event timeline

`timeline/YYYY-MM/<dev>.jsonl` — one JSON object per line, newline-terminated, no blank lines.
Create the month directory if this is the month's first event.

```jsonl
{"schema":1,"ts":"2026-07-25T13:40:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"progress","track":"payments-v2","thread":"msa1624/api#41","repo":"msa1624/api","branch":"feat/api-41-checkout","commits":["a1b2c3d","e4f5a6b"],"note":"idempotency keys on charge endpoint"}
{"schema":1,"ts":"2026-07-25T15:10:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"blocked","track":"payments-v2","thread":"msa1624/api#41","repo":"msa1624/api","branch":"feat/api-41-checkout","blocked_by":["msa1624/platform#12"],"note":"needs the new rate-limit middleware"}
{"schema":1,"ts":"2026-07-25T17:55:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"pr_opened","track":"payments-v2","thread":"msa1624/api#41","repo":"msa1624/api","branch":"feat/api-41-checkout","pr":"msa1624/api#52","draft":true,"linked":true}
{"schema":1,"ts":"2026-07-25T18:20:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"session_end","threads_touched":1,"repos_touched":1}
```

| Field | Rule |
|---|---|
| `schema` | always `1` today |
| `ts` | UTC, ISO 8601, always — local time makes cross-timezone charts lie |
| `session` | the id shared by every event in one sitting |
| `dev` | the GitHub handle the work is attributed to |
| `event` | `session_start` · `session_resume` · `branch_created` · `progress` · `blocked` · `unblocked` · `done` · `handoff` · `pr_opened` · `session_end` |
| `track` · `thread` · `repo` · `branch` | thread-scoped events only. `thread` is always `owner/repo#N`, never bare `#N` |
| `commits` | short SHAs, so an entry can be checked against git rather than trusted |
| `note` | one line: what actually happened. Expected on `progress` and `blocked` |
| `blocked_by` | array of `owner/repo#N` — a dependency **hit while working** |
| `to` | `handoff` only: the handle the work passes to |
| `pr` | `pr_opened` only: the PR as `owner/repo#N`. Never a bare `#N`, and never a URL |
| `draft` | `pr_opened` only: `true` when work remained, `false` when the thread was complete |
| `linked` | `pr_opened` only: `true` when the closing keyword actually created the relationship, `false` when the base branch made it inert. **Recorded because it cannot be re-derived** — a later reader cannot tell a PR that never linked from one whose issue was closed by hand |
| `threads_touched` / `repos_touched` | `session_end` only: counts, so a session's shape reads without replaying it |
| `inferred` | `true` only on a synthetic `session_end` for an abandoned session |

**Session-scoped events** — `session_start`, `session_resume`, `session_end` — **omit**
`track`/`thread`/`repo`/`branch` rather than setting them null.

**No duration or hours field, ever.** Session boundaries place work on a Gantt at day granularity; a
computed "time worked" is the raw material for exactly the comparison principle 4 rules out.

### Attribution

`dev` is the human who triggered the session, matching commit **authorship** — read from the author
field and `Co-authored-by:` trailers, bots excluded. An agent-authored commit co-authored to a person
attributes to that person. Handle from `gh api user --jq .login`.

### Generated views *(end-work only)*

`views/gantt.md` and `views/dependencies.md` are rebuilt from `tracks.yml` and the **whole** timeline
on every end-work run, after pulling. Both open with:

```
<!-- GENERATED — do not edit, rebuilt by end-work -->
```

**Built from the timeline and `tracks.yml` alone — never from GitHub.** A committed file carrying an
issue's assignee, status, or planned dates would be a cache of state, wrong the moment someone
reassigned the issue.

Node labels come from the `title` on that thread's `branch_created` event — **not a live lookup**. If
the issue is renamed the view keeps the old label; the event records what was true then. A thread
with no `branch_created` falls back to its bare `owner/repo#N`.

**`views/gantt.md` charts actuals only.** Planned dates live on the issue's Start/Target fields, so
charting them here would mean caching them here.

- One `section` per track, in `tracks.yml` order. Tracks with no events are omitted.
- One bar per thread. **A thread with no events does not appear.**
- Bar starts at the earliest `branch_created`, else the earliest event of any kind.
- Bar ends at its `done` date → status `done`; still open → its latest event date, status `active`.
  A zero-width bar gets a `1d` duration.
- A thread whose events carry **no commit SHAs at all** gets ` (unverified)` appended to its label.

````
<!-- GENERATED — do not edit, rebuilt by end-work -->
```mermaid
gantt
    title Org tracks — actual, derived from the timeline
    dateFormat YYYY-MM-DD
    axisFormat %m-%d

    section payments-v2
    checkout endpoint    :done,    api41, 2026-07-14, 2026-07-22
    refund flow          :active,  api43, 2026-07-24, 2026-07-28
```
````

No assignees, no statuses, no colour-coding by state — that is all live GitHub data, which
`/snapshot` renders on request.

**`views/dependencies.md` edges come from one source only:** each event's `blocked_by`. For an event
on thread `T` with `blocked_by: [B]`, the edge is `B -->|blocks| T`. Deduplicate. Group nodes into a
`subgraph` per repo; node ids are repo shortname plus issue number (`api41`), which keeps them
mermaid-safe.

````
<!-- GENERATED — do not edit, rebuilt by end-work -->
```mermaid
graph LR
    subgraph api["msa1624/api"]
        api41["#41 checkout endpoint"]
    end
    subgraph platform["msa1624/platform"]
        platform12["#12 rate limiter"]
    end

    platform12 -->|blocks| api41
```
````

**Edges recorded on the issues are not baked in** — not the Relationships field, not `#N` references
or "blocks"/"depends on" prose. Those are issue state, editable at any time, so a committed copy
would be wrong without warning. `/snapshot` joins them live and is the only view that can show the
two sources disagreeing. With no `blocked_by` events at all, write the header plus one line saying no
dependencies have been encountered yet — **not** an empty mermaid block.

**Conflict resolution.** View conflicts are **discarded and regenerated, never resolved**. On a
rejected push: throw away local changes under `views/`, `pull --rebase` (only `*.jsonl` remains in
play, and `merge=union` handles it), regenerate from the merged timeline, push again. Safe because
views are derived — a regenerated file is always correct, a merged one may be neither developer's
output.

### Guardrails

- **Verifiable, not trusted.** Every `progress` event carries commit SHAs; one without renders
  visibly softer in the views, which is the correct outcome.
- **No leaderboards, ever.** No generated view ranks or compares people, and none may be added.
- **Keep everything, forever.** No compaction, no pruning.
- **The timeline stays event-shaped.**

## The Process

```mermaid
sequenceDiagram
    participant D as Developer
    participant S as end-work
    participant P as every session worktree
    participant T as <base>/.claude/.tracking/{org}
    participant G as GitHub

    D->>S: wrap up
    S->>S: read status.json (window, session.threads)
    S->>T: write-access preflight — can I push?
    Note over S,T: NO ACCESS → STOP before writing anything
    S->>P: git status + unpushed check in EVERY session worktree
    Note over S,P: BLOCKING — the developer's own work,<br/>across every repo the session touched
    S->>G: WAVE — 4 read-only agents in parallel
    Note over S,G: compliance · session brief · dependencies (compare)<br/>+ field discovery, run by the skill
    S->>S: return gate on every payload
    S->>D: ONE block: everything proposed, each line with its source
    Note over S,D: a bare yes covers everything incl. opening PRs.<br/>CLOSURES must be named separately.
    D->>S: yes (and any closures, named)
    S->>G: comments, labels, fields, assignees, dependency links
    S->>G: open PRs over pushed work, link + board them
    Note over S,G: closing keyword is INERT off the default branch —<br/>check the base, record linked:true|false
    S->>G: then closures, only if named
    S->>T: append events to this month's dev file
    S->>T: regenerate views/gantt.md + views/dependencies.md
    S->>T: show the diff and push, same step — no second yes
    Note over S,T: push rejected → discard views/, pull --rebase,<br/>regenerate views, push. NEVER hand-resolve views/
    S->>D: report
    S->>S: close the session — move it to last_session
```

### Step 1: Read the Session

Derive the org. Read `<base>/.claude/<org>.status.json`.

| What you find | What you do |
|---|---|
| A live `session` | Its `started_at` is the window; `threads[]` seeds the worktree set below. |
| A `session` **36h or older** | Same thing — a recovery run, whether start-work handed off or the developer got here themselves. The long window is the point; do not shorten it. |
| No `session` | **First rule out the wrong base** (see below). Then: no session was opened. Say so, use midnight today as the window, and derive the worktree set from the fallback below. Still write `last_session` at the end. |

**The midnight-today fallback is a floor, not a window anyone chose.** It is why start-work sweeps
an abandoned session *before* clearing the cursor: once `session` is gone, the `started_at` that
would have framed that work is gone with it, and this run silently scopes to today instead. If you
reach this row and the repos show commits older than today that no event covers, say so rather than
reporting a clean window.

**"No session" and "not this base" look identical, and only one of them is true.** The cursor is
per working directory, so running end-work somewhere other than where start-work ran finds an
absent `session` and reports a session that never happened — while the real one stays open and goes
stale. Before accepting the empty reading, check whether a cursor exists elsewhere:

```bash
ls <base>/.claude/*.status.json          # this base — the authoritative one
ls <base>/../.claude/*.status.json 2>/dev/null   # layout R only: the parent, the other place they might have started
```

**The parent check is layout R's one concession, and it is a look, not a read.** A developer who
opened the session from the workspace parent and is now standing in a repo would otherwise be told
their session doesn't exist. Found one → **name the directory and stop**, so they can re-run there.
Never open it, never adopt its `session`, never write its `last_session`. A cursor found elsewhere
belongs to that base, and writing this base's `last_session` from it corrupts both.

**In layout P there is no parallel check.** Do not descend into the children looking for cursors —
start-work never writes one there, so anything found would be some other base's record.

If no cursor turns up and the developer believes they opened a session, say so plainly and ask which
directory they started in, rather than closing a session here that was never opened here.

`gh api user --jq .login` for the developer's handle.

#### The worktree set

The iron law iterates a **worktree set**, derived here. It is *not* `session.threads[]` directly,
because on a no-session run that list is empty — and that is exactly the run where the developer
never opened a session and is likeliest to have work sitting uncommitted.

| Case | The set |
|---|---|
| Live session | Every distinct `session.threads[].worktree`, **plus the current repo** (layout R) **or the repo set** (layout P) |
| No session | **The current repo** (layout R) **or the repo set** (layout P), **plus** the local path of every distinct `repo` on this dev's timeline events since the window, where that repo is in the repo set. The clone is local — this is a file scan, not an API call |

Deduplicate by resolved absolute path.

**The repo set is what makes layout P safe.** "The repo you are standing in" is exactly what a
workspace base doesn't have, and a no-session run from one is the likeliest run of all to have
uncommitted work sitting in a child repo. So in P the law sweeps **every child repo**, session or no
session — a wider net than R's, which is correct: the developer told you those repos are all in
scope by opening Claude above them.

**A worktree set of size zero is a bug, not a clean run.** In R it holds at least the current repo;
in P at least the repo set. If the derivation somehow produces nothing — a layout-P base with no
child clones at all — **say so explicitly** rather than reporting a clean wrap-up, because a clean
result and an empty sweep are indistinguishable to whoever reads the report.

A timeline `repo` with no clone in the set cannot be checked. **Report it by name as unchecked** —
never let it fall out of the sweep silently.

### Step 2: Sync, Then Write-Access Preflight (BEFORE ANYTHING IS WRITTEN)

Run **_The Substrate_ → B3 (pull) and then B4 (write access)**, in that order. B4 is
BLOCKING.

**The order is not cosmetic.** A clone that is behind its remote fails `push --dry-run` with a
non-fast-forward rejection, which is not a permission failure — and reading it as one stops a run
that had nothing wrong with it. Pull first.

Permission denied, where the failure **names** permission or authentication → **stop**. Do not run
the rest, do not append events, do not update issues. A developer without push rights does not get a
degraded wrap-up that banks events locally forever. Say plainly that they lack push access, and that
`--local-only` exists if they knowingly want an unshared record.

This is a *permissions* check. A stale clone is handled by the pull above; a transient network
failure is handled in Step 8.

### Step 3: The Iron Law (BLOCKING)

For **every worktree in the set derived in Step 1**:

```bash
git -C <worktree> status --short
# unpushed: prefer the upstream. A branch with no upstream has never been pushed,
# so fall back to the default branch — and only if origin/HEAD is actually set.
git -C <worktree> log --oneline @{u}.. 2>/dev/null \
  || git -C <worktree> log --oneline "$(git -C <worktree> symbolic-ref -q --short refs/remotes/origin/HEAD || echo origin/main)"..HEAD
```

A branch with no upstream is **not** a clean result — it means nothing on it has ever reached the
remote. Report it as unpushed work, naming the branch.

| Found | Report as |
|---|---|
| Uncommitted files | Blocker, grouped under that repo |
| Commits not on the remote | Blocker, grouped under that repo |
| The worktree path no longer exists on disk | **Its own reported line** — never silently skipped |

**Blockers are reported grouped by repo, never as one flat list** — three uncommitted files across
three repos are three separate pieces of work to land.

Also check the tracking clone itself:

```bash
git -C <base>/.claude/.tracking/<org> status --short
```

A clone left dirty by a previous run gets **its own report line**. It is never merged into the
developer's uncommitted-work blocker — they are different problems with different fixes.

### Step 4: Research — the Wave

**The iron law has already run, in this skill, above.** It is never delegated: a subagent the skill
cannot see into reporting "clean" is exactly the failure that ships someone's uncommitted work.

**Spawn three `Explore` subagents in one message, in parallel**, and run field discovery yourself —
it is one cheap call and it is what makes "never write a field name you did not discover this run"
checkable against every proposed write.

```bash
gh api /orgs/{org}/issue-fields   # this run's field set. Pass it into the briefs.
```

#### Shared preamble — goes in every brief

```
You are a READ-ONLY research agent. Return findings; never act on them.

NEVER call setIssueFieldValue, addProjectV2ItemById,
updateProjectV2ItemFieldValue, any GraphQL mutation, or gh issue
edit/create/close/comment, gh project item-add/item-edit, or
gh pr create/edit/merge/review. If something seems to need one, return it in asks[] —
never as an action. You CAN call these tools; not calling them is the rule you are
being held to.
The calling skill opens PRs itself, in the main conversation, after the developer
accepts the block. Its having that surface widens NOTHING here: an agent that thinks
a PR should exist says so in asks[] and never opens one.
DO NOT read the timeline, status.json, or tracks.yml. Everything you must compare
against is supplied in your INPUT. Sourcing both sides of a comparison yourself
destroys the comparison.
NEVER check whether work is uncommitted or unpushed. That check is the caller's iron
law and it already ran. You report pushed:true|false per commit; nothing more.

Ladder: gh flag → gh api graphql. Never report something unreachable
without walking both and naming both.
Cross-repo blocker rollups start at rung 2 by ROUTING, not escalation.
NEVER read issue_dependencies_summary to decide whether something is blocked.
The fields are blockedBy / blocking on Issue — NOT blockedByIssues.
HTTP 200 can carry an "errors" key. Nulls under errors are FAILURES, not absences.
NEVER invent a SHA, a note, or a blocker. An event with no commits behind it renders
as unverified, which is honest — not a reason to pad it.

Every reference is owner/repo#N. Never bare #N.
Return exactly one fenced json block as your LAST message, in this envelope:
{ "agent","status":"ok|partial|failed","rung","rung_reason","covered":[],
  "not_covered":[],"surface_log":[{"call","rung","class":"read","ok"}],
  "asks":[],"unavailable":[],"data":{} }
covered/not_covered are MANDATORY.
```

#### Brief 1 — compliance

> **Purpose.** Find what slipped between pushing and recording it, and propose the repair.
>
> **INPUT you supply:** the worktree set, the window, `existing_events[]` read from the local
> timeline, `fields[]`.
>
> Read local git with Bash — `git -C <worktree> log/show/cat-file`. `existing_events` is the only
> record of what is already logged; treat it as complete for the window.
>
> **`data`:** `commits[]` — `{sha, repo, branch, author, committer, co_authors[], subject, refs[],
> closing_refs[], pushed}`. `gaps[]` — `{kind, commit, thread, evidence, proposed_action, …,
> confidence}`. `no_gap_found_for[]`, `commits_with_no_issue_ref[]`.
>
> **`proposed_action` is a closed enum: `post_issue_comment` · `append_progress_event` ·
> `append_blocked_event` · `update_field` · `ask_user_whether_done`. There is no `close_issue`
> value, no `open_pr` value, and no board-`Status` value.** A closing keyword on a still-open issue
> can only ever produce `ask_user_whether_done` — closing keywords state *intent*, not completion.
> Whether a PR opens is decided in Step 5.5 from four checkable preconditions, not from an agent's
> read of whether the work looks finished. **Board transitions are derived from the policy and the
> moments this run actually reached**, never proposed by an agent reading commits — an agent that
> could nominate a `Status` would be guessing one, one layer removed.
>
> **Report the author, not the committer** (they differ after rebases, merges, admin pushes), and
> honour `Co-authored-by:`. `track` is always `null` in a proposed event — you don't read
> `tracks.yml`. `evidence` is what you actually checked, concretely: "no comment mentions this
> commit," never "looks undocumented." An `append_blocked_event` requires **session** evidence — a
> dependency merely declared on the issue is not one.

#### Brief 2 — session brief

> **Purpose.** Live issue and PR state across the window, per thread, with comment and review history.
>
> **INPUT you supply:** `since` = `session.started_at`, the session's threads, `fields[]`.
>
> **`data`:** `moved[]`, `awaiting_you[]`, `thread_standing[]` — same shapes as start-work's. `what`
> says what actually changed, never that a timestamp moved. `fields[].value: null` means the issue
> lacks that field, which is a finding.

#### Brief 3 — dependencies, compare mode

> **Purpose.** What was declared on the issues versus what this session actually ran into.
>
> **INPUT you supply:** the threads, and `encountered[]` = this session's `blocked_by` events from
> the local timeline.
>
> **`encountered` is ground truth about what a session hit.** You cannot verify it and must not try.
>
> **`data`:** `declared[]`, `prose_hints[]`, `diff{hit_not_declared[], declared_not_hit[]}`,
> `ready_now[]`, `still_blocked[]`.

**If a brief fails**, retry once narrowed, then run the inline procedure below yourself. **A failed
compliance brief does not block** — the session still closes, the events still append, and "the
compliance pass did not run" is a printed line rather than an omitted section.

#### The return gate — run before rendering or writing

| Gate | On failure |
|---|---|
| **Envelope** parses and carries every required field | Treat as no-return. **Never scrape values out of prose.** |
| **Write-class** — every `surface_log[].class == "read"`, no `call` matching `setIssueFieldValue`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `^mutation`, `gh issue (edit\|create\|close\|comment)`, `gh project item-(add\|edit)`, `gh pr (create\|edit\|merge\|review)`, `gh api --method (POST\|PATCH\|PUT\|DELETE)` | **Discard the whole payload** and say a read-only agent attempted a write. |
| **SHA** — every SHA bound for a `commits` array survives `git -C <worktree> cat-file -e <sha>^{commit}` | Append the event **without** `commits`. It renders `(unverified)`, which is the honest outcome. **Never `git fetch` to make a fabricated SHA real.** |
| **Discovery** — every proposed field name is in this run's org `issueFields` list | Drop it; report that field unset, naming it. |
| **Existence** — every `owner/repo#N` resolves | Drop the ref and say so. `data: null` with an `errors` block at HTTP 200 is a permissions or transient failure, **not** a hallucination. |
| **Reference form** — matches `^[\w.-]+/[\w.-]+#\d+$` | Reject the record. A bare `#N` in `thread` or `blocked_by` is unresolvable from another repo. |
| **Encountered vs. declared** — an `append_blocked_event` carries session evidence | Reject it. A discovered dependency goes on the issue only; feeding it to `blocked_by` makes `/snapshot`'s join compare a set with itself. |
| **Ladder honesty** — unreachability claims backed by **both** rungs | Unproven. **Re-walk the ladder yourself.** |
| **Coverage** — `not_covered[]` printed | Never omit it. |

**Nothing a subagent returns is a receipt.** Every write happens here, in the main conversation,
after the block in Step 6.5 is accepted.

The window is `session.started_at`. Never widen it silently.

```bash
gh search issues --owner {org} --updated ">={window}" --sort updated --order desc
gh search prs    --owner {org} --updated ">={window}" --sort updated --order desc
gh search issues --owner {org} --state closed --closed ">={window}"
gh search prs    --owner {org} --merged --merged-at ">={window}"
```

For items updated but not closed, `gh issue view N --comments` / `gh pr view N --json reviews,comments`
for comments and review history — what actually changed, not just that something did.

### Step 5: Propose the GitHub Writes

**This step proposes. Nothing here is written until Step 6.5's block is accepted.**

For session threads with meaningful progress. Every proposed field write is checked against the field
set **this run's discovery** returned — end-work must not write a field name it did not
discover this run:

```bash
gh issue comment N -R {org}/<repo> -b "Progress: implemented X, Y. Remaining: Z."
gh issue edit    N -R {org}/<repo> --add-label "..." --remove-label "..."
gh issue close   N -R {org}/<repo>            # --reason "not planned" where that is the truth

# org Issue Fields have no gh flag — rung 2
gh api graphql -f query='mutation { setIssueFieldValue(input: { issueId: "I_..."
  issueFields: [{ fieldId: "IFD_...", dateValue: "YYYY-MM-DD" }] }) { issue { id } } }'
```

Update labels *before* closing, so the next scan reads the right state. Shift the planned-finish
field — `Target date` in this org — only when the developer said the timeline moved, **never to make
a date look met.**

**Closing the issue does not move the board.** GitHub moves a closed item to the done column only if
that board has the built-in workflow enabled, and **you cannot read from here whether it does** —
the same unreadable scope that makes auto-add unreliable. So a thread that closes gets the policy's
`done` transition written explicitly, in the same breath, on the same named yes:

```bash
gh project item-edit --id <item-id> --project-id <project-id> \
                     --field-id <status-field-id> --single-select-option-id <done-option-id>
```

If the transition is already there because the board's own workflow beat you to it, that is the
already-at-target no-op — say nothing. Closing an issue and leaving its card in `In Progress` is
the drift this section exists to stop.

**Every proposed comment carries its provenance**, in the shape start-work's `Field provenance`
specifies for the issue body — the source named under each value, an inferred value's runner-up
given, and every quote reproduced verbatim rather than summarised. end-work must not rewrite bodies,
so that section goes in the comment it is already posting.

**If a write fails, that is a rung, not a verdict.** Drop to `gh api graphql`
before reporting anything unset, and name what you tried. If a role has no field in
this org, say so rather than writing the nearest field that accepts the value.

**Dependencies hit during the session.** The timeline's `blocked_by` is the authoritative record
**by design, not because the write is unavailable** — see *The Substrate* → Issue Fields in this Org.
The Relationship itself is writable at rung 1:

```bash
gh issue edit <N> --add-blocked-by <number-or-full-URL>   # URL form crosses repos
```

**Write it. Do not offer it.** Once a `blocked_by` event is going into the timeline, the fact is
already established and already consented to at the block — making the developer separately opt in
to mirroring it onto the issue is a question with one sensible answer, which is the cognitive load
this skill exists to remove. It renders as a line in the block like every other write. Appending the
event is not optional either way.

The same applies in reverse to `unblocked`: drop the relationship with `--remove-blocked-by` when
the session cleared it.

**And the board follows both**, if the policy defines them: `blocked` → the policy's blocked option,
`unblocked` → its in-progress one. Many boards have no blocked column at all, and an absent key
there means the card simply stays put — the timeline and the issue's Relationship still carry the
fact. Remember the one-transition-per-run rule: a thread blocked and then unblocked in the same
session fires `unblocked` only.

**Handoffs.** A `handoff` event names a recipient in `to`. **Reassign the issue to them in the same
step** — a timeline that says the work passed to @ali while the issue still shows the sender is the
exact drift this skill is supposed to prevent, and it is invisible to anyone reading only GitHub.

```bash
gh issue edit N -R {org}/<repo> --add-assignee "<to>" --remove-assignee "<from>"
```

`<from>` is normally the current user: start-work assigns `@me` at create and claims unassigned
issues it picks up, so by the time work is handed off the sender is usually already on it. Read the
issue's live `assignees` for `<from>` rather than assuming — a thread that changed hands once
already will not have you on it.

**A handoff is the one reassignment that is never a default.** Self-assigning is automatic precisely
because it claims *unowned* work; moving an issue off someone else is a named, explicit act that
needs a recipient in `to` and the developer's yes. Nothing in the self-assign default authorizes
taking an issue someone else holds — if `<from>` isn't you and no handoff was declared, leave it
alone.

The board gets the policy's `handoff` transition alongside the reassignment, for the same reason:
a card whose assignee changed but whose column didn't is half a handoff. Boards that don't
distinguish a handoff column leave the key out and the card stays where it is.

If the recipient cannot be assigned — not a collaborator, or the write fails at both rungs — say
so plainly and leave the event alone. The timeline records what happened; a failed reassignment
does not change that it happened. **The `Status` transition is judged separately** — one write
failing is not evidence about the other, and reporting them as one outcome hides which surface
actually drifted.

### Step 5.5: Propose the PR

**A thread whose work is pushed and has no open PR gets one.** The record is worthless if it says
the work landed and nobody can review it, and making the developer open it by hand is exactly the
load this skill removes. Like every other write here, it is proposed in the block and covered by the
single yes — **there is no second gate.**

**The base is the repo's default branch unless the developer named another one** — read it, never
assume `main`:

```bash
gh repo view <owner>/<repo> --json defaultBranchRef --jq .defaultBranchRef.name
```

That default is not a convenience: it is the one base on which the closing keyword works at all.
A developer who names a different base gets the PR they asked for **and** an unlinked-issue line in
the block, so the trade is visible before they accept it rather than discovered after the merge.

**Four preconditions, all checkable — no judgment call, no question:**

| Check | How | If it fails |
|---|---|---|
| The branch has commits the base does not | `git -C <worktree> log --oneline origin/<base>..HEAD` | Nothing to propose. Skip silently. |
| Everything on the branch is **pushed** | already computed by the iron law, Step 3 | **Do not open it.** A PR over a branch with unpushed commits does not contain the work. Report it as not opened, naming the unpushed commits. |
| No PR is already open for this head | `gh pr list -R {org}/<repo> --head "<branch>" --state open` | Nothing to do. Say it's already open, with its ref. |
| The thread has an issue to link | `session.threads[].thread` | Open it anyway; report it unlinked. |

**Draft or ready is derived, not asked.** You already computed the answer for the Carry-over section:

| Carry-over for this thread | PR opens | Keyword in the body |
|---|---|---|
| Remaining work listed | **draft** | `Refs owner/repo#N` — no auto-close |
| Nothing remaining | **ready for review** | `Closes owner/repo#N` |

`Closes` on a ready PR is not a closure this skill is making — the merge is, and a human does that
with the keyword in front of them. That is why it does not need the named yes a direct closure does.

**Check the base branch before trusting the keyword.** gh-wrapper owns the mechanics and the trap:
a closing keyword is *silently ignored* unless the PR targets the repo's default branch. Read
`defaultBranchRef`, never assume `main`. Off the default branch the keyword is inert — keep the
plain reference, say so in the block and the report, and record `linked: false` on the event.

**Use the full `owner/repo#N` form in the keyword always**, matching this skill's reference rule
everywhere else. It is the only form that works when the PR and its issue live in different repos,
which is normal in layout P.

**The body carries provenance**, the same way this skill's issue comments do — what the session did,
which commits, and what remains. Check `.github/pull_request_template.md` first and fill it in
rather than replacing it.

Then, because none of these follow from the create:

1. **Add the PR to the board** if one was discovered — `gh project item-add --url <pr-url>`. PRs go
   missing off a board exactly the way issues do, and adding is idempotent.
2. **Move the issue's card** with the policy's `pr_opened` transition. This is the moment the board
   is most often wrong: the work is up for review, and the column still says someone is writing it.
   The transition applies to **the issue's item**, not the PR's — the issue is what the board plans
   around, and the PR item is a mirror of it.
3. **Comment on the issue** with the PR ref, and say plainly if the keyword did not link.
4. **Append `pr_opened`**, carrying `pr`, `draft`, and `linked`.

**A draft PR still fires `pr_opened`.** Draft means there is carry-over, not that nothing happened —
and the board's reviewers are exactly who needs to see it arrive. If a board distinguishes the two
states it does so with its own columns, which is a policy question, not one to resolve by guessing
here.

### Step 6: Reconcile Push Activity — the Compliance Pass

*(Delegated to the compliance brief. This section is what it returns, and your fallback if it fails.)*

Every `git push` is supposed to be followed by a progress comment on each issue the pushed commits
reference, closure when a closing keyword was used **and the work is genuinely done**, and field
updates when the timeline shifted. That doesn't reliably happen at push time. This catches what
slipped.

For each worktree, over the session window:

```bash
git -C <worktree> log --since="<window>" --oneline
```

| Found | Proposed repair |
|---|---|
| Commit references `#N`, no comment mentions that commit | A comment summarizing what it did |
| Closing keyword (`Fixes`/`Closes`/`Resolves #N`) used, issue still open | **Ask whether it's actually done.** Never an automatic closure — the compliance brief's action enum has no `close_issue` value precisely so this cannot slip through |
| Commit references `#N` with **no corresponding timeline event** | The missing `progress` event, carrying its verified SHAs |
| Work shifted urgency or timeline | A field update, only where the developer said so |

Report every gap repaired under "Compliance gaps found" — that section is the signal that the
push-time self-check needs attention.

### Step 6.5: The Confirmation Block

**One block. Everything you are about to do, each line with its source. Nothing written yet.**

```
## Wrapping up 2026-07-25-nilendu-01 — 3 threads, 3 repos
Window 2026-07-25 09:00 → 18:20 UTC. Nothing written yet.

### Pending changes (BLOCKING)
**msa1624/api** (~/work/api, feat/api-43-refunds)
- Uncommitted: src/refunds.ts, src/refunds.test.ts
- Unpushed: 9f2c1ab — refund state machine

Commit and push before this is handed off. Wrapping up anyway records that you
stopped, not that it was clean.

Note: ~/work/platform is in the session but no longer exists on disk.

### To the timeline (timeline/2026-07/nilendu.jsonl)
  progress   api#43   9f2c1ab — refund state machine   ← the only commit in the
                                                         window on this branch
  blocked    web#22   blocked_by [msa1624/api#43]      ← you said 14:40 "UI needs
                                                         the refund endpoint shape"
  pr_opened  web#22   msa1624/web#61, draft, linked    ← see below
  session_end  3 threads, 3 repos

### To GitHub
  api#43       comment: "state machine done; idempotency
               and tests remain"                        ← from 9f2c1ab
  web#22       add-blocked-by api#43                    ← the blocker above; goes on
                                                          the issue as well as the
                                                          timeline
  platform#12  label ship-ready                         ← PR #19 merged 16:12
  api#48       reassign to @ali                         ← the handoff below; the
                                                          issue still shows you

### To the board — payments-board (#2)
  web#22    Status  In Progress → In Review   ← status-policy.yml: pr_opened.
                                                web#61 opens below; the add does
                                                not move the card
  api#48    Status  In Progress → In Review   ← status-policy.yml: handoff
  web#22    blocked → no move                 ← the board has no Blocked option
                                                and the policy has no key for it;
                                                the timeline still records it
  api#43    Status  already In Progress       ← no change

  platform#12 is in the closing section below; its Status moves on that yes, not
  this one.

### Opening a PR
  msa1624/web#61  payment UI — DRAFT                    ← 4 commits pushed on
                  feat/web-22-payment-ui, and carry-over lists remaining work,
                  so it opens as a draft
                  Body: "Refs msa1624/web#22"           ← draft, so no auto-close
                  Base: main = default branch, so the reference links
                  Also added to payments-board (#2)     ← PRs go missing off a
                                                          board like issues do

  Not opened: api#43 — 9f2c1ab is unpushed, so a PR would not contain the work.

### Closing — needs its own yes, naming them
  platform#12  rate limiter → closed/completed
               ← PR #19 merged 16:12; exit criteria "all endpoints behind rate
                 limiter" met by 3a1f, b92c; no open sub-issues
               Status In Review → Done  ← status-policy.yml: done. Closing the
                 issue does not move the card unless the board's own workflow is
                 enabled, and that isn't readable from here.

### Compliance gaps found
- 9f2c1ab referenced #43 with no timeline event — the progress event above repairs it

Researched: 3 worktrees, 11 commits, live state on 5 issues and 3 PRs, 22 timeline
events. 0 writes so far.

→ Yes records the timeline, the comments, the labels, the fields, the dependency, the
  reassignment, the board moves above, and opens web#61 as a draft, then pushes. It
  does NOT close platform#12 or move its card to Done — say "yes, close 12" for that.
```

#### Two consent levels, and why

**A bare "yes" confirms every other write in the block — comments, labels, fields, assignees,
dependency links, board `Status` moves, appends, and opening a PR. It never confirms a closure,
and the `done` transition rides with the closure rather than with the bare yes** — moving a card
to the done column is the same claim as closing the issue, made on the surface more people read.

Closures are confirmed only by a reply that names them, or that names closing explicitly. A closure
the developer did not name is reported as *proposed, not closed*, and re-proposed next run.

**The line is not reversibility — it is who catches the mistake.** A PR opened too early is caught
by its reviewer, and rejecting it is the mechanism working as designed. A comment, a label, a field,
or an assignee is visible and correctable. **A closure is the one write nobody watches you make**,
and it changes what everyone downstream believes is finished. `Fixes #N` states intent, not
completion.

**Do not add a third gate.** A second confirmation on the PR would be a gate on a decision already
made at this block, and the cost of that is that people stop reading the first one — the same
reasoning that puts the push behind the same yes. Show it, source it, then do it.

Silence is not a yes. A reply about something else is not a yes.

### Step 7: Append the Events

```
BEFORE appending any event:
1. PREFLIGHT: Step 2 passed — B3 pulled, THEN B4 confirmed push access
2. CHECKED:   git status ran in EVERY worktree in the set, output read in full
3. GATED:     every agent payload passed the return gate
4. ACCEPTED:  the developer said yes to the block as rendered
5. PULLED:    Substrate B3, re-run now if the session ran long
6. ONLY THEN: append

Skip any step = fabricating a record of work you did not verify
```

Append to `timeline/YYYY-MM/<dev>.jsonl` — creating the month directory if this is the first event
of the month. Append semantics are **_The Substrate_ → Event timeline**:

- A `progress` event per thread that moved, carrying its `commits` and a one-line `note` of what
  actually happened.
- `blocked` / `unblocked` where the session hit or cleared a dependency. `blocked_by` is an array of
  `owner/repo#N` — this is the only thing `views/dependencies.md` is built from, so a dependency hit
  and not recorded here is a dependency the org never learns about. The timeline owning this edge is
  a design choice about what the timeline is for, **not** a consequence of the Relationship being
  unwritable; Step 5 covers writing it on the issue as well.
- `done` for threads that finished. Check the work is actually complete first.
- `handoff`, with `to` set to the handle, when work is being passed on — and reassign the issue.
- `pr_opened` for each PR this run opened, carrying `pr`, `draft`, and `linked`. **Write it after
  the PR exists, with the ref GitHub returned** — never a predicted number.
- `session_end`, last, with `threads_touched` and `repos_touched`.

Field rules, event by event, are in **_The Substrate_ → Event timeline**.
Session-scoped events carry no `track`/`thread`/`repo`/`branch`.

**Never invent a SHA, a note, or a blocker.** An event with no commits behind it renders visibly
softer in the views, which is the correct outcome — not a reason to pad it.

### Step 8: Regenerate the Views, Commit, Push

Rebuild `views/gantt.md` and `views/dependencies.md` from `tracks.yml` and the **whole** timeline —
never from GitHub. Rules in **_The Substrate_ → Generated views**.

**`status-policy.yml` rides this commit** if the block asked for a policy and got one — it is
tracking-repo state like `tracks.yml`, not a cursor, and it is the one thing here that is authored
rather than generated. Never regenerate it from the board's option list; that would turn whatever
the board currently has into a policy nobody agreed to.

**Show the diff and push in the same step. Do not wait for a second yes.** The developer's yes was
given at the block in Step 6.5, and asking again is a gate on a decision already made — the cost of
which is that people stop reading the first one. Showing the diff is a *disclosure* requirement
(operate visibly, not silently); waiting on it was never the same requirement, and the old text
conflated the two.

One commit, tracking repo only:

```bash
git -C <base>/.claude/.tracking/<org> add -A
git -C <base>/.claude/.tracking/<org> commit -m "session 2026-07-25-nilendu-01 — 3 threads, 3 repos"
git -C <base>/.claude/.tracking/<org> push
```

| Push outcome | What you do |
|---|---|
| **Rejected** (someone else pushed) | Discard, pull, regenerate, push again — the recipe is **_The Substrate_ → Conflict resolution**. **Never hand-resolve a `views/` conflict.** |
| **Transient failure** (offline, or a race outliving the retry) | Leave the events on disk, append-only, and report it. They push on the next run. |
| **Permission failure** | Cannot happen here — Step 2 caught it. If it somehow appears, treat it as Step 2 and say so. |

### Step 9: Close the Session

Last, after the report is delivered: move `session` into `last_session` in
`<base>/.claude/<org>.status.json`, then **delete `session` entirely**. The `last_session` shape is
**_The Substrate_ → `<org>.status.json`**.

**Write it even when Step 3 found blocking changes.** The boundary records when you stopped, not
whether the handoff was clean.

## Output Format

```
## Session closed — 2026-07-25-nilendu-01
Org: msa1624 | Window: 2026-07-25 09:00 → 18:20 UTC | 3 threads, 3 repos

### Pending Changes (BLOCKING)
**msa1624/api** (~/work/api, feat/api-43-refunds)
- Uncommitted: src/refunds.ts, src/refunds.test.ts
- Unpushed: 9f2c1ab — refund state machine

**msa1624/web** (~/work/web, feat/web-22-payment-ui)
- Uncommitted: src/PaymentForm.tsx

**Action required**: commit and push in both repos before this work is handed off.

Note: ~/work/platform is listed in the session but no longer exists on disk.
Note: the tracking clone had uncommitted changes from a previous run — resolved by regenerating.

### Recorded to the timeline (timeline/2026-07/nilendu.jsonl)
- progress · payments-v2 · msa1624/api#43 · feat/api-43-refunds · 9f2c1ab — refund state machine
- blocked · payments-v2 · msa1624/web#22 — blocked by msa1624/api#43, "UI needs the refund endpoint shape settled"
- done · auth-hardening · msa1624/platform#12 — rate limiter shipped
- pr_opened · payments-v2 · msa1624/web#22 — msa1624/web#61, draft, linked
- session_end · 3 threads, 3 repos

Views regenerated. Pushed to msa1624/tracking as 4a91c07.

### PRs opened
| PR | Thread | Kind | Linked | On board |
|---|---|---|---|---|
| msa1624/web#61 | msa1624/web#22 | draft | yes — `Refs msa1624/web#22` | payments-board |

Not opened: msa1624/api#43 — 9f2c1ab is still unpushed, so a PR would not contain the work.

### Board — payments-board (#2)
| Thread | Status | Moment |
|---|---|---|
| msa1624/web#22 | In Progress → In Review | pr_opened |
| msa1624/api#48 | In Progress → In Review | handoff |
| msa1624/platform#12 | In Review → Done | done |
| msa1624/api#43 | In Progress (no change) | — |

Not moved: msa1624/web#22's `blocked` — the policy defines no key for it, so the card stayed put.
The timeline still records the blocker.

### Completed
| Thread | Repo | Title | Status |
|---|---|---|---|
| #12 | msa1624/platform | rate limiter | Closed |
| #47 | msa1624/api | refund endpoint | Merged |

### Carry-over
- msa1624/api#43 — refund flow
  - Done: state machine
  - Remaining: idempotency, tests
  - Blocks: msa1624/web#22
- msa1624/web#22 — payment UI
  - Blocked on msa1624/api#43

### Compliance gaps found
- msa1624/api#43 had a commit referencing it with no progress comment — added
- 9f2c1ab referenced #43 but had no timeline event — appended
```

Omit the Pending Changes section entirely when Step 3 comes back clean.

## Red Flags — STOP

- Writing anything before the write-access preflight has passed
- Reporting "no session was opened" without ruling out that this is a **different base** than the
  one start-work ran in — the real session stays open and goes stale while you say it never existed
- Adopting a cursor found under some other base — it belongs to that base, and writing this base's
  `last_session` from it corrupts both
- Using a **relative** base after iterating into a product worktree
- Guessing the org from the directory name because the base has no remote
- Deriving the worktree set from "the current directory" in layout P, where there is no current repo
   — the set collapses and the iron law passes on an unswept workspace
- Reporting a clean wrap-up from an empty worktree set instead of saying the sweep found nothing to
  sweep
- Dropping a timeline `repo` that has no local clone, instead of reporting it unchecked
- Descending into child repos hunting for cursors — start-work never writes one there
- Picking a majority owner when the repo set's remotes disagree, instead of asking
- Writing the tracking paths into a product repo's `.gitignore` instead of `.git/info/exclude`
- Iterating `session.threads[]` instead of the worktree set — on a no-session run that list is empty
  and the iron law silently passes on exactly the run that needs it most
- Running `git status` only in the base when the worktree set lists three
- Concluding "no push access" from a `push --dry-run` that failed non-fast-forward, before B3 has run
- A missing worktree skipped silently instead of reported
- Writing a field name you did not discover this run
- Closing an issue on a bare "yes" to the block, without the developer naming it
- Waiting for a second yes at the push, after the block was already accepted
- Rendering an agent payload before it has passed the return gate
- Proposing a `note` or a `blocked_by` an agent produced with no commit or session evidence behind it
- Delegating the iron law to a subagent
- Passing an agent's prose into the report instead of re-rendering its rows
- Reporting a field unsettable after one failed attempt, without walking both rungs
- Rewriting an issue body, or merging, reviewing, approving, or rewriting a PR — creation is the
  whole surface
- Opening a PR over a branch with unpushed commits, so the PR does not contain the work
- Opening a second PR for a head that already has one open
- Putting a closing keyword in a PR body without reading `defaultBranchRef` — off the default
  branch it is inert and the sidebar is silently empty
- Reporting a PR as linked when the base made the keyword inert, or omitting `linked` from the event
- `Closes` on a draft PR — a draft says work remains, and the keyword says it doesn't
- Opening the PR and stopping — the board add, the `Status` move, the issue comment, and
  `pr_opened` do not follow from the create
- Closing an issue and leaving its card in the in-progress column, on the assumption that the
  board's built-in workflow caught it — that scope is not readable from here
- Moving a card to the done column on the bare yes, instead of on the named closing yes
- Moving a `Status` without a policy key behind it, or without the line appearing in the block
- Writing both `blocked` and `unblocked` transitions for one session, recording a state the board
  never needed to show
- Substituting a neighbouring option when the policy names one the board no longer has
- Inventing a policy option name instead of asking and writing `status-policy.yml`
- Regenerating `status-policy.yml` from the board's current options — that is a policy nobody agreed to
- Firing start-work's moments — `issue_created`, `branch_created`, `resumed` — from here
- Reporting the reassignment and the `handoff` transition as one outcome, hiding which one drifted
- Writing a `pr_opened` event with a predicted PR number instead of the ref GitHub returned
- Asking for a second yes before opening a PR the block already proposed
- Recording a `handoff` and leaving the issue assigned to the sender
- Offering to mirror a `blocked_by` onto the issue instead of just writing it
- Uncommitted changes found and put anywhere but the top of the report
- Describing unpushed commits as "minor" or "just local"
- The tracking clone's dirtiness folded into the developer's blocker section
- Hand-resolving a `views/` conflict instead of discarding and regenerating
- Rewriting or reordering an existing timeline line
- Building a view from GitHub data instead of the timeline
- Closing an issue because a commit said `Fixes #N`, without checking the work is done
- A `blocked` event with a bare `#N` in `blocked_by`
- Inventing a commit SHA, a note, or a blocker to make an event look complete
- Pushing the tracking repo without showing the diff
- Recording a duration or an hours count
- Finishing the run without moving `session` into `last_session`

**The first three mean: stop, the check has not actually run. The rest mean: you are about to write
something false into the record, or into a surface that isn't yours to write.**

## Quick Reference

| Situation | Action |
|---|---|
| Start of every run | Resolve base + layout + repo set + org (B0) → read `status.json` → write-access preflight → iron law in every worktree |
| Which layout | `git -C <base> rev-parse --show-toplevel` — a path is R, nothing is P |
| Base is a parent of clones (P) | Repo set = depth-1 children with a `.git`. No current repo; the repo set stands in for it everywhere |
| Base has no git remote | Layout P's normal state — org comes from the children, else `<base>/.claude/tracking-org`, else ask once and write it |
| Repo set's remotes disagree on the owner | Violated premise. Name it and ask; never take the majority |
| Cursor shows no session | Rule out the wrong base first. In layout R, `ls <base>/../.claude/*.status.json` and name the parent if it has one — never adopt it |
| No push access | Stop before writing anything. Mention `--local-only`, don't default to it. |
| Which worktrees to check | The **worktree set** from Step 1 — never `session.threads[]` directly |
| No session open | The set is still non-empty: current repo (R) or the whole repo set (P), plus repos on the timeline since the window |
| A timeline repo with no local clone | Report it unchecked, by name |
| Worktree gone from disk | Report it as its own line |
| Pending changes exist | Top-of-report BLOCKING section, grouped by repo, with an action-required line |
| Tracking clone dirty | Separate report line, never the developer's blocker |
| Window | `session.started_at`. No session → midnight today, and say so. |
| Invoked by start-work's recovery | Nothing changes. Read the cursor, take the long window, render the block as always |
| Reached the end of a recovery run | Step 9 clears `session` as usual — start-work re-reads it and carries on |
| Item made progress but isn't done | `post_issue_comment` + labels + a `progress` event |
| Item is genuinely done | `gh issue close --reason completed` **and** a `done` event **and** the policy's `done` transition — closing moves no card |
| Which `Status` to set | `status-policy.yml` in the tracking repo. This skill fires `blocked`, `unblocked`, `pr_opened`, `handoff`, `done` — never start-work's moments. |
| Two board moments in one session | Fire the **last** one reached. The timeline carries the intermediate events. |
| No `status-policy.yml` | Render `— ask` with the board's real options, then write the file into the same commit as the events |
| Policy names an option the board lost | Report it by name and re-ask that key. Never substitute. |
| Policy has no key for this moment | Leave `Status` alone. Absent means no transition, not "work it out". |
| Item already at the target option | No-op. Don't write it, don't report it as a change. |
| Which yes covers a `Status` move | The bare yes — **except `done`**, which rides the named closing yes |
| Dependency hit while working | A `blocked` event with `blocked_by: ["owner/repo#N"]` — the only source the dependency view has. **Also** `gh issue edit --add-blocked-by`, written, not offered, **and** the policy's `blocked` transition if it defines one |
| Session cleared a dependency | An `unblocked` event **and** `--remove-blocked-by` on the issue **and** the policy's `unblocked` transition |
| Work handed to someone | A `handoff` event with `to`, reassign the issue to them, **and** the policy's `handoff` transition |
| Thread's work is pushed, no PR open | Open one. Draft + `Refs` if carry-over lists remaining work, ready + `Closes` if not |
| Branch has unpushed commits | **Don't open a PR.** It wouldn't contain the work. Report it not opened |
| Before writing a closing keyword | `gh repo view --json defaultBranchRef` — off it the keyword does nothing |
| PR base isn't the default branch | Keep the plain ref, report unlinked, record `linked: false` |
| Just opened a PR | Board it, move the issue's `Status`, comment on the issue, append `pr_opened` — none of that follows from the create |
| Which item a `pr_opened` move applies to | **The issue's** item. The PR's item mirrors it; the board plans around the issue. |
| Which fields to update | **This run's `/orgs/{org}/issue-fields` result** — never a remembered name |
| Research | Four agents in parallel, after the iron law, before the block |
| An agent payload | Return gate before rendering or writing |
| A closure | Its own named yes. A bare "yes" never closes anything. |
| After the block is accepted | Write, then show the diff and push in one step |
| A field write fails | Walk gh-wrapper's rung 2, then report unset naming what you tried |
| Commit references `#N` with no event | Append the missing `progress` event, report it as a compliance gap |
| Push rejected | Discard `views/`, `pull --rebase`, regenerate, push |
| Push fails transiently | Events stay on disk, reported, pushed next run |
| End of every run | Move `session` → `last_session`, clear `session` — even on a dirty run |
| Referencing an item | Always `owner/repo#N` |
| About to run a `gh` command | Stop, use gh-wrapper |

## Rationalization Prevention

| Excuse | Reality |
|---|---|
| "The uncommitted changes are trivial, I'll note them at the bottom" | Trivial changes are exactly what gets lost. Top of report, marked blocking. |
| "I know the date field is called Target date" | You know what it was called last time. Discover it, then write it. |
| "`gh issue edit` failed, so the field can't be set" | That's one rung of two. Try `gh api graphql`. Then report, naming both. |
| "Relationships has no write tool, so the timeline is all we can do" | `gh issue edit --add-blocked-by` writes it at rung 1. The timeline is authoritative by design, not by inability. |
| "The commits are local, that still counts as done" | Unpushed work is invisible to everyone else. It isn't handed off until it's pushed. |
| "I'm standing in ~/work/api, so that's the repo to check" | The session touched three. Iterate the worktree set. |
| "I'm in ~/work and it isn't a repo, so there's nothing to sweep" | It's a workspace of N repos, and every one of them is in scope — that's what opening Claude above them means. Sweep the repo set. |
| "The session listed one worktree, so the other two children don't matter" | In a workspace base every child is in scope. The listed worktrees are a floor, not a ceiling. |
| "There's no session, so there's nothing to check" | The run where nobody opened a session is the run where uncommitted work is likeliest to be forgotten. The worktree set is never empty. |
| "The cursor has no session, so none was opened" | The cursor is per working directory. An empty reading in the wrong directory is indistinguishable from an empty reading in the right one — and only one of them means what you're about to say. Rule out the base first. |
| "I found a cursor in another directory, I'll close that session from here" | It belongs to that base. Closing it from here writes `last_session` into the wrong cursor and leaves the right one open. Tell the developer which directory to run in. |
| "The base has no remote, so I can't determine the org" | That's layout P's normal state. The children's remotes carry it; then `<base>/.claude/tracking-org`; then ask once and write it. A base's own remote is one source of the org, not the only one. |
| "`push --dry-run` failed, so they can't push" | Read the failure. Non-fast-forward is a stale clone; permission-denied is a permission. Pull, re-check, then conclude. |
| "~/work/platform is gone, so there's nothing to report there" | A worktree that vanished mid-session is a finding, not a non-event. Say it. |
| "The tracking clone is dirty too, I'll list it with the other blockers" | Different problem, different fix. The developer's work needs committing; the clone needs regenerating. |
| "No push access, but I'll write the events locally so nothing is lost" | Events nobody will see are already lost. Stop and say so. |
| "The views conflict is two lines, I'll just merge them by hand" | The result is neither developer's output. Views are derived — discard and regenerate. |
| "The commit said `Fixes #N`, so close it" | Closing keywords state intent, not completion. Verify first, then get it named. |
| "They confirmed the block, so the closures are confirmed" | A block-level yes covers the rest — comments, labels, fields, assignees, board moves, appends, opening a PR. A closure changes what everyone else believes is finished, and it's the one write nobody watches you make. Name the issues; get a yes for them. |
| "I closed the issue, GitHub moves the card to Done" | Only if that board has the built-in workflow enabled, and you cannot read that from here — the same blind spot that makes auto-add unreliable. Write the transition; it's a no-op if the board beat you to it. |
| "The card says In Progress and the PR is up — close enough, someone will move it" | Nobody moves it. That is the whole reason this section exists: the column is the thing people plan off, and it's the thing nothing forces you to update. |
| "The board has no Blocked column, I'll park it in On Hold" | A different option means a different thing to whoever built the board. An absent key means leave the card alone — the timeline still records the blocker. |
| "It got blocked and then unblocked, I'll write both so the history is complete" | The board is state, not history. Two writes record a column the board never needed to show. Fire the last moment; the timeline is where the history lives. |
| "The policy says In Review, the board now calls it Review — same thing" | Then someone renamed it deliberately, and the policy is stale. Report the key and re-ask it; substituting is exactly what the Iron Law forbids. |
| "There's no policy file, I'll use the obvious mapping this once" | "This once" becomes the mapping nobody agreed to, written into a board other people plan from. Ask once, write the file, and it's answered forever. |
| "The reassignment failed, so I'll report the handoff as not done" | Two writes, two outcomes. Say which one landed. Collapsing them hides whether the board or the issue is the surface that drifted. |
| "Opening a PR is a big deal, I'll confirm it separately" | It's in the block with its source, and the developer said yes to the block. A second gate on a settled decision teaches people to skim the first one — the same reason the push doesn't wait either. |
| "The work looks done, I'll open it ready for review" | "Looks done" isn't the input. Carry-over is: remaining work → draft, nothing remaining → ready. You already computed it for the report. |
| "`Closes #43` in a draft PR is fine, it only fires on merge" | A draft says work remains and the keyword says it doesn't. Use `Refs` until it's ready. |
| "The base is `main`, so the keyword works" | Usually, not always — and when it isn't the default branch GitHub ignores the keyword entirely and the body still renders perfectly. One `--json defaultBranchRef` call. |
| "The keyword didn't link, but the PR mentions the issue, close enough" | A mention is a backlink, not a linked issue. The issue won't close on merge and nothing on either item shows it. Say it's unlinked and record `linked: false`. |
| "Same repo, so a bare `#43` in the keyword is fine" | Every other reference in this skill is `owner/repo#N` for the same reason. Cross-repo threads are normal in layout P. |
| "There are unpushed commits, but I'll open the PR so it's ready" | The PR wouldn't contain the work, and it would look like it did. That's the iron law's whole point. Report it not opened. |
| "I opened the PR, the board picks it up from the issue" | It doesn't. A PR is its own board item, missing the same silent way an issue is. |
| "They said they're handing this to @ali, the timeline records it" | And GitHub still shows it assigned to them. Someone reading the issue — which is most people — sees the wrong owner. Reassign it. |
| "I'll ask whether they want the blocker on the issue too" | The `blocked_by` event is already going in and they already said yes to the block. That question has one sensible answer, which makes it load, not consent. |
| "Asking again before the push is safer" | It's a second gate on a decision already made, and the cost is that people stop reading the first one. Show the diff, then push. |
| "The research agent said the state machine is done" | Then it can name the commits. An agent's summary with no SHAs behind it is the same fabricated note as one you wrote yourself. |
| "The agent already discovered the fields" | You pass the discovery down; you don't take four agents' word for four schemas. Compare every proposed write against the one result. |
| "The compliance agent failed, so I'll skip the wrap-up" | It doesn't block. Close the session, append the events, and print that the compliance pass didn't run. |
| "Push reconciliation is redundant, I commented at push time" | Step 6 exists because that check demonstrably doesn't always fire. Run it and report what you find. |
| "I don't have the SHA handy, I'll write the progress event without commits" | Then it renders as unverified, which is honest. Inventing one isn't. |
| "The session ran three days, I'll report it as today" | Say it was three days. A silently stretched window makes the whole report wrong in a way nobody can see. |
| "Recording hours would make the Gantt more precise" | It would make it a productivity metric. Day granularity, no durations. |

## The Bottom Line

**Verify before you write. Walk the ladder before you declare a limit.**

The handoff is only as honest as its worst line. Uncommitted work described as clean, a fabricated
SHA, and a field reported unsettable that was merely untried all break it the same way.
