---
name: gh-wrapper
description: Use when about to run any `gh` CLI command (`gh issue`, `gh pr`, `gh repo`, `gh api`), when the user pastes one, when setting a custom Issue Field (org-defined single-select, date, number, or text) or an issue type on an issue, when creating an issue that may belong on a Projects v2 board, when setting Projects v2 board item fields (Status, Size, Estimate, or any board-defined field), when linking issues across repositories, when opening a pull request or linking one to its issue, or when about to report that a GitHub field, board membership, relationship, or PR link cannot be set
---

# gh Wrapper: Route to the Right GitHub Surface

## Overview

Three surfaces reach GitHub: the `plugin:github:github` MCP server, the `gh`
CLI, and `gh api graphql`. They are not interchangeable, and **the MCP tools are
not always loaded**. Route by capability, not by habit.

**Core principle:** Prefer MCP, but never let a missing MCP tool become a missing
capability. Something further down the ladder can almost always do it.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
EVERY FIELD DISCOVERY RETURNS IS SET WITH A VERIFIED VALUE
OR EXPLICITLY REPORTED UNSET.

NEVER GUESSED. NEVER APPROXIMATED. NEVER SILENTLY SKIPPED.
```

**"Every field" means org Issue Fields *and* Projects v2 board item fields.** They
are different mechanisms with different write paths (see *Projects v2* below), and
the law does not distinguish between them. An issue landing on a board with an
empty `Status`, `Size`, or `Estimate` is the same corrupted record as one with an
empty Priority — it just fails silently in a different view.

A guessed value is indistinguishable from a real one downstream. A field you
quietly skipped reads as "not applicable" to whoever reads the record next. Both
corrupt the record. Ask, or report it unset — those are the only two honest
outcomes.

**The law survives delegation.** When this work is handed to a read-only research
subagent, it applies unchanged to the proposal that comes back: a value the agent
inferred is not a value that was verified, and it is confirmed or reported unset
like any other. See *Research Subagents* below. A caller that defines its own bar
for "verified" layers that on top; it never lowers this one.

## The Ladder

```
BEFORE saying "that can't be set / can't be done through this surface":

1. MCP TOOL?      Check the tables below. Confirm the tool is actually
                  loaded — do not assume from the table alone.
2. gh FLAG?       Check `gh <cmd> --help`. Flags changed recently;
                  read the help, don't recall it.
3. gh api graphql? The universal escape hatch. Nearly everything
                  REST or GraphQL can do is reachable here.
4. ONLY THEN:     Say it can't be done — and name all three rungs
                  you tried.

Skip any rung = fabricating a limitation
```

**The ladder is a capability fallback order, not a cost order.** For a cross-repo rollup, rung 3 is
the *routing* answer rather than an escalation — one GraphQL query costs 1 point where the REST
equivalent is 18 requests. Starting there is following the ladder, not skipping it. Say which rung
you used and why.

**No exceptions:**
- Not for "MCP is the house style, so I'll just report it unavailable"
- Not for "the skill used to say there was no fallback"
- Not for "GraphQL feels like overkill for one field"
- Not for a deadline. Running out of time makes a field **unset**, never
  **unsettable** — those are different sentences and only one of them is true.
- An error message naming another mutation is a signpost to the next rung, not
  a dead end
- Reporting a false limitation is worse than shelling out

## Preflight: Is MCP Actually Loaded?

The plugin may be enabled and still **not appear in a given session.** Tool
prefix is `mcp__plugin_github_github__`, not `mcp__github__`.

If `ToolSearch` returns nothing for it, MCP is off the table for the whole
session. Do not retry per-command. Drop to rung 2 and say so once.

**Owner/repo:** infer from `git config --get remote.origin.url` when `-R` is absent.
**Identity:** `get_me()`, or `gh api user`, when a command needs "me".

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
`organization(login:) { issueFields ... }` selection from rung 3 below to this
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
| Teams | yes | **no** | org-scoped — use `list_repository_collaborators` instead |
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

On a personal account an empty field set is a **complete answer, not a rung-1
failure.** The ladder exists for capabilities that exist. Escalating here
manufactures work and ends in a false report either way — "unsettable" is wrong,
and so is silently setting nothing without saying why.

Contrast this with the `options: []` trap below, which is the same shape
inverted: there, empty is a lie told by the wrong node; here, empty is the truth.
Telling them apart is exactly what the owner-type probe is for.

## Preflight: Before Creating Any Issue

**Creating an issue is not one lookup, it's four, and they run together, before
the write.** An agent that starts from the Issues table below and follows only
the row for `issue_write(method: "create")` never sees the Projects v2 section
unless it goes looking — that's how a board link gets missed without anyone
deciding to skip it. Do all four in one pass, every time, regardless of which
table or command sent you here:

```
BEFORE issue_write(method:"create") / gh issue create — ALWAYS:
1. list_issue_fields(owner)         → issue fields to set or report unset
2. list_issue_types(owner)          → valid type, if the repo uses types
3. projectsV2 discovery (below)     → board(s) to link
4. projectV2.fields discovery       → board item fields to set or report unset
                                      (Status, Size, Estimate, …)
