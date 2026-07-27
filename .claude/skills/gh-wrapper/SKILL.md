---
name: gh-wrapper
description: Use when about to run any `gh` CLI command (`gh issue`, `gh pr`, `gh repo`, `gh api`), when the user pastes one, when setting a custom Issue Field (org-defined single-select, date, number, or text) or an issue type on an issue, when creating an issue that may belong on a Projects v2 board, when setting Projects v2 board item fields (Status, Size, Estimate, Iteration/sprint, or any board-defined field), when linking issues across repositories, when opening a pull request or linking one to its issue, or when about to report that a GitHub field, board membership, relationship, or PR link cannot be set
---

# gh Wrapper: Route to the Right GitHub Surface

## Overview

Two surfaces reach GitHub: the `gh` CLI and `gh api graphql`. They are not
interchangeable — `gh` has no flag for large parts of the GraphQL-only surface.
Route by capability, not by habit.

**Core principle:** Prefer the `gh` flag when one exists, but never let a missing
flag become a missing capability. `gh api graphql` can almost always do it.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
EVERY FIELD DISCOVERY RETURNS IS FILLED — FROM A VERIFIED VALUE,
OR FROM A GUESS MARKED AS ONE AND CONFIRMED.
EXPLICITLY REPORTED UNSET ONLY WHEN NEITHER IS POSSIBLE.

NEVER GUESSED SILENTLY. NEVER LEFT BLANK BY DEFAULT.
NEVER SILENTLY SKIPPED.
```

**"Every field" means org Issue Fields *and* Projects v2 board item fields.** They
are different mechanisms with different write paths (see *Projects v2* below), and
the law does not distinguish between them. An issue landing on a board with an
empty `Status`, `Size`, or `Estimate` is the same corrupted record as one with an
empty Priority — it just fails silently in a different view.

**An *unmarked* guess is indistinguishable from a real one downstream** — that is
the corruption this law is about, and it is still forbidden. A field you quietly
skipped is the same corruption in the other direction: it reads as "not
applicable" to whoever reads the record next. What is *not* forbidden is a guess
that arrives labelled as a guess, with its source, on a surface where someone can
overturn it. That is a proposal, and proposals are how fields get filled.

So there are three honest outcomes, not two: set it from a source, **propose a
marked guess to the caller's confirmation surface**, or report it unset by name.
Prefer them in that order — a blank field is invisible and permanent, a marked
guess is visible and cheap to correct.

**Not everything the preflight produces is a field, and the non-field outputs are
handed back too.** The dependency scan (preflight step 5) returns a *stated
outcome* — a count and what it cleared — even when it proposes no edges, and that
outcome travels with the filled field set to the same confirmation surface. It is
the one preflight output with no blank anywhere to mark its absence, so nothing
but saying it makes it visible.

**This skill has no confirmation surface of its own** (see *A workflow policy is a
source* below). It discovers, fills, and hands the marked set to whoever called
it; the caller shows them and collects the yes. A caller with no confirmation
surface gets the fields reported unset rather than written — the guess is only
safe because someone sees it.

**The law survives delegation.** When this work is handed to a read-only research
subagent, it applies unchanged to the proposal that comes back: a value the agent
inferred is a *proposal*, not a verified value, and it is marked and confirmed
like any other. See *Research Subagents* below. A caller that defines its own bar
for "verified" layers that on top; it never lowers this one.

## The Ladder

```
BEFORE saying "that can't be set / can't be done through this surface":

1. gh FLAG?       Check `gh <cmd> --help`. Flags changed recently;
                  read the help, don't recall it.
2. gh api graphql? The universal escape hatch. Nearly everything
                  REST or GraphQL can do is reachable here.
3. ONLY THEN:     Say it can't be done — and name both rungs
                  you tried.

Skip a rung = fabricating a limitation
```

**The ladder is a capability fallback order, not a cost order.** For a cross-repo rollup, rung 2 is
the *routing* answer rather than an escalation — one GraphQL query costs 1 point where the REST
equivalent is 18 requests. Starting there is following the ladder, not skipping it. Say which rung
you used and why.

**No exceptions:**
- Not for "the skill used to say there was no fallback"
- Not for "GraphQL feels like overkill for one field"
- Not for a deadline. Running out of time makes a field **unset**, never
  **unsettable** — those are different sentences and only one of them is true.
- An error message naming another mutation is a signpost to the next rung, not
  a dead end
- Reporting a false limitation is worse than shelling out

## Preflight: Context

**Owner/repo:** infer from `git config --get remote.origin.url` when `-R` is absent.
**Identity:** `gh api user --jq .login` when a command needs "me".

## Preflight: What Kind of Owner Is This?

**An owner is an organization or a user, and it changes what exists.** Several
features below are org-scoped and are *absent* — not restricted, not
permission-gated — on a personally-owned account. Establish which one you have
before any Issue Field or issue-type work.

```graphql
query { repositoryOwner(login: "<owner>") { __typename }
  repository(owner: "<owner>", name: "<repo>") {
    viewerCanSeeIssueFields
    issueTypes(first: 1) { totalCount } } }
```

Fold this into discovery rather than paying for it separately: add the
`organization(login:) { issueFields ... }` selection from rung 2 below to this
same query and you get owner type, both capability gates, and the field list in
one request. When the owner is a user, that `organization` node comes back `null`
— which is the answer, not an error.

`__typename` is exactly `"Organization"` or `"User"`. For Issue Fields
specifically, prefer `viewerCanSeeIssueFields` over `__typename` — it also
answers the permissions case, which owner type alone does not. When you need only
the owner type: `gh api /users/<owner> --jq .type`.

| Feature | Org | Personal | Scope |
|---|---|---|---|
| Issue Fields | yes | **no** | org-scoped — `User.issueFields` is not in the schema |
| Issue types | yes | **no** | org-scoped — `Repository.issueTypes` is `null` |
| Teams | yes | **no** | org-scoped — use `gh api /repos/<owner>/<repo>/collaborators` instead |
| Projects v2 | yes | yes | swap `organization(login:)` ↔ `user(login:)` |
| Sub-issues | yes | yes | repo-scoped — identical shape, no branching |
| Dependencies | yes | yes | repo-scoped — identical shape, no branching |

### Empty Is Sometimes the Truth

An empty result means opposite things in the two cases, and they look alike:

```
❌ personal account, no Issue Fields → "discovery failed" → walk the ladder
❌ personal account, no Issue Fields → "I must be querying the wrong node"
✅ personal account, no Issue Fields → correct and final. Say the feature
   does not exist for this owner, and set nothing.
```

On a personal account an empty field set is a **complete answer, not a discovery
failure.** The ladder exists for capabilities that exist. Escalating here
manufactures work and ends in a false report either way — "unsettable" is wrong,
and so is silently setting nothing without saying why.

Contrast this with the `options: []` trap below, which is the same shape
inverted: there, empty is a lie told by the wrong node; here, empty is the truth.
Telling them apart is exactly what the owner-type probe is for.

## Preflight: Before Creating Any Issue

**Creating an issue is not one lookup, it's six, and they run together, before
the write.** An agent that starts from the Issues table below and follows only
the `gh issue create` row never sees the Projects v2 section
unless it goes looking — that's how a board link gets missed without anyone
deciding to skip it. Do all six in one pass, every time, regardless of which
table or command sent you here:

```
BEFORE gh issue create — ALWAYS:
1. /orgs/<owner>/issue-fields       → issue fields to fill
2. /orgs/<owner>/issue-types        → valid type, if the repo uses types
3. projectsV2 discovery (below)     → board(s) to link
4. projectV2.fields discovery       → board item fields to fill — ALL of them,
                                      not the ones you recognise
                                      (Status, Size, Estimate, Iteration, …)
5. parent + siblings + a bounded scan → blocked-by / blocking to propose,
                                      AND a stated scan outcome — always
                                      (*Searching Issues*, below)
