#!/usr/bin/env python3
"""Pre-publication checks for the pixelle site.

Runs from anywhere: the script locates the repository root by itself.

  .claude/skills/3-site-check-local/audit.py --help
"""

import argparse
import collections
import glob
import html
import os
import re
import shutil
import subprocess
import sys
import urllib.parse


def die(message):
    """Runtime failure: exit 2, like argparse — distinct from the 1 of findings."""
    print(message, file=sys.stderr)
    raise SystemExit(2)


try:
    import yaml
except ImportError:
    die("PyYAML is missing:  pip install pyyaml   (or apt install python3-yaml)")

DESCRIPTION = """\
Pre-publication checks for the pixelle site.

By default only notes changed since HEAD are examined: that is where fresh
mistakes are. Auditing the whole corpus drowns the signal under pre-existing,
deliberate findings — keep that for a periodic review.
"""

EPILOG = """\
verdicts:
  ok       check passed — what was examined is stated on the right
  info     neutral observation, does not affect the outcome
  doubt    likely a typing mistake — confirm before correcting
  expose   data becomes public without an explicit decision
  broken   the site publishes something wrong or dead

exit status:
  0  nothing to report, or only doubt/info
  1  at least one broken or expose
  2  runtime failure (wrong directory, missing dependency)

examples:
  audit.py                  before committing
  audit.py --built          after `npm run build:ci`, adds the checks on public/
  audit.py --all            full corpus inventory, for a periodic review
  audit.py --since HEAD^    what one commit changed — the form CI uses
  audit.py --quiet          show only what is wrong

Nothing is fixed or modified. content/ is generated, so every correction
belongs in the Obsidian vault.
"""

UNRENDERED = ("dataview", "mapview", "leaflet", "zoommap")

# La nature d'une note : liste fermée, et petite. Elle décrit ce qu'est la
# note, pas de quoi elle parle — la discipline, elle, vit dans `tags`.
CATEGORIES = ("work", "event", "place", "photo")

# Les étiquettes de lieu sont **déduites** par la synchronisation à partir de
# `place:`. Une nouvelle valeur y signale un lieu nouveau, pas une faute de
# frappe : la note de lieu est l'objet à relire, pas l'étiquette.
DERIVED_TAG_ROOTS = ("location/",)

# Clés dont la publication a été décidée une fois pour toutes. Le contrôle de
# nouveauté existe pour qu'aucune clé ne devienne publique par accident ; une
# fois la question posée et tranchée, il n'a plus à la reposer. `parent` relie
# un lieu à celui qui le contient, et sa valeur est un lien : l'afficher est
# précisément ce qu'on veut.
ACKNOWLEDGED_KEYS = ("parent",)

IMAGE_EXTS = (".webp", ".png", ".jpg", ".jpeg", ".avif", ".gif", ".svg", ".bmp")
DOC_EXTS = (".pdf",)

# Une image part avec la page, que le visiteur l'ait demandée ou non ; un
# document ne part que s'il clique. Deux régimes, donc deux seuils — et c'est
# la même distinction qui fait ranger les PDF hors du flux d'images à la
# synchronisation. Au-delà de 2 Mo, une seule image pèse plus que tout le
# reste de la page : c'est une casse, pas une préférence.
IMAGE_DOUBT_BYTES = 500 * 1024
IMAGE_BROKEN_BYTES = 2 * 1024 * 1024

# Comparaison par défaut : l'arbre de travail contre HEAD. `--since REF` la
# déplace sur un commit, seule forme utile en intégration continue, où tout est
# déjà commité et où `git status` ne montrerait donc jamais rien.
SINCE = None

# Notes deliberately reduced to their frontmatter: they exist to be the target
# of a link, not to be read. Do not report them as empty.
STUB_DIRS = ("_assets/items/",)

DATE_KEYS = ("date", "created", "modified", "publishDate")


# ─────────────────────────────────────────────────────────────────────────────
# Rendering
# ─────────────────────────────────────────────────────────────────────────────

RANK = {"ok": 0, "info": 0, "doubt": 1, "expose": 2, "broken": 3}
MARK = {
    "ok": ("✓", "\033[32m"),
    "info": ("·", "\033[2m"),
    "doubt": ("?", "\033[36m"),
    "expose": ("▲", "\033[33m"),
    "broken": ("✗", "\033[31m"),
}