```

None of the four is optional because the task "looked like" it didn't need it.
Steps 3 and 4 are the ones with no visible symptom when skipped — the issue looks
completely normal, fields and all, and is simply invisible to (or blank on)
whatever board people actually plan from. Run them before the create, not as a
follow-up once someone asks why the issue isn't on the board or why its `Status`
is empty.

**Ordering:** steps 1–2 are written *with* the create; step 4's values can only be
written *after* the item is on the board, because a board item field value needs an
item id that doesn't exist until step 3's add. Discover all four up front anyway —
discovering late is how "I'll set Status after" becomes never.

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
options.** `list_issue_fields(owner)` returns each field's name, type, and, for
single-selects, its valid options. Account for **every field it returns**: set it
to a value the conversation established, or report it unset. Never guess one,
never silently skip one. An admin can change the field set without touching this
file, and a field set that is right for one org is wrong for the next.

This whole section is **org-only.** On a personally-owned account there are no
Issue Fields to discover and nothing above applies — see the owner-type preflight
and stop there rather than escalating.

**There is no `required` flag.** `list_issue_fields` returns name, type, and
options only — GitHub does not expose which fields are mandatory. Requiredness is
a policy your project defines elsewhere, not something this surface can detect.
"Account for every field returned" is the rule that works with what the API
actually gives back.

Issue types are org-defined too, and **also org-only**. Validate against
`list_issue_types` (rung 1) or `gh api /orgs/<owner>/issue-types` before assuming
a type exists or applies. That path 404s on a personal account by design — there
is no user-level equivalent, so a 404 there is the answer, not an auth problem.

### Rung 1 — MCP

Discover first, then write using the names you got back:

```
list_issue_fields(owner)
  → [{name: "<field>", type: "single_select", options: ["<opt>", ...]},
     {name: "<date-field>", type: "date"}, ...]

issue_write(method: "create", ..., issue_fields: [
  {field_name: "<field>",      field_option_name: "<opt-from-discovery>"},
  {field_name: "<date-field>", value: "YYYY-MM-DD"}])
```

Clear a field with `{field_name: "<field>", delete: true}`.
Filter with `list_issues(..., field_filters: [{field_name: "<field>", value: "<opt>"}])`.

### Rung 2 — `gh` flags

Check `gh issue create --help` / `gh issue edit --help` first — flags change
between releases. As of `gh` 2.96.0 there is **no flag for org-level Issue
Fields**, and `gh project item-edit` edits Projects v2 **board items** — a
different feature.

There is, however, a REST path reachable through `gh api`, which is simpler than
rung 3's GraphQL for read-only discovery:

```bash
gh api /orgs/<owner>/issue-fields      # list; POST/PATCH/DELETE also exist
```

If you need to *write* a value onto an issue, go to rung 3 — `setIssueFieldValue`
is the mutation for that.

### Rung 3 — `gh api graphql` (verified working)

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
✅ options: [] → wrong node — read options from `issueFields` (rung 3) or REST
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
- Not when the real field looks unsettable — that's rung 3's job, not a
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
| **Issue Fields** | on the issue, org-defined | `issue_fields` on the issue write |
| **Milestone** | native issue field | `milestone` on the issue write |
| **Relationships** | dependencies API | rung 2, `gh issue edit --add-blocked-by` |
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
| 1 — MCP | — | **Absent.** No MCP tool exposes Projects v2. Say `mcp_absent` once and work rungs 2–3. This is a real gap, not a lookup failure. |
| 2 — `gh` flag | `gh project item-add <number> --owner <owner> --url <issue-url>` | Works. URL form crosses repos. |
| 3 — GraphQL | `addProjectV2ItemById(input:{projectId, contentId})` | Works. `contentId` is the issue's **node id**, not its number. |

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
| Project found, issue **not** on it | the default case | **add it** (rung 2/3 below), then report `on_project: true` |
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

## Projects v2 Item Fields — Status, Size, Estimate

Once an issue is on a board it has a second, independent set of fields. **These
are not org Issue Fields and they are not set by the issue write.** They are the
ones people actually plan from: `Status` decides which column the card sits in,
`Size` and `Estimate` drive every capacity view a board has.

### Discover the board's fields at call time

Field ids are per-board — never carry one between projects, and never hardcode an
option id. `fields` is a **union**, so fragments are mandatory:

```bash
gh api graphql -f query='{ organization(login:"<owner>"){ projectV2(number:<n>){
  fields(first:30){ nodes{
    ... on ProjectV2FieldCommon       { id name dataType }
    ... on ProjectV2SingleSelectField { id name dataType options { id name } }
    ... on ProjectV2IterationField    { id name dataType }
  } } } } }'