6. assignee                         → @me, unless someone else was named
```

None of the six is optional because the task "looked like" it didn't need it.
Steps 3 and 4 are the ones with no visible symptom when skipped — the issue looks
completely normal, fields and all, and is simply invisible to (or blank on)
whatever board people actually plan from. Step 6 fails the same quiet way: an
unassigned issue reads as untriaged rather than as in-progress. Run all six
before the create, not as a follow-up once someone asks why the issue isn't on
the board, why its `Status` is empty, or who is actually doing it.

**Step 5 fails one degree quieter than any of them, and it is the step to watch.**
A skipped field leaves a blank someone can point at; a skipped board link leaves
an issue missing from a view. A dependency that was never looked for leaves
*nothing* — no blank, no error, no absence anywhere in the record — and it is
indistinguishable, on the issue and on the board, from a dependency that was
looked for and correctly not found. It is also the only step whose inputs can all
be missing at once: no parent, no siblings, a create that nobody framed as
dependent. **That is not an exemption.** Absent structure is what makes the scan
the *only* input rather than zero inputs, and step 5 is discharged by producing
its stated outcome, never by having had nothing to read.

**Fill, don't ask.** Each of the six produces a *value*, not a question — a
value read off a source where one exists, and otherwise a best guess carrying the
thin source it leaned on. Report a field unset only when the surface genuinely
offers nothing to set. The caller confirms the filled set in one pass; see
*Fill Every Field* below for what that costs and what it buys.

**Ordering:** steps 1–2, 5, and 6 are written *with* the create; step 4's values
can only be written *after* the item is on the board, because a board item field
value needs an item id that doesn't exist until step 3's add. Discover all six up
front anyway — discovering late is how "I'll set Status after" becomes never.

## Issue Fields — Discover, Never Hardcode

Org-level Issue Fields (Settings > Planning > Issue fields) live **on the issue
itself**, independent of any Projects v2 board. They are defined per-org and can
be anything: single-select, date, number, or text.

**"Set the project fields" means these. "Add this to the project" does not** — that
is board membership, a separate mechanism with its own ladder; see *Projects v2*
below. The two are independent: an issue can carry every Issue Field the org
defines and still be on no board at all. Setting a field is never a substitute for
adding to a board, and reading one as the other is the failure that leaves work
invisible to everyone who plans off the board.

**Discover the org's fields at call time — never hardcode field names or
options.** `gh api /orgs/<owner>/issue-fields` returns each field's name, type,
and, for single-selects, its valid options. Account for **every field it returns**: set it
to a value the conversation established, or to a best guess drawn from the parent,
the siblings, or the org's convention — and mark the guess as one. Never guess
*silently*, never silently skip one. An admin can change the field set without
touching this file, and a field set that is right for one org is wrong for the next.

### Fill Every Field

**A blank field is not neutral.** It reads as untriaged, drops the issue out of
every grouped view and every burndown, and — unlike a wrong value — nobody
notices it. A marked guess is visible, correctable in four words, and wrong at
worst. So the default is to fill, and leaving a field unset is the exception that
has to justify itself.

**What a guess must carry:** the source it came from, named. "High because it's
important" restates the value; "parent #38 is High, sibling #43 is High" is a
source. A value with no traceable source at all is a fabrication, not a guess, and
that is still out of bounds — the rule this replaces was aimed at fabrication, and
it still catches it.

**What this does not license.** Fill *field values*; do not invent *structural
facts*. Which repo hosts the work, which board it belongs to when discovery
returned several, whether a dependency exists — guessing there manufactures a
fact rather than proposing a default, and picking one board out of three is not a
guess anyone can spot and correct. Ask on those.

**One confirmation, not one per field.** A filled set is worth showing in a single
pass with each value's source, and accepting with a single yes. Asking per field
is what filling was supposed to eliminate.

This whole section is **org-only.** On a personally-owned account there are no
Issue Fields to discover and nothing above applies — see the owner-type preflight
and stop there rather than escalating.

**There is no `required` flag.** Discovery returns name, type, and
options only — GitHub does not expose which fields are mandatory. Requiredness is
a policy your project defines elsewhere, not something this surface can detect.
"Account for every field returned" is the rule that works with what the API
actually gives back.

Issue types are org-defined too, and **also org-only**. Validate against
`gh api /orgs/<owner>/issue-types` before assuming a type exists or applies. That
path 404s on a personal account by design — there is no user-level equivalent, so
a 404 there is the answer, not an auth problem.

### Rung 1 — `gh` flags

Check `gh issue create --help` / `gh issue edit --help` first — flags change
between releases. As of `gh` 2.96.0 there is **no flag for org-level Issue
Fields**, and `gh project item-edit` edits Projects v2 **board items** — a
different feature.

There is, however, a REST path reachable through `gh api`, which is simpler than
rung 2's GraphQL for read-only discovery:

```bash
gh api /orgs/<owner>/issue-fields      # list; POST/PATCH/DELETE also exist
```

If you need to *write* a value onto an issue, go to rung 2 — `setIssueFieldValue`
is the mutation for that.

### Rung 2 — `gh api graphql` (verified working)

Discover field and option IDs. `issueFields` is a **union** — fragments are
mandatory, bare selections error:

```graphql
query { organization(login: "<owner>") { issueFields(first: 10) { nodes {
  ... on IssueFieldSingleSelect { id name options { id name } }
  ... on IssueFieldDate { id name }
} } } }
```

**`organization` here does not swap to `user`.** Unlike Projects v2, there is no
`user(login:) { issueFields }` — the field does not exist on the `User` type at
all. If the owner is a user, this query is not the wrong query; the feature is
absent.

Get the issue node ID, then set every field in one mutation:

```graphql
mutation { setIssueFieldValue(input: {
  issueId: "I_..."
  issueFields: [
    { fieldId: "IFSS_...", singleSelectOptionId: "IFSSO_..." },
    { fieldId: "IFD_...",  dateValue: "YYYY-MM-DD" }
  ]}) { issue { id } } }
```

Clear with `{ fieldId: "IFSS_...", delete: true }`. Verify after writing:
`gh api /repos/{o}/{r}/issues/{n} --jq '.issue_field_values'`.

**Node-ID trap:** org Issue Field IDs (`IFSS_`/`IFD_`/`IFSSO_`) are a different
space from Projects v2 field IDs (`PVTF_`/`PVTSSF_`/`PVTI_`). Using a board field
ID with `updateProjectV2ItemFieldValue` on a mirrored field fails with
*"Issue field values cannot be updated using the updateProjectV2ItemFieldValue
mutation."* That error is a **signpost to the right mechanism, not a dead end** —
the field is an org Issue Field wearing a board field's clothes, so write it here
with `setIssueFieldValue`. See *Projects v2 Item Fields* for telling the two apart
**before** you write, which is cheaper than reading the error.

The error text names `updateIssueFieldValue`. Both that and `setIssueFieldValue`
exist in the schema; `setIssueFieldValue` is the one verified above and sets
several fields in one call. Don't treat the error's wording as evidence that the
mutation documented here is wrong.

**`options: []` is a lie, not a diagnosis.** Querying a *board's* mirrored
single-select over GraphQL returns an empty options list even when the field has
working options. It means you queried the wrong node, nothing more.

```
❌ options: [] → "the field has no options configured" → "impossible to set"
❌ options: [] → ask a human to "add the missing options"
✅ options: [] → wrong node — read options from `issueFields` (rung 2) or REST
✅ options: [] → also a positive ID: this board field IS a mirror, so it is
   written with setIssueFieldValue, never updateProjectV2ItemFieldValue
```

A board-native single-select (`Status`, `Size`) returns its real options from the
same query — so empty-vs-populated is a mechanism signal, not a health signal.
Never conclude a field is unsettable from an empty options list, and never send
a human to reconfigure a field that is already correct.

### Don't Substitute a Neighbouring Field

Not every field that accepts a write is the field you meant to write. A Projects
v2 board often carries fields that look like org Issue Fields — similar name,
similar type — and they are a different feature and not the record.

**No exceptions:**
- A field that happens to accept a write is not a proxy, stand-in, or "closest
  equivalent" for the one you actually need
- Not when the real field looks unsettable — that's rung 2's job, not a
  neighbour's
- Writing a neighbour to approximate the real field doesn't record the real
  field; it puts a fabricated value somewhere else that someone else reads
- If a field can't be set, report **that field** unset. Do not substitute a
  neighbouring field that happens to accept a write.

If the task names a field the org doesn't define, say it doesn't exist. Do not
invent it, and do not map it onto the nearest field that does.

## Projects v2 — Board Membership and Board Fields Are Separate Mechanisms

Five separate mechanisms sit on the same issue and are read and written
differently. Conflating any two is wrong even when the result looks right:

| Mechanism | Where it lives | Write path |
|---|---|---|
| **Issue Fields** | on the issue, org-defined | rung 2, `setIssueFieldValue` |
| **Milestone** | native issue field | rung 1, `gh issue edit --milestone` |
| **Relationships** | dependencies API | rung 1, `gh issue create --blocked-by` / `gh issue edit --add-blocked-by` |
| **Projects v2 membership** | the board, not the issue | the ladder below |
| **Projects v2 item fields** | the board *item*, not the issue | `updateProjectV2ItemFieldValue` / `gh project item-edit` |

**The last two are the ones that fail silently**, and they fail independently. The
first three are visible on the issue the moment you look at it. An issue on no
board looks completely normal, and only people planning off that board notice. An
issue that *is* on the board but has an empty `Status` or `Size` is worse — it is
visibly there and quietly uncategorised, so it drops out of every grouped view and
every burndown while looking tracked.

**Membership is not fields.** Adding an item to a board sets no values on it. A
board item created by `item-add` starts with every custom field empty, and nothing
about the add prompts you to fill them. Doing step 3 and skipping step 4 is the
default failure, not an unusual one.

**Run this discovery before every issue create, not after** — see *Preflight:
Before Creating Any Issue* above. This section is the mechanics; that one is the
gate that makes sure you actually get here.

### Discover at call time — never hardcode a project number

```
gh api graphql -f query='{ organization(login:"<owner>"){
  projectsV2(first:20){ nodes{ number title id } } } }'
