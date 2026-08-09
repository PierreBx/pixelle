---
name: 4-site-commit-and-publish
description: "Step 4 of the pixelle workflow: commit content/ and publish the site to GitHub Pages, then verify the deploy against the served pages. Use when the user asks to publish, commit and publish, put the site online, or deploy."
allowed-tools: Read, Bash, Glob, Grep
---

You publish pixelle. A script does the work; your job is to write a truthful commit
message, show what would leave, **ask**, and only then push.

```bash
PUBLISH=.claude/skills/4-site-commit-and-publish/commit-and-publish.sh
```

It is standalone and `--help` documents it — the user may run it without you. Do not
reimplement its steps by hand.

## What this step is not

It does **not** sync, build or audit. Steps 2 (`2-site-construct-locally`) and 3 (`3-site-check-local`)
own that. If you find yourself running `npm run sync` or `audit.py` here, you are in the
wrong skill: send the user back a step instead. Redoing that work would only blur which
step actually failed.

The script does verify that those steps ran: `public/` must exist and be newer than the
newest note in `content/`. A stale build means the site is about to be published in a state
nobody looked at. `--force` overrides, and must be a deliberate, stated choice.

## Guard rails

- **Pushing is visible from the outside.** It triggers the CI and puts the site online.
  **Ask before pushing**, unless the user has already said to go all the way.
- **`content/` is generated.** Never fix a note there; edit it in the vault, then rerun
  steps 2 and 3.
- Publishing is publishing: a note removed from the site may survive in caches and in the
  git history. Better to check before than after.

## 1. Commit, without pushing

```bash
$PUBLISH -m "<message>"
```

Besides the stale-build precondition, the script refuses to commit when a file the CI
builds from (`quartz.config.yaml`, `scripts/`, `package*.json`, `.github/`) is modified but
unstaged — committing content without it ships a site different from the one verified.

Write the message yourself, factual and specific: `Publie : <titre>`, `Chant NN : …`,
`Retire : <titre>`. Never a generic one. If nothing changed in `content/`, the script says
so and commits nothing — report that plainly rather than inventing a change.

## 2. Show, then ask

Report what would leave: how many notes added, changed, **removed**, plus any file outside
`content/` in the commit. The script counts removals for you and warns about them; a
removal takes a page off the site, so always surface it.

Then ask. Wait for a real answer.

## 3. Push

```bash
$PUBLISH --push
```

The script pushes, then verifies the deploy by **comparing the served pages to the local
build**, byte for byte. Quartz output is deterministic, so a match proves the new content
is live. It checks the homepage plus up to three pages the push changed.

Do not verify through the GitHub API. In practice it has reported `completed success` for
a run still in progress, returned an empty list for a SHA it had just described, and its
anonymous quota is 60 requests per hour — which this repository exhausts quickly. The
served bytes are the only reliable answer.

A single fresh read is not proof either: CDN edges lag independently, so a page can look
stale minutes after a correct deploy. The script handles this; if you check by hand, read
more than once with a cache-busting query.

## 4. Report

Say what was published or removed, the state of the deploy, and the site URL
(`https://pierrebx.github.io/pixelle`). Flag every anomaly met along the way, including
your own missteps — a verification you got wrong is worth more to the user than a clean
summary that hides it.
