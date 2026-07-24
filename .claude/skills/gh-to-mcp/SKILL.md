---
name: gh-to-mcp
description: Use when you are about to run a `gh` CLI command (or the user pastes one) in this repository — translates it into the equivalent plugin:github:github MCP tool call, including issue fields ("Projects"-style Priority/Effort/dates), issue types, and sub-issue hierarchy
---

# gh CLI → plugin:github:github MCP

## Overview

This repository's agent workflows (see [AGENTS.md](../../../AGENTS.md) and the
[start-workday](../start-workday/SKILL.md) / [end-workday](../end-workday/SKILL.md) /
[project-status](../project-status/SKILL.md) skills) use the `plugin:github:github` MCP server
exclusively — not the `gh` CLI binary. If you or the user reach for a `gh` command, don't shell
out to it. Translate it to the matching MCP tool call instead, so org-level enforcement (Issue
Fields, issue types) stays consistent.

**Always infer `owner`/`repo` from `git config --get remote.origin.url`** when the `gh` command
doesn't specify `-R owner/repo` explicitly, matching the convention used by start-workday/end-workday.

**Call `mcp__plugin_github_github__get_me` first** if a command needs the current user's identity
(e.g. `gh issue list --assignee @me`), the same way the GitHub MCP server's own instructions
recommend.

## When to Use

- You're about to run `gh issue ...`, `gh pr ...`, `gh repo ...`, `gh release ...`, or any other
  `gh` subcommand in this repo
- The user pastes a `gh` command and asks you to run it
- You're writing a script or instructions that currently assume the `gh` CLI is available

## Core Translation Table

### Issues

