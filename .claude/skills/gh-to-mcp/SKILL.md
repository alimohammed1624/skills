---
name: gh-to-mcp
description: Use when about to run any `gh` CLI command (`gh issue`, `gh pr`, `gh repo`, `gh api`), when the user pastes one, when setting Priority/Effort/dates or issue types on an issue, or when writing scripts that assume the `gh` CLI is available
---

# gh CLI → plugin:github:github MCP

## Overview

This repo's agent workflows use the `plugin:github:github` MCP server exclusively — never the `gh` CLI binary. Translate the command instead of shelling out, so org-level enforcement (Issue Fields, issue types) stays intact.

**Core principle:** Don't shell out. Translate. If there's no equivalent tool, say so rather than improvising.

**Owner/repo:** infer from `git config --get remote.origin.url` whenever the `gh` command doesn't pass `-R owner/repo`.

**Identity:** call `get_me` first when a command needs the current user (e.g. `gh issue list --assignee @me`).

## When to Use

- About to run `gh issue ...`, `gh pr ...`, `gh repo ...`, `gh release ...`, or any other `gh` subcommand
- The user pastes a `gh` command and asks you to run it
- Writing a script or instructions that assume the `gh` CLI is available

The start-workday, end-workday, and project-status skills all route their GitHub access through here.

## Issues

