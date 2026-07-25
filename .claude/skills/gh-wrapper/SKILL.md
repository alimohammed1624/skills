---
name: gh-wrapper
description: Use when about to run any `gh` CLI command (`gh issue`, `gh pr`, `gh repo`, `gh api`), when the user pastes one, when setting Priority/Effort/Start date/Target date or issue types on an issue, when linking issues across repositories, or when about to report that a GitHub field or relationship cannot be set
---

# gh Wrapper: Route to the Right GitHub Surface

## Overview

Three surfaces reach GitHub here: the `plugin:github:github` MCP server, the `gh`
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

A guessed Priority is indistinguishable from a real one downstream. A field you
quietly skipped reads as "not applicable" to whoever reads the record next. Both
corrupt the tracking record. Ask, or report it unset — those are the only two
honest outcomes.

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

The plugin is enabled in `~/.claude/settings.json` and still **may not appear in
a given session.** Tool prefix is `mcp__plugin_github_github__`, not
`mcp__github__`.

If `ToolSearch` returns nothing for it, MCP is off the table for the whole
session. Do not retry per-command. Drop to rung 2 and say so once.

**Owner/repo:** infer from `git config --get remote.origin.url` when `-R` is absent.
**Identity:** `get_me()`, or `gh api user`, when a command needs "me".

## Issue Fields — the Four This Org Enforces

Org-level Issue Fields (Settings > Planning > Issue fields) live **on the issue
itself**, independent of any Projects v2 board. Read "add this to the project" or
"set the project fields" as a request to set these.

| Field | Type | Valid values |
|---|---|---|
| Priority | single-select | `Urgent` · `High` · `Medium` · `Low` |
| Effort | single-select | `High` · `Medium` · `Low` |
| Start date | date | `YYYY-MM-DD` |
| Target date | date | `YYYY-MM-DD` |

Issue types: `Task` · `Bug` · `Feature`. **No `Epic`.** A track's parent is a
`Feature` unless told otherwise — it's a track because `tracks.yml` points at it.

Re-run `list_issue_fields` / `list_issue_types` (or the GraphQL query below) at
call time. An admin can change these without touching this file.

### Rung 1 — MCP

```
issue_write(method: "create", ..., issue_fields: [
  {field_name: "Priority", field_option_name: "High"},
  {field_name: "Effort", field_option_name: "Medium"},
  {field_name: "Start date", value: "2026-07-26"},
  {field_name: "Target date", value: "2026-08-09"}])
```
Clear a field with `{field_name: "...", delete: true}`.
Filter with `list_issues(..., field_filters: [{field_name: "Priority", value: "High"}])`.

### Rung 2 — `gh` flags

**None exist.** `gh` 2.96.0 has no flag for org-level Issue Fields, and
`gh project item-edit` edits Projects v2 **board items** — a different feature.
This rung is genuinely empty. Go to rung 3.

### Rung 3 — `gh api graphql` (verified working)

Discover field and option IDs. `issueFields` is a **union** — fragments are
mandatory, bare selections error:

```graphql
query { organization(login: "OWNER") { issueFields(first: 10) { nodes {
  ... on IssueFieldSingleSelect { id name options { id name } }
  ... on IssueFieldDate { id name }
} } } }
```

Get the issue node ID, then set all four in one mutation:

```graphql
mutation { setIssueFieldValue(input: {
  issueId: "I_..."
  issueFields: [
    { fieldId: "IFSS_...", singleSelectOptionId: "IFSSO_..." },
    { fieldId: "IFD_...",  dateValue: "2026-07-26" }
  ]}) { issue { id } } }
```

Clear with `{ fieldId: "IFSS_...", delete: true }`. Verify after writing:
`gh api /repos/{o}/{r}/issues/{n} --jq '.issue_field_values'`.

**Node-ID trap:** org Issue Field IDs (`IFSS_`/`IFD_`/`IFSSO_`) are a different
space from Projects v2 field IDs (`PVTSSF_`). Using a board field ID with
`updateProjectV2ItemFieldValue` on a mirrored field fails with
*"Issue field values cannot be updated using the updateProjectV2ItemFieldValue
mutation."* That error is a **signpost to rung 3, not a dead end.**

**`options: []` is a lie, not a diagnosis.** Querying the *board's* mirrored
`Priority` over GraphQL returns an empty options list even though the field has
four working options. It means you queried the wrong node, nothing more.

```
❌ options: [] → "the field has no options configured" → "impossible to set"
❌ options: [] → ask a human to "add the missing options"
✅ options: [] → wrong node — read options from `issueFields` (rung 3) or REST
```

Never conclude a field is unsettable from an empty options list, and never send
a human to reconfigure a field that is already correct.

### Never Available

`Size` and `Estimate` are **not** org Issue Fields here. Say they don't exist.

The Projects v2 **board** does have fields named `Size` and `Estimate`. They are a
different feature and they are not the record.

**No exceptions:**
- `Size` is not a proxy, stand-in, or "closest equivalent" for `Effort`
- Not when `Effort` looks unsettable — that's rung 3's job, not Size's
- Writing `Size` to approximate `Effort` doesn't record Effort; it puts a
  fabricated value on a board someone else reads
- If `Effort` can't be set, report `Effort` unset. Do not substitute a
  neighbouring field that happens to accept a write.

## Cross-Repo Work

This org runs one project across five repos. Cross-repo is a normal case.

**Every relationship flag accepts an issue URL, and the URL form crosses repos:**

```bash
gh issue edit N --add-blocked-by https://github.com/OWNER/OTHER/issues/M
gh issue create --blocked-by <numbers-or-URLs> --blocking <numbers-or-URLs>
gh issue edit N --add-sub-issue https://github.com/OWNER/OTHER/issues/M
gh issue create --parent <number-or-URL> --type Task
```