def tinted():
    return sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def paint(text, code):
    return f"{code}{text}\033[0m" if tinted() else text


def width():
    return min(shutil.get_terminal_size((100, 24)).columns, 110)


class Check:
    """One check: what it examines, what it found."""

    def __init__(self, section, label):
        self.section = section
        self.label = label
        self.verdict = ""  # right-hand summary, shown whatever the outcome
        self.entries = []  # (level, detail)

    def add(self, level, detail):
        self.entries.append((level, detail))
        return self

    @property
    def level(self):
        return max((lv for lv, _ in self.entries), key=lambda lv: RANK[lv], default="ok")


class Report:
    def __init__(self):
        self.checks = []
        self.header = []

    def check(self, section, label):
        c = Check(section, label)
        self.checks.append(c)
        return c

    def render(self, quiet):
        cols = width()
        out = []
        out.append(paint("  pixelle audit", "\033[1m"))
        for key, value in self.header:
            out.append(f"  {paint(key.ljust(9), '\033[2m')}{value}")
        out.append("")

        shown = [c for c in self.checks if not (quiet and c.level in ("ok", "info"))]
        pad = max((len(c.label) for c in shown), default=0) + 2

        section = None
        for c in shown:
            if c.section != section:
                if section is not None and out[-1] != "":
                    out.append("")
                section = c.section
                out.append(f"  {paint(section.upper(), '\033[1m')}")
            glyph, color = MARK[c.level]
            out.append(f"   {paint(glyph, color)} {c.label.ljust(pad)}{paint(c.verdict, '\033[2m')}")
            for lv, detail in c.entries:
                word = "·" if lv == "info" else lv
                indent = 8 + len(word)
                for i, line in enumerate(wrap(detail, cols - indent - 4)):
                    head = f"       {paint(word, MARK[lv][1])} " if i == 0 else " " * indent
                    out.append(head + line)
            if c.entries:
                out.append("")

        if shown and out[-1] != "":
            out.append("")
        out.append("  " + "─" * (cols - 4))
        out.append("  " + self.footer())
        return "\n".join(out)

    def counts(self):
        return collections.Counter(chk.level for chk in self.checks)

    def footer(self):
        c = self.counts()
        bits = [f"{len(self.checks)} checks", paint(f"{c['ok'] + c['info']} clean", "\033[32m")]
        for lv, one, many in (
            ("doubt", "doubt", "doubts"),
            ("expose", "exposure", "exposures"),
            ("broken", "breakage", "breakages"),
        ):
            if c[lv]:
                bits.append(paint(f"{c[lv]} {one if c[lv] == 1 else many}", MARK[lv][1]))
        verdict = " · ".join(bits)
        if c["broken"] or c["expose"]:
            return verdict + "\n  → fix in the vault, then run the sync again"
        if c["doubt"]:
            return verdict + "\n  → nothing blocking; confirm the doubts before publishing"
        return verdict + "\n  → ready to publish"


def wrap(text, limit):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    lines.append(cur)
    return lines or [""]


# ─────────────────────────────────────────────────────────────────────────────
# Reading
# ─────────────────────────────────────────────────────────────────────────────


def frontmatter(text):
    """Return (dict, body). Unreadable frontmatter yields (None, body)."""
    m = re.match(r"^---\n(.*?)\n---\n?(.*)\Z", text, re.S)
    if not m:
        return {}, text
    try:
        return (yaml.safe_load(m.group(1)) or {}), m.group(2)
    except Exception:
        return None, m.group(2)


def excluded_properties():
    cfg = yaml.safe_load(open("quartz.config.yaml", encoding="utf8"))
    plug = next(
        p for p in cfg["plugins"] if str(p.get("source", "")).endswith("/note-properties")
    )
    return set(plug["options"].get("excludedProperties") or [])


