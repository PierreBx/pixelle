#!/usr/bin/env python3
"""Contrôles avant publication du site pixelle.

Se lance de n'importe où : le script retrouve la racine du dépôt tout seul.

  .claude/skills/verifier-publication/audit.py --help
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


def die(message):
    """Erreur d'exécution : code 2, comme argparse — distinct du 1 des constats."""
    print(message, file=sys.stderr)
    raise SystemExit(2)


try:
    import yaml
except ImportError:
    die("Il manque PyYAML :  pip install pyyaml   (ou apt install python3-yaml)")

DESCRIPTION = """\
Contrôles avant publication du site pixelle.

Par défaut, n'examine que les notes modifiées depuis HEAD : c'est là que sont
les erreurs fraîches. Un audit du corpus entier noie le signal sous des constats
préexistants et assumés — le réserver à une revue périodique.
"""

EPILOG = """\
verdicts :
  ok       contrôle passé — ce qui a été examiné est indiqué à droite
  info     observation neutre, ne pèse pas sur le résultat
  doute    probable erreur de saisie — à confirmer avant de corriger
  expose   une donnée devient publique sans décision explicite
  casse    le site publie quelque chose de faux ou de mort

code de sortie :
  0  rien à signaler, ou seulement des doute/info
  1  au moins un casse ou un expose
  2  erreur d'exécution (mauvais dossier, dépendance manquante)

exemples :
  audit.py                  avant de commiter
  audit.py --built          après `npm run build:ci`, ajoute les contrôles sur public/
  audit.py --all            inventaire complet du corpus, pour une revue périodique
  audit.py --quiet          ne montrer que ce qui cloche

Rien n'est corrigé ni modifié. content/ étant généré, toute correction se fait
dans le coffre Obsidian.
"""

UNRENDERED = ("dataview", "mapview", "leaflet", "zoommap")

# Fiches volontairement réduites à leur frontmatter : elles existent pour être
# la cible d'un lien, pas pour être lues. Ne pas les signaler comme vides.
STUB_DIRS = ("_assets/items/",)

DATE_KEYS = ("date", "created", "modified", "publishDate")


# ─────────────────────────────────────────────────────────────────────────────
# Restitution
# ─────────────────────────────────────────────────────────────────────────────

RANK = {"ok": 0, "info": 0, "doute": 1, "expose": 2, "casse": 3}
MARK = {
    "ok": ("✓", "\033[32m"),
    "info": ("·", "\033[2m"),
    "doute": ("?", "\033[36m"),
    "expose": ("▲", "\033[33m"),
    "casse": ("✗", "\033[31m"),
}


def tinted():
    return sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def paint(text, code):
    return f"{code}{text}\033[0m" if tinted() else text


def width():
    return min(shutil.get_terminal_size((100, 24)).columns, 110)


class Check:
    """Un contrôle : ce qu'il examine, ce qu'il a trouvé."""

    def __init__(self, section, label):
        self.section = section
        self.label = label
        self.verdict = ""  # résumé de droite, affiché quel que soit le résultat
        self.entries = []  # (niveau, détail)

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
        out.append(paint("  audit pixelle", "\033[1m"))
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
        c = collections.Counter(chk.level for chk in self.checks)
        return c

    def footer(self):
        c = self.counts()
        bits = [f"{len(self.checks)} contrôles", paint(f"{c['ok'] + c['info']} conformes", "\033[32m")]
        for lv, one, many in (
            ("doute", "doute", "doutes"),
            ("expose", "exposition", "expositions"),
            ("casse", "anomalie", "anomalies"),
        ):
            if c[lv]:
                bits.append(paint(f"{c[lv]} {one if c[lv] == 1 else many}", MARK[lv][1]))
        verdict = " · ".join(bits)
        if c["casse"] or c["expose"]:
            return verdict + "\n  → corriger dans le coffre, puis relancer la synchronisation"
        if c["doute"]:
            return verdict + "\n  → rien ne bloque ; confirmer les doutes avant de publier"
        return verdict + "\n  → publiable"


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
# Lecture
# ─────────────────────────────────────────────────────────────────────────────


def frontmatter(text):
    """Renvoie (dict, corps). Un frontmatter illisible donne (None, corps)."""
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
    """Chemins de content/ modifiés ou ajoutés depuis HEAD."""
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


def plural(n, word, plural_form=None):
    return f"{n} {word if n <= 1 else (plural_form or word + 's')}"


# ─────────────────────────────────────────────────────────────────────────────
# Contrôles sur content/
# ─────────────────────────────────────────────────────────────────────────────


