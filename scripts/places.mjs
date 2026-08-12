/**
 * Hiérarchie des lieux.
 *
 * Extrait de `sync-vault.mjs`. Ne touche à aucun fichier : à partir des notes
 * publiées, ce module sait remonter une chaîne de parents et poser l'étiquette
 * qui en découle.
 */
import path from "node:path"

// ---------------------------------------------------------------------------
// Hiérarchie des lieux
// ---------------------------------------------------------------------------
// Une note de contenu désigne **un** lieu : `place: "[[places/Grand-Théatre]]"`.
// Ce lieu désigne son parent, qui désigne le sien — un saut à la fois, jamais
// la chaîne entière.
//
// Quartz ne sait pas remonter une chaîne : ses liens retour ne font qu'un pas
// et une base ne récurse pas. « Tout ce qui s'est passé en France » n'est donc
// pas calculable à partir des seuls `parent:`. Les **étiquettes**, elles,
// s'agrègent toutes seules : `location/france` regroupe automatiquement ses
// descendants. C'est la seule surface qui remonte.
//
// D'où la division : l'auteur écrit le lieu exact une fois, sous forme de lien
// — la note-lieu porte ses coordonnées, sa description, ses liens retour — et
// la synchronisation en déduit l'étiquette hiérarchique. Rien n'est écrit deux
// fois, et les pages d'agrégat existent sans que personne les entretienne.

const PLACE_TAG_ROOT = "location"

/**
 * Cartes disponibles. Une note publiée les appelle par un commentaire HTML
 * seul sur sa ligne — invisible dans Obsidian, remplacé ici par le SVG :
 *
 *     <!-- carte: world -->
 *
 * `select` dit quels lieux figurent sur la carte. Pour ajouter un fond de
 * carte, donner `basemap: { href, bbox: [ouest, sud, est, nord] }` : le bbox
 * doit être celui de l'image, sans quoi les points tombent à côté.
 */
const MAPS = {
  world: { title: "Les lieux du site", select: () => true },
  odyssey: { title: "L'Odyssée", select: (p) => p.map === "odyssey" },
  blog: { title: "Les lieux des billets", select: (p) => p.inBlog },
}

const MAP_MARKER = /^[ \t]*<!--[ \t]*carte:[ \t]*([\w-]+)[ \t]*-->[ \t]*$/gm

/** `Saint-Médard-en-Jalles` -> `saint-médard-en-jalles`. */
function placeSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
}

/**
 * Index des lieux **publiés** : nom -> { name, parent }.
 *
 * Publiés seulement : un lieu privé n'a pas à voir son nom partir dans une
 * étiquette publique. Une chaîne qui bute sur un lieu non publié s'arrête là.
 */
function buildPlaceIndex(published) {
  const index = new Map()
  for (const note of published) {
    if (note.frontmatter?.type !== "place") continue
    const name = path.basename(note.relPath, ".md")
    const raw = note.frontmatter.parent
    const parent = typeof raw === "string" ? raw.match(/\[\[([^\]|#]+)/)?.[1]?.trim() : null
    index.set(name.toLowerCase(), {
      name,
      // `[[places/Bordeaux|Bordeaux]]` -> `Bordeaux`
      parent: parent ? path.basename(parent) : null,
    })
  }
  return index
}

/**
 * Chaîne racine -> feuille d'un lieu, ou null s'il est inconnu.
 * @param onBreak appelé quand un maillon manque, pour le rapport.
 */
function placeChain(target, index, onBreak) {
  const start = index.get(path.basename(target).toLowerCase())
  if (!start) return null
  const chain = []
  const seen = new Set()
  let cur = start
  while (cur) {
    if (seen.has(cur.name.toLowerCase())) {
      onBreak(`cycle dans la hiérarchie des lieux, à « ${cur.name} »`)
      break
    }
    seen.add(cur.name.toLowerCase())
    chain.unshift(cur.name)
    if (!cur.parent) break
    const next = index.get(cur.parent.toLowerCase())
    if (!next) {
      onBreak(`« ${cur.name} » a pour parent « ${cur.parent} », qui n'est pas un lieu publié`)
      break
    }
    cur = next
  }
  return chain
}

/** Ajoute une étiquette au frontmatter, quelle que soit son écriture. */
function addTag(frontmatter, tag) {
  if (frontmatter === null) return `tags: [${tag}]`
  if (new RegExp(`(^|[\\s,\\[])${tag}($|[\\s,\\]])`, "m").test(frontmatter)) return frontmatter
  const inline = frontmatter.match(/^tags:[ \t]*\[(.*)\][ \t]*$/m)
  if (inline) {
    const inner = inline[1].trim()
    return frontmatter.replace(inline[0], `tags: [${inner ? `${inner}, ` : ""}${tag}]`)
  }
  const block = frontmatter.match(/^tags:[ \t]*\n((?:[ \t]+-[ \t]+.*\n?)+)/m)
  if (block) {
    const indent = block[1].match(/^[ \t]+/)?.[0] ?? "  "
    return frontmatter.replace(block[0], `${block[0].replace(/\n?$/, "\n")}${indent}- ${tag}\n`)
  }
  return `${frontmatter.replace(/\n?$/, "")}\ntags: [${tag}]`
}

export { PLACE_TAG_ROOT, MAPS, MAP_MARKER, placeSlug, buildPlaceIndex, placeChain, addTag }