```

**Projects are NOT org-only, and this is where they differ from Issue Fields,
issue types, and Teams.** A personally-owned account has `user(login:"<owner>")
{ projectsV2 }`. An empty result from the *organization* root on a personal
account is the wrong query, not the final answer — switch roots and ask again.
This is the one place the owner-type preflight's "absent is the complete answer"
rule does **not** carry over.

### The ladder for adding an item

| Rung | Path | Status |
|---|---|---|
| 1 — `gh` flag | `gh project item-add <number> --owner <owner> --url <issue-url>` | Works. URL form crosses repos. |
| 2 — GraphQL | `addProjectV2ItemById(input:{projectId, contentId})` | Works. `contentId` is the issue's **node id**, not its number. |

**Adding is idempotent.** Re-adding an item already on the board returns the
existing item id and does not error — so linking explicitly is safe even where an
auto-add workflow already fired. Never skip a link on the theory that automation
probably handled it; automation is usually scoped to some repos and not others,
and you cannot see its scope from here.

### The gate — link, never silently skip

Same rule as a discovered Issue Field left unset, but for board membership the
action is a link, not a question:

> **A discovered project that the issue is not on gets the issue ADDED TO IT,
> never silently skipped, never left for a human to decide.**

Return all three of these distinctly, and never let them collapse into one silence:

| State | What it means | Do |
|---|---|---|
| No project found | the owner has no board | `project: none` — nothing to link |
| Project found, issue on it | already linked | `on_project: true` — nothing to do |
| Project found, issue **not** on it | the default case | **add it** (either rung above), then report `on_project: true` |
| Several projects found | ambiguous | list them all; **never pick one** — ask which board(s), or add to all if the caller already said so |

**Discover, then link. Don't stop to ask.** Adding is idempotent and reversible
(removing an item from a board is a normal, low-cost action), which is exactly
why this is the one write in this skill that doesn't wait for a confirmation
round-trip — the whole point of running discovery first is so the link happens
automatically off the back of it, not so the caller has something to relay to a
human. Asking "should I add it?" after discovery already answered "there's a
board and the issue isn't on it" is redoing the caller's job by hand. The only
things that still get surfaced to the caller are the genuinely ambiguous cases
above (no board, several boards) — never the plain "found one board, issue
belongs on it" case.

## Projects v2 Item Fields — Status, Size, Estimate, Iteration

Once an issue is on a board it has a second, independent set of fields. **These
are not org Issue Fields and they are not set by the issue write.** They are the
ones people actually plan from: `Status` decides which column the card sits in,
`Size` and `Estimate` drive every capacity view a board has.

### Discover the board's fields at call time

Field ids are per-board — never carry one between projects, and never hardcode an
option id. `fields` is a **union**, so fragments are mandatory:

```bash
gh api graphql -f query='{ organization(login:"<owner>"){ projectV2(number:<n>){
  fields(first:50){ totalCount nodes{
    ... on ProjectV2FieldCommon       { id name dataType }
    ... on ProjectV2SingleSelectField { id name dataType options { id name } }
    ... on ProjectV2MultiSelectField  { id name dataType multiSelectOptions { id name } }
    ... on ProjectV2IterationField    { id name dataType configuration {
        duration startDay
        iterations          { id title startDate duration }
        completedIterations { id title startDate duration } } }
  } } } } }'
```

Swap the root to `user(login:)` for a personally-owned board — projects swap, as
always.

**Every fragment must select the field's *values*, not just its identity.** A
single-select without `options`, a multi-select without `multiSelectOptions`, and
an iteration field without `configuration` all come back looking like a field
nobody could possibly fill — and a field with no candidate values is the one that
gets quietly skipped, because skipping it feels like a fact about the board
rather than a fact about your query.

**The values field is named differently on each type, and the name is not
guessable by analogy.** Single-select has `options`; multi-select has
`multiSelectOptions` — `options` on a multi-select is `undefinedField`, not an
empty list. Iteration has `configuration`. Copy them from this query rather than
inferring a fourth from the pattern of the first three; a wrong name returns
`errors` with no `data`, which the *Concluding a GraphQL field doesn't exist*
rule below covers.

`ProjectV2FieldCommon` is an interface with **four** implementors —
`ProjectV2Field`, `ProjectV2SingleSelectField`, `ProjectV2MultiSelectField`,
`ProjectV2IterationField` — and it returns `id name dataType` for every one of
them. So **a field can be fully "discovered" and still be unfillable purely
because its type-specific fragment was left out.** That is the `options: []` trap
in its general form: the common fragment always succeeds, which is exactly what
makes the omission invisible.

**`totalCount` is not decoration.** Compare it to the number of nodes you got
back on every run. If it is larger, discovery is **incomplete** — and the Iron
Law's "every field discovery returns" cannot be satisfied against a list you know
is truncated. Raise the cap or page; never proceed on the short list and never
report the fields you saw as the board's set. A board silently losing its 51st
field fails exactly like a field with no fragment: no error, no blank, nothing to
notice.

### Three kinds of field come back, and only one of them you write here

This is the distinction that decides which mutation to call, and getting it wrong
produces an error that reads like a permissions problem:

| Kind | Examples | Write path |
|---|---|---|
| **Board-native** | `Status`, `Size`, `Estimate`, any field defined on the board | `updateProjectV2ItemFieldValue` — **this section** |
| **Mirrored org Issue Field** | any board field whose name is also in the org's `issueFields` | `setIssueFieldValue` on the **issue** — see *Issue Fields* above |
| **Built-in projections** | `Title`, `Assignees`, `Labels`, `Milestone`, `Repository`, `Linked pull requests`, `Reviewers`, `Parent issue`, `Sub-issues progress`, `Created`, `Updated`, `Closed` | Not writable on the board at all — set them on the issue |

**The reliable test is a name cross-reference, and you already have both lists.**
A board field whose name appears in this run's org `issueFields` list is a
mirror; write it with `setIssueFieldValue`. This works for every data type, which
matters because date mirrors give you no other signal.

**Corroborating signal, single-selects only:** a mirrored single-select returns
`options: []` from the board node while a board-native one returns its real
options. That is the same `options: []` trap documented above, seen from the other
side — it identifies a mirror, it never means a field is misconfigured.

Verified on a live org board: `Size` (single-select, real options) and `Estimate`
(number) accepted `updateProjectV2ItemFieldValue`. `Priority`, `Start date`, and
`Target date` — all three also org Issue Fields — rejected it with
*"Issue field values cannot be updated using the updateProjectV2ItemFieldValue
mutation."* **That error means you picked the wrong mechanism, not that you lack
permission.** Re-read the table above; do not escalate, and do not retry it.

### The ladder for setting an item field

| Rung | Path | Status |
|---|---|---|
| 1 — `gh` flag | `gh project item-edit --id <item-id> --project-id <project-id> --field-id <field-id> --single-select-option-id <opt>` (or `--text` / `--number` / `--date` / `--iteration-id`) | Works. Needs the **item** id, not the issue number. |
| 2 — GraphQL | `updateProjectV2ItemFieldValue(input:{projectId, itemId, fieldId, value:{…}})` | Works. Verified. |

The `value` key is typed per field, and `ProjectV2FieldValue` accepts exactly
these six: `{text:"…"}`, `{number:3}`, `{date:"YYYY-MM-DD"}`,
`{singleSelectOptionId:"…"}`, `{multiSelectOptionIds:["…","…"]}`,
`{iterationId:"…"}`. Passing the wrong one is a validation error, not a silent
no-op. **`multiSelectOptionIds` takes a list** — one option id in an array, not a
bare string, and writing it replaces the whole selection rather than adding to it.
Rung 1 covers five of the six (`--text`, `--number`, `--date`,
`--single-select-option-id`, `--iteration-id`); multi-select has no flag in `gh`
2.96.0, so it is rung 2 by capability.

Get the item id — the add returns it, or query it back:

```bash
gh api graphql -f query='{ organization(login:"<owner>"){ projectV2(number:<n>){
  items(first:50){ nodes{ id content{ ... on Issue { number repository{ name } } } } } } } }'