def audit_content(rep, scope_all):
    excl = excluded_properties()
    every = sorted(glob.glob("content/**/*.md", recursive=True))

    if not every:
        rep.check("contenu", "présence de notes").add("casse", "content/ est vide")
        return

    changed = every if scope_all else sorted(changed_paths() & set(every))
    scope = (
        "corpus entier"
        if scope_all
        else f"{plural(len(changed), 'note modifiée', 'notes modifiées')} depuis HEAD"
    )
    rep.header.append(("portée", f"{scope}  ({len(every)} notes publiées au total)"))

    S = "contenu"
    c_parse = rep.check(S, "frontmatter lisible")
    c_flag = rep.check(S, "drapeau publish: true")
    c_body = rep.check(S, "corps de note")
    c_block = rep.check(S, "blocs rendus par Quartz")
    c_self = rep.check(S, "liens de frontmatter")
    c_date = rep.check(S, "dates exploitables")
    c_keys = rep.check(S, "clés exposées au public")

    if not changed:
        for c in (c_parse, c_flag, c_body, c_block, c_self, c_date, c_keys):
            c.verdict = "sans objet"
        audit_bases(rep)
        return

    # Référence : où chaque clé de frontmatter apparaît déjà, hors delta. Sert à
    # distinguer une clé nouvelle sur le site d'une clé installée.
    baseline = {}
    changed_set = set(changed)
    for f in every:
        if f in changed_set:
            continue
        fm, _ = frontmatter(read(f))
        folder = os.path.relpath(f, "content").split(os.sep)[0]
        for k in fm or {}:
            baseline.setdefault(k, collections.Counter())[folder] += 1

    n = len(changed)
    stubs = links = dates = 0

    for f in changed:
        rel = os.path.relpath(f, "content")
        folder = rel.split(os.sep)[0]
        fm, body = frontmatter(read(f))

        if fm is None:
            c_parse.add("casse", f"{rel} — YAML invalide, la note ne sera pas rendue")
            continue

        # Résidu : explicit-publish écarterait la page, le lien deviendrait mort.
        if fm.get("publish") is not True:
            c_flag.add("casse", f"{rel} — sans le drapeau, la page devient un lien mort")

        # Une note sans corps publie une page dont le seul contenu visible est
        # son tableau de propriétés. Presque toujours un brouillon oublié.
        if not body.strip():
            if rel.startswith(STUB_DIRS):
                stubs += 1
            else:
                c_body.add("doute", f"{rel} — publierait une page sans contenu")

        for tag in UNRENDERED:
            if re.search(r"^```\s*" + tag + r"\b", body, re.M):
                c_block.add(
                    "casse", f"{rel} — bloc `{tag}` affiché en code brut sur le site"
                )

        for k, v in fm.items():
            for target in re.findall(r"\[\[([^\]|#]+)", str(v)):
                links += 1
                if target.strip() == os.path.splitext(os.path.basename(rel))[0]:
                    c_self.add("doute", f"{rel} — `{k}` pointe sur la note elle-même")

            if k in DATE_KEYS:
                dates += 1
                # Quartz journalise « invalid date » et retombe sur la date git.
                if isinstance(v, str) and v.strip().lower() in ("null", "none", "nan"):
                    c_date.add("casse", f"{rel} — `{k}: {v}` affichera une date fausse")

            if k in excl or scope_all:
                continue
            seen = baseline.get(k)
            if seen is None:
                # includeAll : la clé devient une ligne visible du tableau.
                c_keys.add("expose", f"{rel} — `{k}` n'existait nulle part ailleurs")
            elif folder not in seen:
                # Trier par fréquence dans ce dossier : la clé qu'emploient les
                # notes voisines est presque toujours celle qu'il fallait.
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
                    "doute",
                    f"{rel} — `{k}` vient de {'/, '.join(sorted(seen))}/ ; "
                    f"{folder}/ emploie plutôt {usual or 'aucune autre clé'}",
                )

    def verdict(check, examined, clean, faulty):
        """Ce qui a été examiné, puis ce qu'on y a trouvé — jamais l'inverse."""
        k = len(check.entries)
        check.verdict = f"{examined} — {clean}" if not k else f"{examined} — {faulty(k)}"

    verdict(c_parse, plural(n, "note analysée", "notes analysées"),
            "toutes lisibles", lambda k: f"{plural(k, 'illisible')}")
    verdict(c_flag, f"{n} examinées",
            "toutes marquées", lambda k: f"{k} sans le drapeau")
    tolerated = (
        f", {plural(stubs, 'fiche tolérée', 'fiches tolérées')} sous {' '.join(STUB_DIRS)}"
        if stubs
        else ""
    )
    verdict(c_body, f"{n} examinées{tolerated}",
            "toutes ont un contenu", lambda k: plural(k, "note vide", "notes vides"))
    verdict(c_block, "/".join(UNRENDERED),
            "aucun bloc de ce type", lambda k: f"{plural(k, 'bloc')} en code brut")
    verdict(c_self, plural(links, "lien examiné", "liens examinés"),
            "aucun renvoi sur soi", lambda k: f"{plural(k, 'renvoi')} sur soi-même")
    verdict(c_date, plural(dates, "date examinée", "dates examinées"),
            "toutes exploitables", lambda k: f"{plural(k, 'invalide')}")

    if scope_all:
        audit_keys_corpus(rep, c_keys, every, excl)
    else:
        visible = {k for k in baseline if k not in excl}
        found = collections.Counter(lv for lv, _ in c_keys.entries)
        trouble = ", ".join(
            plural(found[lv], one, many)
            for lv, one, many in (
                ("expose", "clé inédite", "clés inédites"),
                ("doute", "hors convention", "hors convention"),
            )
            if found[lv]
        )
        c_keys.verdict = (
            f"{len(visible)} clés déjà publiques (includeAll) — "
            + (trouble or "aucune nouveauté")
        )

    audit_bases(rep)


