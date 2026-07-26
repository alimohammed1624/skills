---
name: gh-wrapper
description: Use when about to run any `gh` CLI command (`gh issue`, `gh pr`, `gh repo`, `gh api`), when the user pastes one, when setting a custom Issue Field (org-defined single-select, date, number, or text) or an issue type on an issue, when creating an issue that may belong on a Projects v2 board, when linking issues across repositories, or when about to report that a GitHub field, board membership, or relationship cannot be set
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
EVERY ISSUE FIELD IS SET WITH A VERIFIED VALUE
OR EXPLICITLY REPORTED UNSET.

NEVER GUESSED. NEVER APPROXIMATED. NEVER SILENTLY SKIPPED.
```

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
space from Projects v2 field IDs (`PVTSSF_`). Using a board field ID with
`updateProjectV2ItemFieldValue` on a mirrored field fails with
*"Issue field values cannot be updated using the updateProjectV2ItemFieldValue
mutation."* That error is a **signpost to rung 3, not a dead end.**

**`options: []` is a lie, not a diagnosis.** Querying a *board's* mirrored
single-select over GraphQL returns an empty options list even when the field has
working options. It means you queried the wrong node, nothing more.

```
❌ options: [] → "the field has no options configured" → "impossible to set"
❌ options: [] → ask a human to "add the missing options"
✅ options: [] → wrong node — read options from `issueFields` (rung 3) or REST
```

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

## Projects v2 — Board Membership Is a Fourth Mechanism

Four separate mechanisms sit on the same issue and are read and written
differently. Conflating any two is wrong even when the result looks right:

| Mechanism | Where it lives | Write path |
|---|---|---|
| **Issue Fields** | on the issue, org-defined | `issue_fields` on the issue write |
| **Milestone** | native issue field | `milestone` on the issue write |
| **Relationships** | dependencies API | rung 2, `gh issue edit --add-blocked-by` |
| **Projects v2 membership** | the board, not the issue | the ladder below |

**Board membership is the one that fails silently.** The others are visible on the
issue the moment you look at it; an issue that is on no board looks completely
normal, and only the people planning off that board ever notice.

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

### The gate — report, never silently skip

Same rule as a discovered Issue Field left unset:

> **A discovered project that the issue is not on is REPORTED TO THE CALLER,
> never silently skipped.**

Return all three of these distinctly, and never let them collapse into one silence:

| State | What it means | Report as |
|---|---|---|
| No project found | the owner has no board | `project: none` — nothing to link |
| Project found, issue on it | already linked | `on_project: true` |
| Project found, issue **not** on it | the failure case | `on_project: false` — **the caller must be told** |
| Several projects found | ambiguous | list them all; **never pick one** |

**Discover and report. Do not link on your own initiative.** This skill has no
confirmation surface — it cannot show a source line or obtain a yes, and a board
write made without one is a written value the developer never accepted. The
calling skill owns the decision and the consent; this skill owns knowing, and
makes it impossible for the caller not to know.

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
| `gh issue create -t -b` | `issue_write(method: "create", ...)` — discover the org's fields with `list_issue_fields` and account for every one at create time |
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
any GraphQL mutation, or gh issue edit/create/close/comment. If a task seems to
need one, return it in asks[] — never as an action.

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
| **Write-class** — every `surface_log[].class == "read"`, and no `call` matches `issue_write`, `add_issue_comment`, `sub_issue_write`, `setIssueFieldValue`, `^mutation`, `gh issue (edit\|create\|close\|comment)`, `gh pr (create\|edit\|merge\|review)` | **Discard the whole payload.** Tell the user a read-only agent attempted a write. Do not retry silently. |
| **Existence** — every `owner/repo#N` resolves | Drop the ref and say so. Distinguish "does not exist" from `data: null` **with an `errors` block at HTTP 200** — the latter is a permissions or transient failure, not a hallucination. |
| **Discovery** — every proposed field name is in this run's `list_issue_fields` | Drop the proposal; report that field unset, naming it. |
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
- Concluding a personal account has no projects from an empty `organization(...)`
  query — projects are **not** org-only; switch to `user(login:)` and ask again
- Linking a board on your own initiative — this skill has no confirmation surface,
  so the caller owns the write and the yes
- Picking one project when discovery returned several
- Skipping a link because an auto-add workflow "probably" caught it — its scope is
  not visible from here, and adding is idempotent anyway
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
| "`options: []`, so the field isn't configured" | You queried the board mirror. The options exist. Read `issueFields`. |
| "A human needs to add the missing options first" | Nothing is missing. You are about to send someone to 'fix' a correct field. |
| "This field is the closest thing to the one I need" | Closest ≠ correct. It records a different field. Report the real one unset instead. |
| "The mutation's input shape is undocumented" | Introspect `IssueFieldCreateOrUpdateInput`, or copy the working mutation above. |
| "No time left to finish the fields" | Then say the fields are unset. Never upgrade "unfinished" to "impossible." |
| "I'll put the values in the body for now" | Prose in a body is not a field. Nothing queries it. |
| "`sort:` in the query works in the UI" | `search_*` takes dedicated `sort`/`order` params. |
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
| Issue not on the discovered board | **Report it to the caller.** Never link it yourself, never stay silent. |
| Discovery returned several projects | List them all; never pick one |
| An auto-add workflow might cover it | You can't see its scope. Link anyway — adding is idempotent. |
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
