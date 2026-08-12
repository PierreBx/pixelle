#!/usr/bin/env node
/**
 * Sync published notes from the Obsidian vault into content/.
 *
 * The rule is opt-in and absolute: a note is copied only if its YAML
 * frontmatter contains `publish: true`. Everything else in the vault is
 * invisible to this script, and therefore to the site and to GitHub.
 *
 * Attachments (images, PDFs) are copied only when a published note actually
 * references them. Referenced *notes* are never pulled in implicitly — if a
 * published note links to an unpublished one, the link is reported as dangling
 * rather than silently dragging private content into the build.
 *
 * Usage:
 *   node scripts/sync-vault.mjs [--dry-run] [--verbose]
 *   VAULT_PATH=/some/other/vault node scripts/sync-vault.mjs
 */

import { readFile, writeFile, mkdir, rm, copyFile, stat, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { globby } from "globby"
import YAML from "yaml"
// La fonction de Quartz elle-même, pas une réécriture : les règles de slug sont
// nombreuses (`&` -> `-and-`, `|` -> `-`, ponctuation typographique conservée)
// et toute divergence produirait des liens morts sur la page d'accueil.
import { slugifyFilePath } from "@quartz-community/utils"
import { renderMap } from "./maps.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Destination de la synchronisation. `CONTENT_DIR` n'existe que pour les
 * tests : ce script **supprime** ce qu'il ne reconnaît pas, et une suite de
 * tests qui viserait le vrai `content/` le viderait à la première exécution.
 * En usage normal la variable n'est pas définie, et rien ne change.
 */
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(REPO_ROOT, "content")

const VAULT_PATH = process.env.VAULT_PATH ?? "/home/ipro0800/Documents/data/obsidian/petersVault"

/**
 * Racine de publication à l'intérieur du coffre. Défaut : `public`.
 *
 * Le coffre range ses notes sous `public/` et `private/` ; ce défaut fait donc
 * du rangement une vraie barrière, sans dépendre d'une variable d'environnement
 * qu'on oublierait. Un `npm run sync` nu se comporte correctement.
 *
 * Pour repasser au parcours de tout le coffre (coffre à plat, ancien schéma),
 * passer une valeur **vide** : `PUBLIC_ROOT= npm run sync`.
 *
 * Quand une racine est active, seules les notes de ce sous-arbre sont
 * candidates — et deux conséquences voulues :
 *
 *   - une note portant `publish: true` hors de cette racine n'est plus publiée ;
 *   - les chemins de destination sont calculés **relativement à la racine**,
 *     donc son nom n'apparaît jamais dans une URL (`public/blog/X.md` ->
 *     `content/blog/X.md`). Les URL existantes ne bougent pas.
 *
 * Les **pièces jointes** restent cherchées dans tout le coffre : elles ne sont
 * copiées que si une note publiée les référence, et vivent souvent hors de la
 * racine (`_assets/`, `_obsidian/_bases/`). Elles conservent leur chemin.
 */
const PUBLIC_ROOT = (process.env.PUBLIC_ROOT ?? "public").replace(/^\/+|\/+$/g, "") || null

const DRY_RUN = process.argv.includes("--dry-run")
const VERBOSE = process.argv.includes("--verbose")
/** Autorise une synchronisation qui viderait `content/` (voir le garde-fou). */
const FORCE = process.argv.includes("--force")

/** Retire le préfixe de la racine de publication d'un chemin du coffre. */
function stripPublicRoot(relPath) {
  if (!PUBLIC_ROOT) return relPath
  const prefix = `${PUBLIC_ROOT}/`
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : relPath
}

/** Une note est-elle candidate à la publication, vu la racine configurée ? */
function isUnderPublicRoot(relPath) {
  if (!PUBLIC_ROOT) return true
  return relPath.startsWith(`${PUBLIC_ROOT}/`)
}

/** Vault directories never scanned, for privacy or noise. */
const IGNORED_DIRS = [
  ".obsidian",
  ".trash",
  ".git",
  ".idea",
  "node_modules",
  ".claude",
]

/**
 * Extensions copied as attachments when referenced by a published note.
 *
 * `.base` (Obsidian Bases) is included so index notes render. A base is a
 * query, not content: Quartz evaluates it against `content/`, which holds
 * only published notes, so it cannot surface anything private.
 */
/**
 * Clés de plomberie de publication : elles pilotent la synchronisation et
 * n'ont aucun sens sur le site. `note-properties` les masque déjà via
 * `excludedProperties` dans quartz.config.yaml ; les bases ont leur propre
 * liste de colonnes, que ce filtre aligne sur la même politique.
 *
 * Le coffre reste libre : la colonne est utile dans Obsidian, où elle sert à
 * repérer ce qui est publié. Seule la copie vers `content/` est nettoyée.
 */
const BASE_HIDDEN_COLUMNS = new Set(["publish", "note.publish", "homepage", "note.homepage"])

const ATTACHMENT_EXTS = new Set([
  ".base",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico",
  ".pdf",
  ".mp3", ".wav", ".m4a", ".ogg", ".flac",
  ".mp4", ".webm", ".mov",
])

// ---------------------------------------------------------------------------
// Allègement des pièces jointes
// ---------------------------------------------------------------------------
// Le coffre garde ses originaux ; c'est la copie vers `content/` qui est
// allégée, exactement comme les vignettes de vidéos plus bas. Deux mesures
// distinctes, parce que deux poids distincts :
//
//   - une **image** est chargée avec la page, sans que le visiteur l'ait
//     demandée : elle est redimensionnée et ré-encodée en WebP ;
//   - un **document** (PDF) ne l'est que si le lecteur le réclame — encore
//     faut-il qu'il soit lié et non incorporé. `![[x.pdf]]` fait rendre à
//     Quartz un cadre qui télécharge le fichier entier au chargement de la
//     page : 15 Mo de programmes de concert partaient ainsi sur quatre pages.
//
// `OPTIMISE_IMAGES=0` rétablit la copie brute, pour comparer.

const OPTIMISE_IMAGES = process.env.OPTIMISE_IMAGES !== "0"

/**
 * Plus grand côté servi, et non plus grande largeur : une photo en hauteur de
 * 1600×2133 tient dans une limite de largeur tout en pesant trois mégapixels.
 * C'est la surface qui fait le poids, donc c'est la surface qu'il faut borner.
 * 1600 laisse deux fois la largeur de la colonne de texte, écrans denses compris.
 */
const IMAGE_MAX_SIDE = Number(process.env.IMAGE_MAX_SIDE ?? 1600)
const IMAGE_QUALITY = Number(process.env.IMAGE_QUALITY ?? 80)

/** Vignettes : jamais agrandies au-delà de la colonne, un cran plus petites. */
const THUMB_MAX_SIDE = 1200

/**
 * Largeurs supplémentaires servies aux petits écrans.
 *
 * Une image de 1600 px partait jusqu'ici vers un téléphone de 375 px, soit
 * quatre fois trop d'octets pour un écran qui n'en montrera jamais la moitié.
 * On émet donc quelques largeurs et un `srcset` : le navigateur choisit.
 *
 * Conséquence : l'incorporation Obsidian devient une balise `<img>` dans la
 * copie, seule forme qui porte `srcset`. Elle emporte au passage les dimensions
 * réelles, que Quartz écrivait « auto » — le navigateur ne pouvait donc rien
 * réserver, et le texte sautait à l'arrivée de chaque image.
 */
const IMAGE_WIDTHS = [480, 960]

/** Largeur de la colonne de texte, pour que le navigateur choisisse juste. */
const IMAGE_SIZES = "(max-width: 800px) 100vw, 750px"

/**
 * Formats ré-encodés en WebP. `.gif` en est exclu (l'animation survit mal),
 * `.avif` aussi (déjà plus compact que ce que WebP produirait), et `.svg`
 * n'est pas une image matricielle.
 */
const RASTER_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"])

/** Documents : liés, jamais incorporés, et rangés hors du flux d'images. */
const DOC_EXTS = new Set([".pdf"])
const DOC_DIR = "_assets/docs"

/** Au-delà, une vignette déjà téléchargée est ré-encodée sur place. */
const THUMB_MAX_BYTES = 200 * 1024

/**
 * Où atterrit une pièce jointe dans `content/`, et sous quelle forme.
 *
 * Le nom de destination est décidé **avant** tout encodage, et seulement à
 * partir de l'extension : les notes sont réécrites à partir de ce plan, donc
 * il doit être prévisible. Un encodage qui déciderait après coup de garder le
 * PNG laisserait les notes pointer vers un `.webp` inexistant.
 */
function attachmentPlan(relPath) {
  const ext = path.extname(relPath).toLowerCase()
  const dest = stripPublicRoot(relPath)
  if (DOC_EXTS.has(ext)) {
    return { kind: "doc", dest: `${DOC_DIR}/${path.basename(relPath)}`, ext }
  }
  if (OPTIMISE_IMAGES && RASTER_EXTS.has(ext)) {
    return { kind: "image", dest: `${dest.slice(0, -ext.length)}.webp`, ext }
  }
  return { kind: "raw", dest, ext }
}

/** Taille lisible, pour l'étiquette d'un lien de document. */
function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

// ---------------------------------------------------------------------------
// Encapsulation des vidéos YouTube  (prototype)
// ---------------------------------------------------------------------------
// Les notes du coffre gardent un simple lien markdown, lisible dans Obsidian.
// C'est la synchronisation qui le remplace, dans `content/` uniquement, par une
// vignette cliquable. Le coffre n'est jamais modifié.
//
// Pourquoi une vignette et non un `<iframe>` direct : un iframe YouTube contacte
// Google au chargement de la page, dépose des cookies et trace le visiteur avant
// tout clic — ce que `analytics: null` refuse explicitement dans
// quartz.config.yaml. Ici la vignette est téléchargée à la synchronisation et
// servie depuis le site ; l'iframe n'est construit qu'au clic, à partir de
// l'identifiant porté par `data-yt`. Aucune requête tierce tant que le visiteur
// n'a rien demandé. Le domaine utilisé est `youtube-nocookie.com`.
const YOUTUBE_EMBED = process.env.YOUTUBE_EMBED !== "0"
const THUMB_DIR = "_assets/images/youtube"

/** Toute URL YouTube, qu'elle soit nue, en lien markdown ou en embed image. */
const YOUTUBE_URL = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s)<>\]"']+/g