def audit_keys_corpus(rep, check, every, excl):
    """Sur le corpus entier, la nouveauté n'a plus de sens : on inventorie."""
    inventory = {}
    for f in every:
        fm, _ = frontmatter(read(f))
        for k in fm or {}:
            if k not in excl:
                inventory.setdefault(k, []).append(os.path.relpath(f, "content"))
    rare = sum(1 for holders in inventory.values() if len(holders) <= 2)
    check.verdict = f"{len(inventory)} clés visibles — " + (
        plural(rare, "clé rare", "clés rares") if rare else "aucune clé rare"
    )
    check.add(
        "info",
        "inventaire : "
        + ", ".join(f"{k}×{len(v)}" for k, v in sorted(inventory.items())),
    )
    for k, holders in sorted(inventory.items()):
        if len(holders) <= 2:
            check.add("expose", f"`{k}` — clé rare, sur {', '.join(holders)}")


def audit_bases(rep):
    """Garde-fou sur la transformation des bases par sync-vault.mjs."""
    check = rep.check("contenu", "colonnes des bases")
    files = sorted(glob.glob("content/**/*.base", recursive=True))
    check.verdict = f"{plural(len(files), 'base copiée', 'bases copiées')} dans content/"
    for f in files:
        rel = os.path.relpath(f, "content")
        try:
            doc = yaml.safe_load(read(f)) or {}
        except Exception:
            check.add("doute", f"{rel} — YAML illisible, colonnes non vérifiables")
            continue
        for view in doc.get("views") or []:
            for col in view.get("order") or []:
                if str(col).split(".")[-1] in ("publish", "homepage"):
                    check.add(
                        "expose",
                        f"{rel} — la vue « {view.get('name')} » affiche `{col}` ; "
                        f"sync-vault.mjs aurait dû la retirer (BASE_HIDDEN_COLUMNS)",
                    )


# ─────────────────────────────────────────────────────────────────────────────
# Contrôles sur public/
# ─────────────────────────────────────────────────────────────────────────────


def audit_built(rep):
    S = "sortie construite"
    pages = sorted(glob.glob("public/**/*.html", recursive=True))
    if not pages:
        rep.check(S, "présence de public/").add(
            "casse", "aucune page — lancer `npm run build:ci` d'abord"
        )
        return

    c_raw = rep.check(S, "blocs non rendus")
    c_base = rep.check(S, "bases peuplées")

    embeds, empty = 0, []
    for f in pages:
        s = read(f)
        rel = os.path.relpath(f, "public")
        for tag in UNRENDERED:
            if f'data-language="{tag}"' in s:
                c_raw.add("casse", f"{rel} — bloc `{tag}` dans le HTML publié")
        if "bases-inline" not in s:
            continue
        embeds += 1
        # Se fier au décompte du plugin : la classe `bases-empty` marque aussi
        # les cellules vides d'un tableau, par dizaines.
        for meta in re.findall(r'class="bases-view-meta"[^>]*>([^<]*)<', s):
            if re.match(r"^Showing 0 of 0\b", html.unescape(meta).strip()):
                empty.append(rel)

    c_raw.verdict = f"{plural(len(pages), 'page inspectée', 'pages inspectées')} — " + (
        f"{plural(len(c_raw.entries), 'bloc brut')}" if c_raw.entries else "sortie propre"
    )
    c_base.verdict = (
        f"{plural(embeds, 'page incorpore une base', 'pages incorporent une base')} — "
        + (f"{plural(len(set(empty)), 'vue vide')}" if empty else "toutes peuplées")
    )
    for rel in sorted(set(empty)):
        c_base.add(
            "doute",
            f"{rel} — une vue est vide ; légitime si aucune note ne correspond, "
            f"sinon frontmatter mal renseigné",
        )


# ─────────────────────────────────────────────────────────────────────────────


def find_root():
    """Racine du dépôt : le dossier qui porte quartz.config.yaml et content/.

    Cherché d'abord au-dessus du script (cas normal, il vit dans .claude/), puis
    au-dessus du dossier courant — ainsi une copie du script fonctionne aussi.
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
        help="examiner tout le corpus au lieu des seules notes modifiées",
    )
    parser.add_argument(
        "--built",
        action="store_true",
        help="ajouter les contrôles sur public/ (exige un `npm run build:ci` récent)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="masquer les contrôles conformes, ne montrer que ce qui cloche",
    )
    args = parser.parse_args()

    root = find_root()
    if root is None:
        die(
            "Racine du dépôt pixelle introuvable (ni quartz.config.yaml ni content/).\n"
            "Lancer le script depuis le dépôt, ou le laisser dans .claude/skills/."
        )
    os.chdir(root)

    rep = Report()
    rep.header.append(("racine", root))
    audit_content(rep, args.all)
    if args.built:
        audit_built(rep)

    print(rep.render(args.quiet))
    c = rep.counts()
    return 1 if c["casse"] or c["expose"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
