# Business-Stakeholder Report for `/snapshot` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `/snapshot` run produce a second, non-technical report for business stakeholders — rendered from the same computed pass, published beside the technical report in one commit, with its own permalink.

**Architecture:** No new data collection. The existing four-agent research wave and the four joins are untouched. A fifth agent (Brief 5) runs *after* the joins, is fed the finished pass as its brief, never touches GitHub, and returns a structured payload. The skill renders both documents from that pass and publishes both in one commit.

**Tech Stack:** Markdown only. This repo is a skills harness — `.claude/skills/*/SKILL.md` are prose specifications, not code.

## Global Constraints

**There is no test framework here and no code to run.** Every "verify" step below is a `grep`, a `git diff`, or a read-back with an exact expected result. Do not scaffold a test suite; do not add `package.json`, `pytest`, or any runner. A task is done when its verification greps return what the step says they will.

- **All edits to `/snapshot` go in one file:** `.claude/skills/snapshot/SKILL.md`. It is self-contained by design — no reference files, no asset files, no agent definitions. Do not create any.
- **Match the surrounding voice.** Bold the rule, then give the reason it exists. Tables for enumerable rules, prose for judgment. Never add a rule without the sentence explaining what goes wrong without it.
- **Line width is 100 characters** in this file's prose. Wrap to match; do not reflow paragraphs you are not editing.
- **Preserve the substrate markers.** `<!-- SUBSTRATE: ... -->` at `.claude/skills/snapshot/SKILL.md:99` marks blocks shared with start-work and end-work. **Nothing in this plan edits a substrate block.** If an edit seems to require one, stop and report it.
- **Exact spellings used throughout, do not vary them:** the payload keys are `themes`, `verdicts`, `decisions`, `not_covered`; the brief is `Brief 5`; the step is `Step 5.5`; the published file suffix is `-business.md`; the local file is `<org>-YYYY-MM-DD-HHMM-business.md`.
- **Verdict enum, closed, exactly these four values:** `on_track` · `at_risk` · `blocked` · `not_started`.
- **Commit after every task.** One commit per task, message given in the task.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.claude/skills/snapshot/SKILL.md` | Modified in 6 tasks | The whole feature. Framing, Brief 5, the document spec, publishing, output format, guardrails |
| `README.md` | Modified in 1 task | The harness spec — what testers exercise. A feature absent from it does not exist for this repo |
| `.claude/skills/end-work/SKILL.md` | 1 line | Unrelated drift fix, carried in this branch per the spec's "Out of scope, done alongside" |

---

### Task 1: Framing and write surfaces

Establish that a run produces two documents, before anything describes how. Everything downstream reads inconsistent until this lands.

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md:14-17` (Overview), `:62-69` (What It Writes table), `:176-186` (Write surfaces)

**Interfaces:**
- Produces: the phrase "two documents from one pass", the filename suffix `-business.md`, and the two-added-paths rule that Tasks 4 and 6 both restate.

- [ ] **Step 1: Replace the Overview delivery paragraph**

Replace lines 14–17 (the paragraph beginning `**It delivers in three places.**`) with:

```markdown
**Every run produces two documents from one pass.** The **technical report** — three layers, four
joins, the two mermaid diagrams — and a **business report** written for non-technical stakeholders,
rendered from the same computed layers and joins so the two can never disagree. Both are written
locally under `<base>/.claude/snapshots/`, then **committed and pushed together to `reports/` in the
tracking repo in one commit**, where GitHub renders the mermaid. The chat gets a brief summary, both
local paths, and **two permalinks pinned to the commit SHA**. See *The Report Document*.
```

- [ ] **Step 2: Update the What It Writes table**

In the table at `:64-69`, replace the third row's right-hand cell:

Find: `| No issue comments, field writes, closures, or labels | Its own **new** file under `reports/` in the tracking repo, committed and pushed |`

Replace with: `| No issue comments, field writes, closures, or labels | Its own **two new** files under `reports/` in the tracking repo — the technical report and the business report — committed and pushed in one commit |`

- [ ] **Step 3: Update the write-surfaces section**

Change the heading at `:176` from `### Write surfaces — these three, and nowhere else` to `### Write surfaces — these four, and nowhere else`.

Add these two rows to the table, after the existing `<base>/.claude/snapshots/...` row and after the existing `<clone>/reports/...` row respectively:

```markdown
| `<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM-business.md` | This run's business report. Same stamp as the technical one, same rules: a new file each run, never an overwrite. Local and gitignored. |
```

```markdown
| `<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM-business.md` | The same business report, committed in the **same commit** as the technical one. A new file only, under every rule the row above carries. |
```

