# Odyssey knowledge base — reference

Normative reference for the Odyssey notes in the `petersVault` vault. Supersedes the
`CLAUDE.md` that used to live at the vault root, made redundant once the `add-chant`
skill moved here.

Note **content stays in French** — titles, bodies, proper nouns. Only this reference and
the controlled vocabularies are in English.

The main value of this base is the **graph view**: relations are encoded as wikilinks in
the YAML frontmatter, not in note bodies.

## Location

Everything lives under `$VAULT/public/odyssée/`:

```
Personnages/   # type character      Chants/     # type song, "Chant 01"…"Chant 24"
Lieux/         # type place          Factions/   # type faction (Achéens, Troyens)
Événements/    # type event
Carte de l'Odyssée.md     Itinéraire d'Ulysse.md
```

Outside the publication root: `_obsidian/_metadata/` (Metadata Menu fileClasses),
`_obsidian/_templates/` (`odyssey *.md` templates), `_obsidian/_bases/` (embedded bases).

⚠️ **Homonyms.** Two files sharing a name make short wikilinks ambiguous, and Obsidian may
link the wrong one — silently, including by rewriting links when a folder is moved. It has
happened: an empty `_inbound/Zeus.md` captured six `[[Zeus]]` links from the Odyssey.
Before creating a note, check no homonym exists elsewhere: `find "$VAULT" -name "X.md"`.

## Note conventions

- **Language: French** for bodies, event titles and proper nouns (French spelling: Ulysse,
  Télémaque, Pénélope, Ithaque). **Exception: the controlled-vocabulary values of `nature`
  are in English**, matching the fileClasses' `valuesList`.
- Every note carries a `type` (`character` / `place` / `event` / `song` / `faction`) **AND**
  the matching tag (`odyssey/character`…). The redundancy is deliberate: tags drive the
  graph's colour groups, `type` drives the Bases filters. Never drop either.
- Every Odyssey note carries `publish: true`: without the flag it stays invisible to the
  site, even under `public/`.
- Relations are **wikilinks inside the YAML**:
  - characters: `father`, `mother`, `spouse`, `consort` (non-marital unions), `children`,
    `killed_by`, `patron_of` (gods), `home`, `faction`
  - places: `ruler`, `nature`, `location` (`"lat,lng"`, empty for mythical places)
  - events: `location`, `participants`, `song` (`"[[Chant NN]]"`)
  - songs: `number` (1–24), `characters`, `places`, `previous`, `next`
  - factions: `leader`
- Character `nature`: `mortal` / `god` / `nymph` / `monster`. Place `nature`:
  `real` / `mythical` / `uncertain`.
- **Cardinality** follows the Metadata Menu type: `File` fields take a scalar wikilink
  (`father`, `mother`, `spouse`, `killed_by`, `home`, `faction`, `ruler`, `location`,
  `song`, `previous`, `next`, `leader`); `MultiFile` fields take a **list** (`consort`,
  `children`, `patron_of`, `participants`, `characters`, `places`), even with a single
  element: `children: ["[[Télémaque]]"]`.
- The exact schemas live in `$VAULT/_obsidian/_metadata/odyssey-*.md` (bound by tag through
  `mapWithTag`). **Read them before creating or modifying notes**; do not invent fields
  outside the schema without asking.
- **Note bodies**: `## Rôle` + `## Apparitions (chants)` for characters, `## Description`
  for places, `## Résumé` for events. For a song: `## Résumé` then `## Événements` fed by
  `![[chantEvents.base]]`. Stay concise (2–4 sentences per section).
- **Unresolved links are intended**: a character mentioned but not yet met stays a grey node
  in the graph (a creation queue). Do not create an empty note just to resolve a link.

## The `song` type

- One note per book, zero-padded title `Chant NN` so sorting works. It **summarises** the
  book and acts as a **graph hub**.
- The `song` field of **events** points at it: the song↔event edges come for free, with no
  duplicated field. That field — not the outgoing links — is also what feeds
  `chantEvents.base` on the site.
- Characters and places are listed as outgoing links from the song note (`characters`,
  `places`). They appear automatically in the properties table: **no** `## Personnages` /
  `## Lieux` sections in the body.
- `previous` / `next` chain the books: reading progress becomes a visible spine in the graph.

## Factions (the Trojan War)

- Hub notes `Achéens` and `Troyens`, each with a `leader` (Agamemnon; Hector) and its
  members through `![[factionMembers.base]]` — a base filtered on the characters' `faction`
  property, not on outgoing links.