def changed_paths():
    """Paths under content/ added or modified since the comparison point."""
    if SINCE:
        r = subprocess.run(
            ["git", "diff", "--name-only", "-z", "--diff-filter=d", SINCE, "--", "content"],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            die(f"--since {SINCE}: unknown revision")
        return {e for e in r.stdout.split("\0") if e}
    out = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all", "-z", "--", "content"],
        capture_output=True,
        text=True,
    ).stdout
    return {
        e[3:] for e in out.split("\0") if len(e) > 3 and e[0] != "D" and e[1] != "D"
    }


def read(f):
    return open(f, encoding="utf8").read()


def show_head(path):
    """File contents at the comparison point, or None when absent from it."""
    r = subprocess.run(
        ["git", "show", f"{SINCE or 'HEAD'}:{path}"],
        capture_output=True,
        text=True,
        errors="replace",
    )
    return r.stdout if r.returncode == 0 else None


def human(n):
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} Mo".replace(".", ",")
    return f"{max(1, round(n / 1024))} Ko"


def content_assets():
    """Basenames of every non-markdown file present in content/."""
    return {
        os.path.basename(f).lower()
        for f in glob.glob("content/**/*", recursive=True)
        if os.path.isfile(f) and not f.endswith(".md")
    }


def plural(n, word, plural_form=None):
    return f"{n} {word if n <= 1 else (plural_form or word + 's')}"


# ─────────────────────────────────────────────────────────────────────────────
# Checks on content/
# ─────────────────────────────────────────────────────────────────────────────


