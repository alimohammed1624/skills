# Target Workflow — Org Tracking & Skill Design

> **Status:** design target. This describes the end state the skills work toward. No skill files are
> edited by this doc.

---

## 1. Design Principles

Five rules govern everything below.

1. **State vs. event.** *State* is what is true right now — an issue's status, its assignee, what is
   blocking it. *Events* are what happened, when, and by whom. State lives only in GitHub and is
   always fetched live; it is never cached anywhere in the tracking system. Events live only in the
   timeline and are never re-derived from GitHub once written, because the past does not change. A
   report that needs both fetches state live and joins timeline history against it. Nothing reads
   current status out of the timeline, and no timeline entry is authoritative for anything but
   history.
2. **Pointer, not content.** A track's registry entry holds a pointer to its epic issue plus the
   handful of facts GitHub cannot express. If a field exists on the issue, the registry does not
   store it.
3. **Append-only.** Timeline events are written once and never rewritten, on any schedule, for any
   reason. A correction is a new event.
4. **No ranking.** The timeline answers "what happened and how does work connect," never "who did
   more." Nothing generated from it compares people against each other.
5. **Out-of-band.** The record of the work never lives on a branch of the work it describes. Branch
   identity is *data on an event*, never the *location* of an event.

**Scope.** This workflow is org-scoped by design. It depends on Issue Fields and issue types, which
are organization-only GitHub features — absent on a personally-owned account, not merely restricted.
`gh-wrapper` is account-agnostic; this workflow is not.

---

## 2. System Layout

Three pieces — one shared repo and two local files.

**The tracking repo**, one per org. A GitHub repo holding the track registry, the per-developer
event log, and the generated views. It contains no application code and runs no CI.

```
msa1624/tracking
├── README.md                       the format, for anyone who opens the repo cold
├── .gitattributes                  *.jsonl merge=union — and nothing else (§3)
├── tracks.yml                      the org-wide track registry
├── timeline/
│   ├── 2026-07/
│   │   ├── ali.jsonl               append-only, one file per developer per month
│   │   ├── nilendu.jsonl
│   │   └── priya.jsonl
│   └── 2026-08/
├── views/                          generated, never hand-edited — means "now"
│   ├── gantt.md
│   └── dependencies.md
└── reports/                        /snapshot's dated reports — means "then"
    └── 2026-08/
        └── 2026-08-05-1142.md      written once, never rewritten
```

**`views/` and `reports/` sit under opposite rules and the difference is the timestamp.** A view is
regenerated to mean *now*, so it may hold no live issue state (decision 11). A report is stamped with
the moment it describes, is never rewritten, and is therefore an archive rather than a cache — so it
carries exactly the live state a view may not. See §8.3.1.

**`<base>` is the directory the skill was invoked in**, resolved absolute with `pwd` on every run and
recorded nowhere. Every local path below hangs off it. It is one of two shapes — an org repo
(**layout R**), or a parent holding several org repo clones (**layout P**) — and `git rev-parse
--show-toplevel` tells you which.

**Nothing lives at `~/.claude/`.** That is Claude Code's own configuration directory and this design
does not put org state in it. State is **per working directory, not per machine**: two directories
on one machine each keep their own clone and cursors, even for the same org. The consequence is
worth stating because it will bite someone — **a session opened in one directory is invisible from
another.** Open and close a session from the same base.

**Two local cursor files**, one pair per org **per base**, gitignored and never shared. They live
outside `.claude/.tracking/`, which is a clone of a shared repo — a file that must survive a
reclone, a `git clean`, or a bad rebase inside that clone cannot live where the clone's own git
operations can reach it. The two are split by **who owns the write**:

- **`status.json`** — where hands-on work stands: the previous session's boundary and the live
  session. Owned by start-work and end-work.
- **`snapshot.json`** — when `/snapshot` last ran. Owned by `/snapshot`.

```
<base>/.claude/
├── .tracking/
│   └── msa1624/                    the working clone; skills pull, append, commit, push here
├── snapshots/                      /snapshot's report documents — derived, never read back
│   └── msa1624-2026-07-25-1442.md
├── msa1624.status.json             last + live session — start-work / end-work
└── msa1624.snapshot.json           /snapshot's cursor — /snapshot
```

`snapshots/` is **output, not state**, and it is the *local* copy of each report — the published one
goes to `reports/` in the tracking repo (§8.3.1). Nothing parses either — not the next `/snapshot`
run, not any other skill — and deleting this directory loses nothing recomputable. It exists so a run
still produces a readable report when the push fails, the tracking repo is missing, or the developer
has no write access.

**Product repos get nothing *tracked*.** In layout P this is literal — `<base>/.claude/` is the
parent directory and sits in no repo at all. In **layout R the base is inside a product repo**, so
`.claude/` does land there physically, and the skills keep it invisible by writing the exclusion
lines to `<toplevel>/.git/info/exclude`:

```
.claude/.tracking/
.claude/*.status.json
.claude/*.snapshot.json
.claude/snapshots/
.claude/tracking-org
```

**`.git/info/exclude`, never `.gitignore`.** `.gitignore` is tracked, so writing it would modify the
product repo's contents and land in someone's commit — the exact thing the write-surface table below
forbids. `.git/info/exclude` is local-only and untracked, so the exclusion costs the repo nothing.
Nothing is excluded in layout P because there is no repo to exclude it from, and the lines are
**never** written into the child repos.

**Write surfaces.** These skills write in exactly seven places, and nowhere else:

| Location | Writes permitted |
|---|---|
| `<base>/.claude/.tracking/<org>/` | The only place anything is committed or pushed — always after showing the diff. The developer's yes is given at the confirmation block (§8.1, §8.2), not again at the push: showing the diff is a *disclosure* requirement, and waiting on it is a second gate on a decision already made. **`/snapshot` is the one exception to the confirmation rule**: it adds a single new file under `reports/` on every run without asking, because the run *is* the request and the write is its own output (§8.3.1). |
| `<base>/.claude/<org>.{status,snapshot}.json` | Local cursor writes. No git involved. |
| `<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM.md` | `/snapshot`'s local report copy, one per run, never overwriting an earlier one (§8.3.1). Gitignored, no git involved. |
| Product repos | Branch creation and checkout, by start-work only (§8.1). No file contents modified, nothing committed, nothing pushed. |
| Issues in product repos | Creation and field-setting by start-work (§8.1); status reconciliation by end-work (§8.2). Issue *bodies* are not rewritten. |
| Projects v2 board items | Membership added by both workday skills, and `Status` moved per `status-policy.yml` (§3). No other board field is written without an established value. |
| PRs in product repos | **Creation only, by end-work only (§8.2)**, over commits the developer already pushed. Never merged, never reviewed, never approved; an existing PR's body and title are not rewritten. |

Everything else — existing PRs, issue bodies, other people's repos — is read-only.

**Why PRs are a write surface at all, and why only this much.** The record is
worthless if it says the work landed and no one can review it, and asking the
developer to open the PR by hand is the cognitive load these skills exist to
remove. But the surface stops at *creation*: a PR is a proposal, and every
judgment about it — approve, request changes, merge — belongs to a human. The
distinction that licenses the write is **who catches the mistake**. A PR opened
too early is caught by its reviewer, which is the mechanism working as designed.
A merge or an approval is caught by nobody.

**Creating the PR is not linking it.** The closing keyword in the body is what
creates GitHub's linked-issue relationship, and it is *silently ignored* unless
the PR targets the repo's default branch — see the gh-wrapper skill, which owns
the mechanics. A PR whose base makes the keyword inert is reported unlinked, never
described as linked.