Then replace the paragraph at `:184-186` with:

```markdown
No events, no issue comments, no field writes, no labels, no closures. **The one commit this skill
ever makes adds exactly two files** — the technical report and the business report, both under
`reports/YYYY-MM/`, both carrying this run's stamp. If a `git status` in the clone shows a third
path, or a path that is not one of those two, stop and say so: a snapshot run staging anything else
has gone wrong somewhere upstream.
```

- [ ] **Step 4: Verify the framing is consistent**

Run:
```bash
grep -n "adds exactly one file\|these three, and nowhere else\|delivers in three places" .claude/skills/snapshot/SKILL.md
```
Expected: **no output.** Any hit is a leftover from the old single-document framing.

Run:
```bash
grep -c -- "-business.md" .claude/skills/snapshot/SKILL.md
```
Expected: `2` — the two write-surface rows added in Step 3. The Overview paragraph names the business report in prose and carries no filename, by design.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: two documents per run — framing and write surfaces"
```

---

### Task 2: Brief 5 — the brief, the payload, and its return gate

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md:401` (wave count note), insert new section between `:714` (end of Step 5) and `:715` (`### Step 6:`)

**Interfaces:**
- Consumes: the finished `join_planned_vs_actual`, `join_sizing_vs_actual`, Brief 1's `repo_detail[]`/`org_rollup[]`/`track_rollup[]`, Brief 4's `diff{}`, and the union of every brief's `covered`/`not_covered` — all already computed by Step 5.
- Produces: the payload keys `themes[]`, `verdicts[]`, `decisions[]`, `not_covered[]` and the verdict enum `on_track` · `at_risk` · `blocked` · `not_started`, which Tasks 3 and 5 render.

- [ ] **Step 1: Note in Step 1.5 that the wave stays at four**

At `:401`, after the sentence `**Spawn four `Explore` subagents in one message, in parallel.**`, insert this sentence into the same paragraph:

```markdown
**A fifth agent runs later, after the joins are complete — see *Step 5.5*. It is not part of this
wave and must never be dispatched here**: its entire input is the output of Steps 2–5, so a Brief 5
launched in parallel would have nothing to read and would go to GitHub to find it.
```

- [ ] **Step 2: Insert the Step 5.5 section**

Insert immediately before `### Step 6: Write, Publish, Summarize, Then Write the Cursor` at `:715`:

````markdown
### Step 5.5: Brief 5 — the Business Framing

*(The business report's interpretation layer. One agent, dispatched alone, after every join above has
returned and passed its gate.)*

**It works from the computed pass and never from GitHub.** Its brief carries the finished layers,
joins, threads, and verdicts. It performs no `gh` call, no field discovery, and no lookup of any
kind. That is what makes the two documents incapable of disagreeing: they describe one moment,
computed once. An agent that fetched its own numbers would read GitHub at a different instant, and
the business report could then state a figure the technical report contradicts — with nothing in the
run able to detect it.

**Give it the shared preamble** from Step 1.5, unchanged, plus the brief below.

> **INPUT you supply:** `tracks[]` with each track's parent, owner, and live dates;
> `join_planned_vs_actual{rows[], skipped[], ran}`; `join_sizing_vs_actual{ran, phrase}`;
> Brief 4's `diff{hit_not_declared[], declared_not_hit[]}` and `still_blocked[]`;
> Brief 1's `repo_detail[]` rows and `track_rollup[]`; the window; and the union of every brief's
> `covered[]` / `not_covered[]`.
>
> **You make no GitHub call of any kind.** Not a read, not a search, not a `gh api graphql` query.
> Everything you need is above. If something appears to be missing, it is missing from the run — say
> so in `not_covered[]` and return. `surface_log` should come back empty, and an empty one is the
> expected result rather than a sign you did too little.
>
> Your job is interpretation, not retrieval: group threads into **themes** a non-engineer would
> recognize, call each track's **verdict**, and name the items that **need a decision** from someone
> outside the team.
>
> **`data`:**
>
> ```json
> { "themes":    [{"headline": "...", "items": ["msa1624/api#43"], "evidence": "..."}],
>   "verdicts":  [{"track": "payments-v2", "verdict": "at_risk", "owner": "@nilendu",
>                  "observation": "planned 2026-07-18, no branch_created"}],
>   "decisions": [{"item": "msa1624/web#22", "why": "...", "who": "@priya|null"}],
>   "not_covered": [] }
> ```
>
> `verdict` is the closed enum `on_track` · `at_risk` · `blocked` · `not_started`. **Every verdict
> carries an `observation` that cites something outside itself** — a planned date against a missing
> `branch_created`, a `still_blocked` entry, an absent assignee. "At risk because it is risky"
> restates the verdict and is the failure this field exists to prevent.
>
> `headline` is a plain-language noun phrase a non-engineer would recognize — "refund handling now
> works end to end", never "merged #47 into the charge path". `evidence` names which supplied row it
> came from. `items[]` are `owner/repo#N` refs **taken from your input**; you cannot introduce one.
>
> `decisions[]` holds only what someone outside the team must act on: blocked on an external party,
> planned and never started, slipped past its Target date, or open with no owner. `who: null` means
> unowned, which is itself the decision — never guess a name to fill it.
>
> **No numbers you were not given.** No percent-complete, no forecast date unless that exact date
> was supplied as a Target date, no confidence score, no duration, no count you computed yourself.
>
> **Write about work, never about people.** An owner is a routing label attached to a track or a
> decision. There is no per-person section here, no contribution list, and no count of anyone's
> output — that layer exists in the technical report and does not cross over.