def audit_content(rep, scope_all):
    excl = excluded_properties()
    every = sorted(glob.glob("content/**/*.md", recursive=True))

    if not every:
        rep.check("content", "notes present").add("broken", "content/ is empty")
        return

    changed = every if scope_all else sorted(changed_paths() & set(every))
    scope = (
        "whole corpus"
        if scope_all
        else f"{plural(len(changed), 'note changed', 'notes changed')} since {SINCE or 'HEAD'}"
    )
    rep.header.append(("scope", f"{scope}  ({len(every)} notes published in total)"))

    S = "content"
    c_parse = rep.check(S, "frontmatter parses")
    c_flag = rep.check(S, "publish: true flag")
    c_body = rep.check(S, "note body")
    c_block = rep.check(S, "blocks Quartz renders")
    c_self = rep.check(S, "frontmatter links")
    c_date = rep.check(S, "usable dates")
    c_alt = rep.check(S, "texte alternatif")
    c_desc = rep.check(S, "trouvailles décrites")
    c_vocab = rep.check(S, "vocabulaire")
    c_keys = rep.check(S, "publicly exposed keys")

    if not changed:
        for c in (c_parse, c_flag, c_body, c_block, c_self, c_date, c_alt, c_desc, c_vocab, c_keys):
            c.verdict = "not applicable"
        audit_assets(rep)
        audit_bases(rep)
        return

    # Baseline: what is **already published**, that is, the state of HEAD.
    #
    # Unchanged files equal their HEAD version, so they are read from disk. For
    # files in the delta the committed version is required: without it, a key
    # only those notes carried would look brand new although it has been online
    # for months. A note never committed has no HEAD version and contributes
    # nothing — a genuine novelty is still reported.
    baseline = {}
    changed_set = set(changed)

    def absorb(path_in_content, fm):
        folder = path_in_content.split(os.sep)[0]
        for k in fm or {}:
            baseline.setdefault(k, collections.Counter())[folder] += 1

    for f in every:
        if f not in changed_set:
            absorb(os.path.relpath(f, "content"), frontmatter(read(f))[0])
    # Étiquettes déjà en usage au point de comparaison. Même principe que pour
    # les clés : on ne tient pas de liste fermée — qu'il faudrait éditer à
    # chaque nouveau sujet — on signale ce qui n'existait nulle part. Une faute
    # de frappe est détectée le jour où elle paraît ; un sujet vraiment neuf est
    # signalé une fois, puis entre dans la référence au commit suivant.
    tag_baseline = set()
    for f in every:
        source = read(f) if f not in set(changed) else show_head(f)
        if source is None:
            continue
        fm_ref, _ = frontmatter(source)
        for t in (fm_ref or {}).get("tags") or []:
            tag_baseline.add(str(t))

    # Notes déjà publiées au point de comparaison. Sert à distinguer une note
    # neuve d'une note retouchée : on exige d'une nouveauté ce qu'on se contente
    # de signaler sur l'existant.
    already_published = set()
    for f in changed:
        committed = show_head(f)
        if committed is not None:
            already_published.add(f)
            absorb(os.path.relpath(f, "content"), frontmatter(committed)[0])

    n = len(changed)
    stubs = links = dates = embeds = 0
    posts_seen = tags_seen = 0
    descriptions_missing = []
    assets = content_assets()

    for f in changed:
        rel = os.path.relpath(f, "content")
        folder = rel.split(os.sep)[0]
        fm, body = frontmatter(read(f))

        if fm is None:
            c_parse.add("broken", f"{rel} — invalid YAML, the note will not render")
            continue

        # Leftover: explicit-publish would drop the page, leaving a dead link.
        if fm.get("publish") is not True:
            c_flag.add("broken", f"{rel} — without the flag the page becomes a dead link")

        # A note without a body publishes a page whose only visible content is
        # its properties table. Almost always a forgotten draft.
        if not body.strip():
            if rel.startswith(STUB_DIRS):
                stubs += 1
            else:
                c_body.add("doubt", f"{rel} — would publish a page with no content")

        for tag in UNRENDERED:
            if re.search(r"^```\s*" + tag + r"\b", body, re.M):
                c_block.add(
                    "broken", f"{rel} — `{tag}` block shown as raw code on the site"
                )

        # La synchronisation transforme une incorporation d'image en balise
        # `<img>`, seule forme qui porte un `srcset` et des dimensions. L'alias
        # Obsidian y devient l'attribut `alt` : c'est donc lui qu'on contrôle
        # ici, en plus des incorporations restées telles quelles (images sans
        # dimensions lisibles, ou copiées sans optimisation).
        for tag in re.findall(r"<img\b[^>]*>", body):
            if "_assets" not in tag:
                continue
            embeds += 1
            alt = re.search(r'\balt\s*=\s*"([^"]*)"', tag)
            if not alt or not alt.group(1).strip():
                src = re.search(r'\bsrc\s*=\s*"([^"]*)"', tag)
                name = os.path.basename(src.group(1)) if src else "?"
                c_alt.add(
                    "broken",
                    f"{rel} — `{name}` part sans alternative : rien à lire "
                    f"pour qui ne voit pas l'image. Dans le coffre : "
                    f"`![[{name}|description]]`",
                )

        # Obsidian écrit le texte alternatif dans l'alias de l'incorporation,
        # et Quartz le rend en `alt` — sauf quand l'alias est purement
        # numérique (`|300`, `|300x200`), qui désigne des dimensions.
        for inner in re.findall(r"!\[\[([^\]]+?)\]\]", body):
            target = inner.split("|")[0].strip()
            if not target.lower().endswith(IMAGE_EXTS):
                continue
            # Une incorporation qui ne se résout pas est déjà signalée comme
            # lien manquant par la synchronisation : ne pas la compter deux fois.
            if os.path.basename(target).lower() not in assets:
                continue
            embeds += 1
            alt = inner.split("|", 1)[1].strip() if "|" in inner else ""
            if not alt or re.fullmatch(r"\d*x?\d*", alt):
                c_alt.add(
                    "broken",
                    f"{rel} — `{target}` part sans alternative : rien à lire "
                    f"pour qui ne voit pas l'image. Dans le coffre : "
                    f"`![[{target}|description]]`",
                )

        # Une trouvaille est un lien : sans description, la page n'est qu'une
        # vignette, et rien n'y dit pourquoi le lien a été gardé. On l'exige
        # d'un lien qui arrive, on le signale sur un lien déjà en ligne — sans
        # quoi retoucher une vieille note pour une virgule bloquerait la CI.
        # Nature : liste fermée. Discipline : nouveauté signalée.
        for cat in fm.get("category") or []:
            if str(cat) not in CATEGORIES:
                c_vocab.add(
                    "broken",
                    f"{rel} — `category: {cat}` hors vocabulaire ; "
                    f"attendu {' · '.join(CATEGORIES)}",
                )
        for t in fm.get("tags") or []:
            t = str(t)
            tags_seen += 1
            if t.startswith(DERIVED_TAG_ROOTS):
                continue
            if t not in tag_baseline:
                c_vocab.add(
                    "doubt",
                    f"{rel} — `{t}` n'existait sur aucune autre note ; "
                    f"faute de frappe, ou sujet neuf",
                )

        if folder == "posts":
            posts_seen += 1
        if folder == "posts" and not str(fm.get("description") or "").strip():
            descriptions_missing.append(rel)
            if f in already_published:
                c_desc.add(
                    "doubt",
                    f"{rel} — publiée sans description ; la vignette ne dit pas "
                    f"pourquoi le lien vaut d'être gardé",
                )
            else:
                c_desc.add(
                    "broken",
                    f"{rel} — nouveau lien sans `description` : une phrase dans "
                    f"le coffre, et le signet devient une recommandation",
                )

        for k, v in fm.items():
            for target in re.findall(r"\[\[([^\]|#]+)", str(v)):
                links += 1
                if target.strip() == os.path.splitext(os.path.basename(rel))[0]:
                    c_self.add("doubt", f"{rel} — `{k}` points at the note itself")

            if k in DATE_KEYS:
                dates += 1
                # Quartz logs "invalid date" and falls back to the git date.
                if isinstance(v, str) and v.strip().lower() in ("null", "none", "nan"):
                    c_date.add("broken", f"{rel} — `{k}: {v}` will display a wrong date")

            if k in excl or k in ACKNOWLEDGED_KEYS or scope_all:
                continue
            seen = baseline.get(k)
            if seen is None:
                # includeAll: the key becomes a visible row of the table.
                c_keys.add("expose", f"{rel} — `{k}` existed nowhere else")
            elif folder not in seen:
                # Sort by frequency within that folder: the key the neighbouring
                # notes use is nearly always the one that was meant.
                siblings = sorted(
                    (
                        (folders[folder], key)
                        for key, folders in baseline.items()
                        if folders.get(folder) and key not in excl
                    ),
                    reverse=True,
                )
                usual = ", ".join(f"{key}×{cnt}" for cnt, key in siblings[:5])
                c_keys.add(
                    "doubt",
                    f"{rel} — `{k}` comes from {'/, '.join(sorted(seen))}/ ; "
                    f"{folder}/ rather uses {usual or 'no other key'}",
                )

    def verdict(check, examined, clean, faulty):
        """What was examined, then what was found there — never the reverse."""
        k = len(check.entries)
        check.verdict = f"{examined} — {clean}" if not k else f"{examined} — {faulty(k)}"

    verdict(c_parse, plural(n, "note analysed", "notes analysed"),
            "all readable", lambda k: plural(k, "unreadable"))
    verdict(c_flag, f"{n} examined",
            "all flagged", lambda k: f"{k} without the flag")
    tolerated = (
        f", {plural(stubs, 'stub tolerated', 'stubs tolerated')} under {' '.join(STUB_DIRS)}"
        if stubs
        else ""
    )
    verdict(c_body, f"{n} examined{tolerated}",
            "all have content", lambda k: plural(k, "empty note", "empty notes"))
    verdict(c_block, "/".join(UNRENDERED),
            "no block of this kind", lambda k: f"{plural(k, 'block')} as raw code")
    verdict(c_self, plural(links, "link examined", "links examined"),
            "no self-reference", lambda k: f"{plural(k, 'self-reference')}")
    verdict(c_date, plural(dates, "date examined", "dates examined"),
            "all usable", lambda k: plural(k, "invalid"))
    verdict(c_alt, plural(embeds, "image incorporée", "images incorporées"),
            "toutes décrites", lambda k: plural(k, "sans alternative"))
    verdict(c_desc, plural(posts_seen, "trouvaille examinée", "trouvailles examinées"),
            "toutes décrites", lambda k: plural(k, "sans description", "sans description"))
    verdict(c_vocab, plural(tags_seen, "étiquette examinée", "étiquettes examinées"),
            "toutes connues", lambda k: plural(k, "hors vocabulaire", "hors vocabulaire"))

    if scope_all:
        audit_keys_corpus(rep, c_keys, every, excl)
    else:
        visible = {k for k in baseline if k not in excl}
        found = collections.Counter(lv for lv, _ in c_keys.entries)
        trouble = ", ".join(
            plural(found[lv], one, many)
            for lv, one, many in (
                ("expose", "unseen key", "unseen keys"),
                ("doubt", "off-convention", "off-convention"),
            )
            if found[lv]
        )
        c_keys.verdict = (
            f"{len(visible)} keys already public (includeAll) — "
            + (trouble or "nothing new")
        )

    audit_assets(rep)
    audit_bases(rep)