```mermaid
%% Paths below use the CONCRETE example base (~/work), never the <base> placeholder
%% the prose uses. Mermaid renders labels as HTML, so <base> is stripped as an unknown
%% tag and "<base>/.claude/x.json" silently renders as "/.claude/x.json" — a plausible
%% path that has lost its root. It parses cleanly, so nothing warns you. Keep it concrete.
flowchart TB
    subgraph LOCAL["Developer's workspace — base is ~/work (layout P)"]
        direction TB
        subgraph WORK["product checkouts"]
            direction LR
            P1["~/work/api"]
            P2["~/work/web"]
            P3["~/work/platform"]
        end
        STATUS["~/work/.claude/msa1624.status.json<br/>last + live session"]
        SNAP["~/work/.claude/msa1624.snapshot.json<br/>/snapshot's cursor"]
        CLONE["~/work/.claude/.tracking/msa1624/<br/><b>clone of the tracking repo</b><br/>tracks.yml · timeline/ · views/ · reports/"]
        REPORTS["~/work/.claude/snapshots/<br/>local report copies"]
    end

    REMOTE[("msa1624/tracking<br/>one branch, append-only")]
    GH[("GitHub issues &amp; PRs<br/>current state, always live")]

    P1 -.->|session.threads| STATUS
    P2 -.->|session.threads| STATUS
    P3 -.->|session.threads| STATUS
    CLONE <-->|pull / commit / push| REMOTE

    SW[start-work] --> STATUS
    SW -->|org → deterministic clone path| CLONE
    SW -.-> GH
    EW[end-work] --> STATUS
    EW ==>|append events, regenerate views,<br/>commit + push| CLONE
    EW -.->|update issues, open PRs| GH
    PS["/snapshot"] --> SNAP
    PS --> REPORTS
    PS ==>|adds ONE file to reports/,<br/>commit + push. Never edits<br/>tracks.yml, timeline/, or views/| CLONE
    PS -.->|read-only| GH
```

One `git pull` on one clone yields every developer, every track, every repo — as local file reads
rather than API calls fanned out across the org.

---

## 3. The Tracking Repo

**One branch. The tracking repo is never branched**, and nothing in it is ever force-pushed,
squashed, or rebased into a different shape. Its history is linear and append-only, which is what
lets principle 3 hold.

**`merge=union` applies to `*.jsonl` and nothing else.** Timeline files are append-only, so a union
merge of two developers' appends is always correct. It is deliberately *not* extended to `views/` —
union-merging two generated Markdown files produces a document that is neither. View conflicts are
resolved by regeneration instead (§8.2).

**Branch identity lives on the event.** Each thread-scoped event records the `repo` and `branch` the
work happened in (§6). Work is therefore locatable in space as well as time, and a session spanning
three repos and three branches still writes to one file.

**Branch names carry the thread number**, in the form `<type>/<repo>-<issue#>-<slug>` — e.g.
`feat/api-41-checkout`. start-work generates every branch it creates this way (§8.1), so the
branch→thread link is recoverable from the branch name alone, with no lookup table to maintain.

### `status-policy.yml` — the board transition policy

The repo holds one authored file besides `tracks.yml`. It maps this workflow's lifecycle moments to
option names on a Projects v2 board's `Status` field:

```yaml
project: 2                  # the board this policy governs
field: Status
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

**Why it exists.** Board membership is a link, and §8.1 adds it automatically because adding is
idempotent and content-free. A `Status` value is *content* — principle-wise it is exactly the kind
of thing the "never guessed" rule protects, and "new issues start in Backlog" is a convention no
board states anywhere readable. Without a written policy the only correct behaviour is to report
`Status` unset, which is what leaves a card sitting in `Backlog` while its branch has been open for
a week.

**A written policy is a source.** With one, a transition is *derived* — it renders in the
confirmation block cited to the policy, and rides the same single yes as every other line. This is
the one field the workflow drives on its own, and it is legal only because the mapping was agreed
to once rather than inferred each time.

| Rule | |
|---|---|
| File absent | The policy is undefined. The block renders the transition `— ask`, with a suggestion built from the board's **actual** options, and the file is written on the yes. **Never seeded at bootstrap** — an empty `transitions: {}` reads as "leave everything alone" and would silently make the mechanism inert. |
| Key absent | No transition at that moment. Boards with no `Blocked` column are normal. |
| Value no longer an option on the board | Stale policy: report by name, re-ask that key, never substitute a neighbour. |
| Item already at the target | No-op, and not reported as a change. |
| Two moments in one session | Fire the last one reached. The board is state; the timeline carries the history. |

Option **names** are stored because a human reads and edits them; option **ids** are what the API
takes, and are resolved from that run's field discovery. `done` is the one transition that rides
the *named* closing yes rather than the blanket one — moving a card to the done column makes the
same claim as closing the issue, on the surface more people read.

### Worktrees

One tracking clone is shared by every worktree and every repo on the machine. One `status.json` is
likewise shared, with each active worktree appearing as an entry in `session.threads[]` (§4.1). A
session working several worktrees in parallel is the normal case, so the cursor tracks them as a set.

---

## 4. Local Cursor Files

Two files, two owners. Both gitignored, both outside every git repo on the machine.

### 4.1 `status.json` — owned by start-work / end-work

```json
{
  "schema": 1,
  "org": "msa1624",
  "last_session": {
    "started_at": "2026-07-25T09:00:00Z",
    "started_repo": "msa1624/api",
    "ended_at": "2026-07-25T18:20:00Z",
    "ended_repo": "msa1624/api"
  },
  "session": {
    "id": "2026-07-25-nilendu-01",
    "started_at": "2026-07-25T09:00:00Z",
    "threads": [
      { "track": "payments-v2",    "thread": "msa1624/api#43",      "repo": "msa1624/api",      "branch": "feat/api-43-refunds",       "worktree": "~/work/api" },
      { "track": "payments-v2",    "thread": "msa1624/web#22",      "repo": "msa1624/web",      "branch": "feat/web-22-payment-ui",    "worktree": "~/work/web" },
      { "track": "auth-hardening", "thread": "msa1624/platform#12", "repo": "msa1624/platform", "branch": "fix/platform-12-ratelimit", "worktree": "~/work/platform" }
    ]
  }
}
```

- **`last_session`** — where the previous session began and ended. This is the "since you left off"
  boundary; it is not a calendar cursor and carries no assumption that the previous session was
  yesterday.
- **`session`** — the live session: its id, when it opened, and every thread it has touched, each
  with the repo, branch, and local worktree path work is happening in. A list, not a single pointer.
  Absent when no session is open.

end-work moves the closing session into `last_session` and clears `session`. At most one session is
open at a time.

`session.threads[].worktree` is load-bearing: it is the list end-work iterates to enforce the
iron law across every repo a session touched (§8.2).

### 4.2 `snapshot.json` — owned by `/snapshot`

```json
{
  "schema": 1,
  "org": "msa1624",
  "last_checked": "2026-07-25T05:26:35Z"
}
```

That is the whole file. `/snapshot` reads `last_checked` to offer "since last check" as a report
window, and overwrites it at the end of each run.

### No cross-reads

The two files share no fields, and neither skill opens the other's. The tracking clone's location is
not recorded in either: `<base>/.claude/.tracking/<org>/` is a deterministic path from `org`, which every
skill derives from `git config --get remote.origin.url`. Bootstrap-if-missing and pull-before-use
(§9) run on every invocation regardless, so there is nothing to cache.

---

## 5. Tracks & Threads

- **Track** — a set of related work. An epic: "Payments v2," "Q3 auth hardening." Spans repos and
  weeks; has an owner, a target date, and exit criteria.
- **Thread** — one unit of work inside a track. One GitHub issue, plus the PRs, branches, and
  commits that close it.

Every thread has an issue, and **every issue carries the org's standard fields**, set at creation.

The workflow depends on *roles*, not on field names. Which field fills a role is discovered at call
time via `gh api /orgs/<org>/issue-fields` and is never hardcoded — the right-hand column is this org's mapping at
the last check, not a contract:

| Role | Used by | Field in this org |
|---|---|---|
| Ordering within a track | §5 | Priority |
| Planned start | §8.3 planned-vs-actual | Start date |
| Planned finish | §8.3 planned-vs-actual | Target date |
| Sizing signal | §8.3 calibration | Effort |
| Release grouping | §8.3 | Milestone — a native issue field, *not* an Issue Field |
| Declared dependencies | §8.3 | Relationships — the dependencies API, *not* an Issue Field |

Those last two are separate GitHub mechanisms that happen to sit on the same issue. They are
discovered, read, and written differently from Issue Fields, and conflating the three is how a
value ends up written somewhere nothing queries.

**If a role has no field, the analysis that needs it degrades and says so.** It is never
approximated with a neighbouring field that happens to accept a write. This org defines no `Size`
or `Estimate`; §8.3 states what that costs.

**These are never guessed.** A value the conversation has not *established* is asked for, not
invented — an estimate nobody stated is not a field to fill in with a plausible number.

**"Established" has a precise meaning**, and the skills own the full definition
(each workflow skill's *The Substrate* → *Established vs. guessed*). In short: a value is established when it has a
**source**, the source is **shown to the developer** beside it, and the developer **said yes after
seeing it** — all three. A value missing any one is guessed.

This is what makes the skills' research-and-propose flow legal rather than a loophole. The skill does
the looking-up so the developer never has to open the project board; the developer still does the
accepting. What is forbidden is the middle — a plausible value with a rationale composed afterwards
to justify it. **Source first, then value. Never value, then rationale.** A field with no source is
rendered as a question carrying a labelled suggestion, not as a proposal.

The planned-start and planned-finish fields are what make a thread's *planned* dates exist at all,
which is what `/snapshot` charts actuals against. Relationships and Milestone are live issue state
and are read live wherever they are needed; neither is copied into the timeline or `tracks.yml`.

**A dependency that research *found* is not a dependency a session *hit*.** A blocker discovered by
reading the issues is written to the issue's Relationship and **nowhere else**; only a blocker a
session actually ran into becomes a `blocked` timeline event. `blocked_by` is the sole input to
`views/dependencies.md` (§7) and to §8.3's declared-vs-encountered join, so feeding it discovered
dependencies makes that join compare a set with itself — degraded with no visible symptom.

**Finding a candidate is not declaring one.** start-work searches the org's open issues at creation
time, in both directions — what this work might depend on, and what might depend on it — and the
search is deliberately broad, because a blocker two repos over is exactly the one nobody finds by
hand. But what a broad search returns is *retrieval*, and **retrieval is not evidence.** A shared
label, a shared milestone, a similar title, or two issues touching the same file are all fine ways
to *find* a candidate and no reason at all to *declare* an edge.

A candidate reaches Relationships only when it carries a quotable **direction** — a sentence saying
which way round the two pieces of work go, quoted verbatim from the candidate's own body or from the
conversation ("blocked on X", "waiting on X", "after X lands"). What clears that bar is written
without asking, reported with its quote and a one-line undo, on the same principle §6 applies to
mirroring a `blocked_by` onto its issue: a question with one sensible answer is load, not consent.
What does not clear it is never written, and never rendered as a menu — a scan that hands the
developer twelve maybes to adjudicate has moved the work rather than done it.

The declared side therefore stays a set of facts someone accepted, not a set of search results, and
§8.3's join keeps its meaning. Nothing found this way ever reaches `blocked_by`.

Parent/child structure comes from GitHub sub-issues, not a shadow hierarchy. **A milestone is not a
track** — a milestone is a shipping checkpoint owned by GitHub, a track is a registry entry owned by
`tracks.yml`, and one track's threads may span several milestones.

`tracks.yml` is the org-wide registry, and has one home: the tracking repo. A track spanning
`msa1624/api` and `msa1624/web` is a single entry.

```yaml
- id: payments-v2
  parent: msa1624/api#38          # the epic issue — title, owner, dates all live here
  status: active                  # active | paused | done | abandoned
  exit_criteria: "checkout flow live for 100% of traffic"
- id: auth-hardening
  parent: msa1624/platform#12
  status: active
  exit_criteria: "all endpoints behind rate limiter, pen-test clean"
```

**Four fields, per principle 2.** A track's title, owner, start date, and target date live on the
epic issue, so they are not duplicated here — anything needing them follows `parent` and reads them
live. `id` is the stable slug timeline events reference; `parent` is the pointer. The remaining two
are the facts GitHub cannot express:

- **`status`** — four states where an issue offers open or closed. A paused track is not a closed
  one; an abandoned track is not a finished one.
- **`exit_criteria`** — a structured, checkable definition of done. As prose in the epic's body
  nothing could read it. Without it a track never closes; it stops generating events and leaves a
  permanent bar on the Gantt.

A track as a *reader* sees it — dates, owners, and statuses joined live from the issues, not as any
one file stores it. Only the id, `parent`, status, and exit criteria come from `tracks.yml`.

```mermaid
flowchart TB
    T1["<b>Track: payments-v2</b><br/>epic msa1624/api#38<br/>2026-07-14 → 2026-08-15 (from the issue)<br/>exit: checkout live @ 100% traffic"]
    T1 --> H1["Thread: api#41 · checkout endpoint<br/>@ali · done<br/>branch feat/api-41-checkout"]
    T1 --> H2["Thread: api#43 · refund flow<br/>@nilendu · in progress<br/>branch feat/api-43-refunds"]
    T1 --> H3["Thread: web#22 · payment UI<br/>@priya · blocked"]
    H1 --> C1["PR api#44 · 6 commits"]
    H2 --> C2["PR api#47 · 3 commits"]
    H3 -.->|blocked by| H2