#### The return gate — Brief 5

The Step 1.5 gate applies in full. These are additional, and each **discards the whole payload**:

| Gate | Why |
|---|---|
| `surface_log` is non-empty — **any** call, read-class included | This agent had no reason to reach GitHub at all. A read here means it went looking for numbers instead of using the ones it was given, and the two documents can now disagree |
| Any `owner/repo#N` in `themes[].items`, `verdicts[].track`, or `decisions[].item` that was not in the brief | It came from somewhere, and the only somewhere available is invention |
| A `verdict` outside the four-value enum, or a verdict with a missing or empty `observation` | An unsourced verdict is the business-report form of a guessed field value |
| An `observation` that restates its verdict without citing a supplied row | The rationale was composed after the value was chosen — the exact failure *Established vs. guessed* exists to catch |
| Any percentage, duration, ranking, score, or a number absent from the input | Invented certainty. A stakeholder cannot tell a computed figure from a plausible one |
| Any per-person key, contribution list, or count of a person's output | Principle 4, in the artifact most likely to be read as a performance signal |

**On a discarded payload: do not retry, and do not write the business report yourself.**

This is a **deliberate exception** to the rule at the end of Step 1.5, where a failed brief is
retried once and then run inline as a fallback. It does not apply here, and the reason is specific:
Steps 2–5 are both specification and fallback because their output is *rows* — you can produce the
same rows yourself and the reader cannot tell the difference, because there is none. Brief 5's
output is *interpretation*, and a skill that composes the interpretation after rejecting the agent's
has removed the only check on it. The technical report publishes as normal, no business document is
written, and the chat says so with the reason.
````

- [ ] **Step 3: Verify Brief 5 landed in the right place and the wave is unchanged**

Run:
```bash
grep -n "^### Step 5\|^### Step 5.5\|^### Step 6" .claude/skills/snapshot/SKILL.md
```
Expected: `Step 5`, then `Step 5.5: Brief 5 — the Business Framing`, then `Step 6`, in that order.

Run:
```bash
grep -n "Spawn four .Explore. subagents\|#### Brief 1\|#### Brief 2\|#### Brief 3\|#### Brief 4" .claude/skills/snapshot/SKILL.md
```
Expected: all five hits still present and unmodified — the wave is still four agents.