```

Clear a value with `clearProjectV2ItemFieldValue(input:{projectId, itemId, fieldId})`.

### Iteration fields — the sprint a card lands in

*Verified 2026-07-27: schema introspection confirms every selection below, and the
query returns them from a live board (`msa1624` #3, an `ITERATION` field named
`Sprint`). `ProjectV2FieldValue` accepts `iterationId`; `gh` 2.96.0 has
`--iteration-id`. **Not** observed live: a populated `completedIterations` — that
warning below is reasoned from the schema.*

**Match on `dataType`, never on the name.** The dataType is `ITERATION`; the
**name is whatever whoever configured the board typed** — `Sprint`, `Cycle`,
`Iteration`, `Sprint / Cycle`. On the one live board checked it is `Sprint`, and
an agent scanning discovery for a field *called* "Iteration" finds nothing there
and moves on, having skipped a field the board very much defines. This is the
same rule as *never hardcode field names or options* one level down: the name is
discovery **output**, never a matcher.

**An iteration field is board-native and ordinary.** It takes `{iterationId:"…"}`
through `updateProjectV2ItemFieldValue`, or `--iteration-id` at rung 1, and it
falls under the same gate as `Status` — filled from a source, proposed as a
marked guess, or reported unset by name. There is no iteration-shaped exception
to the Iron Law.

**Its values live in `configuration`, split across two lists, and the split is
the trap:**

| List | What it holds | Writable |
|---|---|---|
| `iterations` | the current iteration and every future one | **yes — this is the one you pick from** |
| `completedIterations` | iterations whose window has already closed | schema-legal, almost always wrong |

Writing a completed iteration is the failure mode here: it validates, it returns
success, and it files the work into a sprint that already shipped — so it is
invisible in every current-sprint view, which is the only view an iteration field
exists to feed. **Never resolve an iteration by title alone.** Titles repeat
across cycles ("Sprint 4" comes round again), and `completedIterations` is where
a title match most often lands.

**Which iteration is a guess, and it needs a source like any other.** The
defensible default is the iteration whose window contains today — derived from
each entry's `startDate` and `duration`, both of which discovery returns. That is
a real source, so it renders as a derived value citing the dates, not as a bare
guess. Next-iteration is equally legitimate when the work plainly isn't starting
now — but that is the caller's policy, exactly like "new issues start in
Backlog", and the same three conditions apply.

Worked, from the live board — the arithmetic is `startDate + duration` days, and
`duration` is days, not weeks:

```
Sprint (ITERATION), duration 14, startDay 1
  iterations: Sprint 1  2026-07-27 → 08-09   ← contains 2026-07-27. This one.
              Sprint 2  2026-08-10 → 08-23
              Sprint 3  2026-08-24 → 09-06
  completedIterations: []

→ Sprint = "Sprint 1", cited "today 2026-07-27 falls in its 07-27 → 08-09 window"
→ written by id (edcbc333…), never by the title "Sprint 1"
```

**An empty `iterations` list is sometimes the truth.** A board can define an
iteration field and configure no iterations on it — and then there is genuinely
nothing to set, the field is reported unset by name, and that is the complete
answer. This is the same pair the owner-type preflight exists to separate, one
level down:

```
❌ no iterations returned → "unsettable" → skip it silently
❌ no iterations returned → escalate, retry, look for another mutation
✅ configuration was never selected → wrong query. Re-run with the fragment above
✅ configuration selected, iterations: [] → true. Report the field unset, by name,
   and say the board has no iterations configured
```

Telling those apart costs one thing: knowing whether your query actually asked
for `configuration`. If it didn't, you don't have an answer yet.

### The gate — same law, different mechanism

> **Every board-native field the board defines is set to a value the conversation
> established, proposed as a marked guess with its source, or reported unset by
> name. Never guessed *silently*, never silently skipped.**

Board membership gets linked automatically because adding is idempotent and
reversible. **Board field values still do not get that treatment** — a value is
content, not a link, so it goes through the caller's confirmation surface rather
than being written off the back of discovery. Filling it with a marked guess is
allowed and preferred over leaving it blank; writing it *unconfirmed* is not.
`Status` is not an exception: "new issues start in Backlog" is a policy your
workflow may define, and if it hasn't, that is a value to propose and confirm
rather than assume silently.

### A workflow policy *is* a source

The flip side, and the reason the sentence above says "may define": **when a workflow
has written that policy down, a transition derived from it is derived, not guessed.**
`Status` is the one board field with a lifecycle behind it — an item moves because
something happened to the work — so it is the one field a workflow can legitimately
drive without asking each time.

The workday skills define exactly that, in `status-policy.yml` in the org's tracking
repo (start-work / end-work → *Board `Status` — the transition policy*). It maps
lifecycle moments to option **names**, and the calling skill resolves those names to
option ids against **this run's** field discovery.

Three conditions make such a write legal, and all three must hold:

| | Condition |
|---|---|
| 1 | The policy **exists and was agreed to** — not inferred from the board's column names, which is guessing with a config file in front of it |
| 2 | The option name **resolves against this run's discovery.** A name the board no longer returns is a stale policy: report it, never substitute the nearest option |
| 3 | The transition is **shown before it is written**, on the caller's confirmation surface, cited to the policy |

Miss any one and you are back to guessing. **gh-wrapper has no confirmation surface**,
so as always it discovers and reports — it never decides on its own that a card should
move. A caller with no policy gets the field reported unset, exactly as before.

So the two halves of Projects v2 resolve differently, and this is deliberate:

| | Membership | Item fields |
|---|---|---|
| Discovered and missing | **link it, don't ask** | **fill it — from a source, else a marked guess — and confirm; report unset only if the caller can't confirm** |
| Why | idempotent, reversible, content-free | it writes content someone else reads as fact, so it needs eyes on it — but blank is content too, and worse |

Report unset board fields the same way you report unset Issue Fields — by name,
in the same list. A caller who sees "Priority unset" and no mention of `Status`
will reasonably assume `Status` was handled.

## Linking a PR to Its Issue — Four Mechanisms, One Silent Failure

Opening a PR does not link it to anything. As with an issue and its board, the
link is a **separate mechanism from the create**, and the one that matters most
is the one with no visible symptom when it fails.

| Mechanism | What it actually does | Write path |
|---|---|---|
| **Closing keyword** in the PR body | GitHub's real linked-issue relationship: the sidebar link, and auto-close on merge | the body, at create — `Closes owner/repo#N` |
| **Plain mention** (`owner/repo#N`, no keyword) | A cross-reference backlink on the issue. **No link, no auto-close** | the body |
| **Board membership for the PR** | PRs go on Projects v2 boards too, and go missing the same silent way issues do | `gh project item-add --url <pr-url>` |
| **`Linked pull requests`** board field | Read-only projection **derived from the closing keyword** — writing it is not a thing | — |

**The last two are independent of the first two.** A PR can carry a perfect
`Closes` keyword and be on no board; it can be on the board and linked to
nothing. Setting one is never evidence about the other.

### The Default-Branch Trap

```
A closing keyword is IGNORED — entirely, silently — unless the PR
targets the repository's DEFAULT branch.

Not "the link is created but doesn't fire on merge."
No link is created at all.
```

This is the failure mode to design around, because nothing about the PR looks
wrong: the body reads `Closes owner/repo#43`, the text renders, and the sidebar
is simply empty. A PR based on anything other than the default branch — a stacked
PR, a release branch, an integration branch — links to nothing.

**So check the base before trusting the keyword**, and never infer the default
branch from the name `main`:

```bash
gh repo view <owner>/<repo> --json defaultBranchRef --jq .defaultBranchRef.name
```

| Base | Do |
|---|---|
| Is the default branch | Closing keyword works. Use it. |
| Is **not** the default branch | **Say so.** The keyword is inert — keep the plain reference for the backlink, post the issue comment, and report that no linked-issue relationship exists and the issue will not auto-close on merge. |

Reporting it is the whole job here. A caller who is told the PR is "linked" when
the base made that impossible will not check, and the issue silently outlives the
merge.

### Cross-Repo Linking Works — With Two Conditions

`Closes owner/repo#N` closes an issue in a **different** repository, which matters
in any multi-repo org where a thread's issue and its PR live apart. It needs:

1. **Push access to the repo holding the issue.** Normal within one org.
2. **The default branch**, exactly as above — the trap is not same-repo-only.

**Use the full `owner/repo#N` form always, even same-repo.** It costs nothing, it
is the only form that works cross-repo, and it removes the class of bug where a
reference silently resolves against the wrong repository.

**Manual sidebar linking is same-repo only**, so cross-repo has no fallback: if the
base is not the default branch, there is no other way to create the relationship.
Report it unlinked rather than implying a link exists.

### The ladder for creating a PR

| Rung | Path | Status |
|---|---|---|
| 1 — `gh` flag | `gh pr create --base --head --title --body --draft` | Works. Check `.github/pull_request_template.md` first. |
| 2 — GraphQL | `createPullRequest(input:{repositoryId, baseRefName, headRefName, ...})` | Works. |

The closing keyword goes in the **body** — there is no flag or parameter for it on
any rung. Adding the PR to a board is a separate call after creation, same as for
an issue, and the same idempotency applies.

### The gate

> **A PR is created with its closing keyword in the body, or the caller is told
> plainly that no linked-issue relationship exists and why.** Never let "I put
> `Closes` in the body" stand in for a link the base branch made impossible.

**Opening a PR is outward-facing in a way a comment is not** — it requests human
review time. Unlike board membership, it is not a link to be made automatically off
the back of discovery. Whether to open one is the caller's decision; this skill
covers only how, and how to link it once the caller has decided.

