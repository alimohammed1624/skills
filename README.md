# Test Project

This repo exists to test Claude Code skills — it's a harness, not a product. The `.claude/skills/`
directory holds the org work-tracking skills described by
[`docs/target-workflow.md`](docs/target-workflow.md), exercised against this repo and its org to
check that they trigger correctly and behave as specified.

## The design in one paragraph

**State lives in GitHub. Events live in a tracking repo.** State is what's true right now — an
issue's status, assignee, planned dates — always fetched live, never cached. Events are what
happened, when, and by whom — written once to an append-only timeline, never re-derived. Anything
needing both joins them at read time. The full design, including the five principles everything
follows from, is in [`docs/target-workflow.md`](docs/target-workflow.md);
[`docs/tracking-redesign.md`](docs/tracking-redesign.md) is the superseded brainstorm kept for the
reasoning, including the options that lost.

## Skills under test

Each skill is a `SKILL.md` with YAML frontmatter (`name`, `description`) that Claude auto-loads when
its description matches the task. The description is itself under test: does the right skill fire
for a given phrasing, and does it stay silent when another is the better fit?

There are **four** skills — the three the design specifies, plus gh-wrapper. The substrate they share
is a plain reference file, [`.claude/.tracking/format.md`](.claude/.tracking/format.md), not a skill:
it has no frontmatter, never triggers on its own, and is read as each skill's first step. It owns
everything about *where things live and what shape they are* — the deterministic paths, the
bootstrap-and-pull preflight, the `tracks.yml` schema, the timeline event format, branch naming, the
view-regeneration rules, and what this org's Issue Fields actually are. Factoring it out keeps one
copy instead of three; keeping it out of `skills/` keeps the skill surface matching the design.

**What to probe there:** that the paths are always derived and never recorded anywhere; that
`tracks.yml` stays at four fields and never accumulates issue state; that timeline lines are only
ever appended; that a `views/` conflict is discarded and regenerated rather than hand-merged.

### start-work

Owns **session lifecycle** — the only skill that opens a session, resumes one, or closes an
abandoned one. Recovery lives here because a developer who abandons a session is by definition one
who didn't run end-work. Preflight resolves the open session (resume under 36h, close as abandoned
at 36h+ with `session_end {inferred:true}`), then reads the current branch as a *hint* to pre-fill
the question tree, then asks what the session is for: continuing, starting something new, or just
looking. "Just looking" opens nothing and writes nothing. New work creates the issue with every
required field set and a branch named `<type>/<repo>-<issue#>-<slug>`, so the branch→thread link is
recoverable from the name alone.

**What to probe:** that a live session is resumed rather than restarted; that an abandoned session's
synthetic close is filed under *its* month, not today's; that "just looking" really writes nothing;
that the branch hint pre-fills without deciding; that issue creation asks rather than guessing a
Priority or Effort; that a new track can't be created without `exit_criteria`.

### end-work

Its iron law: **uncommitted or unpushed work blocks a clean handoff** — checked first, every run,
reported at the top, grouped by repo. Critically, the check runs in **every worktree the session
touched**, iterating `session.threads[].worktree`, not just the repo the developer is standing in.
Write access to the tracking repo is verified *before anything is written*, so a developer without
push rights gets a clear stop rather than events banked locally forever. It then updates issue
statuses, runs a compliance pass over commits referencing `#N`, appends the session's events,
regenerates the views, and pushes one commit — closing the session into `last_session` even when the
handoff was dirty, because the boundary records when you stopped, not whether it was clean.

**What to probe:** that all three worktrees get checked in a three-repo session and a vanished
worktree is reported rather than skipped; that the tracking clone's dirtiness stays out of the
developer's blocker section; that no-push-access stops the run *before* any write; that a rejected
push discards and regenerates `views/` instead of merging it; that a `Fixes #N` keyword doesn't
auto-close without verifying real completion; that the session still closes on a dirty run.

### snapshot