/**
 * Extrait l'identifiant de vidéo (11 caractères) d'une URL YouTube.
 * Absorbe les formes que le partage iOS produit : emoji collé en fin d'URL,
 * sous-domaine `m.`, et `/shorts/` que le plugin Quartz ne reconnaît pas.
 * Renvoie null pour ce qui n'est pas une vidéo (lien de chaîne, ID tronqué).
 */
function youTubeVideoId(rawUrl) {
  const url = rawUrl.replace(/[^\x00-\x7F]+$/u, "").replace(/[.,;:]+$/, "")
  const m =
    url.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/) ??
    null
  return m ? m[1] : null
}

/**
 * Vignette cliquable. `prefix` remonte de la page vers la racine du site : le
 * chemin doit rester relatif, sinon il ignorerait le `/pixelle` de l'URL de
 * base et pointerait à la racine du domaine.
 */
function youTubeFacade(id, label, thumbSlug, prefix) {
  const title = escapeHtml(label || "Vidéo YouTube")
  // L'iframe est construit au clic à partir de `data-yt`, et non stocké dans un
  // `<template>` : Quartz vide le contenu des templates au rendu, ce qui
  // laissait une vignette qui, cliquée, ne révélait rien. Le gestionnaire
  // n'utilise que des apostrophes, pour survivre à l'attribut entre guillemets.
  // La mise en forme vit dans quartz/styles/custom.scss (`.yt-embed`).
  const play =
    "const f=document.createElement('iframe');" +
    "f.src='https://www.youtube-nocookie.com/embed/'+this.dataset.yt+'?autoplay=1';" +
    "f.title=this.dataset.title||'Vidéo YouTube';" +
    "f.className='yt-player';" +
    "f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';" +
    "f.allowFullscreen=true;this.replaceWith(f)"
  // `aria-label` plutôt qu'un texte masqué : Quartz ne définit pas de classe
  // `sr-only`, un span « visuellement caché » s'afficherait donc en clair.
  return `<div class="yt-embed" role="button" tabindex="0" aria-label="Lire la vidéo : ${title}" data-yt="${id}" data-title="${title}" onclick="${play}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
  <img src="${prefix}${thumbSlug}" alt="" loading="lazy" />
  <span class="yt-play" aria-hidden="true">▶</span>
</div>`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
}

/**
 * Remplace, dans le corps d'une note, chaque lien vers une vidéo YouTube par sa
 * vignette. Renvoie le markdown transformé et les vignettes à télécharger.
 */
/** Les deux formes reconnues : lien/embed markdown, puis URL nue. */
const MD_LINK = /!?\[([^\]]*)\]\((https?:\/\/[^)\s]*(?:youtube\.com|youtu\.be|instagram\.com)[^)\s]*)\)/g

/**
 * Médias cités par une note, sans rien transformer. Clés `yt:<id>` /
 * `ig:<code>` : un même jeu sert au pré-chargement des vignettes et au test
 * de disponibilité pendant la transformation.
 */
function scanMedia(raw) {
  const { body } = splitFrontmatter(raw)
  const keys = []
  const add = (url) => {
    const yt = youTubeVideoId(url)
    if (yt) return keys.push(`yt:${yt}`)
    const ig = instagramShortcode(url)
    if (ig) keys.push(`ig:${ig}`)
  }
  for (const [, , url] of body.matchAll(MD_LINK)) add(url)
  for (const url of body.match(YOUTUBE_URL) ?? []) add(url)
  for (const url of body.match(INSTAGRAM_URL) ?? []) add(url)
  return keys
}

/** Chemin de la vignette d'un média, dans `content/`. */
function thumbSlugFor(key) {
  const [kind, id] = [key.slice(0, 2), key.slice(3)]
  const dir = kind === "yt" ? THUMB_DIR : IG_THUMB_DIR
  return `${dir}/${id.toLowerCase()}.jpg`
}

/**
 * @param available identifiants dont la vignette a pu être récupérée. Une vidéo
 *   absente en est exclue : sa vignette renvoie 404, signe qu'elle a été
 *   supprimée ou rendue privée. On laisse alors le lien d'origine plutôt que
 *   d'afficher un cadre noir qui, cliqué, annoncerait « vidéo indisponible ».
 */
