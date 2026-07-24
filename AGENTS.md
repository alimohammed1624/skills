# Agent Instructions — claude-workday-test

All GitHub operations in this repository go through the `plugin:github:github` MCP server, not
the `gh` CLI. If you're about to run a `gh` command, or translating one the user pasted, use the
`gh-to-mcp` skill first to find the equivalent MCP tool call.

This repository lives under the `msa1624` GitHub org, which has org-level **Issue Fields**
configured (Settings > Planning > Issue fields):

| Field | Type | Options |
|---|---|---|
| Priority | single-select | Urgent, High, Medium, Low |
| Effort | single-select | High, Medium, Low |
| Start date | date | YYYY-MM-DD |
| Target date | date | YYYY-MM-DD |

## Creating issues

Every issue created via `mcp__plugin_github_github__issue_write` (method: `create`) MUST set
all four fields in `issue_fields`:

```json
[
  {"field_name": "Priority", "field_option_name": "High"},
  {"field_name": "Effort", "field_option_name": "Medium"},
  {"field_name": "Start date", "value": "YYYY-MM-DD"},
  {"field_name": "Target date", "value": "YYYY-MM-DD"}
]
```

**Before calling `issue_write` with method `create`, self-check that all four fields are present
and use exact option names** (Urgent/High/Medium/Low for Priority, High/Medium/Low for Effort,
dates as YYYY-MM-DD). There is no automated enforcement of this — verify it yourself every time.

**If the right value for a field isn't obvious from the conversation or issue content, ask the
user before creating the issue.** Do not guess Priority, Effort, or dates — a wrong guess is
worse than a missed field.

## Creating pull requests

See the `gh-to-mcp` skill if you're working from a `gh pr` command — it maps `gh pr create`,
`gh pr edit`, `gh pr review`, `gh pr merge`, etc. to the matching MCP tool calls.

`mcp__plugin_github_github__create_pull_request` has no `issue_fields` parameter — GitHub's
Issue Fields feature does not extend to PRs through this tool, so it cannot be enforced the
same way. Instead:

- Reference the issue(s) the PR addresses in the PR body (e.g. `Closes #7`).
- Before opening the PR, confirm the referenced issue already has Priority, Effort, Start date,
  and Target date populated. If not, update the issue first (or ask the user).

## Updating issues when pushing

**After running `git push`, always scan the commit messages just pushed for issue references
(`#N`)** — there is no automated reminder for this, so do it yourself every time. For each
referenced issue:

- Add a progress comment via `add_issue_comment` summarizing what the pushed commit(s) did.
- If a commit message uses a closing keyword (`Fixes #N`, `Closes #N`, `Resolves #N`) and the
  work is genuinely complete, close the issue via `issue_write` with an appropriate
  `state_reason`.
- If the work shifts the timeline or urgency, update `Start date`, `Target date`, or `Priority`
  accordingly via `issue_write` — ask the user if the right values aren't clear rather than
  guessing.