| `gh` command | MCP tool call |
|---|---|
| `gh issue list` | `list_issues(owner, repo, state: "OPEN")` |
| `gh issue list --state all` | `list_issues(owner, repo)` (omit `state`) |
| `gh issue list --label bug` | `list_issues(owner, repo, labels: ["bug"])` |
| `gh issue list --search "..."` | `search_issues(query: "repo:owner/repo ...")` |
| `gh issue view N` | `issue_read(owner, repo, issue_number: N, method: "get")` |
| `gh issue view N --comments` | `issue_read(..., method: "get_comments")` |
| `gh issue create -t "..." -b "..."` | `issue_write(method: "create", owner, repo, title, body, ...)` — **see [Issue Fields](#issue-fields--this-repos-projects-equivalent); this repo requires four fields on every create** |
| `gh issue edit N --add-label X` | `issue_write(method: "update", issue_number: N, labels: [...])` — the array replaces; fetch current labels via `issue_read(..., method: "get_labels")` first when adding |
| `gh issue edit N --add-assignee user` | `issue_write(method: "update", issue_number: N, assignees: [...])` |
| `gh issue close N` | `issue_write(method: "update", issue_number: N, state: "closed", state_reason: "completed")` |
| `gh issue close N --reason "not planned"` | `issue_write(..., state: "closed", state_reason: "not_planned")` |
| `gh issue comment N -b "..."` | `add_issue_comment(owner, repo, issue_number: N, body: "...")` |
| `gh issue reopen N` | `issue_write(method: "update", issue_number: N, state: "open")` |

## Pull Requests

| `gh` command | MCP tool call |
|---|---|
| `gh pr list` | `list_pull_requests(owner, repo, state: "open")` |
| `gh pr list --search "..."` | `search_pull_requests(query: "repo:owner/repo ...")` |
| `gh pr view N` | `pull_request_read(owner, repo, pullNumber: N, method: "get")` |
| `gh pr diff N` | `pull_request_read(..., method: "get_diff")` |
| `gh pr checks N` | `pull_request_read(..., method: "get_check_runs")` or `get_status` |
| `gh pr view N --json files` | `pull_request_read(..., method: "get_files")` |
| `gh pr create -t "..." -b "..." --base main --head branch` | `create_pull_request(owner, repo, title, body, base, head, draft?)` — check for a PR template first (`.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/`) via `get_file_contents` |
| `gh pr edit N --add-reviewer user` | `update_pull_request(owner, repo, pullNumber: N, reviewers: [...])` |
| `gh pr edit N --title "..."` | `update_pull_request(..., title: "...")` |
| `gh pr ready N` | `update_pull_request(..., draft: false)` |
| `gh pr review N --approve -b "..."` | `pull_request_review_write(method: "create", event: "APPROVE", body)` |
| `gh pr review N --request-changes -b "..."` | `pull_request_review_write(method: "create", event: "REQUEST_CHANGES", body)` |
| `gh pr comment N -b "..."` | `add_issue_comment(owner, repo, issue_number: N, body: "...")` — PR comments use the issue-comment endpoint |
| `gh pr merge N --squash` | `merge_pull_request(owner, repo, pullNumber: N, merge_method: "squash")` |
| `gh pr update-branch N` | `update_pull_request_branch(owner, repo, pullNumber: N)` |

## Repo / Branches / Commits / Files

| `gh` command | MCP tool call |
|---|---|
| `gh repo view owner/repo` | `get_file_contents(owner, repo, path: "/")` for tree, or `search_repositories` for metadata |
| `gh repo create name --private` | `create_repository(name, private: true)` |
| `gh repo fork` | `fork_repository(owner, repo)` |
| `gh api repos/.../branches` | `list_branches(owner, repo)` |
| `gh api .../git/refs` for a new branch | `create_branch(owner, repo, branch, from_branch?)` |
| `git log` remote equivalent | `list_commits(owner, repo, sha?, author?, since?, until?)` |
| `gh api .../commits/SHA` | `get_commit(owner, repo, sha)` |
| reading a file at a ref | `get_file_contents(owner, repo, path, ref?)` |
| committing one file remotely | `create_or_update_file(owner, repo, path, content, message, branch, sha?)` — get current `sha` via `git rev-parse <branch>:<path>` when updating |
| committing multiple files remotely | `push_files(owner, repo, branch, files: [{path, content}, ...], message)` |
| deleting a file remotely | `delete_file(owner, repo, path, message, branch)` |
| `gh release list` | `list_releases(owner, repo)` |
| `gh release view` / `--tag` | `get_release_by_tag(owner, repo, tag)` or `get_latest_release(owner, repo)` |
| `git tag` remote lookup | `get_tag(owner, repo, tag)` |

## Search

| `gh` command | MCP tool call |
|---|---|
| `gh search issues "..."` | `search_issues(query: "...")` |
| `gh search prs "..."` | `search_pull_requests(query: "...")` |
| `gh search repos "..."` | `search_repositories(query: "...")` |
| `gh search code "..."` | `search_code(query: "...")` |
| `gh search commits "..."` | `search_commits(query: "...")` |

## Users / Teams / Collaborators

| `gh` command | MCP tool call |
|---|---|
| `gh api user` | `get_me()` |
| `gh api /orgs/{org}/teams/{slug}/members` | `get_team_members(org, team_slug)` |
| (no direct `gh` equivalent) my teams | `get_teams(user?)` |
| `gh api repos/.../collaborators` | `list_repository_collaborators(owner, repo, affiliation?)` |
| `gh api search/users` | `search_users(query)` |

## Copilot

| `gh` command | MCP tool call |
|---|---|
| `gh copilot ...` delegate a task | `create_pull_request_with_copilot(owner, repo, title, problem_statement, base_ref?)` |
| assign Copilot to an existing issue | `assign_copilot_to_issue(owner, repo, issue_number)` |
| check Copilot job status | `get_copilot_job_status(owner, repo, id)` |
| request a Copilot PR review | `request_copilot_review(owner, repo, pullNumber)` |

## Issue Fields — this repo's "Projects" equivalent

`plugin:github:github` exposes no `gh project` (Projects v2 board) tool in this environment. What this org uses instead is **org-level Issue Fields** (Settings > Planning > Issue fields: Priority, Effort, Start date, Target date). Read "add this to the project" or "set the project fields" as a request to set these fields, not as a board operation.

| Intent (often phrased like a `gh project` action) | MCP tool call |
|---|---|
| List available custom fields and their valid options | `list_issue_fields(owner, repo?)` — omit `repo` for org-level fields |
| List issue types (epic/task/bug, if enabled) | `list_issue_types(owner, repo?)` |
| Set Priority/Effort/dates on create | `issue_write(method: "create", ..., issue_fields: [{field_name: "Priority", field_option_name: "High"}, {field_name: "Effort", field_option_name: "Medium"}, {field_name: "Start date", value: "YYYY-MM-DD"}, {field_name: "Target date", value: "YYYY-MM-DD"}])` |
| Update a single field later | `issue_write(method: "update", issue_number, issue_fields: [{field_name: "...", field_option_name/value: "..."}])` |
| Clear a field | `issue_write(..., issue_fields: [{field_name: "...", delete: true}])` |
| Filter issues by a custom field ("show High priority issues") | `list_issues(owner, repo, field_filters: [{field_name: "Priority", value: "High"}])` |
| Set issue type | `issue_write(..., type: "...")` — validate against `list_issue_types` first |
| Add a sub-issue / break work into children | `sub_issue_write(method: "add", owner, repo, issue_number, sub_issue_id)` |
| Move a sub-issue to a different parent | `sub_issue_write(method: "add", ..., replace_parent: true)` |
| Reorder sub-issues | `sub_issue_write(method: "reprioritize", ..., after_id/before_id)` |
| Remove a sub-issue link | `sub_issue_write(method: "remove", ...)` |
| Read an issue's hierarchy | `issue_read(..., method: "get_sub_issues")` / `method: "get_parent"` |

**Every `issue_write` with `method: "create"` must include all four Issue Fields** — Priority, Effort, Start date, Target date — with validated option names and dates. Self-check before calling. Ask the user rather than guessing when a value isn't obvious from the conversation.

## Red Flags — STOP

- About to run `gh` in a Bash call in this repo
- Creating an issue without all four Issue Fields
- Guessing a Priority or Effort value the conversation never established
- Putting `sort:` inside a `search_*` query string
- Inventing a tool name because no row in these tables matched
- Translating a merge, delete, or send and treating the translation as approval

## Quick Reference

| Situation | Action |
|-----------|--------|
| `gh` command in hand | Look it up in the tables above; never shell out |
| Owner/repo not given | Infer from `git config --get remote.origin.url` |
| Command needs "me" | `get_me()` first |
| `--limit` / `-L` flags | Map to `perPage`/`page`; keep batches to 5–10 items |
| Full objects not needed | Pass `minimal_output: true` |
| Sorting a search | Use the `sort`/`order` params, not the query string |
| Adding a label to existing ones | Fetch current labels first — the array replaces |
| No equivalent tool exists | Say so explicitly, ask how to proceed |
| Translation is irreversible (merge/delete/send) | Confirm-before-acting still applies |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "`gh` is installed and it's one command" | Shelling out bypasses org-level Issue Fields and issue-type enforcement. That's the whole reason this skill exists. |
| "The user pasted the `gh` command, so they want it run" | They want the outcome. Translate it. |
| "I'll fill in Priority/Effort with something reasonable" | Guessed field values look identical to real ones downstream. Ask. |
| "This one field can be filled in later" | All four are required at create time. Later doesn't happen. |
| "No table row matches, but this tool name looks right" | Improvised calls fail or do the wrong thing. `gh workflow`, `gh secret`, `gh gist`, `gh alias`, `gh extension` have no equivalent here — say so. |
| "`sort:` in the query works in the GitHub UI" | The `search_*` tools take dedicated `sort`/`order` params. Query strings hold criteria only. |
| "I translated the merge command, so it's approved" | Translation isn't consent. Confirm irreversible actions first. |