Relationships have **no MCP write tool** — that's rung 2 territory, and it works.
Sub-issue hierarchy also has `sub_issue_write` at rung 1.

Adding an issue from any linked repo to the shared project:
`gh project item-add 1 --owner OWNER --url <issue-url>`.
`projectV2.repositories` lists *linked* repos, not repos *with items* — never
infer coverage from it.

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
organization(login: "OWNER") { projectV2(number: 1) { items(first: 30) { nodes {
  content { ... on Issue {
    number  repository { nameWithOwner }  state
    blockedBy(first: 5) { nodes { number repository { nameWithOwner } state } }
  } } } } } }
```

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
| `gh issue create -t -b` | `issue_write(method: "create", ...)` — **all four Issue Fields required** |
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
| team members / my teams | `get_team_members(org, team_slug)` / `get_teams(user?)` |
| collaborators | `list_repository_collaborators(owner, repo, affiliation?)` |
| Copilot: delegate / assign / status / review | `create_pull_request_with_copilot` / `assign_copilot_to_issue` / `get_copilot_job_status` / `request_copilot_review` |

No MCP tool covers `gh workflow`, `gh secret`, `gh gist`, `gh alias`,
`gh extension`, `gh run`, rulesets, milestones, or webhooks. Those are rung 2 by
default — say you're dropping to `gh` and why.

**Plain `git` is not `gh`.** Running `git` against product repos or the tracking
clone needs no translation.

## Red Flags — STOP

- About to say a field, relationship, or action "can't be set" without having
  walked all three rungs
- Filling in a Priority or Effort the conversation never established
- Creating an issue with fewer than all four Issue Fields
- Approximating a field with a label, a comment, or `gh project item-edit`
- Setting `Size` or `Estimate`
- Reading `issue_dependencies_summary` to decide whether something is blocked
- Concluding a GraphQL field doesn't exist after one failed query
- Concluding "impossible" from an empty `options: []` list
- Writing a *neighbouring* field (`Size`, a label, the issue body) because the
  real field resisted one attempt
- Putting field values in the issue **body** as prose instead of on the fields
- Letting a deadline convert "I didn't finish this" into "this can't be done"
- Shelling out to `gh` for something a loaded MCP tool already covers
- Inventing a tool name instead of dropping a rung
- Treating a translation or fallback as approval for a merge, delete, or send

**The first three mean: stop and ask, or walk the ladder. The rest mean: you are
about to write something false into the record.**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "No MCP tool, so it can't be done" | Rungs 2 and 3 exist. Walk them before claiming a limit. |
| "The skill says Issue Fields have no fallback" | It did, and it was wrong. `setIssueFieldValue` is verified working. |
| "MCP is the house style, so I'll report it unavailable" | Style is not capability. A false limitation is worse than a shell-out. |
| "I'll fill in Priority with something reasonable" | Guessed values look identical to real ones downstream. Ask. |
| "This one field can be filled in later" | All four at create time. Later doesn't happen. |
| "The design calls for Size and Estimate" | This org defines neither. Say so. |
| "Summary says blocked_by 0, so nothing blocks it" | The counter is stale for ~1s after a write. Read the list endpoint. |
| "Cross-repo dependencies must not be supported" | They are. You read a lagging counter. |
| "`blockedByIssues` errored, so GraphQL can't do it" | Wrong field name. It's `blockedBy`. Introspect. |
| "`options: []`, so the field isn't configured" | You queried the board mirror. The options exist. Read `issueFields`. |
| "A human needs to add the missing options first" | Nothing is missing. You are about to send someone to 'fix' a correct field. |
| "`Size` is the closest thing to `Effort`" | Closest ≠ correct. It records a different field. Report Effort unset instead. |
| "The mutation's input shape is undocumented" | Introspect `IssueFieldCreateOrUpdateInput`, or copy the working mutation above. |
| "No time left to finish the fields" | Then say the fields are unset. Never upgrade "unfinished" to "impossible." |
| "I'll put the values in the body for now" | Prose in a body is not a field. Nothing queries it. |
| "A track's parent should be an Epic" | Task, Bug, Feature only. `tracks.yml` makes it a track. |
| "`sort:` in the query works in the UI" | `search_*` takes dedicated `sort`/`order` params. |
| "I fell back to `gh`, so the merge is approved" | Neither translation nor fallback is consent. |

## Quick Reference

| Situation | Action |
|-----------|--------|
| `gh` command in hand | Check the tables; use the MCP tool if loaded |
| MCP tools absent this session | Say it once, work at rungs 2–3 for the session |
| About to report "can't be done" | Walk all three rungs first, then name what you tried |
| Priority/Effort/dates | MCP `issue_fields`, else `setIssueFieldValue` — never a label |
| Issue type | `issue_write(..., type:)` or `gh issue edit N --type` |
| blocked-by / blocking | `gh issue edit`/`create` — URL form for cross-repo |
| Sub-issue across repos | `--add-sub-issue <full-URL>` |
| "Is this blocked?" | `dependencies/blocked_by` list, never the summary |
| Cross-repo status rollup | One GraphQL query, not N REST calls |
| Owner/repo not given | `git config --get remote.origin.url` |
| Adding a label | Fetch current first — the array replaces |
| Irreversible (merge/delete/send) | Confirm first, on every surface |

## The Bottom Line

**Walk the ladder before declaring a limit. Ask before inventing a value.**

The record is only worth what its worst entry is worth. A fabricated Priority and
a falsely-reported "can't be set" corrupt it the same way.