## Cross-Repo Work

Issues, PRs, and Projects v2 boards span repositories under one owner. Cross-repo
linking is a normal case in any multi-repo org.

**Every relationship flag accepts an issue URL, and the URL form crosses repos:**

```bash
gh issue edit N --add-blocked-by https://github.com/<owner>/<other-repo>/issues/M
gh issue create --blocked-by <numbers-or-URLs> --blocking <numbers-or-URLs>
gh issue edit N --add-sub-issue https://github.com/<owner>/<other-repo>/issues/M
gh issue create --parent <number-or-URL> --type Task
```

Relationships and sub-issue hierarchy are both rung 1 — these flags are the write
path, and they work.

**Propose dependencies at create time, not only when asked.** Preflight step 5
reads the parent, its sub-issues, and a **bounded scan** of the owner's open
issues (*Searching Issues*, below), in both directions: what this work might
depend on, and what might depend on it.

**The scan runs on every create — nobody has to ask for it.** It is one GraphQL
query at `cost: 1`, capped at page one, and a caller who never mentions
dependencies is the caller most likely to be missing one. An issue with no parent
and no siblings does not shrink step 5 to nothing; it removes the two structural
inputs and leaves the scan carrying the whole step.

**Retrieval is not evidence.** A shared label, a shared milestone, or a similar
title is a fine way to *find* a candidate and no reason at all to *declare* an
edge. What may be written is only what carries a quotable **direction** — a
sentence, quoted verbatim from the candidate or from the conversation, saying
which way round the two pieces of work go: "blocked on X", "waiting on X",
"after X lands", "unblocks X", or a literal `owner/repo#N` inside such a
sentence. A candidate with no such sentence is not a dependency; report it to the
caller as a candidate, or drop it.

Unlike a field, an absent dependency leaves no blank anywhere — so **propose
nothing rather than something vague.** An empty `blocked-by` is a legitimate
answer; an invented one is a structural fact nobody asked for. Drop the flag
entirely when the list is empty rather than passing it empty.

**An empty result is a finding, and it is reported.** "Propose nothing" governs
what is *written*; it never governs what is *said*. The scan hands back a count
either way — *scanned N open issues across Q queries, first page each; none
carried a quoted direction* — and **a create that reports no scan outcome is a
create where step 5 did not run.** The two are indistinguishable from the
outside, which is exactly why the outcome is stated rather than inferred from
silence. Silence reads as "no dependencies"; "I looked and found none" and "I
didn't look" are not the same sentence, and only the caller can tell them apart
— and only if you say which one it was.

**The reverse direction costs more.** `--blocking` writes an edge that appears on
*another* issue's blocked-by list and on *its* board, in front of someone who was
never shown your confirmation surface. Hold it to the same quoted direction —
never a string match — and **name whose issue it lands on** when you report it.

Adding an issue from any linked repo to a shared project:
`gh project item-add <project-number> --owner <owner> --url <issue-url>`.
`--owner` takes an org login, a user login, or `@me` for the authenticated user's
own projects. `projectV2.repositories` lists *linked* repos, not repos *with
items* — never infer coverage from it.

### Read-After-Write Trap

```
✅ gh api /repos/{o}/{r}/issues/{n}/dependencies/blocked_by   → correct immediately
❌ gh api /repos/{o}/{r}/issues/{n} --jq .issue_dependencies_summary → stale ~1s
```

The summary counter lags the write and returns `0` right after you add a blocker.
That looks exactly like "cross-repo dependencies aren't supported" — it isn't.
**Any "is this blocked?" check must read the list endpoint or GraphQL's
`blockedBy`.** The summary is fine on a cold read.

### Cross-Repo Rollup: Use GraphQL

One query, `cost: 1`, versus 18 REST requests for the same 16 issues:

```graphql
organization(login: "<owner>") { projectV2(number: <project-number>) { items(first: 30) { nodes {
  content { ... on Issue {
    number  repository { nameWithOwner }  state
    blockedBy(first: 5) { nodes { number repository { nameWithOwner } state } }
  } } } } } }
```

For a personally-owned project, swap the root to `user(login: "<owner>")` — the
entire selection inside is unchanged. This one **does** swap, unlike `issueFields`.

Fields are `blockedBy` / `blocking` on `Issue` — **not** `blockedByIssues`. A
wrong name returns `errors` with no `data` key, which reads like absence but is a
typo. Introspect before concluding a field is missing.

### Searching Issues — scope, qualifiers, and cost

*The queries in this section are **unverified in this repo** — unlike the Issue
Fields mutations above, they have not been run against a live org. Confirm the
edge selections on first use, then promote this note.*

**Three surfaces, and picking the wrong one silently narrows your search:**

| Surface | Scope | Returns |
|---|---|---|
| `gh issue list --search "..."` | **one repo** — `-R` or the cwd's remote | issue fields only |
| `gh search issues "..." --owner <o>` | **cross-repo**, one owner | issue fields only |
| GraphQL `search(type: ISSUE)` | **cross-repo**, one owner | issue fields **plus each hit's `blockedBy`/`blocking` in the same request** |

**`gh issue list --search` is repo-scoped.** Reading an empty result from it as
"nothing in the org" is the most common way this goes wrong — it searched one
repository.

Prefer GraphQL by **routing**, for the same reason as the rollup above: REST
search returns titles, and you would then spend one more request per hit to read
its edges.

```graphql
search(query: "org:<owner> is:issue is:open <terms>", type: ISSUE, first: 20) {
  issueCount
  nodes { ... on Issue {
    number  title  state  url  updatedAt  repository { nameWithOwner }
    blockedBy(first: 5) { nodes { number repository { nameWithOwner } state } }
    blocking(first: 5)  { nodes { number repository { nameWithOwner } state } }
  } } }
```

Rung 1, for the fallback path and for callers that only need titles:

```bash
gh search issues "<terms>" --owner <owner> --state open --limit 20 \
  --sort updated --order desc \
  --json number,title,state,repository,url,updatedAt
```

**Qualifiers** go inside the query string: `org:` `repo:` `is:issue` `is:open`
`is:closed` `in:title` `in:body` `label:` `milestone:` `author:` `assignee:`
`no:assignee` `updated:>=YYYY-MM-DD` `closed:>=YYYY-MM-DD`. **`sort:` does not** —
`gh search` takes dedicated `--sort` / `--order` flags, and a `sort:` inside the
string is silently treated as a search term.

`gh search issues` excludes PRs by default; `--include-prs` opts them in, and
`gh search prs` is the separate surface.

**Enumerating siblings.** Preflight step 5 needs the parent's sub-issues *with
their declared edges*. Rung 1 (`gh issue view N --json parent,subIssues`) returns
titles and states but no edges, so this is rung 2 **by routing** — one request
instead of 1 + N:

```graphql
repository(owner: "<owner>", name: "<repo>") { issue(number: <n>) {
  number  title  state
  blockedBy(first: 5) { nodes { number repository { nameWithOwner } state title } }
  subIssues(first: <cap>) { totalCount nodes {
    number  title  state  url  repository { nameWithOwner }
    blockedBy(first: 5) { nodes { number repository { nameWithOwner } state title } }
    blocking(first: 5)  { nodes { number repository { nameWithOwner } state title } }
  } } } }
```

**Cost.** A GraphQL search is 1 point. REST search has its **own** 30 requests/min
ceiling, separate from the 5000/hr core limit — a loop of `gh search` calls hits a
limit that a loop of `gh issue view` calls does not. GraphQL search caps `first`
at 100 and total reachable results at 1000.

#### Search-Index Lag Trap

A companion to the read-after-write trap above, and it bites in the same shape:

```
✅ gh api /repos/{o}/{r}/issues/{n}            → correct immediately
❌ gh search issues "<title>" --owner {o}      → may omit an issue created seconds ago
```

The search index is **asynchronous**. **An empty search result is never evidence
that an issue does not exist** — read it by number. This matters most right after
a create, which is exactly when a caller is most tempted to search for what it
just wrote.

#### Bound every scan

Search is a retrieval channel, not a crawl:

```
a stated query count · a stated --limit · PAGE ONE ONLY
never a cursor, never a second page
```

An unbounded search returns more results, not better ones, and **every extra
result is a line someone has to read.** If a tie were strong enough to act on, it
would have ranked. Paginating to find one more match buys noise by construction.

## Issues