function embedYouTube(raw, dest, available) {
  if (!YOUTUBE_EMBED) return { text: raw, thumbs: new Map() }
  const thumbs = new Map()
  const { frontmatter, body } = splitFrontmatter(raw)
  // `blog/X.md` -> `../` ; `odyssée/Chants/Y.md` -> `../../` ; `index.md` -> ``
  const prefix = "../".repeat(dest.split("/").length - 1)

  // `[titre](url)`, `![](url)`, puis URL nue — du plus spécifique au plus
  // général, pour ne pas re-capturer une URL déjà remplacée.
  // Rend la vignette d'une URL, ou null si le média n'est pas encapsulable.
  const facade = (url, label) => {
    const yt = youTubeVideoId(url)
    const key = yt ? `yt:${yt}` : (instagramShortcode(url) ? `ig:${instagramShortcode(url)}` : null)
    if (!key || !available.has(key)) return null
    const slug = thumbSlugFor(key)
    thumbs.set(slug, key)
    return yt
      ? youTubeFacade(yt, label, slug, prefix)
      : instagramFacade(key.slice(3), label, slug, prefix)
  }

  const out = body
    .replace(MD_LINK, (all, label, url) => facade(url, label) ?? all)
    .replace(YOUTUBE_URL, (url) => facade(url, "") ?? url)
    .replace(INSTAGRAM_URL, (url) => facade(url, "") ?? url)

  return { text: frontmatter === null ? out : `---\n${frontmatter}\n---\n${out}`, thumbs }
}

// --- Instagram ---------------------------------------------------------------
// Même principe que YouTube, avec deux réserves assumées :
//
//   - la vignette n'est pas exposée par une API : on la lit dans la page
//     `/embed`, via la classe interne `EmbeddedMediaImage`. C'est du scraping,
//     Meta peut le casser sans préavis. En ce cas la vignette manque, et le
//     lien reste un lien : rien ne se casse visiblement.
//   - l'image est celle d'un tiers, réhébergée ici sans l'habillage
//     d'attribution d'Instagram. Choix explicite de l'auteur du site.
const INSTAGRAM_URL = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+[^\s)<>\]"']*/g
const IG_THUMB_DIR = "_assets/images/instagram"

/** Code court d'un post/reel. null pour un lien de profil ou de compte. */
function instagramShortcode(rawUrl) {
  const url = rawUrl.replace(/[^\x00-\x7F]+$/u, "")
  const m = url.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/)
  return m ? m[1] : null
}

/** Vignette cliquable pour un post Instagram. Style : `.ig-embed`. */
function instagramFacade(code, label, thumbSlug, prefix) {
  const title = escapeHtml(label || "Publication Instagram")
  const play =
    "const f=document.createElement('iframe');" +
    "f.src='https://www.instagram.com/p/'+this.dataset.ig+'/embed';" +
    "f.title=this.dataset.title||'Publication Instagram';" +
    "f.className='ig-player';f.setAttribute('scrolling','no');" +
    "f.allow='encrypted-media; picture-in-picture';" +
    "f.allowFullscreen=true;this.replaceWith(f)"
  return `<div class="ig-embed" role="button" tabindex="0" aria-label="Ouvrir la publication Instagram : ${title}" data-ig="${code}" data-title="${title}" onclick="${play}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
  <img src="${prefix}${thumbSlug}" alt="" loading="lazy" />
  <span class="ig-play" aria-hidden="true">▶</span>
</div>`
}

/**
 * Récupère la vignette d'un post : lit `/embed`, en extrait l'image, la
 * télécharge. Renvoie false si le post est supprimé, privé, ou si la page ne
 * livre plus d'image — auquel cas on n'encapsule pas.
 */
async function fetchInstagramThumb(code, dest) {
  const UA = "Mozilla/5.0 (compatible; pixelle-sync/1.0)"
  try {
    const page = await fetch(`https://www.instagram.com/p/${code}/embed`, {
      headers: { "user-agent": UA },
    })
    if (!page.ok) return false
    const html = await page.text()
    const m = html.match(/class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/)
    if (!m) return false
    const src = m[1].replace(/&amp;/g, "&")
    const img = await fetch(src, { headers: { "user-agent": UA } })
    if (!img.ok) return false
    const buf = Buffer.from(await img.arrayBuffer())
    if (buf.length < 2000) return false
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    return true
  } catch {
    return false
  }
}

/** Télécharge la vignette d'une vidéo. Silencieux en cas d'échec réseau. */
async function fetchThumbnail(id, dest) {
  for (const name of ["maxresdefault", "hqdefault"]) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 2000) continue // placeholder gris de YouTube
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, buf)
      return true
    } catch {
      /* réseau indisponible : on continue sans vignette */
    }
  }
  return false
}

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

/**
 * Réécrit, dans la copie d'une note, les références aux pièces jointes que la
 * synchronisation transforme : une image devient son `.webp`, un PDF incorporé
 * devient un lien. Le coffre n'est jamais touché — la note d'origine continue
 * de désigner l'original et reste lisible dans Obsidian.
 *
 * Doit tourner **avant** l'encapsulation des vidéos : celle-ci produit du HTML
 * dont les `<img src>` pointent vers des vignettes téléchargées, qui ne sont
 * pas des pièces jointes du coffre et n'ont rien à voir dans ce plan.
 *
 * @param planFor cible telle qu'écrite -> plan (voir attachmentPlan), ou null
 *   si elle ne se résout pas. On laisse alors la référence intacte : le rapport
 *   de synchronisation la signale déjà comme lien manquant.
 */
