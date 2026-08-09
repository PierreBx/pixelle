#!/usr/bin/env bash
#
# Commit content/ and publish the pixelle site. Step 4 of the workflow.
#
#   commit-and-publish.sh -m "message"          commit. Does NOT push.
#   commit-and-publish.sh --push                push, then verify the deploy
#   commit-and-publish.sh -m "message" --push   both, in one go
#   commit-and-publish.sh --dry-run             show what would happen, write nothing
#   commit-and-publish.sh --force               skip the preconditions
#   commit-and-publish.sh --help
#
# It does NOT sync, build or audit: steps 2 (2-site-construct-locally) and 3
# (3-site-check-local) own that, and redoing it here would only hide which step failed.
# What it does check is that those steps actually ran — see "preconditions".
#
# Exit status: 0 success · 1 precondition, push or deploy failed · 2 usage error

set -uo pipefail

MSG=""
PUSH=0
DRY=0
FORCE=0

SITE="https://pierrebx.github.io/pixelle"
# Files the CI build reads. Committing content without them ships a site that
# differs from the one verified locally — this actually happened once, with a
# note's summary left in the clear because excludedProperties stayed behind.
BUILD_INPUTS=(quartz.config.yaml scripts package.json package-lock.json .github)

# The header comment is the help text: print it from line 3 up to the first
# line that is no longer a comment, so editing the header cannot desync it.
usage() { awk 'NR<3{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; }

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '  \033[1m%-9s\033[0m %s\n' "$1" "${2-}"; }
warn() { printf '  \033[33m%-9s\033[0m %s\n' "$1" "$2"; }
fail() { printf '  \033[31m%-9s\033[0m %s\n' "$1" "$2"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message) MSG="${2-}"; [ -n "$MSG" ] || { echo "-m needs a message" >&2; exit 2; }; shift 2 ;;
    --push)       PUSH=1; shift ;;
    --dry-run)    DRY=1; shift ;;
    --force)      FORCE=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$MSG" ] && [ "$PUSH" -eq 0 ]; then
  echo "nothing to do: pass -m to commit, --push to push, or both" >&2
  usage >&2
  exit 2
fi

# Locate the repository root so the script works from any directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$ROOT" ] && [ -f "$ROOT/quartz.config.yaml" ] || {
  echo "pixelle repository root not found" >&2; exit 2; }
cd "$ROOT"

run() { if [ "$DRY" -eq 1 ]; then printf '  \033[2m%-9s would run: %s\033[0m\n' "dry-run" "$*"; else "$@"; fi; }

# public/a/b c.html -> $SITE/a/b%20c . Percent-encoding is done per path segment
# in Python: page names carry `|`, accented letters and emoji, which shell
# quoting mangles.
page_url() {
  [ "$1" = "index.html" ] && { printf '%s/' "$SITE"; return; }
  python3 - "$SITE" "$1" <<'PY'
import sys, urllib.parse
site, rel = sys.argv[1], sys.argv[2]
if rel.endswith(".html"):
    rel = rel[: -len(".html")]
print(site + "/" + "/".join(urllib.parse.quote(s) for s in rel.split("/")))
PY
}

bold "commit and publish pixelle"
[ "$DRY" -eq 1 ] && warn "dry-run" "nothing will be written, committed or pushed"

# ---------------------------------------------------------------- commit phase
if [ -n "$MSG" ]; then

  # -- preconditions. Cheap inspections, never work redone from steps 2 and 3.

  # A build older than the content it came from means the site was never looked
  # at in this state: publishing it skips the whole point of steps 2 and 3.
  if [ ! -f public/index.html ]; then
    fail "precheck" "public/ is missing — run 2-site-construct-locally (step 2) first"
    [ "$FORCE" -eq 1 ] || exit 1
    warn "precheck" "continuing without a build (--force)"
  elif [ -n "$(find content -name '*.md' -newer public/index.html -print -quit 2>/dev/null)" ]; then
    fail "precheck" "content/ is newer than the build — rebuild and re-check (steps 2 and 3)"
    [ "$FORCE" -eq 1 ] || exit 1
    warn "precheck" "publishing content that was never previewed (--force)"
  else
    step "precheck" "build is current with content/"
  fi

  # Build inputs changed but not staged would make the deployed site differ from
  # the one verified locally. Refuse rather than ship the mismatch.
  loose=""
  for p in "${BUILD_INPUTS[@]}"; do
    [ -e "$p" ] || continue
    git diff --quiet -- "$p" || loose="$loose $p"
  done
  if [ -n "$loose" ]; then
    fail "inputs" "modified but unstaged, and the CI builds from them:$loose"
    if [ "$FORCE" -eq 0 ]; then
      echo "         stage them (git add …) or pass --force to publish without them" >&2
      exit 1
    fi
    warn "inputs" "shipped without them (--force)"
  fi

  # -- commit

  run git add -A content
  if [ "$DRY" -eq 0 ] && git diff --cached --quiet; then
    step "commit" "nothing to commit, content/ already matches HEAD"
  else
    removed="$(git diff --cached --name-only --diff-filter=D -- content | wc -l)"
    [ "$removed" -gt 0 ] && warn "commit" "$removed page(s) removed from the site"
    run git commit -q -m "$MSG"
    [ "$DRY" -eq 0 ] && step "commit" "$(git rev-parse --short HEAD)  $MSG"
  fi
fi

# ------------------------------------------------------------------ push phase
if [ "$PUSH" -eq 1 ]; then
  base="$(git rev-parse @{u} 2>/dev/null || echo '')"
  ahead="$(git rev-list --count @{u}..HEAD 2>/dev/null || echo '?')"
  if [ "$ahead" = "0" ]; then
    step "push" "nothing to push, already up to date with the remote"
    exit 0
  fi
  step "push" "$ahead commit(s) to origin"
  run git push -q || { fail "push" "failed"; exit 1; }
  [ "$DRY" -eq 1 ] && exit 0

  # Which pages to verify. Quartz output is deterministic — a local build is
  # byte-identical to what the CI produces from the same commit — so comparing
  # checksums proves the *new* content is served. Merely checking that the site
  # answers, or that two reads agree, passes happily on a stale CDN copy.
  #
  # Emitted filename = source name with spaces turned into dashes.
  mapfile -t targets < <(
    printf 'index.html\n'
    git diff --name-only "$base" HEAD -- content 2>/dev/null \
      | grep '\.md$' | grep -v '^content/index\.md$' \
      | sed 's|^content/||; s|\.md$|.html|; s| |-|g' | head -3
  )

  step "deploy" "waiting for $(git rev-parse --short HEAD) — checking ${#targets[@]} page(s), up to 10 min"
  for i in $(seq 1 40); do
    matched=1
    for t in "${targets[@]}"; do
      [ -f "public/$t" ] || continue
      local_sum="$(md5sum "public/$t" | cut -d' ' -f1)"
      served="$(curl -sf -H 'Cache-Control: no-cache' "$(page_url "$t")?cachebust=$i" 2>/dev/null | md5sum | cut -d' ' -f1)"
      [ "$served" = "$local_sum" ] || { matched=0; break; }
    done
    if [ "$matched" -eq 1 ]; then
      step "deploy" "served pages match the local build — $SITE"
      exit 0
    fi
    sleep 15
  done
  fail "deploy" "served pages still differ from the local build after 10 min"
  echo "         a CDN edge may lag; re-check with: curl -s $SITE/ | md5sum" >&2
  exit 1
fi

[ -n "$MSG" ] && step "done" "committed, not pushed. Run with --push to publish."
exit 0