def audit_keys_corpus(rep, check, every, excl):
    """Over the whole corpus novelty is meaningless: take an inventory instead."""
    inventory = {}
    for f in every:
        fm, _ = frontmatter(read(f))
        for k in fm or {}:
            if k not in excl:
                inventory.setdefault(k, []).append(os.path.relpath(f, "content"))
    rare = sum(1 for holders in inventory.values() if len(holders) <= 2)
    check.verdict = f"{len(inventory)} visible keys — " + (
        plural(rare, "rare key", "rare keys") if rare else "no rare key"
    )
    check.add(
        "info",
        "inventory: " + ", ".join(f"{k}×{len(v)}" for k, v in sorted(inventory.items())),
    )
    for k, holders in sorted(inventory.items()):
        if len(holders) <= 2:
            check.add("expose", f"`{k}` — rare key, on {', '.join(holders)}")


def audit_assets(rep):
    """Poids de ce que content/ fait charger.

    Hors périmètre du diff, volontairement : le poids d'une page est un fait
    du site entier, pas d'une modification. Une image trop lourde publiée il y
    a six mois pèse aujourd'hui autant qu'une image ajoutée ce matin.
    """
    S = "content"
    c_img = rep.check(S, "poids des images")
    c_doc = rep.check(S, "documents liés")

    files = [f for f in glob.glob("content/**/*", recursive=True) if os.path.isfile(f)]
    images = sorted(
        ((os.path.getsize(f), f) for f in files if f.lower().endswith(IMAGE_EXTS)),
        reverse=True,
    )
    docs = sorted(
        ((os.path.getsize(f), f) for f in files if f.lower().endswith(DOC_EXTS)),
        reverse=True,
    )

    total = sum(size for size, _ in images)
    for size, f in images:
        rel = os.path.relpath(f, "content")
        if size > IMAGE_BROKEN_BYTES:
            c_img.add(
                "broken",
                f"{rel} — {human(size)} chargés avec la page ; "
                f"la synchronisation aurait dû la ré-encoder (OPTIMISE_IMAGES)",
            )
        elif size > IMAGE_DOUBT_BYTES:
            c_img.add(
                "doubt",
                f"{rel} — {human(size)}, au-dessus de {human(IMAGE_DOUBT_BYTES)} ; "
                f"acceptable pour une photo de détail, à surveiller",
            )
    c_img.verdict = f"{plural(len(images), 'image')}, {human(total)} au total — " + (
        f"{plural(len(c_img.entries), 'au-dessus du seuil', 'au-dessus du seuil')}"
        if c_img.entries
        else f"toutes sous {human(IMAGE_DOUBT_BYTES)}"
    )

    # Les documents ne sont pas pesés : ils ne partent qu'au clic. Ce qui se
    # vérifie, c'est qu'aucun n'est resté sur le chemin des images — d'où il
    # serait incorporé, donc chargé avec la page.
    stray = [os.path.relpath(f, "content") for _, f in docs if "_assets/docs/" not in f]
    c_doc.verdict = (
        f"{plural(len(docs), 'document')}, {human(sum(s for s, _ in docs))} — "
        + ("hors du flux d'images" if not stray else f"{plural(len(stray), 'mal rangé')}")
    )
    for rel in stray:
        c_doc.add(
            "doubt",
            f"{rel} — hors de _assets/docs/ ; s'il est incorporé quelque part, "
            f"il se télécharge au chargement de la page",
        )


