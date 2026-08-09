---
name: 1-vault-add-chant
description: "Step 1 of the pixelle workflow (optional): process one book of the Odyssey end to end inside the petersVault Obsidian vault — characters, places, events, the song summary note, previous/next chaining, and a vault commit. Use as soon as the user asks to add or process a book (e.g. \"Ajoute le chant 2\", \"add book III\")."
argument-hint: "<book number, e.g. 2>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
---

You add **book $ARGUMENTS** of Homer's Odyssey to the Obsidian vault's knowledge base.
`$ARGUMENTS` is the book number (1–24). The French word for a book of the Odyssey is
*chant*, and the vault uses it throughout — keep writing note content in French.

You work **in the vault only**. Checking, previewing and publishing the site are steps 2
to 4 of the workflow and have their own skills; see §8.

## 0. Context — this skill runs from pixelle, not from the vault

The current directory is the **pixelle** repository; the content to write lives in a
**different** directory, the Obsidian vault. Two consequences, to settle before writing:

- **Resolve the vault path**:
  ```bash
  VAULT="${VAULT_PATH:-/home/ipro0800/Documents/data/obsidian/petersVault}"
  ```
  (same convention as `scripts/sync-vault.mjs`). Every note path below is **relative to the
  vault**: write them prefixed with `$VAULT/`. Never create an Odyssey note in `content/` —
  that directory is **generated** by `npm run sync` and any direct write there is
  overwritten or deleted.
- **The vault has two roots**: `public/` (publishable) and `private/`. The Odyssey lives
  under `$VAULT/public/odyssée/`. A note written outside `public/` is never published,
  `publish` flag or not. Mind the name clash: the `public/` of the **pixelle repository**
  is Quartz's build output, unrelated.
- **Watch for homonyms** when creating a note: two files sharing a name make short
  wikilinks ambiguous, and Obsidian may link the wrong one. Before creating `X.md`, check
  that no other `X.md` exists (`find "$VAULT" -name "X.md"`).
