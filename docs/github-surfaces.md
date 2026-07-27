# GitHub access surfaces: `gh` vs GraphQL

Comparison of the two ways this repo's workflows reach GitHub: the `gh` CLI and
the GitHub GraphQL API (v4), which `gh api graphql` fronts. Focused on the
differences — what each surface uniquely enables and where each one dead-ends.

Verified 2026-07-26 against `gh` 2.96.0 and live GraphQL schema introspection.
The 2026-07-26 pass went beyond reading docs and help text: it executed real
mutations against the `msa1624` test org (issues created and linked across
repos, project fields written and reverted, a project created and deleted) and
**corrected several claims this document previously asserted**. See
[What verification changed](#what-verification-changed-and-what-it-cost) at the
end for the corrections and the traps that produced them.

## The structural difference

`gh api` and `gh api graphql` are universal passthroughs — anything the REST or
GraphQL APIs can do, `gh` can reach. The split between the two surfaces below is
therefore about *ergonomics and locality*, not about capability ceilings: one
surface runs on your machine, the other reaches parts of the schema REST never
exposed.

Ranked by unique reach:

- **GraphQL** is the capability ceiling for anything project-, discussion-, or
  enterprise-shaped.
- **`gh`** is the only surface with a local filesystem and a git checkout.

## `gh`-only

Everything that touches the local machine or a TTY:

- `gh pr checkout`, `gh repo clone`, `gh repo sync`,
  `gh issue develop --checkout` — an API cannot check out a branch
- `gh release upload`, `gh run download` — local files in and out
- `gh run watch --exit-status`, `gh run view --log-failed` — streaming,
  blocking, scriptable in CI
- `gh secret set` — performs the libsodium encryption for you; a raw API call
  means encrypting the value yourself
- `gh ruleset check <branch>` — "which rules would apply to this hypothetical
  branch name". No single API call does this.
- Extensions, aliases, `--json` / `--jq` / `--template`, `--paginate --slurp`

## GraphQL-only

Not reachable via REST — GraphQL only:

- **Repository Discussions** — full CRUD. (REST's "discussions" are *team*
  discussions, a different object.)
- **Sponsors, enterprise administration, IP allow lists, verified domains**
- **`createCommitOnBranch`** (signed/verified commits) and **`updateRefs`**
  (atomic multi-ref update)
- **Merge queue control**, semantic/hybrid issue search, mannequin attribution
- **Project views and status updates** — confirmed 404 on
  `orgs/{org}/projectsV2/{n}/views` and `.../status_updates` via REST.

Three corrections to common assumptions:

- **Sub-issues and issue types are in REST too** —
  `/rest/issues/sub-issues`, `/rest/orgs/issue-types`. Not GraphQL-only.
- **Branch protection is not a GraphQL gap** — it has both classic
  `BranchProtectionRule` and rulesets.
- **Projects v2 core CRUD is not GraphQL-only either.** An earlier version of
  this doc claimed "Projects v2, entirely" was GraphQL-only with no REST
  replacement. Verified false 2026-07-26: `GET/PATCH orgs/{org}/projectsV2/{n}`,
  `.../fields` (list and create), and `.../items/{id}` (read and field-value
  write) are real, documented REST endpoints — see
  [Projects v2 over REST](#projects-v2-over-rest) for exact bodies.
  What is *not* reachable over REST: field **deletion** (404 — `gh project
  field-delete` was needed to clean up a field created via the REST POST),
  project **creation** (`POST orgs/{org}/projectsV2` → 404), `views`, and
  `status_updates` (both 404).

### Iteration fields — verified 2026-07-27

An earlier version of this doc said iterations weren't present to test. They are:
`msa1624` project **#3** carries an `ITERATION` field **named `Sprint`** — the
name is board-chosen, so `dataType` is the only reliable matcher.

- `ProjectV2IterationField.configuration` is non-null and carries exactly
  `duration`, `startDay`, `iterations`, `completedIterations`. Each iteration
  carries `id`, `title`, `startDate`, `duration`, `titleHTML`.
- Live values: `duration: 14`, `startDay: 1`, three future/current iterations,
  `completedIterations: []`.
- Write path confirmed on both rungs — `ProjectV2FieldValue` accepts
  `iterationId`, and `gh` 2.96.0 has `gh project item-edit --iteration-id`.
- Read back through `ProjectV2ItemFieldIterationValue` (`iterationId`, `title`,
  `startDate`, `duration`).

**Still untested:** writing a value onto an item, and any board with a populated
`completedIterations`.

`ProjectV2FieldCommon` has **four** implementors — `ProjectV2Field`,
`ProjectV2SingleSelectField`, `ProjectV2MultiSelectField`,
`ProjectV2IterationField`. A discovery query that selects only the common fragment
returns `id name dataType` for all four and no values for any of them, which reads
as "unfillable" rather than "under-queried". `ProjectV2FieldConfigurationConnection`
exposes `totalCount`; without it a `fields(first:N)` page truncates silently.

**The values accessor differs per type and is not guessable by analogy:**
`ProjectV2SingleSelectField.options`, but
`ProjectV2MultiSelectField.multiSelectOptions` (options → `id`, `name`, `color`,
`description`) and `ProjectV2IterationField.configuration`. Selecting `options` on
a multi-select fails with `undefinedField` — caught here by running the query, not
by reading it. Multi-select writes take `{multiSelectOptionIds:[…]}`, a list, and
have **no rung-1 flag** in `gh` 2.96.0.

## Cross-repo work: dependencies, hierarchy, and one project over many repos

Verified 2026-07-26 against `msa1624` (5 repos, one org-level project). All of
it works, but the surfaces differ sharply in cost and in one read-after-write
trap.

### Everything cross-repo is writable from `gh` — via the URL form

The flags take "issue number **or URL**", and the URL form is what crosses repo
boundaries. Confirmed working end to end:

- `gh issue edit N --add-blocked-by https://github.com/OWNER/OTHER/issues/M`
- `gh issue create --blocked-by <numbers-or-URLs>` / `--blocking` (these exist
  on `create` too, not just `edit`)
- `gh issue edit N --add-sub-issue https://github.com/OWNER/OTHER/issues/M` —
  a parent in one repo with a child in another is accepted and reads back with
  the child's real repo in `sub_issues`.

So cross-repo hierarchy and dependencies are fully writable from the CLI with
no GraphQL involved at all. Reads come back with the foreign repo
named: `/repos/{o}/{r}/issues/{n}/dependencies/blocked_by` returns each
blocker's own `repository.full_name`.

### The trap: `issue_dependencies_summary` is eventually consistent

**The summary counter lags the write; the list endpoint does not.** Measured on
a fresh issue immediately after adding one cross-repo blocker:

```
t=0s  summary.total_blocked_by=0   dependencies/blocked_by length=1
t=1s  summary.total_blocked_by=1   dependencies/blocked_by length=1
```

It converges within ~1s and counts cross-repo blockers correctly once settled —
this is *not* a "cross-repo isn't counted" rule (an earlier read of this looked
exactly like one, which is the point). Any workflow that writes a dependency and
then immediately reads `issue_dependencies_summary` — or reads it to decide
"is this blocked?" — gets a stale zero. **Read the
`dependencies/blocked_by` list, or GraphQL's `blockedBy` connection, when
correctness right after a write matters.** The summary is fine for display on a
cold read.

### One project, many repos

An org-level project spans repos with no special handling:

- `gh project item-add 1 --owner ORG --url <issue-url-in-any-repo>` works for
  issues in any linked repo; items from three different repos coexisted fine.
- `projectV2.repositories` listed all **5** org repos as linked while only 3 had
  items — **linked ≠ has items**, so don't infer coverage from that list.
- Each repo reports the project back via `repository.projectsV2`.

### Where GraphQL decisively wins: the cross-repo rollup

This is the one case where the surface choice actually changes the cost model
rather than just the ergonomics. A single query walks the project's items,
follows each issue's `blockedBy` into whatever repo it lives in, and returns
state and repo names for all of it:

```graphql
organization(login: "ORG") { projectV2(number: 1) { items(first: 30) { nodes {
  content { ... on Issue {
    number  repository { nameWithOwner }  state
    blockedBy(first: 5) { nodes { number repository { nameWithOwner } state } }
  } } } } } }
```

**Measured: `cost: 1`, `nodeCount: 180`, one round trip.** The REST equivalent
was **18 requests** for the same 16 issues (1 for project items + 1 per issue
for `dependencies/blocked_by`) — and REST has no way to fold it into fewer,
because the dependency list is a per-issue endpoint. For a cross-repo "what's
blocking this project" rollup, GraphQL is ~18× cheaper here and the gap widens
linearly with issue count.

Field-name gotcha: the fields are `blockedBy` / `blocking` on `Issue`, **not**
`blockedByIssues`. Guessing the wrong name produces the second GraphQL error
shape — `errors` with no `data` key at all, nothing executed — which is a
useful live confirmation of the two-shapes warning below.

## Where the gaps bite

### A same-object divergence, not just a reach gap

Everything above is about one surface reaching an object the other can't.
This one is different and worth calling out separately: **both REST and
GraphQL reach the same Projects v2 board field, and disagree about its
content.**

This org's Projects v2 board has a `Priority` single-select field mirrored
from the org-level Issue Field of the same name (`gh project field-list`
exposes it, and REST's `orgs/{org}/projectsV2/{n}/fields` shows it carrying
`issue_field_id: 44612082`). Querying that exact field by node ID:

- **REST** (`orgs/{org}/projectsV2/{n}/fields`) returns all 4 options —
  `Urgent`/`High`/`Medium`/`Low` — with their option IDs.
- **GraphQL** (`node(id: "PVTSSF_...") { ... on ProjectV2SingleSelectField {
  options { id name } } }`) returns `options: []` for the identical field,
  same node ID, same moment — empty, not an error.

Writing to it makes the reason legible: the ordinary
`updateProjectV2ItemFieldValue` mutation rejects it outright —
`"Issue field values cannot be updated using the
updateProjectV2ItemFieldValue mutation, they must be updated using the
updateIssueFieldValue mutation"` — because under GraphQL's model this isn't
really a project field, it's a *view* onto an org Issue Field living in a
separate node-ID space (`organization.issueFields`, a union type reached only
through per-type fragments). REST's `.../fields` endpoint flattens that
distinction away and just shows the merged, options-populated field. A caller
who trusts GraphQL's `options: []` here would wrongly conclude the field has
no valid values; a caller who tries the standard project-item mutation to
write it gets a clear rejection rather than a silent no-op — but only on
write, not on the read that preceded it.

### GraphQL's blind spots (REST-only)

- **Actions, almost entirely.** `Repository` has no `workflows` or
  `workflowRuns` field, and there is **no `Artifact` type in the schema**. No
  dispatch, re-run, cancel, job detail, logs, artifacts, runners, or Actions
  secrets.
- **Releases, gists, deploy keys, webhooks, teams, and org membership are all
  readable and not writable.** 255 mutations (schema introspection, verified
  2026-07-26) against a query surface of 5,572 fields across all types.
  Default assumption: read-GraphQL, write-REST, until you've checked the
  mutation list.
- Traffic/statistics, code scanning alerts, repo and org settings management,
  Contents API conveniences (README resolution, tarball/zipball, raw media
  types).
- The direction is not uniformly toward GraphQL: **Packages and audit logs have
  both been deprecated *out* of GraphQL toward REST.**

### `gh`'s blind spots

Narrower, and all escapable via `gh api`:

- Org-level **Issue Fields** (Priority / Effort / Start date / Target date) —
  no flag exists anywhere in `gh help reference`. Note that
  `gh project field-list` is a *different feature*: Projects v2 board fields,
  not org Issue Fields.
- `gh ruleset` is read-only; creating one needs
  `gh api -X POST /repos/{owner}/{repo}/rulesets --input file.json`.
- Line-level review comments — `gh pr review` posts a top-level body only.
- Milestones CRUD, org/team management (`gh org` has only `list`), webhooks,
  branch protection.
- Projects v2 field values work but require raw node IDs
  (`gh project item-edit --id --field-id --project-id`) and only one field
  value per invocation.

## Cost and failure models

| | GraphQL | `gh` |
|---|---|---|
| Rate limit | 5,000 **points**/hr; **1,000/hr for `GITHUB_TOKEN` in Actions** | whichever API it calls — REST-backed, 5,000 req/hr |
| Batching | one query, many objects — docs' example: 11 REST calls → 1 | REST-shaped, one call per request |
| Caching | **no useful ETags** — polling costs full points every time | ETag `304`s are free on the REST paths |
| Hard ceilings | `first:` must be 1–100; 500k nodes/query; **10s server timeout → 502/504, and the points are still charged** | REST paging |

GraphQL point cost is `ceil(underlying connection requests / 100)`, minimum 1.
A well-shaped query is dramatically cheaper than the REST fan-out; a badly
nested one can cost 50× a single REST call. Price a query before running it with
the `rateLimit` field and `dryRun: true`.

Secondary limits: ≤100 concurrent requests (shared with REST), ≤2,000
points/minute at the endpoint (non-mutating = 1, **mutation = 5** — a different
point scale from the hourly budget), ≤90s CPU per 60s real time.

### The GraphQL failure mode worth designing around

**Partial errors return HTTP 200.** A query for a nonexistent repo yields
`{"data":{"repository":null},"errors":[{"type":"NOT_FOUND"}]}` at status 200.
Any client branching on HTTP status reads a permissions failure as success with
a null value. Syntax and undefined-field errors behave differently again —
`errors` with no `data` key at all, nothing executed. Two distinct shapes to
handle.

`gh api graphql` compounds this: it prints the JSON *and* exits non-zero with
only the first error message, so scripts piping through `--jq` consume the
nulled data without noticing.

### Versioning

GraphQL has **no version pin**. Breaking changes ship quarterly (Jan 1 / Apr 1 /
Jul 1 / Oct 1) with ≥3 months' notice, and there is no opt-out. Schema previews
are gone entirely — the docs page now redirects — so drop any
`Accept: application/vnd.github.*-preview+json` headers.

Node IDs are mandatory for nearly every mutation, and they aren't the numbers
you have: bridging from `owner/repo/number` costs an extra round trip, or lift
`node_id` off a REST response.

## Notes on this repo's setup

**A GitHub token is in plaintext** in `~/.claude/settings.json` under
`env.GITHUB_PERSONAL_ACCESS_TOKEN` (a `gho_` token). The file is owner-only at
`-rw-------` (not world-readable — corrected 2026-07-26; an earlier version of
this note claimed `-rw-r--r--`). Still worth rotating and sourcing from the
keychain — `gh` already stores its own credentials there — since the token
sits in plaintext regardless of file mode.

**Org Issue Fields are writable, just not from the CLI.** `gh` 2.96.0 genuinely
has no flag for the four org-level Issue Fields (Priority, Effort, Start date,
Target date), so it's tempting to conclude they can't be set. Don't — that
conclusion turns a *degraded* write path into an *impossible* one. `setIssueFieldValue`
over `gh api graphql` is confirmed working, not just theoretical — exercised directly against
this org's `msa1624` Priority field —

```
mutation {
  setIssueFieldValue(input: {
    issueId: "I_..."
    issueFields: [{ fieldId: "IFSS_...", singleSelectOptionId: "IFSSO_..." }]
  }) { issue { id } }
}
```

sets the value (verified via `issue_field_values` in the REST issue payload
afterward), and the same mutation with `delete: true` in place of the option
ID clears it. The org-level Issue Field node IDs (`organization { issueFields
{ nodes { ... on IssueFieldSingleSelect { id options { id name } } } } }`,
a union type — fragments are mandatory, direct field selections 400) are
**distinct from the Projects v2 field node IDs** `gh project field-list`
returns for the same-named field on the board. Confirmed by a live divergence:
querying the board's `Priority` field (`ProjectV2SingleSelectField`) via
GraphQL returns `options: []` — empty — even though REST's
`orgs/{org}/projectsV2/{n}/fields` lists all 4 options for that same field.
Attempting the ordinary `updateProjectV2ItemFieldValue` mutation against it
fails outright: `"Issue field values cannot be updated using the
updateProjectV2ItemFieldValue mutation, they must be updated using the
updateIssueFieldValue mutation"` — confirming this project field is a
*mirror* of the org Issue Field, not a native project field, and the two
must be written through different mutations with different node ID spaces.

Separately, current `gh` is easy to undersell. Sub-issue hierarchy is fully
*writable* from the CLI, not just readable: 2.96.0 has
`gh issue create --parent/--type` and
`gh issue edit --add-sub-issue/--remove-parent`.

Relationships reach further than `gh issue edit --add-blocked-by`. The same
flags exist on **`gh issue create`** (`--blocked-by` / `--blocking`), so a
dependency can be set at creation rather than in a second call — and **all of
them accept issue URLs, which makes them cross-repo**. Given this org runs one
project across five repos, that last point matters more than it looks.

## What verification changed, and what it cost

The 2026-07-26 pass re-tested this document's claims by executing them rather
than reading about them. Five assertions were wrong. Recording them here
because the *shape* of each error predicts where the next one will be.

### Claims that were wrong

| Claimed | Actually |
|---|---|
| "Projects v2, **entirely**" is GraphQL-only, "there is no REST replacement" | False. `orgs/{org}/projectsV2/{n}`, `.../fields` (incl. create), and `.../items/{id}` (incl. field-value write) are real and work. Only views, status updates, field *deletion*, and project *creation* actually 404. |
| `~/.claude/settings.json` is world-readable at `-rw-r--r--` | It is `-rw-------`. The plaintext-token concern stands; the file-mode alarm did not. |
| "~230 mutations against thousands of fields" | 255 mutations, 5,572 fields. Directionally right, but it was an estimate presented as a count. |
| Relationships are `gh issue edit`-only, same-repo-shaped | `gh issue create --blocked-by/--blocking` also exists, and every relationship flag takes a URL, so all of it is cross-repo. |

### The three traps

**1. Read-after-write lag imitates a capability gap.** Adding a cross-repo
blocker and immediately reading `issue_dependencies_summary` returned `0`. That
is indistinguishable from "cross-repo dependencies aren't counted" — a clean,
plausible, *wrong* finding that was one keystroke from being written down here
as fact. What killed it was a control: a pre-existing issue with a cross-repo
blocker that *did* report `1`. The contradiction forced a re-read, which showed
the counter converging within ~1s.

  The general form: **when a read contradicts a write you just made, suspect
  timing before concluding capability.** Always check a second object that was
  written earlier. A single observation of an eventually-consistent field is
  not evidence about the feature.

**2. "Not in this surface" often means "not under that name."** `blockedByIssues`
doesn't exist; `blockedBy` does. Querying the wrong name returns `errors` with
no `data` key — which reads like absence but is a typo. Before recording a
GraphQL gap, introspect for the field name
(`{ __type(name: "Issue") { fields { name } } }`) rather than trusting one
failed query. The Projects-v2-over-REST error above is the same mistake at
larger scale: the endpoint existed, it just wasn't where the doc looked.

**3. Docs age asymmetrically toward "impossible."** Every correction above moved
in the same direction — something the doc called unreachable turned out to be
reachable. Capabilities get added far more often than removed, so a stale
capability doc accumulates false negatives, not false positives. Re-verify the
*dead ends* first; the "this works" claims rot more slowly.

### What it cost to check

Cheap enough that there's no excuse not to. The entire verification pass —
schema introspection, cross-repo writes, a full project rollup, REST/GraphQL
cost comparison — consumed well under 100 requests against a 5,000/hr budget.
The one measurement worth remembering: the cross-repo rollup was **GraphQL cost
1 vs. 18 REST requests**, and that ratio grows linearly with issue count.

### If you re-verify this doc

- Use a scratch org (`msa1624` here) and **execute** the claims; help text and
  docs are where the errors came from.
- Write, read back, revert, and confirm the revert. Every mutation in this pass
  was undone and re-verified clean, including confirming a pre-existing
  dependency survived.
- Poll anything summary-shaped at least twice, seconds apart, before believing
  it.
- Record counts you actually measured, not counts you rounded.

## Sources

- [About the GraphQL API](https://docs.github.com/en/graphql/overview/about-the-graphql-api)
- [Rate limits and query limits for the GraphQL API](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [Breaking changes](https://docs.github.com/en/graphql/overview/breaking-changes)
- [Comparing GitHub's REST API and GraphQL API](https://docs.github.com/en/rest/about-the-rest-api/comparing-githubs-rest-api-and-graphql-api)
- [Using the API to manage Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Using the GraphQL API for Discussions](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
- [REST API endpoints for sub-issues](https://docs.github.com/en/rest/issues/sub-issues)
- [REST API endpoints for issue types](https://docs.github.com/en/rest/orgs/issue-types)