def audit_bases(rep):
    """Guard on the base transformation performed by sync-vault.mjs."""
    check = rep.check("content", "base columns")
    files = sorted(glob.glob("content/**/*.base", recursive=True))
    check.verdict = f"{plural(len(files), 'base copied', 'bases copied')} into content/"
    for f in files:
        rel = os.path.relpath(f, "content")
        try:
            doc = yaml.safe_load(read(f)) or {}
        except Exception:
            check.add("doubt", f"{rel} — unreadable YAML, columns not verifiable")
            continue
        for view in doc.get("views") or []:
            for col in view.get("order") or []:
                if str(col).split(".")[-1] in ("publish", "homepage"):
                    check.add(
                        "expose",
                        f"{rel} — view \"{view.get('name')}\" shows `{col}`; "
                        f"sync-vault.mjs should have stripped it (BASE_HIDDEN_COLUMNS)",
                    )


# ─────────────────────────────────────────────────────────────────────────────
# Checks on public/
# ─────────────────────────────────────────────────────────────────────────────

RELATIVE_HREF = re.compile(r'<a[^>]+href="((?:\./|\.\./)[^"#?]+)"')

# Ressources chargées par le navigateur sans que le visiteur ait rien demandé.
# Un `<a href>` vers l'extérieur n'en fait pas partie : c'est un lien, il attend
# un clic. Tout le reste — script, feuille de style, image, cadre, police,
# `preconnect` — part à l'ouverture de la page et livre l'adresse IP du lecteur
# à qui la sert.
LOADED_RESOURCE = re.compile(
    r"""<(?:script|img|iframe|video|audio|source|embed|object)\b[^>]*?\b(?:src|data)\s*=\s*["'](https?://[^"']+)["']"""
    r"""|<link\b[^>]*?\bhref\s*=\s*["'](https?://[^"']+)["']"""
    r"""|@import\s+(?:url\()?["'](https?://[^"']+)["']""",
    re.I,
)