**Explicitly invoked only** — `/snapshot`, not "where do things stand." Three layers (current repo,
org rollup, who did what) plus the four joins that neither source can produce alone: planned vs.
actual, effort vs. what the work took, declared vs. encountered dependencies, and a complete org
rollup off one `git pull`. Read-only: the single file it writes is its own cursor. Attribution comes
strictly from author/assignee/reviewer fields and the timeline's `dev`, bots excluded, and it must
never rank or editorialize about anyone's output.

**What to probe:** that conversational phrasing doesn't trigger it; that it reads its cursor
*before* offering window options; that it never comments, writes a field, or appends an event; that
planned dates come from the issue and actual dates from the timeline and never the reverse; that a
repo with no timeline events is called untracked rather than inactive.

### gh-wrapper

Required sub-skill for all of the above. Narrow job: whenever a `gh` CLI command would otherwise run
— typed by Claude, pasted by the user, or implied by a script — translate it to the equivalent
`plugin:github:github` MCP tool call instead of shelling out. That's what keeps org-level Issue
Field and issue-type enforcement intact. When no MCP tool covers the action, it falls back to
running the real `gh` command directly rather than inventing a tool call or refusing outright — the
one exception is Issue Fields and issue types, which have no `gh` fallback at all. Plain `git` is
explicitly not `gh` and needs no translation.

**What to probe:** that `gh` only gets shelled out to when no MCP tool exists for the action, and
that the fallback is announced rather than silent; that issue creation is questioned rather than
filled with a guess when a field is missing; that an option name outside the org's actual list is
rejected; that Issue Fields/issue types are never set via a `gh` fallback; that translating or
falling back on a merge/delete doesn't skip confirm-before-acting.

## State

**Nothing lives in this repo.** All local state is outside every git repo on the machine:

| Path | Owner | Contents |
|---|---|---|
| `~/.claude/.tracking/<org>/` | all three | clone of the org tracking repo |
| `~/.claude/<org>.status.json` | start-work / end-work | `last_session` + the live `session` and its threads |
| `~/.claude/<org>.snapshot.json` | `/snapshot` | one `last_checked` timestamp |

The two cursor files share **zero fields**, and neither skill opens the other's. Both live outside
`.tracking/` deliberately: a file that must survive a reclone or a bad rebase inside that clone can't
live where the clone's own git operations can reach it.

## Environment notes for testers

Verified against the `msa1624` org, and worth knowing because the design doc assumes more than the
environment provides:

- **Issue Fields are exactly four**: Priority (`Urgent`/`High`/`Medium`/`Low`), Effort
  (`High`/`Medium`/`Low`), Start date, Target date. The doc's §5 also lists **Size** and
  **Estimate** — neither exists here. Skills must say so rather than invent them.
- **Issue types are Task, Bug, Feature.** There is no `Epic` type; a track's parent is a `Feature`,
  and it's a track because `tracks.yml` points at it.
- **Relationships has no write tool** in `plugin:github:github`. Dependencies are recorded as
  `blocked_by` timeline events; the declared side is read-only.
- **`msa1624/tracking` does not exist yet.** The first run of any of the three skills will offer to
  create it — with confirmation, since creating a repo is outward-facing. Bootstrap seeds
  `README.md`, `.gitattributes` (`*.jsonl merge=union`), and an empty `tracks.yml` from
  `.claude/.tracking/assets/`.

## Notes for testers

- Each `SKILL.md` ends with a "Red Flags — STOP" list and a "Common Rationalizations" table. These
  encode the specific failure modes the skill was written to prevent — closing an issue on a
  `Fixes #N` keyword without checking real completion, hand-merging a generated view, filing an
  abandoned session's close under the wrong month, silently merging two GitHub handles into one
  identity. They're a ready-made checklist for adversarial test cases.
- The four hard invariants worth targeting first: **append-only** (no timeline line is ever
  rewritten), **no cached state** (nothing committed carries an issue's status, assignee, or planned
  dates), **no rankings** (no view compares people, and no duration is ever recorded), and
  **out-of-band** (the record never lives on a branch of the work it describes).
- The tracked deletions of `auth.js`, `middleware.js`, and `worker.js` in this repo's history are
  fixture data — sample commits for the skills to reference (e.g. "Fix memory leak in background
  worker (fixes #7)"), not application code.
