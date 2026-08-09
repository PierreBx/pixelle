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
  audit.py --quiet          show only what is wrong

Nothing is fixed or modified. content/ is generated, so every correction
belongs in the Obsidian vault.
"""

UNRENDERED = ("dataview", "mapview", "leaflet", "zoommap")

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
    """Paths under content/ added or modified since HEAD."""
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
    """File contents as committed, or None when absent from HEAD."""
    r = subprocess.run(
        ["git", "show", f"HEAD:{path}"], capture_output=True, text=True, errors="replace"
    )
    return r.stdout if r.returncode == 0 else None


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
        else f"{plural(len(changed), 'note changed', 'notes changed')} since HEAD"
    )
    rep.header.append(("scope", f"{scope}  ({len(every)} notes published in total)"))

    S = "content"
    c_parse = rep.check(S, "frontmatter parses")
    c_flag = rep.check(S, "publish: true flag")
    c_body = rep.check(S, "note body")
    c_block = rep.check(S, "blocks Quartz renders")
    c_self = rep.check(S, "frontmatter links")
    c_date = rep.check(S, "usable dates")
    c_keys = rep.check(S, "publicly exposed keys")

    if not changed:
        for c in (c_parse, c_flag, c_body, c_block, c_self, c_date, c_keys):
            c.verdict = "not applicable"
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
    for f in changed:
        committed = show_head(f)
        if committed is not None:
            absorb(os.path.relpath(f, "content"), frontmatter(committed)[0])

    n = len(changed)
    stubs = links = dates = 0

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

            if k in excl or scope_all:
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


def audit_built(rep):
    S = "built output"
    pages = sorted(glob.glob("public/**/*.html", recursive=True))
    if not pages:
        rep.check(S, "public/ present").add(
            "broken", "no page — run `npm run build:ci` first"
        )
        return

    c_raw = rep.check(S, "unrendered blocks")
    c_base = rep.check(S, "bases populated")
    c_link = rep.check(S, "internal links resolve")

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
        "--quiet",
        action="store_true",
        help="hide passing checks, show only what is wrong",
    )
    args = parser.parse_args()

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
