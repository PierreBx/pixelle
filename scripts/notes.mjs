/**
 * Lecture d'une note : frontmatter, drapeaux de publication, références.
 *
 * Extrait de `sync-vault.mjs`. Aucune écriture, aucun accès au disque — ce qui
 * rend ces fonctions utilisables depuis les autres modules sans les faire
 * dépendre de la synchronisation elle-même.
 */
import YAML from "yaml"
import { c } from "./term.mjs"

/** Split leading YAML frontmatter from a markdown document. */
function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: null, body: raw }
  // Frontmatter ends at the first `---` line after the opening one.
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  if (!match) return { frontmatter: null, body: raw }
  return { frontmatter: match[1], body: raw.slice(match[0].length) }
}

function parseFrontmatter(raw, relPath) {
  const { frontmatter } = splitFrontmatter(raw)
  if (frontmatter === null) return null
  try {
    return YAML.parse(frontmatter) ?? {}
  } catch (err) {
    console.warn(c.yellow(`  ! unparseable frontmatter in ${relPath}: ${err.message}`))
    return null
  }
}

/**
 * `publish` must be the boolean true, or the strings "true"/"yes".
 * Anything else — absent, false, null, a date — means do not publish.
 */
function isPublished(frontmatter) {
  if (!frontmatter) return false
  const v = frontmatter.publish
  if (v === true) return true
  if (typeof v === "string") return ["true", "yes"].includes(v.trim().toLowerCase())
  return false
}

/**
 * `homepage: true` designates the note that becomes the site's landing page.
 * It does not imply publication: the note still needs `publish: true`, so the
 * flag can never pull an unpublished note onto the front page by itself.
 */
function isHomepage(frontmatter) {
  return frontmatter?.homepage === true
}

/**
 * Collect every `[[target]]`, `![[target]]` and `![](target)` reference in a
 * document, frontmatter included (Obsidian allows wikilinks in field values,
 * e.g. `banner: "[[cover.jpeg]]"`).
 *
 * Returns bare targets with any `|alias`, `#heading` and `^block` stripped.
 */
function extractReferences(raw) {
  const refs = new Set()

  for (const m of raw.matchAll(/!?\[\[([^\]]+?)\]\]/g)) {
    let target = m[1]
    target = target.split("|")[0]
    target = target.split("#")[0]
    target = target.split("^")[0]
    target = target.trim()
    if (target) refs.add(target)
  }

  // Markdown-style embeds/links pointing at local files.
  for (const m of raw.matchAll(/!?\[[^\]]*?\]\(([^)]+?)\)/g)) {
    let target = decodeURIComponent(m[1].trim())
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // http:, mailto:, etc.
    if (target.startsWith("#")) continue
    target = target.split("#")[0].trim()
    if (target) refs.add(target)
  }

  return [...refs]
}

export { splitFrontmatter, parseFrontmatter, isPublished, isHomepage, extractReferences }