| Task | Command | Note |
|---|---|---|
| list open issues | `gh issue list` | add `--state all` for everything |
| filter by label | `gh issue list --label bug` | |
| search | `gh issue list --search "..."` | **repo-scoped.** Cross-repo is `gh search issues --owner`; GraphQL `search(type:ISSUE)` also returns each hit's edges — see *Searching Issues* |
| read one | `gh issue view N` | `--comments` for the thread, `--json` for fields |
| create | `gh issue create -t -b` | run *Preflight: Before Creating Any Issue* first — all six lookups in one pass, before the write. Every field filled, `--assignee "@me"` by default, the dependency scan run and **its outcome reported even when empty** |
| add / remove a label | `gh issue edit N --add-label X` | additive; the REST/GraphQL `labels` array **replaces** — read current labels first if you go that way |
| assign | `gh issue edit N --add-assignee u` | `@me` and `@copilot` are accepted. **`@me` is the default on create** — displaced only by a named person, never joined by one. Claiming an *unassigned* existing issue is fine; reassigning someone else's is a handoff, not a default |
| set the issue type | `gh issue edit N --type X` | validate against `gh api /orgs/<owner>/issue-types` — org-only |
| milestone | `gh issue edit N --milestone "name"` | `--remove-milestone` to clear |
| close | `gh issue close N` | `--reason "not planned"` maps to `state_reason: not_planned` |
| reopen | `gh issue reopen N` | |
| comment | `gh issue comment N -b` | |
| sub-issue add / move / remove | `gh issue edit N --add-sub-issue` / `--parent` / `--remove-sub-issue` | number or URL; URL form crosses repos |
| read hierarchy | `gh issue view N --json parent,subIssues` | reorder has no flag — rung 2, `reprioritizeSubIssue` |
| enumerate siblings | rung 2 — the parent's `subIssues` | rung 1 returns titles but no edges; one GraphQL request returns the siblings **with** their `blockedBy`/`blocking` — see *Searching Issues* |

## Pull Requests

| Task | Command | Note |
|---|---|---|
| list open PRs | `gh pr list` | `--search "..."` to filter; `gh search prs` crosses repos |
| read one | `gh pr view N` | `--json` for structured fields, including `files` |
| diff | `gh pr diff N` | |
| checks | `gh pr checks N` | |
| create | `gh pr create --base --head --title --body` | check `.github/pull_request_template.md` first; closing keyword goes in the **body** |
| request review | `gh pr edit N --add-reviewer u` | |
| retitle / retarget | `gh pr edit N --title` / `--base` | |
| mark ready | `gh pr ready N` | |
| approve / request changes | `gh pr review N --approve` / `--request-changes` | top-level body only |
| line-level review comment | `gh api graphql` | **no `gh` flag exists** — rung 2, `addPullRequestReviewThread` |
| comment | `gh pr comment N -b` | PR comments go through the issue endpoint |
| merge | `gh pr merge N --squash` | **confirm with the user first** |
| update branch | `gh pr update-branch N` | |

## Repo / Files / Search / Users

| Task | Command | Note |
|---|---|---|
| create a repo | `gh repo create name --private` | |
| fork | `gh repo fork` | |
| list branches | `gh api repos/<o>/<r>/branches` | |
| commits | `gh api repos/<o>/<r>/commits` | or plain `git log` in a local clone |
| read a file at a ref | `gh api repos/<o>/<r>/contents/<path>?ref=<ref>` | |
| write a file remotely | `gh api --method PUT repos/<o>/<r>/contents/<path>` | needs the blob `sha` to overwrite — `git rev-parse <branch>:<path>` |
| releases | `gh release list` / `gh release view <tag>` | |
| search | `gh search issues/prs/repos/code/commits` | crosses repos under one `--owner`; for issues see *Searching Issues* — scope, qualifiers, caps, and the index-lag trap |
| identity | `gh api user --jq .login` | |
| team members | `gh api /orgs/<org>/teams/<slug>/members` | **org-only** — absent on a personal account |
| collaborators | `gh api /repos/<o>/<r>/collaborators` | the personal-account substitute for teams |

`gh workflow`, `gh secret`, `gh gist`, `gh alias`, `gh extension`, `gh run`,
rulesets, milestones, and webhooks are all ordinary rung-1 `gh` commands.

**Plain `git` is not `gh`.** Running `git` against a local clone needs no
routing at all.

## Research Subagents

Multi-call GitHub research can be delegated to parallel read-only subagents. This
section is portable — it encodes no workflow's policy, only what any caller needs
to delegate safely.

**Spawn the built-in `Explore` type.** It holds no `Write`, `Edit`, or
`NotebookEdit`, so a research agent cannot touch a file. **It does hold `Bash`**,
so nothing structural stops a `gh issue edit` — a custom agent definition's
`tools:` allowlist is the only thing that would, and a skill cannot set one per
invocation.

```
So state the honest strength:
  file writes    → blocked structurally (Explore has no Write/Edit)
  GitHub writes  → denied by instruction, caught by the return gate
Never write "structurally incapable" about a research agent's GitHub access.
```

**A research agent is a proposer, never an actor.** Every write executes in the
calling skill, in the main conversation, in view of the user. Nothing an agent
returns is a receipt.

### What every brief must carry

```
YOU ARE READ-ONLY.
Never call setIssueFieldValue, addProjectV2ItemById,
updateProjectV2ItemFieldValue, any GraphQL mutation, or
gh issue edit/create/close/comment or gh project item-add/item-edit. If a task
seems to need one, return it in asks[] — never as an action.

Walk the ladder: gh flag → gh api graphql. Never report something
unreachable without walking both and naming both.
Never read issue_dependencies_summary to decide whether something is blocked.
The fields are blockedBy / blocking on Issue — not blockedByIssues.
HTTP 200 can carry an "errors" key. Check every response, whatever the exit code.
  Nulls under errors are FAILURES, not absences — they go to not_covered[].
On a personally-owned account Issue Fields and issue types are ABSENT, not
  restricted. Empty is the complete answer. Do not escalate.

Return exactly one fenced json block as your last message. Rows, never prose.
```

### The envelope

```json
{ "agent": "<brief-name>", "status": "ok|partial|failed|input_invalid",
  "rung": 2, "rung_reason": "routing|rung1_failed|rung1_sufficed",
  "covered": [], "not_covered": [],
  "surface_log": [{"call": "...", "rung": 2, "class": "read", "ok": true}],
  "asks": [], "unavailable": [], "data": {} }
```

`covered` / `not_covered` are **mandatory**. Delegation makes degradation
invisible by default: a partial scan covering 4 of 7 targets is useful, the same
scan presented as complete is a lie, and without these two fields a `partial`
return is a coin flip. Non-empty `asks[]` **blocks every dependent write**.

### The portable gates — run before rendering a line

| Gate | On failure |
|---|---|
| **Envelope** parses and carries every required field | Treat as no-return. **Never scrape values out of prose.** |
| **Write-class** — every `surface_log[].class == "read"`, and no `call` matches `setIssueFieldValue`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `^mutation`, `gh issue (edit\|create\|close\|comment)`, `gh project item-(add\|edit)`, `gh pr (create\|edit\|merge\|review)`, `gh api --method (POST\|PATCH\|PUT\|DELETE)` | **Discard the whole payload.** Tell the user a read-only agent attempted a write. Do not retry silently. |
| **Existence** — every `owner/repo#N` resolves | Drop the ref and say so. Distinguish "does not exist" from `data: null` **with an `errors` block at HTTP 200** — the latter is a permissions or transient failure, not a hallucination. |
| **Discovery** — every proposed field name is in this run's org `issueFields` **or** this run's `projectV2.fields`, and the proposal names which | Drop the proposal; report that field unset, naming it. A proposal that doesn't say which of the two it means is not verified — the write paths differ. |
| **Ladder honesty** — any unreachability claim is backed by `surface_log` entries at **both** rungs | Treat as unproven. **The caller re-walks the ladder itself** before reporting anything unset. |
| **Coverage** — `not_covered[]` is printed | Never omit it. |

Ladder honesty is the gate that matters most: a subagent under budget pressure
declaring a limit it never tested is how this skill's discipline decays under
delegation. *Running out of time makes something unset, never unsettable* applies
to agents exactly as it applies to you.

### Failure modes

- **No return, or prose.** Retry **once**, narrowed. Then run the caller's own
  inline procedure and say it ran degraded. Never invent the missing content.
- **Partial.** If `data` is populated, use it — and print `covered` / `not_covered`.
- **Hallucinated ref.** Drop it, name it. If it was load-bearing, the analysis
  reports itself not-run rather than rendering with a hole in it.
- **Two agents disagree.** Never pick a winner silently. The more specific query
  wins — reading `blockedBy` beats inferring from labels — and **the disagreement
  is reported**.

**Reporting the rung:** say nothing for `rung1_sufficed`; mention `routing` only if
asked. A `rung1_failed` that rung 2 then covered is worth one line, not a paragraph.

## Red Flags — STOP

- About to say a field, relationship, or action "can't be set" without having
  walked both rungs
- Escalating up the ladder for an Issue Field or issue type on a personal account
- Reporting "can't be set" without having established whether the owner is an org
  or a user — the two produce identical-looking `null`s for opposite reasons
- Filling in a field value the conversation never established
- Creating an issue without first discovering what fields the org defines
- Leaving a discovered field neither set nor reported unset
- Creating an issue without discovering whether the owner has a Projects v2 board
- Leaving a discovered project neither linked nor reported unlinked — an issue on
  no board looks completely normal and fails silently