Run:
```bash
grep -n "on_track\|at_risk\|not_started" .claude/skills/snapshot/SKILL.md | head
```
Expected: hits inside Step 5.5 only. Confirm no stray `on_plan` (that is Brief 3's enum and a different thing).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: add Brief 5 — business framing from the computed pass"
```

---

### Task 3: The business document — structure and rules

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md` — the `## The Report Document` section, inserting a new subsection after `### Where it goes`

**Interfaces:**
- Consumes: Task 2's payload keys and verdict enum.
- Produces: the four section headings — *Where things stand*, *What landed this window*, *Needs a decision*, *What this doesn't cover* — that Task 5's example document must match exactly.

- [ ] **Step 1: Update *Where it goes* to name four paths**

In `### Where it goes`, replace the fenced block listing two paths with:

```
<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM.md               local, gitignored, written first
<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM-business.md      local, gitignored
<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM.md                      committed and pushed
<clone>/reports/YYYY-MM/YYYY-MM-DD-HHMM-business.md             committed in the same commit
```

Then, in the paragraph beginning `UTC, **the same timestamp in both filenames and in `last_checked`**`, change `in both filenames` to `in all four filenames`, and change `One new file per run in each place` to `Two new files per run in each place`.

Leave *Local first, always* and the **It is / It is not** table untouched — every property in that table holds for the business document identically, and saying so twice invites the two from drifting.

- [ ] **Step 2: Insert the business document specification**

Insert immediately after the `### Where it goes` subsection ends and before `### Live titles are correct here — unlike in `views/``:

````markdown
### The business document

The same run, the same data, a different reader. A stakeholder needs a link they can forward without
the per-repo issue tables attached — which is why this is a second file rather than a section at the
top of the first one.

**Everything the *It is / It is not* table above says applies here unchanged.** Derived,
point-in-time, written once, never amended, read back by nothing.

Open it with the same header, plus the line naming its counterpart:

```
<!-- Generated by /snapshot at 2026-08-08T14:42:11Z. Point-in-time output, not a record.
     Business summary. The full technical report for this run is
     reports/2026-08/2026-08-08-1442.md — same moment, same data. -->
```

**Four sections, in this order.**

**1. Where things stand.** One line per track — verdict, owner, and the observation behind the
verdict. Then the **planned-vs-actual gantt, reused unchanged** from the technical report: the same
fenced mermaid block, bound to `join_planned_vs_actual`, under every rule *The two diagrams* already
carries. If that join reported `ran: false` there is **no chart here either** — print its `phrase`
verbatim, exactly as the technical report does. The omitted-thread caption sits outside the fence,
and every finding the chart shows appears in the prose beneath it, because this document is read in
email and in pagers at least as often as on GitHub.

**2. What landed this window.** `themes[]`, rendered as plain-language bullets, each item linked by
title per *Identifying Items*. No commit counts. No per-person breakdown.

**3. Needs a decision.** `decisions[]`. If it is empty, say so in a line — an absent section reads as
an oversight rather than as good news.

**4. What this doesn't cover.** Not-run joins with their `phrase` printed verbatim, `not_covered[]`
repos, and repos with no timeline coverage — untracked, not inactive. **The honesty rule does not
relax because the audience changed.** It binds harder: this reader has no way to tell a thin report
from a complete one, and no instinct to go check.

#### Two prohibitions specific to this document

These sit on top of principle 4, which already forbids rankings, scores, and durations everywhere.

**No per-person section, no counts, no durations.** Owners are named on tracks and on decision items
so a reader knows who to ask. "Who Did What" stays in the technical report only. A business-facing
per-person contribution list is the single most likely thing in this system to be read as a
productivity comparison — and it is permanent and linkable.

**No invented certainty.** No percent-complete, no forecast date unless that date is a Target date on
the issue, no confidence score. A verdict of *at risk* names the observation behind it — "planned
2026-07-18, no branch cut yet" — and never restates itself. This is the same sourced-then-shown rule
the rest of the system applies to field values, and it fails the same way: a plausible value with a
rationale composed afterwards to justify it. The audience is what makes it dangerous here. An
engineer reading "at risk" opens the issue; a stakeholder acts on it.
````

- [ ] **Step 3: Verify the four sections and the gantt binding**

Run:
```bash
grep -n "Where things stand\|What landed this window\|Needs a decision\|What this doesn't cover" .claude/skills/snapshot/SKILL.md
```
Expected: four hits, all inside `### The business document`.

Run:
```bash
grep -n "in all four filenames\|Two new files per run" .claude/skills/snapshot/SKILL.md
```
Expected: one hit each. If either returns nothing, Step 1's edits to *Where it goes* did not land.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: specify the business document and its two prohibitions"
```

---

### Task 4: Publishing — two paths, two permalinks, and the degradation table

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md` — `### Step 6: Write, Publish, Summarize, Then Write the Cursor` and `### Publishing`

**Interfaces:**
- Consumes: Task 1's two-added-paths rule, Task 2's discarded-payload behaviour, Task 3's filenames.
- Produces: the porcelain gate wording and the degradation rows that Task 6's red flags restate.

- [ ] **Step 1: Rewrite Step 6's ordered list**

Replace the five numbered items under `In this order, and the order is the failure design:` with:

```markdown
1. **Ensure `.claude/snapshots/` is excluded** (layout R) and the directory exists.
2. **Write the technical document locally** — every layer, every join, both diagrams.
3. **Write the business document locally** — same stamp, `-business.md`. Skip only if Brief 5's
   payload was discarded; the run continues either way.
4. **Publish** — copy both into `<clone>/reports/YYYY-MM/`, verify **exactly the expected paths are
   staged**, commit once, push, and capture the SHA. Skip if B4 found no write access or the tracking
   repo does not exist. On rejection: `pull --rebase`, push once more, then give up gracefully. See
   *Publishing*.
5. **Print the chat summary** — both permalinks first, then headline counts, the "which comparison I
   ran" line, the findings worth acting on, and the local paths. Not the whole report.
6. **Overwrite `last_checked`** with this run's timestamp — the same one in every filename.
```

- [ ] **Step 2: Extend Step 6's failure table**

Add these rows to the `| What failed | What still happens |` table:

```markdown
| Brief 5, or its return gate | The technical report is written and published exactly as normal. **No business document is written, and none is composed by hand.** The chat names the reason. Everything else about the run is unaffected |
| The business document's local write | Say so. The technical report still publishes; publish nothing under `-business.md` that was never written locally |
```

Leave the existing rows as they are — the push row, the no-access row, and the local-write row all already say the right thing for both documents.

- [ ] **Step 3: Update the Publishing commands**

In `### Publishing`, replace the fenced bash block with:

```bash
mkdir -p <clone>/reports/YYYY-MM
# copy both documents in, byte-identical to the local ones
git -C <clone> add reports/YYYY-MM/YYYY-MM-DD-HHMM.md reports/YYYY-MM/YYYY-MM-DD-HHMM-business.md
git -C <clone> status --porcelain          # MUST show exactly these paths, added, and nothing else
git -C <clone> commit -m "snapshot: {window description} ({YYYY-MM-DD HHMM}Z)"
git -C <clone> push
git -C <clone> rev-parse HEAD              # the SHA both permalinks pin to
```

- [ ] **Step 4: Rewrite the porcelain-gate paragraph**

Replace the paragraph beginning `**Check `status --porcelain` before committing, every time.**` with:

```markdown
**Check `status --porcelain` before committing, every time.** The only acceptable result is **added
paths, all under `reports/YYYY-MM/`, all carrying this run's stamp, and no others** — two of them
normally, one when Brief 5's payload was discarded and no business document exists. Anything else — a
modified `views/` file, a stray `tracks.yml` edit, a rebase leftover, a report from another run —
means something else touched the clone, and committing it would make `/snapshot` the author of a
change it never intended. Stop, report what was staged, and publish nothing.

**Count the paths against what you wrote, not against the number two.** A run that discarded Brief 5
stages one file legitimately; a run that stages two when only one was written is staging something
that is not this run's output.
```

- [ ] **Step 5: Update the permalink paragraph**

Replace `**Build the permalink from the SHA, never from the branch:**` and its fenced block with:

```markdown
**Build both permalinks from the same SHA, never from the branch:**

```
https://github.com/{org}/tracking/blob/{full-sha}/reports/{YYYY-MM}/{YYYY-MM-DD-HHMM}.md
https://github.com/{org}/tracking/blob/{full-sha}/reports/{YYYY-MM}/{YYYY-MM-DD-HHMM}-business.md
```

One commit, one SHA, two links. Two SHAs would mean two commits, which would mean the documents
describe the same moment but landed as separate events in the repo's history.
```

Leave the rejected-push paragraph unchanged — rebase-and-retry is correct for both files, and the reason it gives (unique filenames per run, so no content conflict) holds for both.

- [ ] **Step 6: Verify**

Run:
```bash
grep -n "exactly one added path" .claude/skills/snapshot/SKILL.md
```
Expected: **exactly one hit, in the Quick Reference table.** That row is Task 6's job. A second hit means the Publishing paragraph in Step 4 above did not land.

Run:
```bash
grep -n "HHMM-business.md" .claude/skills/snapshot/SKILL.md | wc -l
```
Expected: at least `4` (Where it goes, two write-surface rows, the git add line, the permalink).

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: publish both documents in one commit, two permalinks"
```

---

### Task 5: Output Format — the business document and the chat summary

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md` — `## Output Format`, after the technical document example and before `### The chat summary`

**Interfaces:**
- Consumes: Task 3's four section headings, verbatim; Task 2's payload.

- [ ] **Step 1: Add the business document example**

Insert after the technical document's closing fence and before `### The chat summary`:

````markdown
### The business document — `<base>/.claude/snapshots/msa1624-2026-07-25-1442-business.md`

```
<!-- Generated by /snapshot at 2026-07-25T14:42:11Z. Point-in-time output, not a record.
     Business summary. The full technical report for this run is
     reports/2026-07/2026-07-25-1442.md — same moment, same data. -->

# Snapshot for the business — msa1624, past week (as of 2026-07-25)
Window: 2026-07-18 → 2026-07-25 | 2 repos in scope (api, web)

## Where things stand

| Track | Where it stands | Owner | What that's based on |
|-------|-----------------|-------|----------------------|
| Payments v2 | At risk | @nilendu | Payment UI was planned to start 2026-07-18; no branch has been cut |
| Auth hardening | On track | @ali | Its one thread finished 2026-07-22, inside the planned window |

<mermaid gantt — the same Diagram 1, then the same caption naming what was omitted>

- [Refund flow](https://github.com/msa1624/api/issues/43) — planned 2026-07-20 → 2026-07-28,
  actually started 2026-07-25. Five days late starting; the target has not moved.
- [Payment UI](https://github.com/msa1624/web/issues/22) — planned to start 2026-07-18, not
  started yet.

## What landed this window

- **Refunds now work end to end.** [Refund endpoint](https://github.com/msa1624/api/pull/47)
  shipped, and [refund flow](https://github.com/msa1624/api/issues/43) is in progress behind it.
- **Rate limiting is live across the platform.**
  [Rate limiter](https://github.com/msa1624/platform/pull/19) merged 2026-07-22.

## Needs a decision

- [Payment UI](https://github.com/msa1624/web/issues/22) — planned to start a week ago, not
  started. Owner @priya.
- [Checkout endpoint](https://github.com/msa1624/api/issues/41) — open with no owner.

## What this doesn't cover

- Sizing was not compared: this org records no Estimate or Size field.
- msa1624/platform is not covered — no read access from this run.
- msa1624/web-legacy has no tracking history, which means nobody has run these skills there. It is
  untracked, not inactive.
```
````

- [ ] **Step 2: Update the chat summary example**

In `### The chat summary`, replace the first paragraph and the fenced example's first three lines.

Change `Short, and it always carries three things: **the permalink**, ...` to `Short, and it always carries three things: **the permalinks**, ...`.

Change `**The permalink leads**, because it is the copy that renders and the copy anyone else can open. The local path follows it as a one-liner.` to:

```markdown
**The permalinks lead**, because they are the copies that render and the copies anyone else can open.
The technical report comes first; the business report is labelled as the one to forward, since that
label is the whole reason it exists. The local paths follow as a one-liner.
```

Replace the first two lines of the fenced example with:

```
Snapshot published → https://github.com/msa1624/tracking/blob/a3f9c21e4b8/reports/2026-07/2026-07-25-1442.md
For stakeholders   → https://github.com/msa1624/tracking/blob/a3f9c21e4b8/reports/2026-07/2026-07-25-1442-business.md
Local copies       → .claude/snapshots/msa1624-2026-07-25-1442{,-business}.md
```

Then add, after the closing fence and before `**The summary is a pointer, not a second report.**`:

```markdown
**When Brief 5's payload was discarded, the second line says so instead of carrying a link** — "No
business report this run: Brief 5's payload named an issue that wasn't in its brief." A missing line
reads as a missing feature; a named reason reads as the run working correctly.
```

- [ ] **Step 3: Verify the headings match Task 3 exactly**

Run:
```bash
grep -c "^## Where things stand$\|^## What landed this window$\|^## Needs a decision$\|^## What this doesn't cover$" .claude/skills/snapshot/SKILL.md
```
Expected: `4`. If a heading differs by a word from Task 3's specification, the example and the spec disagree — fix the example to match the spec.

Run:
```bash
grep -n "For stakeholders" .claude/skills/snapshot/SKILL.md
```
Expected: one hit, in the chat summary example.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: business document example and two-permalink chat summary"
```

---

### Task 6: Guardrails — red flags, quick reference, rationalizations

**Files:**
- Modify: `.claude/skills/snapshot/SKILL.md` — `## Red Flags — STOP`, `## Quick Reference`, `## Rationalization Prevention`

- [ ] **Step 1: Add the red flags**

Add these bullets to `## Red Flags — STOP`, grouped with the existing report-writing flags (after the bullet about amending a published report):

```markdown
- Writing a percent-complete, a forecast date not taken from a Target date field, or a confidence
  score into the business report
- A verdict whose observation restates the verdict instead of citing something outside it
- A per-person section, contribution list, or count of any kind in the business report
- Letting Brief 5 reach GitHub, or accepting a payload whose `surface_log` is non-empty
- Dispatching Brief 5 with the Step 1.5 wave, before the joins it reads have run
- Pasting Brief 5's prose into the document instead of re-rendering its rows
- **Composing the business document by hand after Brief 5's payload was discarded** — the interpretation
  would then have no check on it at all, which is the one thing the gate exists for
- Committing a path that is not one of this run's report documents, or a second document that was
  never written locally
- Publishing the business report while the technical one failed to be written, or the reverse
- Drawing the gantt in the business report when the join reported `ran: false`
- Amending or regenerating a published business report — written once, like every other report
```

- [ ] **Step 2: Update the Quick Reference**

Replace the row `| Before the commit | `git status --porcelain` — exactly one added path, or publish nothing |` with:

```markdown
| Before the commit | `git status --porcelain` — added paths under `reports/YYYY-MM/` with this run's stamp and nothing else. Count them against what you wrote, not against two |
```

Replace `| Research | Four agents, one message, in parallel — then the return gate before rendering |` with:

```markdown
| Research | Four agents, one message, in parallel — then the return gate before rendering. Brief 5 runs alone, after the joins, at Step 5.5 |
```

Replace `| Where the report goes | Local `<base>/.claude/snapshots/<org>-<stamp>.md`, then `<clone>/reports/YYYY-MM/<stamp>.md`, committed and pushed |` with:

```markdown
| Where the reports go | Local `<base>/.claude/snapshots/<org>-<stamp>{,-business}.md`, then `<clone>/reports/YYYY-MM/<stamp>{,-business}.md`, both in one commit |
```

Replace `| Permalink form | `blob/{full-sha}/reports/{YYYY-MM}/{stamp}.md` — SHA, never a branch |` with:

```markdown
| Permalink form | `blob/{full-sha}/reports/{YYYY-MM}/{stamp}{,-business}.md` — one SHA, two links, never a branch |
```

Add these rows after the `| A join reported `ran: false` |` row:

```markdown
| Brief 5's payload fails its gate | Publish the technical report alone. Never retry, never compose the business document yourself. Say why in chat |
| A stakeholder asks "how far along is it?" | A verdict and the observation behind it. Never a percentage — there is no field that carries one |
```

- [ ] **Step 3: Add the rationalizations**

Add to `## Rationalization Prevention`:

```markdown
| "Brief 5's payload was rejected, but I know what it was going to say" | Then the interpretation has no check on it, which is the entire purpose of the gate. Publish the technical report and say the business one didn't run. |
| "Brief 5 needs one number it wasn't given — one read won't hurt" | It reads GitHub at a different instant than the joins did, and the two documents can then disagree with nothing able to detect it. If it wasn't supplied, it goes in `not_covered`. |
| "The stakeholder will ask 'how far along' — I'll estimate a percentage" | There is no field that carries one, so it would be invented, and it will be quoted back as though it were measured. A verdict with its observation answers the question honestly. |
| "'On track' is obvious from the dates — the observation is redundant" | The observation is what makes it checkable. Without it a verdict is an opinion typeset as a finding, and this reader has no way to check it. |
| "A per-person section would help the business side plan" | It is a leaderboard with a business justification. Owners on tracks and decisions carry the routing information; the rest is comparison. |
| "The business report is the friendly one — the not-covered list will sour it" | This reader is the one who cannot tell a thin report from a complete one. Dropping the gap makes the document confident and wrong. |
| "Both documents say the same things — I'll just publish the business one" | The technical report is the one with the joins, the tables, and the diagrams. The business report is a reading of it, not a replacement for it. |
| "It's one commit either way — I'll push the business report separately" | Two commits mean two SHAs, and the two documents describe one moment. One commit, one SHA, two permalinks. |
```

- [ ] **Step 4: Verify no stale single-document rules survive**

Run:
```bash
grep -n "exactly one added path\|exactly one file\|the permalink first" .claude/skills/snapshot/SKILL.md
```
Expected: **no output.**

Run:
```bash
grep -c "business report\|business document" .claude/skills/snapshot/SKILL.md
```
Expected: `20` or more. A much lower number means one of Tasks 1–6 did not land.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/snapshot/SKILL.md
git commit -m "snapshot: red flags, quick reference, and rationalizations for the business report"
```

---

### Task 7: README — the harness spec

The README is what a tester reads to know what to exercise. A feature absent from it does not exist for this repo.

**Files:**
- Modify: `README.md` — the `### snapshot` section, the **Delegated research** table, the **State** table

- [ ] **Step 1: Update the snapshot section**

In `### snapshot`, replace the paragraph beginning `**It does publish, and that is the one thing it writes.**` with:

```markdown
**It does publish, and that is the one thing it writes.** Every run produces **two documents from one
pass** — the technical report and a **business report** for non-technical stakeholders — each written
to a local gitignored copy *and* to `reports/YYYY-MM/<stamp>{,-business}.md` in the tracking repo,
committed together in **one commit** and pushed on every run. Two new files, never an edit. Chat gets
**both SHA-pinned permalinks** first, the business one labelled as the copy to forward, then a
summary.

The business report is rendered from the same computed layers and joins, so the two can never
disagree. Its interpretation layer is **Brief 5**, dispatched alone after the joins have run and fed
the finished pass — it makes no GitHub call at all. It carries four sections (where things stand,
what landed, needs a decision, what this doesn't cover), reuses the planned-vs-actual gantt unchanged,
and refuses two things the technical report does not have to refuse: **any per-person content**, and
**any invented certainty** — no percent-complete, no forecast date that isn't a Target date on the
issue, no confidence score. Every verdict names the observation behind it.
```

- [ ] **Step 2: Add the probes**

Add to the `**What to probe:**` paragraph in `### snapshot`:

```markdown
**What to probe — the business report:** that Brief 5 is dispatched *after* the joins and not with the
wave; that a payload with a non-empty `surface_log` is discarded even when every call was a read;
that a verdict with no `observation`, or one that restates itself, fails the payload; that a
discarded payload publishes the technical report **alone** and the skill does not compose the business
document itself; that the porcelain gate rejects a third staged path *and* accepts one path on a run
that discarded Brief 5; that both permalinks pin to the same SHA; that no per-person line, count, or
percentage survives into the business document; that a `ran: false` planned-vs-actual join removes the
gantt from **both** documents rather than leaving one; and that the not-covered section is present
even when it makes the report read worse.
```

- [ ] **Step 3: Update the two tables**

In the **Delegated research** table, replace the `/snapshot` row's briefs cell with:

```markdown
| `/snapshot` | repo+org rollup · who-did-what · planned/sizing joins · dependencies (compare) — then **business framing** (Brief 5, after the joins, no GitHub access) |
```

In the **State** table, replace the `<base>/.claude/snapshots/...` row with:

```markdown
| `<base>/.claude/snapshots/<org>-YYYY-MM-DD-HHMM{,-business}.md` | `/snapshot` | local copies of each run's two reports — derived, point-in-time, never read back. The published copies go to `reports/` in the tracking repo |
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -n "Brief 5\|business report" README.md | head -20
```
Expected: hits in the snapshot section, the probes paragraph, and the delegated-research table.

Run:
```bash
grep -n "one new file, never an edit\|one new file" README.md
```
Expected: **no output** — the old single-file phrasing is gone.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "README: document the business report and Brief 5"
```

---

### Task 8: Fix the Relationships rung drift in end-work

Independent of the feature, carried in this branch per the spec's *Out of scope, done alongside*. `gh issue edit --add-blocked-by` is a `gh` flag, so it is rung 1 — as gh-wrapper, start-work, the README, and end-work's own rationalization table all say.

**Files:**
- Modify: `.claude/skills/end-work/SKILL.md:309`

- [ ] **Step 1: Confirm the drift before changing anything**

Run:
```bash
grep -rn "add-blocked-by" .claude/skills README.md | grep -i "rung"
```
Expected: four hits saying **rung 1** (gh-wrapper, start-work, README, end-work:1344) and one saying **rung 2** (end-work:309). If the picture differs, stop — the fix is not what this task assumes.

- [ ] **Step 2: Make the edit**

At `.claude/skills/end-work/SKILL.md:309`, change `writable at rung 2` to `writable at rung 1`. Change nothing else on the line.

- [ ] **Step 3: Verify**

Run:
```bash
grep -rn "add-blocked-by" .claude/skills README.md | grep -i "rung 2"
```
Expected: **no output.**

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/end-work/SKILL.md
git commit -m "end-work: Relationships is rung 1, not rung 2"
```

---

## Final verification

- [ ] **Step 1: No stale single-document language anywhere**

```bash
grep -rn "exactly one added path\|adds exactly one file\|these three, and nowhere else\|delivers in three places" .claude/skills README.md
```
Expected: no output.

- [ ] **Step 2: The substrate blocks were not touched**

```bash
git diff main -- .claude/skills/snapshot/SKILL.md | grep -n "^[-+].*Five Principles\|^[-+].*### Paths\|^[-+].*Issue Fields in this org"
```
Expected: no output. Any hit means an edit reached a block shared with start-work and end-work, which this plan never intends.

- [ ] **Step 3: Read the changed sections once, end to end**

Read `.claude/skills/snapshot/SKILL.md` from `## Overview` through `### Step 5.5`, and `## The Report Document` through `## Rationalization Prevention`. Check that Brief 5's payload keys, the verdict enum, the four section headings, and the filename suffix are spelled identically everywhere they appear.