def resolves(page, href):
    """Does a relative href from `page` land on something Quartz emitted?"""
    target = os.path.normpath(
        os.path.join(os.path.dirname(page), urllib.parse.unquote(href))
    )
    return (
        os.path.exists(target + ".html")
        or os.path.exists(target)
        or os.path.exists(os.path.join(target, "index.html"))
    )


def site_host():
    """Hôte du site, lu dans `baseUrl` — le seul qui ne soit pas un tiers."""
    try:
        cfg = yaml.safe_load(open("quartz.config.yaml", encoding="utf8"))
        return str(cfg["configuration"]["baseUrl"]).split("/")[0].lower()
    except Exception:
        return ""


def audit_built(rep):
    S = "built output"
    SITE_HOST = site_host()
    pages = sorted(glob.glob("public/**/*.html", recursive=True))
    if not pages:
        rep.check(S, "public/ present").add(
            "broken", "no page — run `npm run build:ci` first"
        )
        return

    c_raw = rep.check(S, "unrendered blocks")
    c_base = rep.check(S, "bases populated")
    c_link = rep.check(S, "internal links resolve")
    c_third = rep.check(S, "aucune requête tierce")
    third = {}  # hôte -> pages

    embeds, empty = 0, []
    total_links = 0
    dangling = []
    home_dangling = []

    for f in pages:
        s = read(f)
        rel = os.path.relpath(f, "public")

        for tag in UNRENDERED:
            if f'data-language="{tag}"' in s:
                c_raw.add("broken", f"{rel} — `{tag}` block in the published HTML")

        for groups in LOADED_RESOURCE.findall(s):
            url = next(u for u in groups if u)
            host = urllib.parse.urlparse(url).netloc.lower()
            if not host or host == SITE_HOST:
                continue
            third.setdefault(host, []).append(rel)

        for href in RELATIVE_HREF.findall(s):
            total_links += 1
            if not resolves(f, href):
                dangling.append((rel, href))
                if rel == "index.html":
                    home_dangling.append(href)

        if "bases-inline" not in s:
            continue
        embeds += 1
        # Trust the plugin's own count: the `bases-empty` class also marks the
        # empty *cells* of a table, by the dozen.
        for meta in re.findall(r'class="bases-view-meta"[^>]*>([^<]*)<', s):
            if re.match(r"^Showing 0 of 0\b", html.unescape(meta).strip()):
                empty.append(rel)

    # `analytics: null`, les polices rapatriées à la construction et les
    # vignettes vidéo bâties pour ne rien contacter avant le clic ne valent que
    # tant que rien ne les contredit ailleurs. Le greffon `latex` chargeait KaTeX
    # depuis un CDN sur les 384 pages, sans qu'aucune note n'en ait besoin :
    # personne ne l'a vu pendant des mois. D'où ce contrôle.
    c_third.verdict = f"{plural(len(pages), 'page inspected', 'pages inspected')} — " + (
        "aucune ressource extérieure" if not third else f"{plural(len(third), 'hôte tiers', 'hôtes tiers')}"
    )
    for host, where in sorted(third.items(), key=lambda kv: -len(kv[1])):
        c_third.add(
            "broken",
            f"`{host}` chargé par {plural(len(where), 'page')} — p. ex. {where[0]}. "
            f"Le site promet de ne contacter personne : servir la ressource "
            f"depuis le site, ou s'en passer.",
        )

    c_raw.verdict = f"{plural(len(pages), 'page inspected', 'pages inspected')} — " + (
        plural(len(c_raw.entries), "raw block") if c_raw.entries else "output clean"
    )

    c_base.verdict = (
        f"{plural(embeds, 'page embeds a base', 'pages embed a base')} — "
        + (plural(len(set(empty)), "empty view") if empty else "all populated")
    )
    for rel in sorted(set(empty)):
        c_base.add(
            "doubt",
            f"{rel} — a view is empty; legitimate when no note matches, "
            f"otherwise a mistyped frontmatter field",
        )

    # A dangling link elsewhere is usually a published note citing a private or
    # unwritten one — the sync reports those and they render as plain text. On
    # the generated homepage nothing is expected to dangle: every entry there is
    # built from a note that was just written, so one broken link means the
    # generator itself is wrong. That is exactly how 173 dead links once shipped.
    c_link.verdict = f"{total_links} relative links — " + (
        f"{len(dangling)} without a target" if dangling else "all resolve"
    )
    if home_dangling:
        c_link.add(
            "broken",
            f"index.html — {plural(len(home_dangling), 'entry points', 'entries point')} "
            f"nowhere, e.g. {', '.join(home_dangling[:3])}",
        )
    others = [(p, h) for p, h in dangling if p != "index.html"]
    if others:
        shown = ", ".join(f"{h} ({p})" for p, h in others[:4])
        c_link.add(
            "doubt",
            f"{plural(len(others), 'link')} to a note that is private or not yet "
            f"written — expected, rendered as plain text: {shown}",
        )


