# Test Project

This repo exists to test Claude Code skills — it's a harness, not a product. The `.claude/skills/` directory holds a small set of GitHub-workflow skills exercised against this repo (and its org) to check that they trigger correctly and behave as specified.

## Skills under test

Each skill is a `SKILL.md` file with YAML frontmatter (`name`, `description`) that Claude auto-loads when its description matches the task at hand. The description is itself part of what's under test: does the right skill fire for a given phrasing, and does it stay silent when another skill is the better fit?

### start-workday

Beginning-of-day briefing across the whole org, not just this repo. Reads `.claude/state/workday.json` for `last_ended_at` and, if it's under 36h old, uses it as the "since you left off" boundary; older or missing boundaries are called out rather than silently trusted. Queries `search_issues`/`search_pull_requests` with an `org:` qualifier, maps cross-repo `#N` / `owner/repo#N` references and "blocks"/"depends on" language, then renders six fixed sections (Since You Left Off, Action Items, Blocked, Dependencies Map, Stale Items, Quick Wins). Writes `last_started_at`/`last_started_repo` at the end, preserving the existing `ended` fields — it must never rewrite the other two fields in the file.

**What to probe:** boundary handling (fresh/stale/missing/wrong-repo timestamp), that org-wide queries are actually org-scoped and not narrowed to one repo, that every item reference is qualified as `owner/repo#N`.

### end-workday

End-of-day wrap-up, org-wide. Its iron law: `git status --short` and an unpushed-commits check run first, every time, and any hits go in a BLOCKING section at the top of the report — never buried, never called "minor." It then resolves the session window from `last_started_at` (same 36h freshness rule as start-workday), reports completed and in-progress work, updates issue/PR statuses via the GitHub MCP tools, and reconciles push activity — catching commits that reference an issue but never got a progress comment, or that used a closing keyword (`Fixes #N`) without the issue actually being closed. Always writes `last_ended_at`/`last_ended_repo` at the end, even when Step 2 found blockers — the boundary records when you stopped, not whether the handoff was clean. Never writes carry-over content to `workday.json`; that file is strictly the four timestamp/repo fields.

**What to probe:** that uncommitted/unpushed work actually blocks and surfaces first, that a closing keyword doesn't trigger an auto-close without verifying real completion, that the state file never accumulates anything beyond its four fields, and that the boundary write still happens on a "dirty" run.

### project-status

PM-facing report over an explicit time window (since-last-check / past day / past week / custom) — never "today" by default. Reads `.claude/state/project-status.json` *before* offering window options, since the file's contents determine which options are even valid to offer. Produces three layers: current-repo detail, an org-wide rollup, and a per-developer "Who Did What" built from commit authorship (not committer) and `Co-authored-by:` trailers, explicitly excluding bots. This skill is read-only — it must never comment, write a field, or close anything — and it must never rank or editorialize about a person's output, only report what the record shows. Dependency Map entries must be identified by linked title, never a bare issue number. Overwrites its own state file's timestamp at the end of every run.

**What to probe:** that it never mutates GitHub state, that attribution comes strictly from author/assignee/reviewer fields and not inference from file paths or titles, that unassigned items render as `—` rather than a guess, and that it doesn't confuse its state file with `workday.json`.

### gh-to-mcp

Required sub-skill for all three skills above. Its job is narrow: whenever a `gh` CLI command would otherwise be run (typed by Claude, pasted by the user, or implied by a script), translate it to the equivalent `plugin:github:github` MCP tool call instead of shelling out — this is what keeps org-level enforcement (Issue Fields, issue types) intact. It also requires all four Issue Fields (Priority, Effort, Start date, Target date) on every issue creation, and refuses to guess values the conversation never established. Translating an irreversible action (merge, delete, send) is explicitly not the same as approval to perform it.

**What to probe:** that `gh` never actually gets shelled out to in this repo, that issue creation is blocked/questioned when a required field is missing rather than filled with a guess, and that translating a merge/delete command doesn't skip the normal confirm-before-acting step.

## Shared state

- `.claude/state/workday.json` (gitignored, machine-local) — shared by start-workday and end-workday. Exactly four fields: `last_started_at`, `last_started_repo`, `last_ended_at`, `last_ended_repo`. It's a cursor, not a cache — no carry-over content is ever stored here.
- `.claude/state/project-status.json` (gitignored, machine-local) — a single `last_checked` timestamp, owned exclusively by project-status. The workday and project-status skills must never read each other's state file.

## Notes for testers

- All three top-level skills declare `gh-to-mcp` as a **required sub-skill** — a run that hits GitHub without routing through it is a failure, not a style choice.
- Each skill's `SKILL.md` ends with a "Red Flags — STOP" list and a "Common Rationalizations" table. These encode the specific failure modes the skill was written to prevent (e.g. closing an issue on a `Fixes #N` keyword without checking real completion, silently merging two GitHub handles into one identity, reporting a merge commit's committer as its author). They're a ready-made checklist for adversarial test cases.
- The tracked deletions of `auth.js`, `middleware.js`, and `worker.js` in this repo's history are fixture data — sample commits/files for the skills to reference (e.g. "Fix memory leak in background worker (fixes #7)"), not application code.
