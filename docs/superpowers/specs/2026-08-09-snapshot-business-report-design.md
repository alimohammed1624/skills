# Design — a business-stakeholder report from `/snapshot`

**Date:** 2026-08-09
**Skill:** `.claude/skills/snapshot/SKILL.md`
**Status:** approved, not yet implemented

## The change in one paragraph

`/snapshot` produces **two documents from one pass** instead of one. The existing technical report is
unchanged. A second, non-technical report — written for business stakeholders — is rendered from the
same computed layers and joins, published beside the technical one in the same commit, and carries
its own permalink so it can be forwarded without the engineering detail attached. Nothing about the
skill's iron law changes: it still reads the record, still writes only its own output, and the new
document is read back by nothing.

## Why a second file rather than a section

A stakeholder needs a link they can send. A section at the top of the technical report cannot be
shared without the per-repo issue tables underneath it, and a document that serves two audiences
serves the second one badly. Two files also keep the existing report byte-identical to what it is
today, so nothing that reads well now regresses.

## What the business document contains

Four sections, in this order.

### 1. Where things stand

One line per track: **on track · at risk · blocked · not started**, with the track's owner named.

The **planned-vs-actual gantt is reused unchanged** from the technical report — the same fenced
mermaid block, bound to `join_planned_vs_actual`, under the same rules: no diagram if the join
reported `ran: false`, the omitted-thread caption sits outside the fence, and every finding the chart
shows also appears in the prose beneath it. There is no second chart to keep honest.

### 2. What landed this window

Themes in plain language — "refund handling shipped end to end" — each linked to the issue or PR that
carries it, identified by title as a markdown link per *Identifying Items*. No commit counts, no
per-person breakdown.

### 3. Needs a decision

Only items where the business side must act:

- blocked on a party outside the team
- planned and never started
- slipped past its Target date
- open and unowned

### 4. What this doesn't cover

Not-run joins with their `phrase` printed verbatim, `not_covered[]` repos, and repos with no timeline
coverage (untracked, not inactive). The honesty rule does not relax because the audience changed —
if anything, it binds harder, because this reader cannot tell a thin report from a complete one.

## Two prohibitions specific to this document

These sit on top of principle 4, which already forbids rankings, scores, and durations everywhere.

**No per-person section, no counts, no durations.** Owners are named on tracks and on decision items,
so a reader knows who to ask. "Who Did What" stays in the technical report only. A business-facing
per-person contribution list is the single most likely thing in this system to be read as a
productivity comparison, and it is now permanent and linkable.

**No invented certainty.** No percent-complete, no forecast date unless that date is a Target date on
the issue, no confidence score. A verdict of *at risk* must name the observation behind it — "planned
2026-07-18, no branch cut yet" — never restate itself. This is the same sourced-then-shown rule the
rest of the system applies to field values, and the same failure mode: a plausible value with a
rationale composed afterwards to justify it.

## How it is produced — Brief 5

A fifth research agent, dispatched **after Step 5**, once the layers and all four joins are complete.

**It works from the computed pass, never from GitHub.** Its brief carries the finished layers, joins,
threads, and verdicts. It performs no `gh` call, no field discovery, and no lookup of any kind. This
is what makes the two documents incapable of disagreeing: they describe one moment, computed once.

**It returns a structured payload, never prose:**

```json
{
  "themes":     [{"headline": "...", "items": ["msa1624/api#43"], "evidence": "..."}],
  "verdicts":   [{"track": "payments-v2", "verdict": "at_risk",
                  "observation": "planned 2026-07-18, no branch_created"}],
  "decisions":  [{"item": "msa1624/web#22", "why": "...", "who": "@priya|null"}],
  "not_covered": [...]
}
```

The skill re-renders every line from this payload. Agent sentences do not reach the document — the
existing prohibition on passing agent prose into a report applies here unchanged.

### The return gate

The payload is **discarded whole** if any of these hold:

- its `surface_log` shows any GitHub call — this agent has no reason to make one
- it names an issue, PR, or track that was not in its brief
- a verdict carries no `observation`, or the observation restates the verdict rather than citing
  something outside it
- it reports a number the joins did not produce, or any duration, percentage, or ranking
- it writes about a person rather than about work with an owner attached

On a discarded payload the run does **not** retry and does **not** fall back to composing the
document itself. The technical report publishes normally and the chat says the business report was
not produced, with the reason.

## Publishing

```
<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM.md            technical, unchanged
<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM-business.md   new
<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM.md                   technical, unchanged
<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM-business.md          new
```

One run stamp across all four filenames and `last_checked`, as today. Both local copies are written
before either is published.

**The staging gate changes from one path to two.** `git status --porcelain` must show **exactly two
added paths, both under `reports/YYYY-MM/` and both carrying this run's stamp**. Anything else — a
modified `views/` file, a `tracks.yml` edit, a rebase leftover — stops the publish, exactly as today.
The gate's purpose is unchanged: `/snapshot` must never author a change it did not intend.

One commit, both files. Two permalinks, each built from the commit SHA, never from a branch ref.
Rejected push still rebases and retries once, never discards and never regenerates.

## The chat summary

The permalinks lead, technical first, the business one labelled as the copy to forward:

```
Snapshot published → https://github.com/msa1624/tracking/blob/<sha>/reports/2026-08/2026-08-08-1442.md
For stakeholders   → https://github.com/msa1624/tracking/blob/<sha>/reports/2026-08/2026-08-08-1442-business.md
Local copies       → .claude/snapshots/msa1624-2026-08-08-1442{,-business}.md
```

The rest of the summary is unchanged, including the rule that `not_covered[]` and not-run joins are
never compressed away.

## Degradation

Every failure degrades one document and never the other.

| What failed | What happens |
|---|---|
| Brief 5 errors, or its payload fails the return gate | Technical report publishes as normal. No business document is written. Chat names the reason |
| A join reported `ran: false` | The business section prints that join's `phrase` verbatim — no gantt, no verdicts derived from it |
| The push | Both local copies stand, both reported unpublished |
| No write access, or no tracking repo | Both written locally. Never a reason to skip either |
| The technical local write | Existing rule holds — print it in chat. The business document is still attempted |

The cursor is written last and written whatever happened above, unchanged.

## Red flags to add

- Writing a percent-complete, a forecast date not taken from a Target date field, or a confidence
  score into the business report
- A verdict whose observation restates the verdict instead of citing something outside it
- A per-person section, contribution list, or count of any kind in the business report
- Letting Brief 5 reach GitHub, or accepting a payload whose `surface_log` shows it did
- Pasting Brief 5's prose into the document instead of re-rendering its rows
- Composing the business document by hand after Brief 5's payload was discarded
- Committing anything other than exactly two new files under `reports/YYYY-MM/`, both with this run's
  stamp
- Publishing the business report while the technical one failed to be written, or the reverse
- Drawing the gantt in the business report when the join reported `ran: false`
- Amending or regenerating a published business report — it is written once, like every other report

## Documentation to update

The README is this harness's spec for what testers exercise, so the feature does not exist until it
is there:

- the `/snapshot` section — two documents, what the business one carries and what it refuses to
- the **Delegated research** table — Brief 5 under `/snapshot`
- the **State** table — the `-business.md` local path
- a "what to probe" list for the new surface: that a discarded payload publishes the technical report
  alone; that a verdict without an observation fails the payload; that the porcelain gate rejects a
  third staged path; that no per-person line survives into the business document; that a not-run join
  removes the gantt rather than leaving an empty fence; that both permalinks pin to the same SHA

## Out of scope, done alongside

`end-work/SKILL.md:309` says Relationships is writable at **rung 2**. It is rung 1 — `gh issue edit
--add-blocked-by` is a `gh` flag — and gh-wrapper, start-work, the README, and end-work's own
rationalization table at line 1344 all say so. Substrate drift of exactly the kind the README warns
has no automated guard. Fixed in the same branch, in its own commit.