| `gh` command | MCP tool call |
|---|---|
| `gh issue list` | `list_issues(owner, repo, state: "OPEN")` |
| `gh issue list --state all` | `list_issues(owner, repo)` (omit `state`) |
| `gh issue list --label bug` | `list_issues(owner, repo, labels: ["bug"])` |
| `gh issue list --search "..."` | `search_issues(query: "repo:owner/repo ...")` |
| `gh issue view N` | `issue_read(owner, repo, issue_number: N, method: "get")` |
| `gh issue view N --comments` | `issue_read(..., method: "get_comments")` |
| `gh issue create -t "..." -b "..."` | `issue_write(method: "create", owner, repo, title, body, ...)` — **see [Issue Fields](#issue-fields-this-repos-projects-equivalent) below, this repo requires four fields on every create** |
| `gh issue edit N --add-label X` | `issue_write(method: "update", issue_number: N, labels: [...])` (labels array replaces; fetch current labels first via `issue_read(..., method: "get_labels")` if adding to existing) |
| `gh issue edit N --add-assignee user` | `issue_write(method: "update", issue_number: N, assignees: [...])` |
| `gh issue close N` | `issue_write(method: "update", issue_number: N, state: "closed", state_reason: "completed")` |
| `gh issue close N --reason "not planned"` | `issue_write(..., state: "closed", state_reason: "not_planned")` |
| `gh issue comment N -b "..."` | `add_issue_comment(owner, repo, issue_number: N, body: "...")` |
| `gh issue reopen N` | `issue_write(method: "update", issue_number: N, state: "open")` |

### Pull Requests

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
| `gh pr comment N -b "..."` | `add_issue_comment(owner, repo, issue_number: N, body: "...")` (PR comments use the issue-comment endpoint) |
| `gh pr merge N --squash` | `merge_pull_request(owner, repo, pullNumber: N, merge_method: "squash")` |
| `gh pr update-branch N` | `update_pull_request_branch(owner, repo, pullNumber: N)` |

### Repo / Branches / Commits / Files

| `gh` command | MCP tool call |
|---|---|
| `gh repo view owner/repo` | `get_file_contents(owner, repo, path: "/")` for tree, or `search_repositories` for metadata |
| `gh repo create name --private` | `create_repository(name, private: true)` |
| `gh repo fork` | `fork_repository(owner, repo)` |
| `gh api repos/.../branches` / `git branch -r` equivalent | `list_branches(owner, repo)` |
| `gh api .../git/refs` for new branch | `create_branch(owner, repo, branch, from_branch?)` |
| `git log` remote equivalent | `list_commits(owner, repo, sha?, author?, since?, until?)` |
| `gh api .../commits/SHA` | `get_commit(owner, repo, sha)` |
| reading a file at a ref | `get_file_contents(owner, repo, path, ref?)` |
| committing one file remotely | `create_or_update_file(owner, repo, path, content, message, branch, sha?)` — get current `sha` via `git rev-parse <branch>:<path>` when updating |
| committing multiple files remotely | `push_files(owner, repo, branch, files: [{path, content}, ...], message)` |
| deleting a file remotely | `delete_file(owner, repo, path, message, branch)` |
| `gh release list` | `list_releases(owner, repo)` |
| `gh release view` / `--tag` | `get_release_by_tag(owner, repo, tag)` or `get_latest_release(owner, repo)` |
| `git tag` remote lookup | `get_tag(owner, repo, tag)` |

### Search

| `gh` command | MCP tool call |
|---|---|
| `gh search issues "..."` | `search_issues(query: "...")` |
| `gh search prs "..."` | `search_pull_requests(query: "...")` |
| `gh search repos "..."` | `search_repositories(query: "...")` |
| `gh search code "..."` | `search_code(query: "...")` |
| `gh search commits "..."` | `search_commits(query: "...")` |

### Users / Teams / Collaborators

| `gh` command | MCP tool call |
|---|---|
| `gh api user` | `get_me()` |
| `gh api /orgs/{org}/teams/{slug}/members` | `get_team_members(org, team_slug)` |
| (no direct `gh` equivalent) my teams | `get_teams(user?)` |
| `gh api repos/.../collaborators` | `list_repository_collaborators(owner, repo, affiliation?)` |
| `gh api search/users` | `search_users(query)` |

### Copilot

| `gh` command | MCP tool call |
|---|---|
| `gh copilot ...` delegate a task | `create_pull_request_with_copilot(owner, repo, title, problem_statement, base_ref?)` |
| assign Copilot to an existing issue | `assign_copilot_to_issue(owner, repo, issue_number)` |
| check Copilot job status | `get_copilot_job_status(owner, repo, id)` |
| request a Copilot PR review | `request_copilot_review(owner, repo, pullNumber)` |

## Issue Fields — this repo's "Projects" equivalent

There is no `gh project` (classic GitHub Projects v2 board) tool exposed by
`plugin:github:github` in this environment. What this org uses instead — and what `AGENTS.md`
enforces — is **org-level Issue Fields** (Settings > Planning > Issue fields: Priority, Effort,
Start date, Target date). Treat requests like "add this to the project" or "set the project
fields" as requests to set these issue fields, not as a classic Projects board operation.

| Intent (often phrased like a `gh project` action) | MCP tool call |
|---|---|
| List available custom fields / their valid options | `list_issue_fields(owner, repo?)` — omit `repo` for org-level fields |
| List issue types (epic/task/bug, if enabled) | `list_issue_types(owner, repo?)` |
| Set Priority/Effort/dates on create | `issue_write(method: "create", ..., issue_fields: [{field_name: "Priority", field_option_name: "High"}, {field_name: "Effort", field_option_name: "Medium"}, {field_name: "Start date", value: "YYYY-MM-DD"}, {field_name: "Target date", value: "YYYY-MM-DD"}])` |
| Update a single field later | `issue_write(method: "update", issue_number, issue_fields: [{field_name: "...", field_option_name/value: "..."}])` |
| Clear a field | `issue_write(..., issue_fields: [{field_name: "...", delete: true}])` |
| Filter/list issues by a custom field (e.g. "show High priority issues") | `list_issues(owner, repo, field_filters: [{field_name: "Priority", value: "High"}])` |
| Set issue type | `issue_write(..., type: "...")` — validate against `list_issue_types` first |
| Add a sub-issue / break work into children | `sub_issue_write(method: "add", owner, repo, issue_number, sub_issue_id)` |
| Move a sub-issue to a different parent | `sub_issue_write(method: "add", ..., replace_parent: true)` |
| Reorder sub-issues | `sub_issue_write(method: "reprioritize", ..., after_id/before_id)` |
| Remove a sub-issue link | `sub_issue_write(method: "remove", ...)` |
| Read an issue's hierarchy (parent/children) | `issue_read(..., method: "get_sub_issues")` / `method: "get_parent")` |

Per `AGENTS.md`, **every `issue_write` with `method: "create"` in this repo must include all
four Issue Fields** (Priority, Effort, Start date, Target date) with validated option
names/dates — self-check this before calling the tool, and ask the user rather than guessing if
a value isn't obvious from the conversation.

## Notes

- `gh` flags that map to pagination (`--limit`, `-L`) become `perPage`/`page` params; keep batches
  to 5-10 items per the GitHub MCP server's own context-management guidance, and pass
  `minimal_output: true` on `search_repositories` when full objects aren't needed.
- For `search_*` tools, don't put `sort:` inside the query string — use the dedicated `sort`/`order`
  parameters instead.
- `gh` commands with no listed equivalent (e.g. `gh workflow`, `gh secret`, `gh gist`, `gh alias`,
  `gh extension`) have no corresponding tool on this MCP server — say so explicitly rather than
  improvising a call, and ask the user how they'd like to proceed.
- When a `gh` command would send a message, merge, delete, or otherwise take an irreversible action
  on GitHub, the usual confirm-before-acting rules still apply — translating the command doesn't
  bypass that.
