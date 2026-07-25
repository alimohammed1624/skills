# {org} — work tracking

This repo is the org's **work record**. It holds no application code and runs no CI.

It is written by three Claude Code skills — `start-work`, `end-work`, and `/snapshot` — but it is
plain text, and you can read it without any of them.

## What's here

| Path | What it is |
|---|---|
| `tracks.yml` | The org-wide track registry. One entry per track. |
| `timeline/YYYY-MM/<dev>.jsonl` | Append-only event log, one file per developer per month. |
| `views/gantt.md` | Generated. Actual work dates, per track. |
| `views/dependencies.md` | Generated. Dependencies encountered while working. |

## The one rule

**State lives in GitHub. Events live here.**

*State* is what is true right now — an issue's status, its assignee, its planned dates. That is
always read live from GitHub and is **never** copied into this repo. *Events* are what happened,
when, and by whom. Those live only here and are never re-derived from GitHub, because the past does
not change.

Anything that needs both — "was this on schedule?", "did the dependency we declared match the one we
hit?" — joins the two at read time. `/snapshot` does that. Nothing in this repo caches the answer.

## Tracks and threads

A **track** is a set of related work — an epic. A **thread** is one unit of work inside it: one
GitHub issue, plus the PRs, branches, and commits that close it.

`tracks.yml` stores four fields per track, and no more:

```yaml
tracks:
  - id: payments-v2
    parent: {org}/api#38
    status: active                  # active | paused | done | abandoned
    exit_criteria: "checkout flow live for 100% of traffic"
```

The track's title, owner, and dates live on the `parent` issue — follow the pointer and read them
live. `status` exists because an issue offers only open or closed, and a paused track is not a
closed one. `exit_criteria` exists so a track can actually close instead of quietly ceasing to
generate events.

If you find yourself adding an assignee, a status label, or a description here, this file has become
a second issue tracker. Don't.

## The timeline

One JSON object per line. Fields:

| Field | Meaning |
|---|---|
| `schema` | Format version. Currently `1`. |
| `ts` | UTC, ISO 8601. Always UTC — local timestamps make cross-timezone charts lie. |
| `session` | Session id, shared by every event in one sitting. This is what stitches together a session that spans several repos. |
| `dev` | GitHub handle of the person the work is attributed to. |
| `event` | `session_start` · `session_resume` · `branch_created` · `progress` · `blocked` · `unblocked` · `done` · `handoff` · `session_end` |
| `track` / `thread` / `repo` / `branch` | Where the work happened. On thread-scoped events only. `thread` is always `owner/repo#N`. |
| `commits` | Short SHAs, so an entry can be checked against git rather than trusted. |
| `note` | One line: what actually happened. |
| `blocked_by` | `owner/repo#N` — a dependency hit while working. This is what the dependency view is built from. |

`session_start`, `session_resume`, and `session_end` describe the sitting, not a piece of work, so
they carry no track/thread/repo/branch.

```jsonl
{"schema":1,"ts":"2026-07-25T09:00:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"session_start","mode":"fan_out","threads":3}
{"schema":1,"ts":"2026-07-25T09:14:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"branch_created","track":"payments-v2","thread":"{org}/api#43","repo":"{org}/api","branch":"feat/api-43-refunds","title":"refund flow"}
{"schema":1,"ts":"2026-07-25T12:05:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"progress","track":"payments-v2","thread":"{org}/api#43","repo":"{org}/api","branch":"feat/api-43-refunds","commits":["9f2c1ab"],"note":"refund state machine"}
{"schema":1,"ts":"2026-07-25T18:20:00Z","session":"2026-07-25-nilendu-01","dev":"nilendu","event":"session_end","threads_touched":3,"repos_touched":3}
```

Note that `repo` and `branch` are *fields on the event*, not the event's location. A session
spanning three repos and three branches still writes to one file, on one branch, in this one repo.
Nothing is reconciled across repos afterward because nothing was ever split.

## Rules that keep this readable

1. **Append-only.** Timeline lines are written once and never rewritten, on any schedule, for any
   reason. A correction is a new event.
2. **One branch.** This repo is never branched, force-pushed, squashed, or rebased. Its history is
   linear, which is what makes rule 1 hold.
3. **`merge=union` on `*.jsonl` only.** Two developers appending concurrently always merge
   correctly. It is deliberately not extended to `views/` — union-merging two generated Markdown
   files produces a document that is neither. View conflicts are fixed by regenerating, never by
   hand-resolving.
4. **`views/` is generated.** Rebuilt from `tracks.yml` and the timeline on every `end-work` run.
   Hand edits are overwritten without warning.
5. **No durations, no rankings.** There is no hours field and no view that compares people. The
   timeline answers "what happened and how does work connect," never "who did more." Please keep it
   that way.
6. **Nothing is ever pruned.** A developer generating ~10 events a day produces a few hundred KB a
   year. An append-only log rewritten on a retention schedule is not append-only.