function rewriteAttachmentRefs(raw, dest, planFor) {
  const { frontmatter, body } = splitFrontmatter(raw)
  // Même convention que les vignettes : `blog/X.md` -> `../`, `index.md` -> ``.
  const prefix = "../".repeat(dest.split("/").length - 1)

  const swapExt = (target, ext) =>
    target.slice(0, target.length - path.extname(target).length) + ext

  // Un document est annoncé pour ce qu'il est : format et poids avant le clic,
  // puisque c'est le lecteur qui décide de le télécharger.
  const docLink = (plan, alias) => {
    const label = alias?.trim() || path.basename(plan.dest, plan.ext)
    const weight = plan.size ? `, ${humanSize(plan.size)}` : ""
    return `[${label} — ${plan.ext.slice(1).toUpperCase()}${weight}](${encodeURI(prefix + plan.dest)})`
  }

  // Une image incorporée devient une balise `<img>` : c'est la seule forme qui
  // porte un `srcset` et des dimensions. L'alias Obsidian, qui servait de texte
  // alternatif, devient l'attribut `alt` — même information, même exigence.
  //
  // Les adresses sont slugifiées **ici**, avec la fonction de Quartz. Quartz
  // réécrit `src` au passage mais ignore `srcset` : sans cela, `src` pointait
  // vers `…grottes-de-rouffignac-2.webp` pendant que `srcset` annonçait
  // `…Grottes%20de%20Rouffignac-2-480.webp`, qui n'existe pas. Le navigateur
  // aurait choisi une variante introuvable — précisément sur les petits écrans
  // que le `srcset` est censé servir.
  const imgTag = (plan, alias) => {
    const url = (d) => encodeURI(prefix + slugifyFilePath(d))
    const srcset = (plan.variants ?? [])
      .map((v) => `${url(v.dest)} ${v.width}w`)
      .concat(plan.width ? `${url(plan.dest)} ${plan.width}w` : [])
      .join(", ")
    const attrs = [
      `src="${url(plan.dest)}"`,
      srcset && `srcset="${srcset}"`,
      srcset && `sizes="${IMAGE_SIZES}"`,
      `alt="${escapeHtml(alias?.trim() ?? "")}"`,
      plan.width && `width="${plan.width}"`,
      plan.height && `height="${plan.height}"`,
      `loading="lazy"`,
      `decoding="async"`,
    ].filter(Boolean)
    return `<img ${attrs.join(" ")} />`
  }

  let out = body.replace(/(!?)\[\[([^\]]+?)\]\]/g, (all, bang, inner) => {
    const parts = inner.split("|")
    const target = parts[0].trim()
    const plan = planFor(target)
    if (!plan) return all
    if (plan.kind === "doc") return docLink(plan, parts.slice(1).join("|"))
    if (plan.kind !== "image") return all
    // Une image seulement citée — `[[image]]` sans `!` — reste un lien.
    if (!bang) {
      const renamed = swapExt(target, ".webp")
      if (renamed === target) return all
      parts[0] = renamed
      return `[[${parts.join("|")}]]`
    }
    // Sans dimensions lisibles, on s'en tient à l'incorporation d'origine.
    if (!plan.width) {
      const renamed = swapExt(target, ".webp")
      if (renamed === target) return all
      parts[0] = renamed
      return `${bang}[[${parts.join("|")}]]`
    }
    return imgTag(plan, parts.slice(1).join("|"))
  })

  out = out.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (all, bang, label, url) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#")) return all
    const plan = planFor(decodeURIComponent(url.split("#")[0].trim()))
    if (!plan) return all
    if (plan.kind === "doc") return docLink(plan, label)
    if (plan.kind !== "image") return all
    return `${bang}[${label}](${encodeURI(prefix + plan.dest)})`
  })

  // Le frontmatter cite lui aussi des pièces jointes (`banner: "[[x.jpeg]]"`).
  // Seul le changement d'extension s'y applique : transformer une
  // incorporation en lien markdown n'aurait aucun sens dans une valeur YAML.
  // La substitution est purement textuelle, à l'intérieur du `[[...]]` : elle
  // ne touche donc ni la structure ni les guillemets du document.
  const head =
    frontmatter === null
      ? null
      : frontmatter.replace(/\[\[([^\]]+?)\]\]/g, (all, inner) => {
          const parts = inner.split("|")
          const target = parts[0].trim()
          const plan = planFor(target)
          if (plan?.kind !== "image") return all
          const renamed = swapExt(target, ".webp")
          if (renamed === target) return all
          parts[0] = renamed
          return `[[${parts.join("|")}]]`
        })

  return head === null ? out : `---\n${head}\n---\n${out}`
}

/** Recursively list every file in the vault, minus ignored directories. */
async function listVaultFiles() {
  return globby("**/*", {
    cwd: VAULT_PATH,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: IGNORED_DIRS.map((d) => `**/${d}/**`),
  })
}

/**
 * Index non-markdown files by basename (with and without extension) so that
 * Obsidian's shortest-path wikilinks can be resolved back to a real file.
 * Collisions are recorded so we can warn instead of guessing silently.
 */
function buildAttachmentIndex(allFiles) {
  const index = new Map()
  const add = (key, relPath) => {
    const lower = key.toLowerCase()
    if (!index.has(lower)) index.set(lower, [])
    index.get(lower).push(relPath)
  }

  for (const relPath of allFiles) {
    const ext = path.extname(relPath).toLowerCase()
    if (!ATTACHMENT_EXTS.has(ext)) continue
    const base = path.basename(relPath)
    add(relPath, relPath)
    add(base, relPath)
    add(base.slice(0, -ext.length), relPath)
  }
  return index
}

/** Index published markdown by the same keys, to detect dangling note links. */
function buildNoteIndex(relPaths) {
  const index = new Set()
  for (const relPath of relPaths) {
    const base = path.basename(relPath, ".md")
    index.add(relPath.toLowerCase())
    index.add(relPath.slice(0, -3).toLowerCase())
    index.add(base.toLowerCase())
  }
  return index
}

function resolveAttachment(target, attachmentIndex) {
  const candidates =
    attachmentIndex.get(target.toLowerCase()) ??
    attachmentIndex.get(path.basename(target).toLowerCase())
  if (!candidates || candidates.length === 0) return null
  return { relPath: candidates[0], ambiguous: candidates.length > 1, candidates }
}

/**
 * Supprime récursivement les dossiers vides sous `root` (jamais `root` lui-même).
 * Parcours en profondeur d'abord : un dossier ne contenant que des dossiers
 * vides devient vide à son tour et disparaît dans la même passe.
 */
async function pruneEmptyDirs(root) {
  const entries = await readdir(root, { withFileTypes: true })
  let remaining = entries.length
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const child = path.join(root, entry.name)
    if (await pruneEmptyDirs(child)) remaining--
  }
  if (remaining === 0 && root !== CONTENT_DIR) {
    await rm(root, { recursive: true, force: true })
    return true
  }
  return false
}

async function copyIfChanged(src, dest, plan) {
  await mkdir(path.dirname(dest), { recursive: true })
  if (path.extname(src).toLowerCase() === ".base") return writeBase(src, dest)
  if (plan?.kind === "image") return writeImage(src, dest)
  if (existsSync(dest)) {
    const [a, b] = await Promise.all([stat(src), stat(dest)])
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return false
  }
  await copyFile(src, dest)
  return true
}

/**
 * Dimensions servies, et largeurs supplémentaires à émettre.
 *
 * Lu **avant** d'écrire quoi que ce soit : les notes portent les dimensions
 * dans leur `<img>`, il faut donc les connaître au moment de les réécrire, pas
 * au moment de copier les fichiers.
 *
 * `rotate()` est appliqué d'abord, sinon une photo verticale prise au téléphone
 * annonce les dimensions de son capteur, couchées.
 */
async function measureImage(src, dest) {
  if (!OPTIMISE_IMAGES) return {}
  try {
    const sharp = await getSharp()
    const meta = await sharp(src).rotate().metadata()
    if (!meta.width || !meta.height) return {}
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(meta.width, meta.height))
    const width = Math.round(meta.width * scale)
    const height = Math.round(meta.height * scale)
    // Une variante n'a de sens que si elle est plus petite que l'image servie.
    const variants = IMAGE_WIDTHS.filter((w) => w < width).map((w) => ({
      width: w,
      dest: dest.replace(/\.webp$/, `-${w}.webp`),
    }))
    return { width, height, variants }
  } catch {
    return {} // image illisible : on retombe sur une incorporation simple
  }
}

/** sharp met ~100 ms à se charger : inutile quand rien n'est à ré-encoder. */
let sharpModule = null
async function getSharp() {
  sharpModule ??= (await import("sharp")).default
  return sharpModule
}

/**
 * Redimensionne et ré-encode une image vers `dest`.
 *
 * `rotate()` sans argument applique l'orientation EXIF. Sans lui, une photo
 * prise au téléphone ressort couchée : sharp retire les métadonnées à
 * l'encodage, et l'orientation partirait avec elles.
 *
 * La taille du fichier de destination ne peut pas servir de test de fraîcheur
 * (elle n'a rien à voir avec celle de la source) : seule la date fait foi.
 */