- Characters (`mortal` **and** `god`) carry `faction` = their **side at Troy**. To be
  **distinguished from `home`** (the city): a king allied with the Greeks is
  `faction: [[Achéens]]` **and** `home: [[his city]]`. The side includes allies.
- **Not a spoiler**: the war precedes the Odyssey. The field is **empty** for anyone who did
  not fight (suitors, servants, Télémaque, Pénélope, Laërte…).
- **Gods**: `faction` is the Iliadic side, distinct from their role in the Odyssey. Poséidon
  is `faction: [[Achéens]]` (pro-Greek at Troy) yet Ulysses' enemy; Zeus stays neutral.
  `faction` and `patron_of` coexist without contradiction.

## Anti-spoiler policy

The base is built **at reading pace**. Record a fact (especially `killed_by`) only if it is
told or recalled in a book already processed. Example: `Égisthe → killed_by → Oreste` is
legitimate from book I onward (Zeus's account); the suitors' deaths wait for book XXII. In
`## Apparitions`, list only books already read. A song note lists only the entities of the
book read, and its `next` stays empty until the following one is processed.

## Mapping

Real places carry `location: "lat,lng"`, read by the **Map View** plugin. The field is
dual-purpose — coordinates on `place` notes, a wikilink to a place on `event` notes —
without consequence (Map View ignores non-coordinate values).

⚠️ **` ```mapview ` and ` ```leaflet ` blocks were removed from published notes**: Quartz
does not render them and published them as raw code. They remain usable on **unpublished**
notes — but every Odyssey note carries `publish: true`, so in practice: do not add any.
Maps are consulted in Obsidian through the plugin's views, not through embedded blocks.

Roadmap:

1. ✅ Map View enabled, coordinates on real places.
2. ✅ Dedicated marker `tag:#odyssey/place` → purple pin. ⚠️ These rules live in the
   plugin's **`displayRules`** key (not `markerIconRules`); **always go through the UI**,
   never hand-edit `data.json` — a direct edit once wiped the blog's `#trip`/`#dogs` rules.
3. 🚧 **Itinéraire d'Ulysse** (Leaflet, image map over ancient Greece). Groundwork laid,
   block removed from the site. Markers are placed **by clicking on the map** (image
   coordinates in pixels/CRS, never written by hand). Left to do: mythical stops linked to
   their notes, the route as polylines, real/mythical differentiation. To be filled in at
   books IX–XII.
4. Cross-cuts: "places introduced in book N", *mentioned* vs *visited*, GeoJSON.

## Current state

- **Books I to III processed**, chained with `previous`/`next`.
- Factions created; `faction` filled for Ulysse, Agamemnon, Athéna, Poséidon, Nestor,
  Ménélas, Antiloque (`[[Achéens]]`), empty elsewhere. No published character carries
  `[[Troyens]]` — the Trojan members base is therefore empty, which is expected as long as
  Hector does not exist.
- Metadata Menu working (known trap: `Select` requires `sourceType: ValuesList`).
- Graph views saved through Bookmarks; colour group `odyssey/song` (gold).
- 🐛 **Outstanding**: the Leaflet map returned "there was an issue getting the image
  dimensions". Main lead: the accent in the path
  (`public/odyssée/_obsidian/assets/ancient-greece.jpg`) — a test background at an
  accent-free path worked. To try: full path in `image:`, restart Obsidian, then move to an
  accent-free path.
- 🔜 Group the Odyssey config (fileClasses, templates) under `public/odyssée/`, like the map
  background. Careful: that would move files referenced by plugin settings.

## Vault technical constraints

- `.obsidian/` (hidden) is the real Obsidian config: **never touch it** unless explicitly
  asked. Not to be confused with `_obsidian/` (not hidden), which is **editable content**.
- The linter (`lintOnFileChange`) reformats notes on every change: a note may differ from
  what was just written (capitalised headings, dash spacing, the `modified` date). This is
  normal.
- ⚠️ *Paste image rename* could rename every **new** file in the vault (setting
  `handleAllAttachments`) to `YYYY-MM-DD-<active note>` and break writes while Obsidian is
  open. The setting is now off; should it come back, close Obsidian or write in place
  without a rename (`cp source dest`).
- YAML: spaces only, never tabs; wikilinks quoted (`"[[Ulysse]]"`).
- The vault is also synced by **Obsidian Sync**: plain commits only, no rebase, no force
  push.