- Collapsing "no project exists" and "a project exists, this issue isn't on it"
  into the same silence
- Adding an issue to a board and stopping there — membership sets no values; every
  board-native field starts empty and stays that way until you write it
- Discovering the board's fields but never accounting for every one discovery
  returned — an item on a board with an empty `Status` looks tracked and is not,
  and one with an empty iteration field is in no sprint
- Accounting for the board fields you recognise and passing over the rest —
  `Status`/`Size`/`Estimate` are examples in this file, never the set. Discovery
  returns the set, and it differs per board
- Querying `fields` without the type-specific fragments, then reading a field with
  no values back as a field that cannot be filled — an iteration field with no
  `configuration` selected, or a multi-select with no `options`, is a query you
  didn't finish, not a board limitation
- Looking for an iteration field by the name `Iteration` — the dataType is
  `ITERATION` and the name is whatever the board typed, commonly `Sprint`
- Reading a `fields` page back without comparing it to `totalCount` — past the
  cap the tail is gone, and a truncated list looks exactly like a short board
- Resolving an iteration by title, or writing one out of `completedIterations` —
  it validates and files the work into a sprint that already shipped
- Writing a `Status`, `Size`, or `Estimate` *unmarked and unconfirmed* because the
  board "obviously" wants one — filling it with a labelled guess is right; slipping
  it in as though it were sourced is what the Iron Law covers
- Leaving a field blank *because* the only available value would be a guess — blank
  is the worse of the two, and it is the one nobody notices
- Treating "new issues go in Backlog" as a fact about GitHub rather than a policy
  your workflow either defined or didn't
- Reaching for `updateProjectV2ItemFieldValue` on a board field whose name is also
  an org Issue Field — cross-reference the two lists before writing, not after the
  error
- Reading the mirror error as a permissions problem and escalating, or retrying it
  unchanged
- Concluding a personal account has no projects from an empty `organization(...)`
  query — projects are **not** org-only; switch to `user(login:)` and ask again
- Stopping to ask the caller whether to add a discovered board when there's
  exactly one and the issue isn't on it — that's the default case; link it
- Picking one project when discovery returned several
- Skipping a link because an auto-add workflow "probably" caught it — its scope is
  not visible from here, and adding is idempotent anyway
- Putting a closing keyword in a PR body without checking that the base is the
  repo's **default branch** — off it, the keyword is inert and no link is created
- Assuming the default branch is `main` instead of reading `defaultBranchRef`
- Reporting a PR as "linked to #N" when the base branch made the keyword inert —
  the body renders fine and the sidebar is empty, so nobody checks
- Using a bare `#N` in a closing keyword for an issue in another repo
- Opening a PR and stopping there — board membership is a separate call, and PRs
  go missing off a board exactly the way issues do
- Trying to write `Linked pull requests` on a board item — it is a projection of
  the closing keyword, not a writable field
- Approximating a field with a label, a comment, or `gh project item-edit`
- Reading `issue_dependencies_summary` to decide whether something is blocked
- Creating an issue without having run the dependency scan — the one preflight
  step whose omission leaves no blank, no error, and no empty field anywhere to
  notice it by
- Reporting a created issue without saying what the scan found, including — and
  especially — when it found nothing
- Treating "no parent, no siblings" as having discharged step 5 — that is the
  case where the scan is the whole step, not the case where it is unnecessary
- Treating a search hit as evidence of a dependency — a hit is a candidate, and it
  still has to carry a quoted direction before it can be written
- Citing a shared label, a shared milestone, or a similar title as *why* a
  dependency belongs, rather than as *how* the candidate was found
- Writing a `--blocking` edge off a string match — it lands on someone else's
  issue, on their board, in front of someone who never saw your confirmation
- Reading an empty `gh issue list --search` as "nothing in the org" — it searched
  one repository
- Concluding an issue does not exist from an empty `gh search` seconds after
  creating it — the index is asynchronous
- Running an unbounded issue search, or paginating past page one to find one more
  match
- Concluding a GraphQL field doesn't exist after one failed query
- Concluding "impossible" from an empty `options: []` list
- Writing a *neighbouring* field because the real field resisted one attempt
- Putting field values in the issue **body** as prose instead of on the fields
- Letting a deadline convert "I didn't finish this" into "this can't be done"
- Inventing a `gh` flag instead of dropping to rung 2
- Treating a fallback to GraphQL as approval for a merge, delete, or send
- Rendering or writing any part of a subagent payload before the gates have run
- Calling a research agent "structurally incapable" of writing to GitHub — `Explore`
  holds `Bash`; it is denied and verified, which is a weaker claim
- Scraping values out of an agent's prose when its JSON block failed to parse

**The first group means: establish what exists, then stop and ask or walk the
ladder. The rest mean: you are about to write something false into the record.**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "No `gh` flag for it, so it can't be done" | Rung 2 exists. Walk it before claiming a limit. |
| "`issueFields` returned nothing, so I'll try rung 2" | Check the owner first. On a personal account there is nothing to find and no rung will find it. |
| "`user(login:)` should work for issue fields like it does for projects" | Projects v2 swaps; Issue Fields do not. `User.issueFields` is not in the schema. |
| "It 404'd, so my token lacks scope" | `/orgs/...` 404s on a personal account by design. Establish owner type before blaming auth. |
| "The skill says Issue Fields have no fallback" | It did, and it was wrong. `setIssueFieldValue` is verified working. |
| "GraphQL feels like overkill for one field" | Style is not capability. A false limitation is worse than a long query. |
| "I'll fill in this field with something reasonable" | Guessed values look identical to real ones downstream. Ask. |
| "This field can be filled in later" | Every field discovery returns is accounted for at create time. Later doesn't happen. |
| "Discovery doesn't say which are required, so I'll set the ones I recognise" | Recognition is not discovery. Account for every field returned — set it from a source, propose a marked guess, or report it unset. Recognising four of six is how the other two go blank. |
| "The task calls for a field this org doesn't define" | Then it doesn't exist. Say so rather than inventing it. |
| "The board fields are Status, Size, and Estimate" | Those are this file's examples, not the board's schema. The board returned a list; account for that list. |
| "The iteration field came back with no values, so it can't be set" | Ask whether your query selected `configuration`. Identity without values is an incomplete query, not an unsettable field — same shape as `options: []`. |
| "This board has no iteration field" | You searched for the name. Search `dataType == "ITERATION"` — the live board checked calls its field `Sprint`. |
| "30 fields is more than any board has" | Compare the node count to `totalCount` and stop guessing. A truncated list is indistinguishable from a complete one except by that number. |
| "A title match found the sprint, so that's the iteration id" | Titles recur every cycle and `completedIterations` is where the old ones live. Resolve by id, off the list that excludes completed ones. |
| "Nobody said which sprint, so leave Iteration blank" | The iteration whose window contains today is derived from `startDate` + `duration`, which discovery returns — that is a source, not a guess. Blank is the one outcome nobody notices. |
| "It has no parent and no siblings, so there's nothing for step 5 to read" | Then the scan is the only input, not zero inputs. Absent structure raises the scan's value; it does not exempt it. |
| "This issue is a test / the content is fabricated, so it can't have real dependencies" | The scan is what establishes that, not an assumption that precedes it. A fabricated issue in a real org still lands in a real search index, and "no dependencies" is a result you report, not one you presume. |
| "Nobody asked about dependencies, so the scan wasn't part of this task" | Step 5 is not caller-triggered. The caller who never mentions dependencies is the one most likely to be missing one — that is the case it exists for. |
| "The scan found nothing, so there's nothing to report" | A count is the finding. Reporting nothing looks identical to never having looked, and the caller cannot tell which one happened. |
| "Summary says blocked_by 0, so nothing blocks it" | The counter is stale for ~1s after a write. Read the list endpoint. |
| "Cross-repo dependencies must not be supported" | They are. You read a lagging counter. |
| "`blockedByIssues` errored, so GraphQL can't do it" | Wrong field name. It's `blockedBy`. Introspect. |
| "`options: []`, so the field isn't configured" | You queried the board mirror. The options exist. Read `issueFields` — and note the field is a mirror, so it takes `setIssueFieldValue`. |
| "I added it to the board, so the board is done" | Membership sets no values. Every board-native field is still empty. |
| "Board fields are just the project's copy of the issue fields" | Three kinds live there: mirrors, board-native, and read-only projections. Only board-native ones are written with `updateProjectV2ItemFieldValue`. |
| "The mirror error means I lack permission on that field" | It means wrong mechanism. Write it on the issue with `setIssueFieldValue`. Retrying or escalating changes nothing. |
| "Status is obviously Backlog for a new issue" | That's your workflow's policy, if it has one. Absent that, it's a guess — so propose it *as* one, cited to the board's real options, and let the caller confirm. What you may not do is write it as though the policy said so. |
| "The workflow has a Status policy, so I can move any card I like" | The policy covers the moments it names, on the board it names, with options that still resolve. Outside that it establishes nothing. |
| "There's no policy file, but the columns are named Todo / In Progress / Done — the mapping is obvious" | Reading a mapping off column names is guessing with extra steps. The policy is agreed to, or it doesn't exist. |
| "The policy names an option the board dropped — I'll use the closest one" | That's the substitution this whole skill forbids, applied to the one field people plan off. Report the stale key. |
| "Estimate is a number, I'll put a sensible one" | A fabricated estimate is read as a real one by every capacity view on the board. |
| "I'll link the board now and set Status later" | Later doesn't happen. Discover all four up front; set fields right after the add. |
| "Adding to the board is automatic, so fields must be too" | Adding is idempotent and content-free, which is why it's automatic. Values are content and are not. |
| "A human needs to add the missing options first" | Nothing is missing. You are about to send someone to 'fix' a correct field. |
| "This field is the closest thing to the one I need" | Closest ≠ correct. It records a different field. Report the real one unset instead. |
| "The mutation's input shape is undocumented" | Introspect `IssueFieldCreateOrUpdateInput`, or copy the working mutation above. |
| "No time left to finish the fields" | Then say the fields are unset. Never upgrade "unfinished" to "impossible." |
| "I'll put the values in the body for now" | Prose in a body is not a field. Nothing queries it. |
| "`sort:` in the query works in the UI" | `gh search` takes dedicated `--sort` / `--order` flags. |
| "`gh issue list --search` found nothing in the org" | It searched **one repo**. Cross-repo is `gh search issues --owner`. |
| "I just created it and search doesn't return it" | The index is asynchronous. Read it by number; an empty search proves nothing. |
| "Same label, same milestone — obviously the same work" | The label is how you *found* it, not why it belongs. Quote a sentence saying which way round the two go, or drop it. |
| "One more page might turn up the blocker" | If the tie were strong enough to write, it would have ranked. Page two buys noise by construction. |
| "I'll pull each candidate's blockers with a REST call per hit" | The GraphQL `search` selection returns `blockedBy` inline. That's twenty requests for one query's data. |
| "It probably blocks #61 — cheap to add, they can remove it" | It lands on #61's blocked-by list and #61's board, in front of someone who was not in this conversation. Removing it is their afternoon, not yours. |
| "The body says `Closes #43`, so the PR is linked" | Only if the base is the default branch. Off it, GitHub ignores the keyword and creates nothing — and the body still renders exactly the same. Read `defaultBranchRef`. |
| "The base is `main`, that's the default branch" | Usually. Not always, and the failure is silent when it isn't. One `--json defaultBranchRef` settles it. |
| "Cross-repo closing keywords aren't supported" | They are — `Closes owner/repo#N`, given push access to that repo and a default-branch base. |
| "Same repo, so a bare `#43` is fine in the keyword" | It works until the PR moves or someone reads it from elsewhere. The full form costs nothing and never resolves against the wrong repo. |
| "I opened the PR, so the board picks it up" | Board membership is a separate call for PRs exactly as it is for issues, and the same auto-add scoping you can't see applies. |
| "I'll set `Linked pull requests` on the board item" | It is a projection of the closing keyword. Write the keyword; the field follows. |
| "I fell back to GraphQL, so the merge is approved" | A fallback is routing, never consent. |
| "The agent is read-only, so its payload is safe to use" | `Explore` holds `Bash`, so every `gh` write is reachable. Read-only is a rule it was given, not a wall it hit. Run the gates. |
| "Its JSON was malformed but the numbers are right there" | Scraping prose is how a hallucinated figure enters a record wearing a real one's clothes. Retry once, then fall back. |
| "The agent says that field can't be reached" | Not unless both rungs are in its log. Re-walk it before reporting anything unset. |