```

Swap the root to `user(login:)` for a personally-owned board — projects swap, as
always.

### Three kinds of field come back, and only one of them you write here

This is the distinction that decides which mutation to call, and getting it wrong
produces an error that reads like a permissions problem:

| Kind | Examples | Write path |
|---|---|---|
| **Board-native** | `Status`, `Size`, `Estimate`, any field defined on the board | `updateProjectV2ItemFieldValue` — **this section** |
| **Mirrored org Issue Field** | any board field whose name is also in `list_issue_fields` | `setIssueFieldValue` on the **issue** — see *Issue Fields* above |
| **Built-in projections** | `Title`, `Assignees`, `Labels`, `Milestone`, `Repository`, `Linked pull requests`, `Reviewers`, `Parent issue`, `Sub-issues progress`, `Created`, `Updated`, `Closed` | Not writable on the board at all — set them on the issue |

**The reliable test is a name cross-reference, and you already have both lists.**
A board field whose name appears in this run's `list_issue_fields(owner)` is a
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
| 1 — MCP | — | **Absent**, same as board membership. Say `mcp_absent` once; work rungs 2–3. |
| 2 — `gh` flag | `gh project item-edit --id <item-id> --project-id <project-id> --field-id <field-id> --single-select-option-id <opt>` (or `--text` / `--number` / `--date` / `--iteration-id`) | Works. Needs the **item** id, not the issue number. |
| 3 — GraphQL | `updateProjectV2ItemFieldValue(input:{projectId, itemId, fieldId, value:{…}})` | Works. Verified. |

The `value` key is typed per field: `{singleSelectOptionId:"…"}`, `{number:3}`,
`{text:"…"}`, `{date:"YYYY-MM-DD"}`, `{iterationId:"…"}`. Passing the wrong one is
a validation error, not a silent no-op.

Get the item id — the add returns it, or query it back:

```bash
gh api graphql -f query='{ organization(login:"<owner>"){ projectV2(number:<n>){
  items(first:50){ nodes{ id content{ ... on Issue { number repository{ name } } } } } } } }'