```

---

## 6. Event Timeline

One file per developer per month: `timeline/YYYY-MM/<dev>.jsonl`. Two developers wrapping up
simultaneously never touch the same file; the same developer on two machines can, and `merge=union`
resolves appended lines automatically.

```jsonl
{"schema":1,"ts":"2026-07-25T09:02:11Z","session":"2026-07-25-ali-01","dev":"ali","event":"session_start","mode":"resume_same","threads":1}
{"schema":1,"ts":"2026-07-25T13:40:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"progress","track":"payments-v2","thread":"msa1624/api#41","repo":"msa1624/api","branch":"feat/api-41-checkout","commits":["a1b2c3d","e4f5a6b"],"note":"idempotency keys on charge endpoint"}
{"schema":1,"ts":"2026-07-25T15:10:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"blocked","track":"payments-v2","thread":"msa1624/api#41","repo":"msa1624/api","branch":"feat/api-41-checkout","blocked_by":["msa1624/platform#12"],"note":"needs the new rate-limit middleware"}
{"schema":1,"ts":"2026-07-25T18:20:00Z","session":"2026-07-25-ali-01","dev":"ali","event":"session_end","threads_touched":1,"repos_touched":1}
```

| Field | Rule |
|---|---|
| `schema` | version integer, so the format can evolve without breaking readers of old files |
| `ts` | UTC, ISO 8601, always — local time makes cross-timezone charts lie |
| `session` | the session id shared by every event in one sitting. This is what stitches a session together when it fans out across tracks, branches, and repos (§12) |
| `dev` | the GitHub handle of the person the work is attributed to |
| `event` | `session_start` · `session_resume` · `branch_created` · `progress` · `blocked` · `unblocked` · `done` · `handoff` · `pr_opened` · `session_end` |
| `track` | the `tracks.yml` id this work belongs to. Thread-scoped events only |
| `thread` | always `owner/repo#N`, never bare `#N`. Thread-scoped events only |
| `repo` | `owner/repo` — required on every thread-scoped event |
| `branch` | the branch the work happened on, or `null` on `main`/detached. Never inferred later |
| `title` | on `branch_created` only: the thread's title as of when work started. A label for the views, never refreshed and never authoritative (§7) |
| `commits` | short SHAs, so an entry can be checked against git rather than trusted on its word |
| `note` | one line of free text: what actually happened. Expected on `progress` and `blocked` |
| `blocked_by` | array of `owner/repo#N` — a dependency **hit while working**, never one merely discovered on the issue. §7's map is built from this alone |
| `to` | `handoff` only: the handle the work passes to. The issue is reassigned to them in the same step (§8.2) |
| `pr` | `pr_opened` only: the PR as `owner/repo#N`. Never a bare `#N`, never a URL, and never a predicted number — write the ref GitHub returned |
| `draft` | `pr_opened` only: `true` when the thread had remaining work, `false` when it was complete |
| `linked` | `pr_opened` only: whether the closing keyword actually created the linked-issue relationship. **Recorded because it cannot be re-derived** — a reader cannot otherwise tell a PR that never linked from one whose issue was closed by hand |
| `mode` | `session_start` and `session_resume`: `resume_same` · `fan_out` · `handoff` · `new_track`. On a resume it describes *that resume*, not the session's original shape |
| `threads` | `session_start`: threads the session opened with. `session_resume`: the total **after** that resume |
| `threads_added` | `session_resume` only: array of `owner/repo#N` the resume picked up. Omitted, not `[]`, when it added none — it is what lets a session-scoped event record *which* thread joined |
| `threads_touched` / `repos_touched` | `session_end` only: counts, so a session's shape is readable without replaying it |
| `inferred` | `true` on a synthetic `session_end` written for an abandoned session (§8.1). Never set on a recorded event |

**Session-scoped vs. thread-scoped.** `session_start`, `session_resume`, and `session_end` describe
the sitting rather than a piece of work, and a session routinely spans several tracks, repos, and
branches. `track`/`thread`/`repo`/`branch` do not apply to them and are omitted. Every other event
is thread-scoped and carries all four.

`branch_created` is its own event type rather than a flavour of `progress`: it fixes a thread's
actual start date, and the Gantt's bars begin there.

**No duration or hours field.** Session boundaries place work on a Gantt at day granularity. A
computed "time worked" number invites exactly the per-person comparison principle 4 rules out.

**Attribution.** `dev` is the human who triggered the session, matching commit *authorship* — read
from the author field and `Co-authored-by:` trailers, with bots excluded. An agent-authored commit
co-authored to a person attributes to that person.

---

## 7. Generated Views

`views/gantt.md` and `views/dependencies.md` carry a
`<!-- GENERATED — do not edit, rebuilt by end-work -->` header and are rebuilt from `tracks.yml`
and the timeline on every end-work run, after pulling latest.

**They are built from the timeline and `tracks.yml` alone — never from GitHub.** A committed file
carrying an issue's assignee, status, or planned dates would be a cache of state, wrong the moment
someone reassigned the issue. Everything rendered here derives from events, which cannot go stale
because they describe the past.

Node labels show a thread's title, which comes from the `title` recorded on that thread's
`branch_created` event (§6) — not a live lookup. It is the title as it stood when work began, and it
stays that way. If the issue is renamed, the view keeps the old label; the event is a record of what
was true then.

**The Gantt charts actuals only.** Bars run from a thread's `branch_created` to its `done`, or to
its latest event for work still open. Planned dates live on the issue's Start/Target fields, so
charting them here would mean caching them here — `/snapshot` reports the planned-vs-actual
comparison instead, joining live issue data against the timeline at report time (§8.3). A thread
with no events yet does not appear.

```mermaid
gantt
    title Org tracks — actual, derived from the timeline
    dateFormat YYYY-MM-DD
    axisFormat %m-%d

    section payments-v2
    checkout endpoint    :done,    a1, 2026-07-14, 8d
    refund flow          :active,  a2, 2026-07-24, 4d

    section auth-hardening
    rate limiter         :active,  a4, 2026-07-21, 9d
```

```mermaid
graph LR
    subgraph api["msa1624/api"]
        A41["#41 checkout endpoint"]
        A43["#43 refund flow"]
    end
    subgraph platform["msa1624/platform"]
        P12["#12 rate limiter"]
    end
    subgraph web["msa1624/web"]
        W22["#22 payment UI"]
    end

    P12 -->|blocks| A41
    A43 -->|blocks| W22
```

No assignees, no statuses, no colour-coding by state — all of that is live GitHub data, rendered by
`/snapshot` on request. What survives here is structure, which the timeline owns outright.

Dependency edges here come from one source only: each event's `blocked_by` field — a dependency
someone actually hit while working, which the timeline owns.

Edges recorded on the issues themselves are **not** baked in, whether they live in the structured
Relationships field or as `#N` references and "blocks"/"depends on" prose in a body. Both are issue
state: an issue's relationships can be edited at any time, so a committed copy would be wrong
without warning. `/snapshot` joins them live to render the fuller map (§8.3), which is also the only
view that can show the two sources disagreeing — a dependency hit in practice but never recorded on
the issue, or a Relationship declared on the issue that no session ever ran into.

---

## 8. Skill Workflows

### 8.1 start-work

start-work **owns session lifecycle**: it is the only skill that opens a session, resumes one, or
closes an abandoned one. Recovery belongs here because a developer who abandons a session is, by
definition, one who did not run end-work.

**start-work researches before it asks.** Everything a developer would otherwise open the project
board to find — what moved since they left, what is waiting on them, what blocks each thread, what
the parent and siblings carry — is gathered first, by read-only subagents running in parallel, and
rendered as one proposal. The developer reads it and says yes, or says what to change.

The branch a developer is standing on is a strong hint about what they are doing, which collapses
the common case of the question tree into a single confirmation. Intent resolves from three sources
in priority order: **what the developer said when they triggered the skill**, then the branch, then —
only if neither answers it — one question.

```mermaid
flowchart TD
    START([start-work]) --> SYNC["Pull the tracking clone;<br/>bootstrap it if missing (section 9)"]
    SYNC --> READ["Read status.json"]
    READ --> SESS{Open session?}
    SESS -->|None| NEW["Mark: new session"]
    SESS -->|"Open, under 36h"| RES["Mark: resuming"]
    SESS -->|"Open, 36h or older"| STALE["Abandoned — append session_end<br/>{inferred: true} for it now,<br/>clear it, say so in the briefing"]
    STALE --> NEW
    NEW --> BR
    RES --> BR
    BR["git rev-parse --abbrev-ref HEAD;<br/>grep timeline for this branch;<br/>grep handoffs (2 months, all devs)"] --> W1["<b>WAVE 1</b> — parallel, read-only:<br/>what moved · what awaits you ·<br/>blockers, ready_now, still_blocked"]

    W1 --> GATE1["Return gate on every payload"]
    GATE1 --> INTENT{Intent: from what they said,<br/>then the branch,<br/>then ask once}

    INTENT -->|Continuing| BLOCK
    INTENT -->|New work| W2["<b>WAVE 2</b>: field proposals,<br/>each classified established /<br/>precedent / must_ask"]
    INTENT -->|Just looking| BROWSE["Full org briefing;<br/>no session opened,<br/>nothing written"]

    W2 --> GATE2["Return gate"] --> BLOCK

    BLOCK["<b>ONE block</b>: the thread, the track,<br/>every field with its source,<br/>discovered blockers, the branch,<br/>and the alternatives not chosen"] --> YES{Explicit yes?}

    YES -->|Correction| REDO["Re-render the WHOLE block,<br/>re-derive dependent lines.<br/>Prior yes is void."] --> YES
    YES -->|"Silence / other topic"| NOTHING["Write nothing"] --> DONE
    YES -->|Yes| FRESH["Re-read every cited value live"]

    FRESH --> WRITE["Create issue (with Field provenance<br/>in the body) + branch;<br/>add to board, then set its Status (§3);<br/>status.json session.threads[];<br/>session_start / session_resume;<br/>show diff, push"]
    BROWSE --> DONE([end])
    WRITE --> DONE
```

- **An open session is stale after 36h without a close.** The threshold marks abandonment, not a
  calendar boundary: a session left open that long was walked away from rather than paused, since
  anyone still working it would have triggered start-work again inside the window and resumed it.
- **The stale close happens in preflight; the new session's own event waits.** Closing an abandoned
  session concerns work that is already over and does not depend on the current run's answers, so it
  is written immediately. `session_start` carries `mode` and the thread list, neither known until the
  question tree resolves, so it is appended at the end alongside `session.threads[]`.
- **An abandoned session is swept before it is cleared, and recovered by end-work when the sweep
  finds anything.** A session still in the cursor is by definition one end-work never closed, so a
  synthetic `session_end` on its own records that the session stopped and nothing about the work
  inside it. start-work therefore reads the worktrees first — uncommitted, unpushed, and commits
  with no timeline event — and hands off to end-work (§8.2) when any of that turns up, before
  opening the new session. **Clearing the cursor is the irreversible step**: end-work's window is
  `session.started_at` and falls back to midnight-today once `session` is gone, so work not swept
  before the clear falls permanently outside every future window.
- **The hand-off is automatic, and the cursor is its entire protocol.** No arguments pass between
  the skills: end-work reads `status.json` exactly as it always does and derives the long window
  from it. It is not gated by a prompt in start-work because **end-work renders its own confirmation
  block** — that block is the gate, and a second one in front of it only teaches people to skim
  both. A declined block writes nothing anywhere, leaves the stale session open, and stops the run:
  discarding work the developer just declined to record would invert their answer.
- **Re-running start-work on an open session resumes it rather than restarting.** The preflight
  finds it, appends `session_resume`, and continues with the same id, so a later burst lands inside
  the existing session instead of forking a second one covering the same work.
- **The branch lookup is a hint, not a decision.** It pre-selects a default; the developer can always
  choose otherwise. Standing on `main` with a clean tree simply means no pre-fill.
- **Research runs before the question, and writes nothing.** Its output is an input to what the
  developer is being asked, which is why it cannot run after. Results are never persisted — a
  research result is a cache of live state, so every value the block cited is **re-read live
  immediately before writing**, and a value that changed in the interval re-renders instead.
- **One block, one yes.** Every field discovery returned appears in it, each beside the source it was
  read from, with inferred lines marked and re-listed. A field with no source renders as a question
  carrying a labelled suggestion. Silence is not consent; a correction voids the previous yes and the
  whole block re-renders. The issue body carries a `Field provenance` section so the sources survive
  the confirmation and stay auditable. **It is not a copy of the block** — the block compresses each
  field to one line for a reader deciding now; the body carries what an inferred value was inferred
  from and what the runner-up was, for a reader auditing it a month later.
- **New work creates the branch**, named from the issue it just created (§3).
- **"Just looking" opens nothing and writes nothing.** A skill that demands a track before it will
  say anything is a skill people stop running.

### 8.2 end-work

**The iron law: uncommitted or unpushed work blocks a clean handoff.** It is checked first, on every
run, and reported at the top.

**The check runs over a derived *worktree set*, not over `session.threads[]` directly.** The set is
every `session.threads[].worktree` **plus the repo the developer is standing in**; with no session
open, it is the current repo plus every repo on this developer's timeline since the window. It is
never empty. Iterating `threads[]` alone silently checks nothing on a no-session run — which is
precisely the run where nobody opened a session and work is likeliest to be sitting uncommitted.

**The iron law is never delegated to a subagent.** A subagent the skill cannot see into reporting
"clean" is exactly the failure that ships someone's uncommitted work. It runs in the skill, before
any research is dispatched.

**Write access is verified before anything is written — and after the pull.** A developer without
push rights to the tracking repo does not get a degraded wrap-up that banks events locally forever;
the run stops and says so (§9). The order matters: a clone behind its remote fails a push dry-run
with a non-fast-forward rejection, which is **not** a permission failure and must not be read as one.

**end-work proposes, then writes once.** Research runs as read-only subagents after the iron law;
their findings become a single confirmation block covering the timeline events, the comments, the
labels, the field values, the dependency links, the handoff reassignments, and any PRs to open.
**A bare yes covers all of those. It never covers a closure** — closures are listed separately with
their evidence and confirmed only by a reply naming them.

**The consent line is who catches the mistake, not reversibility.** A PR opened too early is caught
by its reviewer; a comment, label, field, or assignee is visible and correctable. A closure is the
one write nobody watches, and it changes what everyone else believes is finished. Adding a second
gate for the PR would be a gate on a decision already made at the block, and the cost of that is
that people stop reading the first one.

**PRs open over pushed work only, and draft-vs-ready is derived rather than asked.** A thread whose
carry-over lists remaining work opens a draft carrying `Refs owner/repo#N`; a thread with nothing
remaining opens ready for review carrying `Closes owner/repo#N`, and the merge — a human action with
the keyword in view — is what closes the issue. A branch with unpushed commits gets no PR at all: it
would not contain the work. The closing keyword is silently ignored off the repo's default branch,
so the base is checked and the outcome recorded on the `pr_opened` event as `linked: true|false`.

**Mirroring is automatic, not offered.** Once a `blocked_by` event is going into the timeline the
fact is established and consented to, so the dependency is written onto the issue in the same step;
`unblocked` removes it. A `handoff` reassigns the issue to the recipient — a timeline that says the
work passed to someone while the issue still shows the sender is invisible to anyone reading only
GitHub, which is most people.

```mermaid
sequenceDiagram
    participant D as Developer
    %% Concrete base (~/work), not <base> — mermaid strips it as an HTML tag. See §2's diagram.
    participant S as end-work
    participant P as every session worktree
    participant T as ~/work/.claude/.tracking/msa1624
    participant G as GitHub

    D->>S: wrap up
    S->>S: read status.json (window, session.threads)
    S->>T: write-access preflight — can I push?
    Note over S,T: NO ACCESS → STOP before writing anything (§9)
    S->>P: git status + unpushed check in EVERY session worktree
    Note over S,P: BLOCKING — the developer's own work,<br/>across every repo the session touched
    S->>G: live issue/PR state for the session window
    S->>G: update statuses, assignees, dependency links — reconcile push activity
    S->>G: move board Status per status-policy.yml (§3)
    S->>G: open PRs over pushed work — link + board them
    Note over S,G: closing keyword is INERT off the default branch:<br/>check the base, record linked:true|false
    S->>T: git pull --rebase
    S->>T: append events to this month's dev file
    S->>T: regenerate views/gantt.md + views/dependencies.md
    S->>D: show the timeline diff, then push — no second yes
    D->>S: confirm
    S->>T: commit + push (one commit, tracking repo only)
    Note over S,T: push rejected → discard views/, pull --rebase<br/>(jsonl union-merges), regenerate views, push.<br/>NEVER hand-resolve a views/ conflict
    S->>D: report
    S->>S: close the session — move it to last_session
```

**Blockers are reported grouped by repo**, never as one flat list — three uncommitted files across
three repos are three separate pieces of work to land. A repo in `session.threads[]` that no longer
exists on disk is itself reported rather than silently skipped.

**View conflicts are discarded and regenerated, never resolved.** On a rejected push: throw away
local changes under `views/`, `pull --rebase` (only `*.jsonl` remains in play, and `merge=union`
handles it), regenerate the views from the merged timeline, push again. This is safe because views
are derived — a regenerated file is always correct, a merged one may be neither developer's output.

**A session is bounded by start-work and end-work, not by the calendar.** It may run twenty minutes
or span several days, and it may be one continuous sitting or a series of bursts. Each invocation
inside an open session appends `progress` events carrying its id; end-work closes it once.

Two further conditions:

- **The tracking clone is behind or dirty.** Always `pull --rebase` before appending. A clone left
  dirty by a previous run is surfaced in its own report line, never merged into the developer's
  uncommitted-work blocker. They are different problems with different fixes.
- **A transient push failure** (offline, or a race outliving the retry) leaves events on disk,
  append-only, and reported; they push on the next run. This covers transient failures only — a
  permissions failure is caught by the preflight and is not a delay.

### 8.3 /snapshot

An **explicitly invoked** command, not a skill that fires on conversational phrasing. A three-layer,
org-scoped, per-developer report only runs when someone asks for it.

Three layers: current repo detail, org-wide rollup, and who-did-what. Attribution comes strictly
from author/assignee/reviewer fields.

**It reads the record and never writes it.** No events, no issue writes, no board `Status` moves, no
`views/` regeneration, and no edit to anything already in the tracking repo. What it *does* write is
its own output: the `snapshot.json` cursor, a local report copy, and one new file under `reports/`
which it commits and pushes (§8.3.1). The test for any write is whether something else would read it
as a source — if yes, `/snapshot` must not write it. It reads
`status-policy.yml` to know what the moments *should* map to, which makes a card disagreeing with
the timeline a reportable finding (§3) rather than noise — reported, never corrected. It does clone the tracking repo if missing and pull it
before every run (§9) — sync is not authorship, and a report built on a stale clone is wrong. **But
it clones what exists and never creates**: cloning is sync, creating a repo is authorship.

**The layers and joins run as parallel read-only subagents**, which is what makes a three-layer org
report affordable. Two rules keep that safe:

- **Field discovery happens once, in the skill, and is passed to every agent.** Several agents
  discovering independently can return several mappings, which the report would then render as one
  schema — wrong with no visible symptom.
- **Agents return structured findings; the skill renders them.** Principle 4 is a property of the
  output, and prose cannot be reliably de-editorialized after the fact — but a parent can refuse to
  accept anything that isn't rows. For the same reason, **the skill writes the "which comparison I
  ran" line, never the agent**: an agent that ran a partial join is the worst-placed thing in the
  system to describe how partial it was.

It produces four things neither source can show on its own, each a live join of issue state against
timeline history — computed at report time and cached nowhere:

- **A complete org rollup, cheaply.** One `git pull` plus local file reads, rather than fanning out
  across every repo in the org.
- **Planned vs. actual.** Planned dates fetched live from whichever fields fill the planned-start
  and planned-finish roles (§5) — `Start date` and `Target date` in this org — actual dates read
  from the timeline. The committed Gantt charts actuals only (§7).
- **Sizing vs. actual.** The sizing field is what the work was expected to take; the timeline shows
  the sessions it actually took. The two together are how estimates get calibrated, and they are
  never compared across people (principle 4). This org defines no separate `Estimate` or `Size`, so
  the comparison available is Effort against the timeline — one signal, not two. `/snapshot` says
  which comparison it ran rather than presenting a degraded one as the full analysis.
- **Declared vs. encountered dependencies.** The issues' Relationships field says what was expected
  to block what; the timeline's `blocked_by` events say what actually did. Each direction of
  disagreement is worth surfacing — a dependency hit in practice but never declared, and a declared
  Relationship no session ever ran into. **Neither side ever contains a search candidate**: both are
  sets someone committed to, and admitting a third kind would make the join report a disagreement
  that never existed.

Milestone is available on every issue and is the natural grouping for a release-shaped report, which
cuts across tracks rather than following them (§5).

#### 8.3.1 Where the report goes, and why it is published

Two byte-identical copies of one document, both stamped with the same UTC timestamp the run writes
to `last_checked`:

| Copy | Path | Purpose |
|---|---|---|
| Local, first | `<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM.md` | Survives a failed push, a missing tracking repo, or no write access. Gitignored via `.git/info/exclude` (§2) |
| Published | `<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM.md` | Committed and pushed every run. **GitHub renders the mermaid**, so a SHA-pinned permalink is a rendered report for anyone with repo access and no local tooling |

Chat gets the permalink first, then a summary, the local path, and — always — which comparisons ran
and which repos weren't covered.

**Publishing is why the diagrams are worth drawing.** Mermaid needs a renderer; the most reliable
one available here is GitHub itself. `/snapshot` has no mermaid dependency and never invokes or
probes for one — it writes fenced text and lets the surface render it.

**Writing it is not authoring the record.** The law protects what anything else reads as truth: the
timeline, issues, boards, `views/`. A report is `/snapshot`'s own output, added as one new file,
never amended, and read by nobody as a source.

**The report may hold live state; a view may not** — and the axis is **dated vs. current**, not
local vs. committed. `views/` is regenerated every end-work run to mean *now*, so it is built from
the timeline and `tracks.yml` alone and labels nodes from the `title` captured on `branch_created`
(§7, decision 11); a live value in a current-picture file is a cache that goes stale invisibly. A
report says "as of 2026-08-05T11:42Z" in its filename and its header, is written once, and is never
rewritten — so live titles and live field values are correct in it. Nothing can mistake it for
current state.

**Operational rules**, each with a reason that does not generalize to the other skills:

- **Write-access preflight, but it never blocks.** No push rights → build the report, write it
  locally, say it could not be published. This deliberately differs from end-work, which *refuses*
  to run without access: end-work's output is events, and banking events nobody will see is
  dishonest, whereas a report is self-contained and worth the same on disk.
- **Exactly one added path per commit**, verified with `git status --porcelain` before committing.
  Anything else staged means another process touched the clone, and committing it would make
  `/snapshot` the author of a change it never intended.
- **Rejected push → rebase and retry once. Never discard, never regenerate.** The opposite of the
  `views/` rule, because a view is derivable and a report describes a moment that has passed —
  regenerating would produce a *different* report under the same timestamp.
- **Reports are immutable.** A wrong one is superseded by the next run, never amended or
  force-pushed. A rewritten permalink is a permalink that lies.
- **Permalinks pin to the commit SHA**, never a branch ref.

**What publishing costs, stated plainly.** Every run now puts a permanent, linkable, per-person
record of a work window into a shared repo — "Who Did What" no longer evaporates. Principle 4
therefore binds *harder*: no ranking, no scoring, no durations, no evaluative word about anyone's
week, and anything borderline is left out. The audience is everyone with repo access, not just the
person who ran it.

It carries two mermaid diagrams, and both exist precisely because the committed views cannot draw
them:

- **Planned vs. actual gantt.** `views/gantt.md` charts actuals only, so this is the only place the
  planned side — live from the `Start date` / `Target date` fields — appears on the same axis as
  `branch_created` and `done`. Day granularity, no durations (principle 4). "Planned but never
  started" shows as a planned bar with no actual bar.
- **Declared vs. encountered dependency graph.** `views/dependencies.md` is built from the
  encountered side alone, so this is the only place the two sources can be seen disagreeing. Three
  edge shapes: both, encountered-only, declared-only. **No inferred edges and no search candidates**,
  in the graph exactly as in the prose.

**A diagram is bound to its join.** If a join reports `ran: false`, its reason is printed where the
block would have gone — a chart standing in for a not-run analysis is read as the analysis having
run. A gantt charting a subset of threads captions how many it omitted and why.

**Nothing charts people.** No contributor graph, no commit-volume bars, no per-person timeline.
Principle 4 binds hardest in a diagram: a chart of people ranks them by its shape, whatever its
caption says.

**The diagrams are additive, never load-bearing.** `/snapshot` has no mermaid dependency — it writes
fenced text and never invokes or checks for a renderer. Whether that becomes a picture is the
reader's viewer, and the likely case is that it does not: the most reliable mermaid renderer in this
workflow is GitHub, which is exactly the surface a never-pushed document cannot reach. So **every
finding a diagram shows is also written out in prose beneath it**, and captions and legends sit
outside the fence. A reader with a pager loses the shape of a finding and none of its substance.
Rendering it by pushing it somewhere would trade a fresh local report for a stale shared cache,
which is the trade this whole design refuses.

---

## 9. Bootstrap & Access

| Situation | Behaviour |
|---|---|
| Tracking repo does not exist for the org | **start-work / end-work:** offer to create it — **with confirmation**. Creating a repo is outward-facing and never happens implicitly. **`/snapshot`: never offers.** Cloning is sync; creating is authorship. It reports the absence, names start-work, and runs the GitHub-only layers with the timeline joins reported as not-run. |
| Repo exists, no local clone | Clone to `<base>/.claude/.tracking/<org>/` — a deterministic path, nothing to record. Whichever of start-work, end-work, or `/snapshot` runs first bootstraps it; the others find it present. |
| Clone exists but is stale | `git pull --rebase` at the start of every start-work, end-work, and `/snapshot` run. Not conditional on a stored sync timestamp — there isn't one. |
| Developer has no write access | **end-work refuses to run**, checking push access before writing anything rather than banking events nobody will see. **start-work works in full** (it only reads until its final step). **`/snapshot` also works in full** — it builds the report and writes the local copy, losing only the published permalink; a report is self-contained, unlike an event nobody will see. A `--local-only` escape hatch exists for someone knowingly accepting an unshared record; it is never the default and never silent. |
| Empty `tracks.yml` | "Task in an existing track" is not offered in the question tree; the flow degrades to "brand new track" with no special case. |
| A field or relationship looks unsettable | Walk both rungs before saying it cannot be set, then name what was tried. Running out of time makes a field *unset*, never *unsettable*. |
| Owner is a personal account | Issue Fields and issue types do not exist there. The analyses that depend on them degrade per §5 and say so; nothing is approximated to fill the gap. |

Access to GitHub itself is `gh-wrapper`'s job — `.claude/skills/gh-wrapper/SKILL.md` owns the ladder
and the per-surface traps, and `docs/github-surfaces.md` owns the mechanics of what each surface can
and cannot reach. This section states what must hold, not how to reach it; neither is restated here.

Delegated research is named in the output too: what ran, what it read, and what it could not cover.
An agent's partial coverage is printed rather than quietly folded into a complete-looking result.

The skills operate on the tracking repo visibly, not silently. Committing in a directory the
developer never named is something they are told about, even when it is exactly what they asked for.

---

## 10. Guardrails

- **Verifiable, not trusted.** Every `progress` event carries commit SHAs. An entry with no SHAs and
  no issue reference renders visibly softer in the views than one that can be checked.
- **No leaderboards, ever.** Every developer's session log sits in one repo, which is what makes the
  org view work and what makes principle 4 easy to violate. No generated view ranks or compares
  people, and no view may be added that does.
- **`README.md` in the tracking repo, committed.** A shared record whose format nobody can read is
  not shared. People will find this repo with no context for what wrote it.
- **A compliance pass in end-work** checks that every commit referencing `#N` during the session
  has a corresponding timeline event, reported in the same "compliance gaps found" section as a
  missing progress comment.
- **Exit criteria are required on every track**, so tracks can close rather than silently stop
  generating events.
- **The board is state, and the workday skills keep it current.** A card that never moves misleads
  more than a card that was never added, because there is no blank to notice. Every transition
  comes from `status-policy.yml` (§3) — a written policy, never a mapping inferred from column
  names — and appears in the confirmation block before it is written.
- **Retention: keep everything, forever.** A developer generating ~10 events a day produces a few
  hundred KB a year. There is no compaction and no pruning — an append-only log rewritten on any
  schedule is not append-only.
- **The timeline stays event-shaped.** If `tracks.yml` accumulates statuses, assignees, or
  descriptions duplicating the epic issue, it has become a second issue tracker and principle 2 has
  been abandoned.

---

## 11. Quick Reference

| Question | Answer |
|---|---|
| Where does the timeline live? | A dedicated org-level repo, `<org>/tracking`, with exactly one branch. |
| Where do the local cursors live? | `<base>/.claude/<org>.status.json` and `<base>/.claude/<org>.snapshot.json` — outside `.tracking/`, one pair per org **per base**, where `<base>` is the directory the skill was invoked in. **Never `~/.claude/`**, which is Claude Code's own config directory. |
| Per machine or per directory? | **Per working directory.** Two bases on one machine keep separate clones and cursors for the same org, and a session opened in one is invisible from another. |
| How many cursor files, and who owns them? | Two, fully independent. `status.json` → start-work / end-work. `snapshot.json` → `/snapshot`. Zero shared fields, no cross-reads. |
| Where is the tracking clone's path recorded? | Nowhere. `<base>/.claude/.tracking/<org>/` is derived from `org` on every run. |
| What does `tracks.yml` store? | Four fields: `id`, `parent`, `status`, `exit_criteria`. |
| Does anything move a card across the board's columns? | Yes — start-work fires `issue_created`, `branch_created`, `resumed`; end-work fires `blocked`, `unblocked`, `pr_opened`, `handoff`, `done`. All from `status-policy.yml` (§3). |
| What if there's no `status-policy.yml`? | The transition renders `— ask` with the board's real options, and the file is written on the yes. It is never seeded, and a mapping is never inferred from column names. |
| Does closing an issue move its card to Done? | Not reliably — only if that board's built-in workflow is enabled, which isn't readable from the API. end-work writes the transition explicitly, on the same named yes as the closure. |
| What fields does every issue carry? | Whatever the org defines, discovered at call time. The workflow needs roles — ordering, planned start, planned finish, sizing — plus Milestone and Relationships. Set at creation: researched, shown with their sources, and confirmed before writing (§5). |
| Who does the looking-up? | The skill, not the developer. Research runs as read-only subagents in parallel, and nothing they return is written until it has passed the return gate and the developer has accepted the block. |
| Do generated views contain issue state? | No. Timeline and `tracks.yml` only. Every issue-vs-timeline comparison — planned/actual, sizing/actual, declared/encountered dependencies — is computed by `/snapshot` at report time. |
| Then how can `/snapshot`'s report hold live state, when it is committed too? | The axis is **dated vs. current**, not local vs. committed. A view is regenerated to mean *now*; a report is stamped with *then*, written once, never rewritten — an archive, not a cache. That is what lets it draw the planned-vs-actual gantt and the declared-vs-encountered graph `views/` deliberately cannot (§8.3.1). |
| Where does the snapshot report go, and is it shared? | Two copies: local at `<base>/.claude/snapshots/<org>-<stamp>.md` (gitignored), and published at `<clone>/reports/YYYY-MM/<stamp>.md`, committed and pushed every run. **Yes, it is shared** — anyone with repo access can open the SHA-pinned permalink, and GitHub renders its mermaid. |
| Does `/snapshot` need push access? | To publish, yes. To *run*, no — without it the report is still built and written locally, and only the permalink is lost. |
| Can a published report be corrected? | No. It is immutable: superseded by the next run, or reverted by a human. `/snapshot` never amends or force-pushes one. |
| Is timeline history ever compacted? | No. |
| How are `views/` conflicts resolved? | Discarded and regenerated. `merge=union` covers `*.jsonl` only. |
| Who owns session lifecycle? | start-work — opens, resumes (`session_resume`), and closes abandoned sessions (`session_end {inferred:true}`). |
| What happens to a session nobody wrapped up? | start-work sweeps its worktrees read-only. Clean → synthetic close, one line. Anything found → it invokes end-work to recover it properly, before opening the new session (§8.1). |
| Does one skill ever invoke another? | start-work → end-work, on that recovery path only. Never the reverse — recovery runs one way so it cannot loop. |
| What if the developer declines the recovery block? | Nothing is written by either skill, the stale session stays open, and no new session opens. Closing it anyway would discard exactly what they declined to record. |
| Is duration or hours recorded? | No. |
| How is branch tracked? | `repo` + `branch` fields on each thread-scoped event, plus the `<type>/<repo>-<issue#>-<slug>` naming convention. |
| How is a multi-repo session held together? | A `session` id on every event, plus `session.threads[]` in `status.json`. |
| What if a developer cannot push to the tracking repo? | end-work refuses to run, before writing anything. |
| Who opens PRs? | end-work only, over already-pushed commits, on the block's single yes. start-work cannot: a freshly cut branch has no commits to propose. |
| Draft or ready for review? | Derived from carry-over, never asked. Remaining work → draft + `Refs`; nothing remaining → ready + `Closes`. |
| Does a PR ever get merged, reviewed, or approved by a skill? | No. Creation is the entire PR surface — every judgment about a PR belongs to a human. |
| Why does opening a PR not need its own yes, when closing an issue does? | Who catches the mistake. A premature PR is caught by its reviewer; a premature closure is caught by nobody. |
| What links a PR to its issue? | The closing keyword in the body, in full `owner/repo#N` form — and it is **silently ignored unless the PR targets the default branch**, so the base is checked and `linked` is recorded on the event. |
| Is `/snapshot` auto-triggered? | No — explicitly invoked. |

---

## 12. Worked Example — One Trigger, Many Tracks, Many Repos

A developer triggers Claude at 09:00. Over the session it works on the refund flow and the payment
UI (both track `payments-v2`, in `msa1624/api` and `msa1624/web`) and on the rate limiter (track
`auth-hardening`, in `msa1624/platform`). Three repos, three new branches, two tracks, one session.

```mermaid
flowchart LR
    DEV["@nilendu triggers Claude<br/>2026-07-25 09:00"] --> S["<b>session</b><br/>2026-07-25-nilendu-01"]

    S --> TR1["track<br/>payments-v2"]
    S --> TR2["track<br/>auth-hardening"]

    TR1 --> TH1["thread api#43<br/>refund flow"]
    TR1 --> TH2["thread web#22<br/>payment UI"]
    TR2 --> TH3["thread platform#12<br/>rate limiter"]

    TH1 --> BR1["msa1624/api<br/>feat/api-43-refunds"]
    TH2 --> BR2["msa1624/web<br/>feat/web-22-payment-ui"]
    TH3 --> BR3["msa1624/platform<br/>fix/platform-12-ratelimit"]

    BR1 ==> JL["<b>timeline/2026-07/nilendu.jsonl</b><br/>one file · one repo · one branch<br/>every event tagged session + repo + branch"]
    BR2 ==> JL
    BR3 ==> JL
```

The fan-out converges. Three repos and three branches produce events in one file, in one repo, on
one branch, because `repo` and `branch` are fields on the event rather than the event's location.
Nothing is reconciled across repos afterward because nothing was ever split.

```jsonl
{"schema":1,"ts":"2026-07-25T09:00:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"session_start","mode":"fan_out","threads":3}
{"schema":1,"ts":"2026-07-25T09:14:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"branch_created","track":"payments-v2","thread":"msa1624/api#43","repo":"msa1624/api","branch":"feat/api-43-refunds","title":"refund flow"}
{"schema":1,"ts":"2026-07-25T09:31:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"branch_created","track":"auth-hardening","thread":"msa1624/platform#12","repo":"msa1624/platform","branch":"fix/platform-12-ratelimit","title":"rate limiter"}
{"schema":1,"ts":"2026-07-25T12:05:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"progress","track":"payments-v2","thread":"msa1624/api#43","repo":"msa1624/api","branch":"feat/api-43-refunds","commits":["9f2c1ab"],"note":"refund state machine"}
{"schema":1,"ts":"2026-07-25T14:40:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"blocked","track":"payments-v2","thread":"msa1624/web#22","repo":"msa1624/web","branch":"feat/web-22-payment-ui","blocked_by":["msa1624/api#43"],"note":"UI needs the refund endpoint shape settled"}
{"schema":1,"ts":"2026-07-25T18:20:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"session_end","threads_touched":3,"repos_touched":3}
```

The `blocked` event records a cross-repo dependency — `web#22` waiting on `api#43` — discovered
while doing the work. That edge may never be written into either issue, and it is what feeds §7's
dependency map.

At wrap-up, end-work reads `session.threads[]` and runs the blocking check in all three
worktrees, not just the one the developer is standing in.

```mermaid
%% Concrete base (~/work), not <base> — mermaid strips it as an HTML tag. See §2's diagram.
flowchart TD
    EW([end-work]) --> LOAD["Read session.threads from<br/>~/work/.claude/msa1624.status.json"]
    LOAD --> LOOP["For EVERY worktree in the derived set<br/>(never empty, even with no session)"]
    LOOP --> A["~/work/api<br/>git status + unpushed check"]
    LOOP --> B["~/work/web<br/>git status + unpushed check"]
    LOOP --> C["~/work/platform<br/>git status + unpushed check"]
    A --> AGG{Anything dirty<br/>in any of them?}
    B --> AGG
    C --> AGG
    AGG -->|Yes| BLOCK["BLOCKING section, grouped by repo,<br/>at the top of the report"]
    AGG -->|No| OK["Clean — proceed to reporting"]
    BLOCK --> REST["Timeline append + push happens either way:<br/>the boundary records when you stopped,<br/>not whether the handoff was clean"]
    OK --> REST
```