async function writeImage(src, dest, maxWidth) {
  if (existsSync(dest)) {
    const [a, b] = await Promise.all([stat(src), stat(dest)])
    if (a.mtimeMs <= b.mtimeMs) return false
  }
  const sharp = await getSharp()
  // Une variante est bornée en largeur ; l'image principale, sur son plus
  // grand côté — c'est la surface qui fait le poids (voir IMAGE_MAX_SIDE).
  const fit = maxWidth
    ? { width: maxWidth, withoutEnlargement: true }
    : { width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true }
  const encoded = await sharp(src)
    .rotate()
    .resize(fit)
    .webp({ quality: IMAGE_QUALITY, effort: 5 })
    .toBuffer()
  // Une source WebP déjà bien compressée peut battre le ré-encodage. On garde
  // alors l'original — c'est permis ici, et seulement ici, parce que
  // l'extension de destination est la même : le fichier reste honnête.
  const original = await readFile(src)
  // Jamais pour une variante : garder l'original reviendrait à servir l'image
  // pleine taille sous le nom d'une petite largeur, ce que le `srcset` promet
  // justement de ne pas faire.
  const keepOriginal =
    !maxWidth && path.extname(src).toLowerCase() === ".webp" && original.length <= encoded.length
  await writeFile(dest, keepOriginal ? original : encoded)
  return true
}

/**
 * Allège une vignette déjà téléchargée, sur place et sans changer son nom.
 *
 * Les vignettes gardent leur extension `.jpg` et sont ré-encodées en JPEG,
 * là où les images du coffre passent en WebP. Ce n'est pas une inconséquence :
 * le nom du fichier sert de cache de téléchargement (`existsSync` plus bas
 * évite de redemander le réseau). Le renommer forcerait à re-télécharger
 * quatre-vingts vignettes d'un coup, et Instagram — qui est scrapé, pas
 * interrogé par une API — a toutes les raisons de refuser la rafale. Le poids
 * gagné est le même ; le risque, non.
 */