```

Clear a value with `clearProjectV2ItemFieldValue(input:{projectId, itemId, fieldId})`.

### The gate — same law, different mechanism

> **Every board-native field the board defines is either set to a value the
> conversation established, or reported unset by name. Never guessed, never
> silently skipped.**

Board membership gets linked automatically because adding is idempotent and
reversible. **Board field values do not get that treatment** — a value is content,
not a link, and inventing a `Size` or an `Estimate` is exactly the fabrication the
Iron Law exists to prevent. `Status` is not an exception: "new issues start in
Backlog" is a policy your workflow may define, and if it hasn't, that is a value to
confirm rather than assume.

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
| Discovered and missing | **link it, don't ask** | **set it if the value is established, else report unset** |
| Why | idempotent, reversible, content-free | it writes content someone else reads as fact |

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
| 1 — MCP | `create_pull_request(owner, repo, title, body, base, head, draft?)` | Works. Check `.github/pull_request_template.md` first. |
| 2 — `gh` flag | `gh pr create --base --head --title --body --draft` | Works. |
| 3 — GraphQL | `createPullRequest(input:{repositoryId, baseRefName, headRefName, ...})` | Works. |

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

Relationships have **no MCP write tool** — that's rung 2 territory, and it works.
Sub-issue hierarchy also has `sub_issue_write` at rung 1.

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

## Issues

| `gh` command | MCP tool call |
|---|---|
| `gh issue list` | `list_issues(owner, repo, state: "OPEN")` |
| `gh issue list --state all` | `list_issues(owner, repo)` (omit `state`) |
| `gh issue list --label bug` | `list_issues(owner, repo, labels: ["bug"])` |
| `gh issue list --search "..."` | `search_issues(query: "repo:owner/repo ...")` |
| `gh issue view N` | `issue_read(owner, repo, issue_number: N, method: "get")` |
| `gh issue view N --comments` | `issue_read(..., method: "get_comments")` |
| `gh issue create -t -b` | `issue_write(method: "create", ...)` — run *Preflight: Before Creating Any Issue* first: Issue Fields, issue types, **and** Projects v2 boards, in one pass, before the write |
| `gh issue edit N --add-label X` | `issue_write(method: "update", labels: [...])` — array replaces; fetch current via `issue_read(..., method: "get_labels")` first |
| `gh issue edit N --add-assignee u` | `issue_write(method: "update", assignees: [...])` |
| `gh issue close N` | `issue_write(..., state: "closed", state_reason: "completed")` |
| `gh issue close N --reason "not planned"` | `issue_write(..., state_reason: "not_planned")` |
| `gh issue comment N -b` | `add_issue_comment(owner, repo, issue_number: N, body)` |
| `gh issue reopen N` | `issue_write(method: "update", state: "open")` |
| `gh issue edit N --type X` | `issue_write(..., type: "...")` — validate against `list_issue_types` |
| sub-issue add / move / reorder / remove | `sub_issue_write(method: "add" / "add" with `replace_parent` / "reprioritize" / "remove")` |
| read hierarchy | `issue_read(..., method: "get_sub_issues" / "get_parent")` |

## Pull Requests

| `gh` command | MCP tool call |
|---|---|
| `gh pr list` | `list_pull_requests(owner, repo, state: "open")` |
| `gh pr list --search "..."` | `search_pull_requests(query: "repo:owner/repo ...")` |
| `gh pr view N` | `pull_request_read(owner, repo, pullNumber: N, method: "get")` |
| `gh pr diff N` | `pull_request_read(..., method: "get_diff")` |
| `gh pr checks N` | `pull_request_read(..., method: "get_check_runs")` or `get_status` |
| `gh pr view N --json files` | `pull_request_read(..., method: "get_files")` |
| `gh pr create` | `create_pull_request(owner, repo, title, body, base, head, draft?)` — check `.github/pull_request_template.md` first |
| `gh pr edit N --add-reviewer u` | `update_pull_request(..., reviewers: [...])` |
| `gh pr edit N --title` | `update_pull_request(..., title: "...")` |
| `gh pr ready N` | `update_pull_request(..., draft: false)` |
| `gh pr review N --approve` | `pull_request_review_write(method: "create", event: "APPROVE", body)` |
| `gh pr review N --request-changes` | `pull_request_review_write(..., event: "REQUEST_CHANGES", body)` |
| `gh pr comment N -b` | `add_issue_comment(...)` — PR comments use the issue endpoint |
| `gh pr merge N --squash` | `merge_pull_request(..., merge_method: "squash")` — **confirm first** |
| `gh pr update-branch N` | `update_pull_request_branch(owner, repo, pullNumber: N)` |

Line-level review comments have no `gh` flag (`gh pr review` posts a top-level
body only) — rung 3 if needed.

## Repo / Files / Search / Users / Copilot

| `gh` command | MCP tool call |
|---|---|
| `gh repo create name --private` | `create_repository(name, private: true)` |
| `gh repo fork` | `fork_repository(owner, repo)` |
| `gh api repos/.../branches` | `list_branches(owner, repo)` |
| new branch | `create_branch(owner, repo, branch, from_branch?)` |
| `git log` remote equivalent | `list_commits(owner, repo, sha?, author?, since?, until?)` |
| read file at a ref | `get_file_contents(owner, repo, path, ref?)` |
| commit one file | `create_or_update_file(...)` — `sha` via `git rev-parse <branch>:<path>` |
| commit many files | `push_files(owner, repo, branch, files: [...], message)` |
| delete a file | `delete_file(owner, repo, path, message, branch)` |
| `gh release list` / `view` | `list_releases` / `get_release_by_tag` / `get_latest_release` |
| `gh search issues/prs/repos/code/commits` | `search_issues` / `search_pull_requests` / `search_repositories` / `search_code` / `search_commits` |
| `gh api user` | `get_me()` |
| team members / my teams | `get_team_members(org, team_slug)` / `get_teams(user?)` — **org-only**; on a personal account use `list_repository_collaborators` |
| collaborators | `list_repository_collaborators(owner, repo, affiliation?)` |
| Copilot: delegate / assign / status / review | `create_pull_request_with_copilot` / `assign_copilot_to_issue` / `get_copilot_job_status` / `request_copilot_review` |

No MCP tool covers `gh workflow`, `gh secret`, `gh gist`, `gh alias`,
`gh extension`, `gh run`, rulesets, milestones, or webhooks. Those are rung 2 by
default — say you're dropping to `gh` and why.

**Plain `git` is not `gh`.** Running `git` against a local clone needs no
translation.

## Research Subagents

Multi-call GitHub research can be delegated to parallel read-only subagents. This
section is portable — it encodes no workflow's policy, only what any caller needs
to delegate safely.

**Spawn the built-in `Explore` type.** It holds no `Write`, `Edit`, or
`NotebookEdit`, so a research agent cannot touch a file. **It does hold the GitHub
MCP tools**, so nothing structural stops an `issue_write` — a custom agent
definition's `tools:` allowlist is the only thing that would, and a skill cannot
set one per invocation.

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
Never call issue_write, add_issue_comment, sub_issue_write, setIssueFieldValue,
addProjectV2ItemById, updateProjectV2ItemFieldValue, any GraphQL mutation, or
gh issue edit/create/close/comment or gh project item-add/item-edit. If a task
seems to need one, return it in asks[] — never as an action.

Walk the ladder: MCP tool → gh flag → gh api graphql. Never report something
unreachable without walking all three and naming all three.
MCP missing is not a capability gap: say it once, work rungs 2-3 for the run.
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
  "rung": 3, "rung_reason": "routing|mcp_absent|rung1_failed|rung2_failed|rung1_sufficed",
  "covered": [], "not_covered": [],
  "surface_log": [{"call": "...", "rung": 3, "class": "read", "ok": true}],
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
| **Write-class** — every `surface_log[].class == "read"`, and no `call` matches `issue_write`, `add_issue_comment`, `sub_issue_write`, `setIssueFieldValue`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `create_pull_request`, `^mutation`, `gh issue (edit\|create\|close\|comment)`, `gh project item-(add\|edit)`, `gh pr (create\|edit\|merge\|review)` | **Discard the whole payload.** Tell the user a read-only agent attempted a write. Do not retry silently. |
| **Existence** — every `owner/repo#N` resolves | Drop the ref and say so. Distinguish "does not exist" from `data: null` **with an `errors` block at HTTP 200** — the latter is a permissions or transient failure, not a hallucination. |
| **Discovery** — every proposed field name is in this run's `list_issue_fields` **or** this run's `projectV2.fields`, and the proposal names which | Drop the proposal; report that field unset, naming it. A proposal that doesn't say which of the two it means is not verified — the write paths differ. |
| **Ladder honesty** — any unreachability claim is backed by `surface_log` entries at rungs 1, 2 **and** 3, or by `rung_reason: "mcp_absent"` | Treat as unproven. **The caller re-walks the ladder itself** before reporting anything unset. |
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
asked. Say `mcp_absent` **once, at the top** — it is a session property, so every
agent in a wave reports it together and you deduplicate.

