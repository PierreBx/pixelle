---
name: 3-site-check-local
description: "Step 3 of the pixelle workflow: audit the site that was just built locally — empty notes, newly exposed frontmatter keys, convention drift, Obsidian blocks Quartz cannot render, invalid dates, base columns, and internal links that do not resolve. Use when the user asks to check or verify the site or the vault, and always as the last gate before publishing."
allowed-tools: Read, Bash, Glob, Grep
---

You judge what pixelle is about to publish. **Report, do not fix**: several apparent
anomalies are deliberate choices.

This is the gate. Step 2 (`2-site-construct-locally`) produced `content/` and `public/`;
step 4 (`4-site-commit-and-publish`) ships them. Between the two, you say whether it is fit to go.

**Change nothing.** Not `content/`, which is generated, and not the build. Every correction
belongs in the vault (`$VAULT_PATH`, default `~/Documents/data/obsidian/petersVault`),
followed by a fresh `2-site-construct-locally`.

## The one command

```bash
.claude/skills/3-site-check-local/audit.py --built
```

`--built` matters: three of the eleven checks read `public/` and are the reason this step
comes *after* the build — unrendered blocks in the HTML, bases that came out empty, and
**internal links that resolve**.

If it answers `no page — run npm run build:ci first`, the build has not run: send the user
back to step 2 rather than building here.

A `public/` produced by `npm run serve` is not comparable either — Quartz's dev server
emits `index.css` where a real build emits `index-fd4047da.css`. Step 2 uses
`npm run preview` precisely to avoid that; if you see unhashed asset names in
`public/index.html`, send the user back to step 2.

`public/` can also be **stale** — built before the last vault edit. Compare timestamps when
in doubt; auditing a stale build is how a fixed bug gets reported as still broken:

```bash
[ "$(find content -newer public/index.html -name '*.md' -print -quit)" ] \
  && echo "public/ is older than content/ — rebuild first"
```

Other flags: `--all` for a corpus inventory (a periodic review; it surfaces about ten
pre-existing, deliberate findings), `--quiet` to hide passing checks, `--help` for the rest.
The script is standalone — the user may run it without this skill.

Every check reports what it examined and what it found: `✓` clean · `?` doubt · `▲` exposure
· `✗` breakage. Exit status 1 as soon as there is a `▲` or a `✗`.

## What the audit already knows

No need to redo these by hand — but understand them to interpret the output:

- **empty note** — frontmatter with no body publishes a page whose only visible content is
  its properties table. Notes under `_assets/items/` are deliberately like that and are
  excluded; anywhere else it is a forgotten draft.
- **unseen key / key off-convention** — `note-properties` runs with `includeAll: true`, so
  any key absent from `excludedProperties` becomes a visible row. The baseline is HEAD:
  a key never published is a decision nobody made, and a key missing from its folder's
  neighbours is convention drift. The audit lists the keys that folder uses, by frequency —
  the right answer is nearly always among them.
- **self-reference**, **invalid date**, **unrendered block**
  (`dataview`/`mapview`/`leaflet`/`zoommap` — no Quartz equivalent, shown as raw code).
- **base columns** — `sync-vault.mjs` strips `publish`/`homepage` from base views when
  copying (`BASE_HIDDEN_COLUMNS`). A finding here means that filter regressed, not that the
  vault is wrong.
- **internal links** — a dangling link on the generated homepage is a breakage: every entry
  there is built from a note that exists, so one dead link means the generator is wrong.
  That is how 173 dead links once shipped. Elsewhere a dangling link is only a doubt — a
  published note citing a private or unwritten one renders as plain text, which is expected.

## Also worth a look

The audit does not read the sync report, and two of its signals only appear there. If the
user ran step 2 in this session, re-read its output for:

- `- file (unpublished)` — a page **removed from the site**. Always confirm it is intended.
- *media without a thumbnail* — the Instagram or YouTube post is deleted or private; the
  bare link stays. Expected, worth one line.

## Output contract

Be brief. The user wants to decide, not to read.

1. **One verdict line**: `N notes, M attachments — X to settle` (or `nothing to report`,
   and you stop there).
2. **One table**, one finding per row, breakages first: *what · where · visible effect on
   the site · proposed correction*. State the correction in the vault, never in `content/`.
3. **One grouped question** if choices remain — never one per anomaly. Recommended option
   first.

Do not print the commands you ran, the raw output, or the passing checks. Do not re-run a
check that already passed to "confirm" it.

## Verified pitfalls

- **Slugs cannot be guessed.** `Manuel Casares - Piano` yields `manuel-casares---piano`.
  To name a page, read the emitted filename under `public/`.
- A base only sees `content/`, which holds published notes only: it cannot reveal anything
  private, and a `publish == true` filter in it is redundant.
