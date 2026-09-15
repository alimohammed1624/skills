# Screenshots in PR and Issue Bodies

A guide, not a gate. Use it when you are asked to put screenshots on a PR or an
issue. Nothing in `SKILL.md` requires screenshots.

*Adapted from `being-and-becoming/AGENTS.md`. **Not run from this skill:** the
upload endpoint below. It is not in GitHub's public REST docs. Before you rely
on it, upload one throwaway image and check that the returned URL renders on the
PR page. `gh` 2.46.0 has no `--attach` flag on `gh pr create` or `gh pr edit`.
Re-read `--help`, because a newer release may have added one.*

## Why repo links don't work

On a **private** repository, none of these render as an image in a PR or issue
body:

- repo-relative paths (`docs/shot.png`)
- `raw.githubusercontent.com/...`
- `github.com/<owner>/<repo>/raw/...`

The body shows a broken image, and the PR looks fine to everyone except the
reviewer. What does render is a **user-attachment URL**,
`https://github.com/user-attachments/assets/<id>`. Dragging a file into the
comment box on github.com produces the same kind of URL.

## Capture

When the screenshots are meant to show a UI change, drive the flow for real
(click, type, submit, navigate) rather than taking one static render. Cover the
states a reviewer would ask about: empty, error and success. Save PNGs to a
scratch directory, not to the repo.

## Upload

1. **Check for a flag first.** If `gh pr create --help` or `gh issue create --help`
   lists `--attach`, pass each file with it. It uploads the file and rewrites the
   local image references in the body. That is rung 1, and it ends here.

2. **Otherwise, upload each PNG to the repo's attachment store:**

   ```bash
   repo_id=$(gh api repos/{owner}/{repo} --jq .id)
   curl -sS -X POST \
     "https://uploads.github.com/user-attachments/assets?name=$(basename "$file")&content_type=image/png&repository_id=$repo_id" \
     -H "Authorization: Bearer $(gh auth token)" \
     -H "Accept: application/json" \
     --data-binary @"$file"
   ```

   Take `url` from the JSON response. `repository_id` is the numeric id, not the
   node id and not `owner/repo`.

3. **Reference it in the body:**

   ```markdown
   ![Empty state after filter clears](https://github.com/user-attachments/assets/<id>)
   ```

   Write alt text that says what the picture shows. "screenshot" says nothing.

4. **Write or update the body** with `gh pr create --body-file`, `gh pr edit N
   --body-file`, or `gh issue edit N --body-file`. A file avoids shell-quoting
   problems with `!` and backticks.

## Verify

The job is done when **every image in the body is a
`https://github.com/user-attachments/assets/...` URL and the PR or issue page
shows the images inline**. Check it:

```bash
gh pr view N --json body --jq .body | grep -o '!\[[^]]*\]([^)]*)'
```

Every match should point at `user-attachments/assets`. Any other URL is a picture
that will not render.

## If the upload fails

A 404 or 401 from the endpoint means this path does not work with a `gh` token
here. It does not mean screenshots can't be attached. Two fallbacks remain:

- **Drag and drop on github.com**, done by a person in a signed-in browser. Say
  which files to drop and where the placeholders are in the body.
- **Browser automation** (Chrome DevTools `upload_file` into the comment box),
  but only in a browser profile that is already signed in to GitHub. A fresh
  `--user-data-dir` profile is not.

Report which path you used. If none worked, report that the images are **not
attached**. Do not leave repo-relative links in the body as if they were.

Walkthrough docs committed under `docs/` may keep repo-relative screenshot paths.
Those links are for the docs, and this guide is about PR and issue bodies.