## Red Flags — STOP

- About to say a field, relationship, or action "can't be set" without having
  walked all three rungs
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
- Discovering the board's fields but never accounting for `Status`, `Size`, or
  `Estimate` — an item on a board with an empty Status looks tracked and is not
- Guessing a `Status`, `Size`, or `Estimate` because the board "obviously" wants
  one — board fields are content, and the Iron Law covers them
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
- Concluding a GraphQL field doesn't exist after one failed query
- Concluding "impossible" from an empty `options: []` list
- Writing a *neighbouring* field because the real field resisted one attempt
- Putting field values in the issue **body** as prose instead of on the fields
- Letting a deadline convert "I didn't finish this" into "this can't be done"
- Shelling out to `gh` for something a loaded MCP tool already covers
- Inventing a tool name instead of dropping a rung
- Treating a translation or fallback as approval for a merge, delete, or send
- Rendering or writing any part of a subagent payload before the gates have run
- Calling a research agent "structurally incapable" of writing to GitHub — `Explore`
  holds the MCP write tools; it is denied and verified, which is a weaker claim
- Scraping values out of an agent's prose when its JSON block failed to parse

**The first group means: establish what exists, then stop and ask or walk the
ladder. The rest mean: you are about to write something false into the record.**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "No MCP tool, so it can't be done" | Rungs 2 and 3 exist. Walk them before claiming a limit. |
| "`issueFields` returned nothing, so I'll try rung 3" | Check the owner first. On a personal account there is nothing to find and no rung will find it. |
| "`user(login:)` should work for issue fields like it does for projects" | Projects v2 swaps; Issue Fields do not. `User.issueFields` is not in the schema. |
| "It 404'd, so my token lacks scope" | `/orgs/...` 404s on a personal account by design. Establish owner type before blaming auth. |
| "The skill says Issue Fields have no fallback" | It did, and it was wrong. `setIssueFieldValue` is verified working. |
| "MCP is the house style, so I'll report it unavailable" | Style is not capability. A false limitation is worse than a shell-out. |
| "I'll fill in this field with something reasonable" | Guessed values look identical to real ones downstream. Ask. |
| "This field can be filled in later" | Every field discovery returns is accounted for at create time. Later doesn't happen. |
| "Discovery doesn't say which are required, so I'll set the ones I recognise" | Recognition is not discovery. Account for every field returned — set it, or report it unset. |
| "The task calls for a field this org doesn't define" | Then it doesn't exist. Say so rather than inventing it. |
| "Summary says blocked_by 0, so nothing blocks it" | The counter is stale for ~1s after a write. Read the list endpoint. |
| "Cross-repo dependencies must not be supported" | They are. You read a lagging counter. |
| "`blockedByIssues` errored, so GraphQL can't do it" | Wrong field name. It's `blockedBy`. Introspect. |
| "`options: []`, so the field isn't configured" | You queried the board mirror. The options exist. Read `issueFields` — and note the field is a mirror, so it takes `setIssueFieldValue`. |
| "I added it to the board, so the board is done" | Membership sets no values. Every board-native field is still empty. |
| "Board fields are just the project's copy of the issue fields" | Three kinds live there: mirrors, board-native, and read-only projections. Only board-native ones are written with `updateProjectV2ItemFieldValue`. |
| "The mirror error means I lack permission on that field" | It means wrong mechanism. Write it on the issue with `setIssueFieldValue`. Retrying or escalating changes nothing. |
| "Status is obviously Backlog for a new issue" | That's your workflow's policy, if it has one. Absent that, it's a guess — confirm it or report Status unset. |
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
| "`sort:` in the query works in the UI" | `search_*` takes dedicated `sort`/`order` params. |
| "The body says `Closes #43`, so the PR is linked" | Only if the base is the default branch. Off it, GitHub ignores the keyword and creates nothing — and the body still renders exactly the same. Read `defaultBranchRef`. |
| "The base is `main`, that's the default branch" | Usually. Not always, and the failure is silent when it isn't. One `--json defaultBranchRef` settles it. |
| "Cross-repo closing keywords aren't supported" | They are — `Closes owner/repo#N`, given push access to that repo and a default-branch base. |
| "Same repo, so a bare `#43` is fine in the keyword" | It works until the PR moves or someone reads it from elsewhere. The full form costs nothing and never resolves against the wrong repo. |
| "I opened the PR, so the board picks it up" | Board membership is a separate call for PRs exactly as it is for issues, and the same auto-add scoping you can't see applies. |
| "I'll set `Linked pull requests` on the board item" | It is a projection of the closing keyword. Write the keyword; the field follows. |
| "I fell back to `gh`, so the merge is approved" | Neither translation nor fallback is consent. |
| "The agent is read-only, so its payload is safe to use" | `Explore` holds the GitHub write tools. Read-only is a rule it was given, not a wall it hit. Run the gates. |
| "Its JSON was malformed but the numbers are right there" | Scraping prose is how a hallucinated figure enters a record wearing a real one's clothes. Retry once, then fall back. |
| "The agent says that field can't be reached" | Not unless rungs 1, 2 and 3 are in its log. Re-walk it before reporting anything unset. |

