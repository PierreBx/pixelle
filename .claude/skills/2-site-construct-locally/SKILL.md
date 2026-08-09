---
name: 2-site-construct-locally
description: "Step 2 of the pixelle workflow: sync the Obsidian vault into content/, build the site and serve it, then hand the user a local URL to try in their browser. Use when the user asks to build the site locally, preview it, serve it, or look at it before publishing."
allowed-tools: Read, Bash, Glob, Grep
---

You produce the site and hand the user a URL they can open. **You do not judge it and you
do not publish it.** Step 3 (`3-site-check-local`) audits what you built; step 4
(`4-site-commit-and-publish`) ships it, and only after a human has looked.

This step exists because some breakage is only visible on a rendered page. The generated
homepage once shipped with all 173 of its links dead; a single glance at `localhost:8080`
would have caught it.

## Build and serve

`npm run serve` is `sync && quartz build --serve` — it projects the vault into `content/`,
builds `public/`, then serves it. It **blocks**, so run it in the background and wait for
the port to answer rather than guessing a delay:

```bash
npm run serve            # run_in_background
until curl -sf -o /dev/null http://localhost:8080/; do sleep 1; done
```

Check first whether something already listens (`ss -ltn | grep 8080`). A server left over
from an earlier run serves **stale HTML**, and you would show the user a page that no
longer matches the vault. Default port 8080, hot-reload socket 3001; both are overridable:

```bash
npx quartz build --serve --port 8081 --wsPort 3002
```

## Read the sync report as it goes by

Three kinds of **expected** noise — mention them once, do not treat them as faults:

| Signal | Meaning |
| --- | --- |
| *missing links* (~22, stable) | a published note cites a private or unwritten one; it renders as plain text, nothing private is copied |
| *media without a thumbnail* | the Instagram or YouTube post is deleted or private; the bare link stays |
| *ambiguous attachment* | two files share a name, the first one wins |

`- file (unpublished)` is different: it **removes a page from the site**. Say so plainly —
it is the one line of the report the user must not miss.

Relay the build warnings too. `isn't yet tracked by git` is harmless before a commit;
`found invalid date` is real, the displayed date will be wrong.

## Report

Give the user, in this order:

1. **The URL**, on its own line, ready to click: `http://localhost:8080/`.
2. **What to look at** — name the pages your changes actually touch, with their real slugs
   read from `public/`, not guessed. `Manuel Casares - Piano` is served at
   `manuel-casares---piano`.
3. **Anything the sync or the build flagged**, briefly.
4. **How to stop the server**, and that it keeps running until then.

Then stop. Do not run the audit here and do not offer to publish — the point of this step
is that a human sees the site first. Once they have looked, `3-site-check-local` is next.

## If they ask for a change

Edit the **vault**, never `content/`. Then re-run the build. The running server does not
watch for changes unless started with `--watch`, so nothing moves on screen without a
rebuild.