async function shrinkThumbnail(dest) {
  if (!OPTIMISE_IMAGES || !existsSync(dest)) return false
  const before = (await stat(dest)).size
  // Sans ce seuil, chaque synchronisation ré-encoderait quatre-vingts vignettes
  // pour ne rien changer. Une fois allégée, une vignette repasse en dessous et
  // n'est plus jamais retouchée : l'opération est idempotente et bon marché.
  if (before <= THUMB_MAX_BYTES) return false
  const sharp = await getSharp()
  const encoded = await sharp(dest)
    .rotate()
    .resize({
      width: THUMB_MAX_SIDE,
      height: THUMB_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
    .toBuffer()
  // Un gain marginal ne justifie pas de réécrire : sans ce seuil, une vignette
  // restée juste au-dessus de la limite était ré-encodée à *chaque*
  // synchronisation, perdant quelques octets et un peu de qualité à chaque
  // passage, et salissant le dépôt sans fin. Exiger un dixième garantit la
  // convergence en une passe.
  if (encoded.length > before * 0.9) return false
  await writeFile(dest, encoded)
  return true
}

/**
 * Copie une base en retirant les colonnes de plomberie de chaque vue.
 *
 * Comparaison sur le contenu produit, pas sur taille/date : le fichier écrit
 * diffère de la source, donc le raccourci de `copyIfChanged` ne s'applique pas.
 * Une base illisible est recopiée telle quelle — mieux vaut une colonne de trop
 * qu'une base cassée.
 */
async function writeBase(src, dest) {
  const raw = await readFile(src, "utf8")
  let out = raw
  try {
    const doc = YAML.parse(raw)
    let stripped = false
    for (const view of doc?.views ?? []) {
      if (!Array.isArray(view?.order)) continue
      const kept = view.order.filter((col) => !BASE_HIDDEN_COLUMNS.has(col))
      if (kept.length === view.order.length) continue
      view.order = kept
      stripped = true
    }
    if (stripped) out = YAML.stringify(doc)
  } catch {
    // base non analysable : on garde l'original
  }
  if (existsSync(dest) && (await readFile(dest, "utf8")) === out) return false
  await writeFile(dest, out, "utf8")
  return true
}

async function main() {
  if (!existsSync(VAULT_PATH)) {
    console.error(c.red(`Vault not found: ${VAULT_PATH}`))
    console.error(`Set VAULT_PATH to override.`)
    process.exit(1)
  }

  // Une racine mal orthographiée ne doit pas se traduire par « zéro note
  // publiée », ce qui viderait content/ sans rien signaler d'anormal.
  if (PUBLIC_ROOT && !existsSync(path.join(VAULT_PATH, PUBLIC_ROOT))) {
    console.error(c.red(`Publication root not found: ${PUBLIC_ROOT}/`))
    console.error(`Looked in ${path.join(VAULT_PATH, PUBLIC_ROOT)}`)
    console.error(`Unset PUBLIC_ROOT to scan the whole vault.`)
    process.exit(1)
  }

  console.log(c.bold(`\nSyncing published notes`))
  console.log(`  vault   ${c.dim(VAULT_PATH)}`)
  console.log(`  content ${c.dim(CONTENT_DIR)}`)
  console.log(
    `  scope   ${c.dim(PUBLIC_ROOT ? `${PUBLIC_ROOT}/ (+ \`publish: true\`)` : `whole vault (\`publish: true\` only)`)}`,
  )
  if (DRY_RUN) console.log(c.yellow(`  dry run — nothing will be written\n`))
  else console.log()

  const allFiles = await listVaultFiles()
  // `allFiles` reste complet : l'index des pièces jointes doit pouvoir
  // résoudre une image ou une base rangée hors de la racine de publication.
  // Seules les **notes** sont restreintes.
  const markdownFiles = allFiles
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .filter((f) => isUnderPublicRoot(f))

  // ---- 1. Decide what is published -------------------------------------
  const published = []
  const homepageButUnpublished = []
  for (const relPath of markdownFiles) {
    const raw = await readFile(path.join(VAULT_PATH, relPath), "utf8")
    const frontmatter = parseFrontmatter(raw, relPath)
    if (!isPublished(frontmatter)) {
      // Worth flagging: the intent is clear but the note would stay invisible.
      if (isHomepage(frontmatter)) homepageButUnpublished.push(relPath)
      continue
    }
    published.push({ relPath, raw, frontmatter })
  }

  // ---- 1b. Resolve the landing page ------------------------------------
  // At most one note may claim it; ties are broken by path so that repeated
  // runs give the same result rather than depending on directory order.
  const claimants = published
    .filter((p) => isHomepage(p.frontmatter))
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
  const homepageNote = claimants[0] ?? null
  const rejectedClaimants = claimants.slice(1)

  // Each note's destination, which is its vault path unless it is the homepage.
  // Le préfixe de la racine de publication est retiré : il organise le coffre,
  // il n'a pas à s'inviter dans les URL du site.
  for (const note of published) {
    note.dest = note === homepageNote ? "index.md" : stripPublicRoot(note.relPath)
  }

  // ---- 2. Resolve attachments referenced by published notes -------------
  // Placé avant toute transformation du texte : les notes sont réécrites à
  // partir du plan calculé ici, et l'encapsulation des vidéos qui suit produit
  // du HTML dont les `<img src>` n'ont rien à faire dans cette réécriture.
  const attachmentIndex = buildAttachmentIndex(allFiles)
  // Built from destinations, not sources: a link to the homepage note under its
  // old name genuinely will not resolve, and should be reported as such.
  const noteIndex = buildNoteIndex(published.map((p) => p.dest))

  const attachmentsToCopy = new Map() // vault relPath -> referencing notes
  const attachmentPlans = new Map() // vault relPath -> plan (voir attachmentPlan)
  const dangling = [] // { from, target }
  const ambiguous = [] // { from, target, candidates }

  for (const note of published) {
    note.plans = new Map() // cible telle qu'écrite dans la note -> plan
    for (const target of extractReferences(note.raw)) {
      const ext = path.extname(target).toLowerCase()

      // A reference with no extension, or an explicit .md, is a note link.
      if (ext === "" || ext === ".md") {
        const key = target.toLowerCase().replace(/\.md$/, "")
        if (!noteIndex.has(key) && !noteIndex.has(`${key}.md`)) {
          dangling.push({ from: note.relPath, target })
        }
        continue
      }

      const hit = resolveAttachment(target, attachmentIndex)
      if (!hit) {
        dangling.push({ from: note.relPath, target })
        continue
      }
      if (hit.ambiguous) {
        ambiguous.push({ from: note.relPath, target, candidates: hit.candidates })
      }
      if (!attachmentsToCopy.has(hit.relPath)) attachmentsToCopy.set(hit.relPath, [])
      attachmentsToCopy.get(hit.relPath).push(note.relPath)

      if (!attachmentPlans.has(hit.relPath)) {
        const plan = { ...attachmentPlan(hit.relPath), relPath: hit.relPath }
        // Le poids d'un document est annoncé dans le lien : il se lit sur la
        // source, la copie étant à l'octet près la même.
        if (plan.kind === "doc") {
          plan.size = (await stat(path.join(VAULT_PATH, hit.relPath))).size
        }
        if (plan.kind === "image") {
          Object.assign(plan, await measureImage(path.join(VAULT_PATH, hit.relPath), plan.dest))
        }
        attachmentPlans.set(hit.relPath, plan)
      }
      note.plans.set(target, attachmentPlans.get(hit.relPath))
    }
  }

  // Deux sources ne peuvent pas viser la même destination : `photo.png` et
  // `photo.jpg` deviendraient tous deux `photo.webp`, et la seconde copie
  // écraserait la première sans un mot. Le cas est rare et se règle dans le
  // coffre ; en attendant, les deux gardent leur nom d'origine.
  const collisions = []
  const byDest = new Map()
  for (const plan of attachmentPlans.values()) {
    if (!byDest.has(plan.dest)) byDest.set(plan.dest, [])
    byDest.get(plan.dest).push(plan)
  }
  for (const [dest, plans] of byDest) {
    if (plans.length < 2) continue
    collisions.push({ dest, sources: plans.map((p) => p.relPath) })
    for (const plan of plans) {
      plan.kind = "raw"
      plan.dest = stripPublicRoot(plan.relPath)
    }
  }

  // ---- 2b. Transformations, appliquées à la copie et jamais au coffre ----
  // Encapsulation des vidéos : le contenu écrit dans `content/` diverge ici du
  // coffre. En deux temps, car on n'encapsule que ce dont on a la vignette :
  // il faut donc savoir avant de transformer.
  const mediaWanted = new Set()
  if (YOUTUBE_EMBED) for (const note of published) for (const k of scanMedia(note.raw)) mediaWanted.add(k)

  const mediaAvailable = new Set()
  const mediaDead = []
  let thumbsShrunk = 0
  for (const key of mediaWanted) {
    const dest = path.join(CONTENT_DIR, thumbSlugFor(key))
    // Déjà téléchargée : on ne redemande pas le réseau à chaque synchronisation.
    if (existsSync(dest)) {
      mediaAvailable.add(key)
      if (!DRY_RUN && (await shrinkThumbnail(dest))) thumbsShrunk++
      continue
    }
    // En simulation on ne télécharge rien ; l'aperçu se limite donc au cache.
    if (DRY_RUN) continue
    const id = key.slice(3)
    const ok = key.startsWith("yt:")
      ? await fetchThumbnail(id, dest)
      : await fetchInstagramThumb(id, dest)
    if (ok) {
      mediaAvailable.add(key)
      if (await shrinkThumbnail(dest)) thumbsShrunk++
    } else mediaDead.push(key)
  }

  // Étiquette hiérarchique de lieu, déduite du lien `place:` (voir plus haut).
  const placeIndex = buildPlaceIndex(published)
  const placeBreaks = []
  const placeUnknown = []
  const blogPlaces = new Set() // lieux servant à un billet, pour la carte du blog
  let placesTagged = 0

  const thumbnails = new Map() // slug dans content/ -> clé du média
  for (const note of published) {
    const rewritten = rewriteAttachmentRefs(note.raw, note.dest, (t) => note.plans.get(t) ?? null)
    const { text, thumbs } = embedYouTube(rewritten, note.dest, mediaAvailable)
    note.output = text
    for (const [slug, key] of thumbs) thumbnails.set(slug, key)

    const raw = note.frontmatter?.place
    const target = typeof raw === "string" ? raw.match(/\[\[([^\]|#]+)/)?.[1]?.trim() : null
    if (!target) continue
    const chain = placeChain(target, placeIndex, (why) => {
      if (!placeBreaks.includes(why)) placeBreaks.push(why)
    })
    if (!chain || chain.length === 0) {
      placeUnknown.push({ from: note.relPath, target })
      continue
    }
    if (note.dest.startsWith("blog/")) {
      for (const name of chain) blogPlaces.add(name.toLowerCase())
    }
    const tag = `${PLACE_TAG_ROOT}/${chain.map(placeSlug).join("/")}`
    const { frontmatter, body } = splitFrontmatter(note.output)
    note.output = `---\n${addTag(frontmatter, tag)}\n---\n${body}`
    placesTagged++
  }

  if (published.length === 0) {
    console.log(c.yellow(`No notes carry \`publish: true\` — nothing to sync.`))
    console.log(
      c.dim(`Add \`publish: true\` to a note's frontmatter to publish it.\n`),
    )
  }

  // ---- 2c. Cartes -------------------------------------------------------
  // Après l'étiquetage : on sait alors quels lieux servent aux billets.
  const mapPoints = []
  for (const note of published) {
    if (note.frontmatter?.type !== "place") continue
    const raw = String(note.frontmatter.coordinates ?? "").trim()
    const m = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (!m) {
      if (raw) placeBreaks.push(`coordonnées illisibles sur ${note.relPath} : « ${raw} »`)
      continue
    }
    const name = path.basename(note.relPath, ".md")
    const parentRaw = note.frontmatter.parent
    const parentLink =
      typeof parentRaw === "string" ? parentRaw.match(/\[\[([^\]|#]+)/)?.[1]?.trim() : null
    mapPoints.push({
      name,
      lat: Number(m[1]),
      lon: Number(m[2]),
      parentName: parentLink ? path.basename(parentLink) : null,
      map: note.frontmatter.map ?? null,
      inBlog: blogPlaces.has(name.toLowerCase()),
      href: note.dest.replace(/\.md$/, ""),
    })
  }

  let mapsDrawn = 0
  const mapsMissing = []
  for (const note of published) {
    if (!MAP_MARKER.test(note.output)) continue
    MAP_MARKER.lastIndex = 0
    const prefix = "../".repeat(note.dest.split("/").length - 1)
    note.output = note.output.replace(MAP_MARKER, (all, name) => {
      const def = MAPS[name]
      if (!def) {
        mapsMissing.push({ from: note.relPath, name })
        return all
      }
      // Un lieu n'est tracé que s'il porte des coordonnées. Un pays n'en a pas :
      // sa position ne serait qu'un centroïde, qui écarterait le cadre de
      // plusieurs centaines de kilomètres et relierait des salles de spectacle
      // à un point qui n'existe nulle part. Il reste un maillon de la
      // hiérarchie et un ancêtre d'étiquette, sans être un point.
      const pts = mapPoints
        .filter(def.select)
        .map((p) => ({ ...p, href: encodeURI(prefix + p.href) }))
      mapsDrawn++
      return renderMap(pts, { title: def.title })
    })
  }
  if (mapsDrawn) console.log(c.dim(`  ${mapsDrawn} carte(s) dessinée(s)`))
  for (const m of mapsMissing) {
    console.log(c.yellow(`  carte inconnue : « ${m.name} » (appelée par ${m.from})`))
  }

  // ---- 3. Work out the exact desired state of content/ ------------------
  // Les pièces jointes subissent le même retrait de préfixe que les notes :
  // `public/_assets/images/x.png` -> `content/_assets/images/x.png`. Sans cela,
  // ranger les images sous la racine de publication réintroduirait `public/`
  // dans l'URL des images, alors que les pages, elles, n'en portent pas.
  const desired = new Set([
    ...published.map((p) => p.dest),
    ...[...attachmentsToCopy.keys()].map((relPath) => attachmentPlans.get(relPath).dest),
    // Les largeurs supplémentaires du `srcset` : sans elles ici, la passe de
    // nettoyage les supprimerait aussitôt écrites.
    ...[...attachmentsToCopy.keys()].flatMap(
      (relPath) => (attachmentPlans.get(relPath).variants ?? []).map((v) => v.dest),
    ),
    ...thumbnails.keys(),
  ])

  const existing = existsSync(CONTENT_DIR)
    ? await globby("**/*", { cwd: CONTENT_DIR, dot: false, onlyFiles: true })
    : []

  // A homepage is generated only when the vault does not supply one, either as
  // a note marked `homepage: true` or a note literally at `index.md`.
  const vaultHasIndex = desired.has("index.md")
  const generatedIndex = "index.md"

  const stale = existing.filter(
    (f) => !desired.has(f) && !(f === generatedIndex && !vaultHasIndex),
  )

  // Garde-fou : publier zéro note alors que content/ en contient déjà signifie
  // presque toujours une erreur de configuration (racine de publication mal
  // nommée, VAULT_PATH pointant ailleurs, drapeaux `publish` perdus lors d'un
  // déplacement) — pas une intention. Sans ce test, la synchronisation vide
  // content/ en silence et la CI déploie un site vide.
  const existingNotes = existing.filter((f) => f.toLowerCase().endsWith(".md"))
  if (published.length === 0 && existingNotes.length > 0 && !FORCE) {
    console.error(
      c.red(`\nRefus : 0 note à publier, alors que content/ en contient ${existingNotes.length}.`),
    )
    console.error(`  vault  ${VAULT_PATH}`)
    console.error(`  scope  ${PUBLIC_ROOT ? `${PUBLIC_ROOT}/` : "whole vault"}`)
    console.error(
      c.dim(`\n  Vérifiez PUBLIC_ROOT et VAULT_PATH, ou que les notes portent bien`),
    )
    console.error(c.dim(`  \`publish: true\`. Pour vider content/ délibérément : --force.\n`))
    process.exit(1)
  }

  // ---- 4. Apply ---------------------------------------------------------
  let written = 0
  let unchanged = 0

  for (const note of published) {
    const label =
      note.dest === note.relPath ? note.relPath : `${note.relPath} -> ${note.dest}`
    const dest = path.join(CONTENT_DIR, note.dest)
    if (!DRY_RUN) {
      await mkdir(path.dirname(dest), { recursive: true })
      const prev = existsSync(dest) ? await readFile(dest, "utf8") : null
      if (prev === note.output) {
        unchanged++
      } else {
        await writeFile(dest, note.output, "utf8")
        written++
        if (VERBOSE) console.log(c.green(`  + ${label}`))
      }
    } else if (VERBOSE) {
      console.log(c.green(`  + ${label}`))
    }
  }

  let attachmentsWritten = 0
  for (const relPath of attachmentsToCopy.keys()) {
    const plan = attachmentPlans.get(relPath)
    const dest = plan.dest
    const label = dest === relPath ? relPath : `${relPath} -> ${dest}`
    if (DRY_RUN) {
      if (VERBOSE) console.log(c.green(`  + ${label}`))
      continue
    }
    const changed = await copyIfChanged(
      path.join(VAULT_PATH, relPath),
      path.join(CONTENT_DIR, dest),
      plan,
    )
    for (const v of plan.variants ?? []) {
      await writeImage(path.join(VAULT_PATH, relPath), path.join(CONTENT_DIR, v.dest), v.width)
    }
    if (changed) {
      attachmentsWritten++
      if (VERBOSE) console.log(c.green(`  + ${label}`))
    }
  }

  for (const relPath of stale) {
    if (!DRY_RUN) await rm(path.join(CONTENT_DIR, relPath), { force: true })
    console.log(c.red(`  - ${relPath} ${c.dim("(unpublished)")}`))
  }

  // Supprimer un fichier ne supprime pas son dossier : après un déplacement de
  // notes dans le coffre, `content/` gardait des dossiers vides indéfiniment.
  // Git les ignore, mais ils brouillent la lecture de l'arborescence.
  if (!DRY_RUN) await pruneEmptyDirs(CONTENT_DIR)

  if (!vaultHasIndex) {
    const homepage = buildHomepage(published)
    if (!DRY_RUN) {
      await mkdir(CONTENT_DIR, { recursive: true })
      await writeFile(path.join(CONTENT_DIR, generatedIndex), homepage, "utf8")
    }
  }

  // ---- 5. Report --------------------------------------------------------
  console.log(c.bold(`\nSummary`))
  console.log(`  ${published.length} note(s) published, ${attachmentsToCopy.size} attachment(s)`)
  if (!DRY_RUN) {
    console.log(
      c.dim(`  ${written} note(s) written, ${unchanged} unchanged, ${attachmentsWritten} attachment(s) copied`),
    )
  }
  if (mediaWanted.size) {
    console.log(c.dim(`  ${thumbnails.size}/${mediaWanted.size} média(s) encapsulé(s)`))
    if (mediaDead.length) {
      console.log(
        c.yellow(`  ${mediaDead.length} média(s) sans vignette — supprimés, privés ou inaccessibles ; lien laissé tel quel :`),
      )
      for (const key of mediaDead) {
        const id = key.slice(3)
        console.log(
          c.dim(`    ${key.startsWith("yt:") ? `https://youtu.be/${id}` : `https://www.instagram.com/p/${id}/`}`),
        )
      }
    }
  }
  if (!DRY_RUN) {
    const images = [...attachmentPlans.values()].filter((p) => p.kind === "image")
    if (images.length) {
      let from = 0
      let to = 0
      for (const p of images) {
        from += (await stat(path.join(VAULT_PATH, p.relPath))).size
        const d = path.join(CONTENT_DIR, p.dest)
        if (existsSync(d)) to += (await stat(d)).size
      }
      console.log(
        c.dim(`  ${images.length} image(s) ré-encodée(s) : ${humanSize(from)} -> ${humanSize(to)}`),
      )
    }
    if (thumbsShrunk) console.log(c.dim(`  ${thumbsShrunk} vignette(s) allégée(s) sur place`))
  }
  if (placesTagged || placeUnknown.length || placeBreaks.length) {
    console.log(
      c.dim(`  ${placesTagged} note(s) situées — étiquette \`${PLACE_TAG_ROOT}/…\` déduite`),
    )
    for (const why of placeBreaks) console.log(c.yellow(`  chaîne des lieux : ${why}`))
    for (const u of placeUnknown) {
      console.log(c.yellow(`  lieu inconnu : ${u.target} (cité par ${u.from})`))
    }
  }
  const docs = [...attachmentPlans.values()].filter((p) => p.kind === "doc")
  if (docs.length) {
    console.log(c.dim(`  ${docs.length} document(s) lié(s) plutôt qu'incorporé(s), sous ${DOC_DIR}/`))
  }
  if (collisions.length) {
    console.log(
      c.yellow(`\n${collisions.length} collision(s) de nom après conversion — originaux conservés :`),
    )
    for (const col of collisions) {
      console.log(c.dim(`  ${col.dest} <- ${col.sources.join(", ")}`))
    }
    console.log(c.dim(`  Renommez l'une des sources dans le coffre pour les alléger.`))
  }
  if (stale.length) console.log(c.dim(`  ${stale.length} file(s) removed`))
  if (homepageNote) {
    console.log(c.dim(`  homepage from ${homepageNote.relPath}`))
  } else if (!vaultHasIndex) {
    console.log(
      c.dim(`  index.md generated (no note carries \`homepage: true\`)`),
    )
  }

  if (rejectedClaimants.length) {
    console.log(
      c.yellow(`\n${rejectedClaimants.length + 1} notes carry \`homepage: true\` — only one can be the landing page:`),
    )
    console.log(c.dim(`  used:    ${homepageNote.relPath}`))
    for (const r of rejectedClaimants) {
      console.log(c.dim(`  ignored: ${r.relPath} (published at its normal path)`))
    }
  }

  if (homepageButUnpublished.length) {
    console.log(
      c.yellow(`\n${homepageButUnpublished.length} note(s) carry \`homepage: true\` but not \`publish: true\`:`),
    )
    for (const p of homepageButUnpublished) console.log(c.dim(`  ${p}`))
    console.log(
      c.dim(`  They stay unpublished. Add \`publish: true\` to use one as the homepage.`),
    )
  }

  if (ambiguous.length) {
    console.log(c.yellow(`\n${ambiguous.length} ambiguous attachment name(s) — first match used:`))
    for (const a of ambiguous.slice(0, 10)) {
      console.log(c.dim(`  ${a.target} (in ${a.from}) -> ${a.candidates[0]}`))
    }
  }

  if (dangling.length) {
    // Grouped by target rather than listed per occurrence: one missing note
    // linked from thirty places is one thing to fix, not thirty. A flat list
    // also truncates badly once the site grows past a handful of notes.
    const byTarget = new Map()
    for (const d of dangling) {
      if (!byTarget.has(d.target)) byTarget.set(d.target, [])
      byTarget.get(d.target).push(d.from)
    }
    const rows = [...byTarget.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )

    console.log(
      c.yellow(
        `\n${dangling.length} link(s) to ${rows.length} missing target(s) — they will not resolve:`,
      ),
    )

    const limit = VERBOSE ? rows.length : 25
    for (const [target, froms] of rows.slice(0, limit)) {
      const count = froms.length > 1 ? c.dim(` (x${froms.length})`) : ""
      // One example source is enough to locate it; --verbose lists them all.
      const where = VERBOSE ? froms.join(", ") : froms[0]
      console.log(`  ${`[[${target}]]`.padEnd(30)}${count} ${c.dim(where)}`)
    }
    if (rows.length > limit) {
      console.log(c.dim(`  ... and ${rows.length - limit} more — run with --verbose`))
    }

    console.log(
      c.dim(`\n  Expected when a published note links to a private or unwritten one.`),
    )
    console.log(
      c.dim(`  Nothing private was copied — the link simply renders as plain text.`),
    )
  }

  console.log()
}

/** A simple landing page listing published notes, grouped by vault folder. */
/**
 * Un lien de la page d'accueil vers une note publiée.
 *
 * Le wikilink est préféré : lisible, et résolu par Quartz. Mais son séparateur
 * d'alias est `|`, caractère fréquent dans les titres de captures Instagram
 * (« Fran Lebowitz | Fan Page »). Quartz coupe alors la cible à la première
 * barre et le lien meurt ; l'échappement `\|` ne le sauve pas — vérifié.
 * Pour ces noms-là on passe donc par un lien markdown vers le slug calculé.
 */
function homepageLink(dest, title) {
  const target = dest.slice(0, -3)
  if (!target.includes("|")) return `[[${target}|${title}]]`
  const href = slugifyFilePath(dest).split("/").map(encodeURIComponent).join("/")
  return `[${title.replaceAll("[", "\\[").replaceAll("]", "\\]")}](${href})`
}

/**
 * Page d'accueil de repli, quand aucune note ne porte `homepage: true`.
 *
 * Tout se calcule sur `note.dest`, jamais sur `note.relPath` : la destination
 * est le chemin réel dans `content/`, dont la racine de publication a été
 * retirée. Bâtir les liens sur le chemin du coffre produisait des cibles
 * `public/...` qui n'existent pas — toute l'accueil renvoyait en 404.
 */
function buildHomepage(published) {
  const byFolder = new Map()
  for (const note of published) {
    const folder = path.dirname(note.dest)
    const key = folder === "." ? "" : folder
    if (!byFolder.has(key)) byFolder.set(key, [])
    byFolder.get(key).push(note)
  }

  // `publish: true` is required: the ExplicitPublish filter drops any page
  // without it, and would otherwise silently delete this homepage.
  const lines = ["---", "title: Accueil", "publish: true", "---", ""]

  if (published.length === 0) {
    lines.push(
      "Aucune note publiée pour le moment.",
      "",
      "Ajoutez `publish: true` au frontmatter d'une note de votre coffre Obsidian,",
      "puis relancez `npm run sync`.",
      "",
    )
    return lines.join("\n")
  }

  for (const key of [...byFolder.keys()].sort()) {
    if (key !== "") lines.push(`## ${key}`, "")
    const notes = byFolder.get(key).sort((a, b) => a.dest.localeCompare(b.dest))
    for (const note of notes) {
      const title = note.frontmatter?.title ?? path.basename(note.dest, ".md")
      lines.push(`- ${homepageLink(note.dest, title)}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

await main()