# ─────────────────────────────────────────────────────────────────────────────


def find_root():
    """Repository root: the directory holding quartz.config.yaml and content/.

    Searched above the script first (the normal case, it lives in .claude/),
    then above the current directory — so a copy of the script also works.
    """
    for start in (os.path.dirname(os.path.abspath(__file__)), os.getcwd()):
        d = start
        while True:
            if os.path.isfile(os.path.join(d, "quartz.config.yaml")) and os.path.isdir(
                os.path.join(d, "content")
            ):
                return d
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    return None


def main():
    parser = argparse.ArgumentParser(
        prog="audit.py",
        description=DESCRIPTION,
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="examine the whole corpus instead of only changed notes",
    )
    parser.add_argument(
        "--built",
        action="store_true",
        help="add the checks on public/ (requires a recent `npm run build:ci`)",
    )
    parser.add_argument(
        "--since",
        metavar="REF",
        help="compare against a commit instead of the working tree (CI: HEAD^)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="hide passing checks, show only what is wrong",
    )
    args = parser.parse_args()

    global SINCE
    SINCE = args.since

    root = find_root()
    if root is None:
        die(
            "pixelle repository root not found (neither quartz.config.yaml nor content/).\n"
            "Run the script from inside the repository, or leave it in .claude/skills/."
        )
    os.chdir(root)

    rep = Report()
    rep.header.append(("root", root))
    audit_content(rep, args.all)
    if args.built:
        audit_built(rep)

    print(rep.render(args.quiet))
    c = rep.counts()
    return 1 if c["broken"] or c["expose"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