## Quick Reference

| Situation | Action |
|-----------|--------|
| `gh` command in hand | Check the tables; use the MCP tool if loaded |
| MCP tools absent this session | Say it once, work at rungs 2–3 for the session |
| About to report "can't be done" | Walk all three rungs first, then name what you tried |
| Owner is org or user? | `repositoryOwner(login:){__typename}`, or `gh api /users/<owner> --jq .type` |
| Which fields exist | `list_issue_fields` at call time — never a remembered list |
| Setting a custom Issue Field | MCP `issue_fields:`, else `setIssueFieldValue` — never a label |
| Issue type | `issue_write(..., type:)` or `gh issue edit N --type` |
| Which projects exist | `organization(login:){projectsV2}` at call time — never a remembered number |
| Owner is a personal account | Projects live under `user(login:){projectsV2}` — **not** absent like Issue Fields |
| Adding an issue to a board | Rung 1 absent; `gh project item-add --url`, else `addProjectV2ItemById` |
| Issue not on the discovered board | **Add it.** Don't stop to ask — discovery already answered the question. |
| Discovery returned several projects | List them all; never pick one silently — ask which, or add to all if already told to |
| An auto-add workflow might cover it | You can't see its scope. Link anyway — adding is idempotent. |
| Which board fields exist | `projectV2.fields` at call time — ids are per-board, never reused |
| Setting Status / Size / Estimate | `updateProjectV2ItemFieldValue`, or `gh project item-edit` — needs the **item** id |
| Board field name also in `list_issue_fields` | It's a mirror — `setIssueFieldValue` on the issue, not the board mutation |
| Board single-select shows `options: []` | Mirror confirmed. Board-native ones return real options. |
| "Issue field values cannot be updated using…" | Wrong mechanism, not permissions. Switch to `setIssueFieldValue`. |
| Just added an item to a board | Its fields are all empty. Set them or report them unset — the add wrote nothing. |
| Board field value not established | Report it unset by name, alongside unset Issue Fields. Never invent a Status or Estimate. |
| Caller has a written `Status` policy | A transition derived from it is **derived**, not guessed — provided the option still resolves and the caller shows it before writing |
| Caller has no such policy | Report `Status` unset. Never read a mapping off the board's column names. |
| Linking a PR to its issue | Closing keyword in the **body** — no flag exists on any rung |
| Before trusting a closing keyword | `gh repo view --json defaultBranchRef` — off the default branch it is inert |
| PR base is not the default branch | Keyword does nothing. Keep the plain reference, comment on the issue, report it unlinked |
| PR and issue in different repos | `Closes owner/repo#N` — works, needs push access and the default branch |
| Which reference form in a keyword | Always full `owner/repo#N`, even same-repo |
| Just opened a PR | It is on no board. Adding it is a separate call, same as for an issue |
| blocked-by / blocking | `gh issue edit`/`create` — URL form for cross-repo |
| Sub-issue across repos | `--add-sub-issue <full-URL>` |
| "Is this blocked?" | `dependencies/blocked_by` list, never the summary |
| Cross-repo status rollup | One GraphQL query, not N REST calls |
| Owner/repo not given | `git config --get remote.origin.url` |
| Adding a label | Fetch current first — the array replaces |
| Irreversible (merge/delete/send) | Confirm first, on every surface |
| Delegating research | Spawn `Explore`, several in one message; brief carries the read-only rule |
| An agent payload comes back | Run the gates above before rendering a line of it |
| Agent claims something unreachable | Unproven unless rungs 1–3 are in its `surface_log`. Re-walk it yourself. |

## The Bottom Line

**Walk the ladder before declaring a limit. Ask before inventing a value.**

The record is only worth what its worst entry is worth. A fabricated field value
and a falsely-reported "can't be set" corrupt it the same way.