## Quick Reference

| Situation | Action |
|-----------|--------|
| `gh` command in hand | Check `gh <cmd> --help` — the flag is rung 1 when it exists |
| No flag covers it | Drop to `gh api graphql` and say which rung you used |
| About to report "can't be done" | Walk both rungs first, then name what you tried |
| Owner is org or user? | `repositoryOwner(login:){__typename}`, or `gh api /users/<owner> --jq .type` |
| Which fields exist | `gh api /orgs/<owner>/issue-fields` at call time — never a remembered list |
| Setting a custom Issue Field | `setIssueFieldValue` — no `gh` flag exists, and never a label |
| Issue type | `gh issue edit N --type` |
| Which projects exist | `organization(login:){projectsV2}` at call time — never a remembered number |
| Owner is a personal account | Projects live under `user(login:){projectsV2}` — **not** absent like Issue Fields |
| Adding an issue to a board | `gh project item-add --url`, else `addProjectV2ItemById` |
| Issue not on the discovered board | **Add it.** Don't stop to ask — discovery already answered the question. |
| Discovery returned several projects | List them all; never pick one silently — ask which, or add to all if already told to |
| An auto-add workflow might cover it | You can't see its scope. Link anyway — adding is idempotent. |
| Which board fields exist | `projectV2.fields` at call time — ids are per-board, never reused |
| Setting Status / Size / Estimate | `updateProjectV2ItemFieldValue`, or `gh project item-edit` — needs the **item** id |
| Board field name also in the org's `issueFields` | It's a mirror — `setIssueFieldValue` on the issue, not the board mutation |
| Board single-select shows `options: []` | Mirror confirmed. Board-native ones return real options. |
| "Issue field values cannot be updated using…" | Wrong mechanism, not permissions. Switch to `setIssueFieldValue`. |
| Just added an item to a board | Its fields are all empty. Fill them or report them unset — the add wrote nothing. |
| Board has a `dataType: ITERATION` field | Board-native, whatever it's named (`Sprint`, `Cycle`, …). Pick from `configuration.iterations` — never `completedIterations`, never by title. Default: the window containing today, cited to its dates. |
| An iteration field returned no values | Check whether you selected `configuration`. Selected and `iterations: []` is the truth; not selected is an unfinished query. |
| Board field list came back | Compare node count to `totalCount` before treating it as the set |
| Board field value not established | Propose a marked guess with its source; report it unset only when the caller has no confirmation surface. Never write an *unmarked* Status or Estimate. |
| Caller has a written `Status` policy | A transition derived from it is **derived**, not guessed — provided the option still resolves and the caller shows it before writing |
| Caller has no such policy | Propose `Status` as a marked guess against the board's real options. Never present a mapping read off column names as though it were the policy. |
| Linking a PR to its issue | Closing keyword in the **body** — no flag or parameter exists on either rung |
| Before trusting a closing keyword | `gh repo view --json defaultBranchRef` — off the default branch it is inert |
| PR base is not the default branch | Keyword does nothing. Keep the plain reference, comment on the issue, report it unlinked |
| PR and issue in different repos | `Closes owner/repo#N` — works, needs push access and the default branch |
| Which reference form in a keyword | Always full `owner/repo#N`, even same-repo |
| Just opened a PR | It is on no board. Adding it is a separate call, same as for an issue |
| blocked-by / blocking | `gh issue edit`/`create` — URL form for cross-repo. Proposed at create time from parent + siblings + a bounded scan, not only on request |
| Creating an issue, nobody named | `--assignee "@me"` is the default; only a named person displaces it |
| Sub-issue across repos | `--add-sub-issue <full-URL>` |
| "Is this blocked?" | `dependencies/blocked_by` list, never the summary |
| Searching across repos | `gh search issues --owner`, or GraphQL `search(type:ISSUE)` when you also need each hit's edges |
| Searching one repo | `gh issue list --search` — and that is all it searches |
| Enumerating siblings | The parent's `subIssues`; rung 2 returns their edges in the same request |
| The scan cleared nothing | Still report it — a count and what it cleared. Silence is indistinguishable from never having looked |
| A search hit with no quoted direction | Not a dependency. Report it as a candidate or drop it — never write it |
| A `--blocking` edge | Same quoted-direction bar, and name whose issue it lands on |
| Empty search right after a create | The index is asynchronous. Read by number; that result proves nothing |
| Cross-repo status rollup | One GraphQL query, not N REST calls |
| Owner/repo not given | `git config --get remote.origin.url` |
| Adding a label | `gh issue edit --add-label` is additive; the REST/GraphQL array replaces |
| Irreversible (merge/delete/send) | Confirm first, on either surface |
| Delegating research | Spawn `Explore`, several in one message; brief carries the read-only rule |
| An agent payload comes back | Run the gates above before rendering a line of it |
| Agent claims something unreachable | Unproven unless both rungs are in its `surface_log`. Re-walk it yourself. |

## The Bottom Line

**Walk the ladder before declaring a limit. Fill every field, and mark what you
guessed.**

The record is only worth what its worst entry is worth — and a blank entry is one
of the worst, because it reads as deliberate and nobody goes looking for it. Fill
it: from a source where there is one, from a labelled guess where there isn't.
What corrupts the record is not the guess but the *unmarked* guess, which is
indistinguishable from a fact, and the falsely-reported "can't be set", which is a
blank wearing an excuse.