- **Read `reference.md` (in this skill's directory) first.** It is the normative reference:
  note conventions, YAML schemas and cardinality, the `song` type, factions, the
  anti-spoiler policy, mapping, and the vault's current state and constraints. Without it
  you are working blind. It is not loaded automatically — open it explicitly.
- Any git command aimed at the vault is written `git -C "$VAULT" …`.

Proceed **step by step**, in order. Never invent a fact: if unsure about the book's
content, check it (WebSearch/WebFetch on a translation of the Odyssey) or ask, rather than
extrapolating.

## 1. Guard rails
- `NN` = the **zero-padded** number (book 2 → `02`, book 12 → `12`). Song note title:
  `Chant NN`.
- If the requested book is not the **logical next one** (last existing `Chant` + 1), tell
  the user and wait for confirmation (the vault is built at reading pace).
- Obsidian may be open: write normally. Never touch `$VAULT/.obsidian/` (hidden config),
  not to be confused with `$VAULT/_obsidian/` (editable content).

## 2. Preparation — read before writing
1. Re-read the fileClasses `$VAULT/_obsidian/_metadata/odyssey-*.md`.
2. List what exists: `$VAULT/public/odyssée/Personnages`, `Lieux`, `Événements`, `Chants`,
   `Factions`.
3. Draw up the entities of book $ARGUMENTS (characters, places, major events) from the text.

The template `$VAULT/_obsidian/_templates/odyssey song.md` is current: it mirrors the
structure of §5 (`## Résumé`, then `## Événements` fed by `![[chantEvents.base]]`). It does
**not** carry `publish: true` — adding it is on you, as §4 recalls.

`odyssey faction.md` is current too (`## Membres` fed by `![[factionMembers.base]]`), as are
the Odyssey `character`, `place` and `event` templates, which never contained a block.

No vault template still contains a construct Quartz cannot render (fenced or inline
Dataview, mapview, leaflet): starting from one of them is safe.

## 3. Update what exists (rather than recreate)
- For every existing entity that reappears: add « Chant $ARGUMENTS » to its
  `## Apparitions (chants)` section, and fill the YAML fields that become known **in this
  book** (anti-spoiler policy applies). This includes `faction` for a Trojan War veteran who
  finally appears (e.g. Nestor, Ménélas → `"[[Achéens]]"`).

## 4. Create the new entities (fileClasses)
Every Odyssey note carries **`publish: true`** in frontmatter (all 53 existing ones do;
without the flag the note never reaches the site).

- **Characters** (`type: character`, tag `odyssey/character`): `nature` in **English**
  (`mortal`/`god`/`nymph`/`monster`); relations as quoted wikilinks. **MultiFile** fields
  (`consort`, `children`, `patron_of`) as **lists** even with one element
  (`children: ["[[X]]"]`); File fields (`father`, `mother`, `spouse`, `killed_by`, `home`,
  `faction`) as a scalar wikilink.
  - **`faction`** (Trojan War side): `"[[Achéens]]"` or `"[[Troyens]]"` for a
    veteran/ally — **mortals AND gods** (Athéna/Poséidon = Achéens; Apollon/Aphrodite/Arès =
    Troyens; Zeus neutral = empty); **empty** for anyone who did not fight (suitors,
    servants, Télémaque…). Distinct from `home` (the city). **Not a spoiler.** Reuse
    `Factions/Achéens` and `Factions/Troyens`; create a new one only if an unseen side
    appears (with its `leader`).
- **Places** (`type: place`, tag `odyssey/place`): `nature` (`real`/`mythical`/`uncertain`).
  A **real** place → `location: "lat,lng"`; a **mythical** one → `location: ""`.
- **Events** (`type: event`, tag `odyssey/event`): one note per major scene; `location` =
  the place's wikilink, `participants` = a **list**, and `song: "[[Chant NN]]"`. That `song`
  field is not decorative: it is what feeds the "Événements" list of the song note on the
  site (base `chantEvents.base`). An event without a correct `song` appears nowhere. **Minor**
  deaths are recorded through the character's `killed_by`, with no dedicated note.
- **Anti-spoiler**: record a fact only if it is told or recalled in a book already read
  (≤ $ARGUMENTS).

## 5. The song summary note
Create `$VAULT/public/odyssée/Chants/Chant NN.md` with **exactly** this structure:

```markdown
---
publish: true
type: song
number: <N>
tags: [odyssey/song]
characters: ["[[…]]", "[[…]]"]
places: ["[[…]]"]
previous: "[[Chant (N-1 zero-padded)]]"
next:
created: <YYYY-MM-DD>
modified: <YYYY-MM-DD>
---

## Résumé

<3–5 sentences, in French>

## Événements

![[chantEvents.base]]
```

- `characters` / `places` = **lists of wikilinks** covering **every** entity mentioned in
  the book. They are displayed automatically on the site (properties table): do **not** add
  `## Personnages` / `## Lieux` sections in the body, that would duplicate them.
- `next:` stays **empty**; **chain the reading** by setting `next: "[[Chant NN]]"` on the
  previous book's note.
- Do **not** add a `## Carte` section: Quartz does not render `mapview` blocks.

## 6. Check (vault side)
- No field outside the schema; wikilinks quoted; MultiFile as lists; `song` a real wikilink
  to `Chant NN`; `publish: true` everywhere; `nature`/`type`/`tags` in English, the rest in
  French.
- No ` ```dataview `, ` ```mapview `, ` ```leaflet ` or ` ```zoommap ` block in the notes you
  created: Quartz does not render them, they would show as raw code on the site.

## 7. Commit the vault
```bash
git -C "$VAULT" add public/odyssée/
git -C "$VAULT" commit -m "Chant $ARGUMENTS : personnages, lieux, événements"
```
Plain commits only — no rebase, no force (the vault is also synced by Obsidian Sync).

## 8. Hand over to the rest of the workflow

Stop here. Do **not** sync, build or push from this skill — three skills already own that,
and duplicating them is how the two diverge:

| Next | Skill |
| --- | --- |
| Build locally and look at it | `2-site-construct-locally` |
| Audit the built site | `3-site-check-local` |
| Commit and publish | `4-site-commit-and-publish` |

Tell the user the vault is ready and name those steps. One thing worth checking during the
local preview: on `odyssée/chants/chant-NN`, the "Événements" list must contain this book's
events — it is rendered at build time, not in the browser, so an empty list means a `song`
field that does not resolve.

## 9. Report
Summarise what was created or updated (counts of characters, places, events; the song note;
the chaining), flag unresolved links, and **ask the user to check the result** in Obsidian
(graph view) — and on the local site once step 2 has run.
