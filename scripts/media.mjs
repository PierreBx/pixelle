/**
 * Encapsulation des vidéos YouTube et Instagram.
 *
 * Extrait de `sync-vault.mjs` : ce module ne connaît rien du coffre ni de
 * `content/`. Il sait reconnaître une URL, en tirer un identifiant, télécharger
 * une vignette et fabriquer la façade qui ne contactera personne avant le clic.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { splitFrontmatter } from "./notes.mjs"
import { c } from "./term.mjs"

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

export { YOUTUBE_EMBED, THUMB_DIR, IG_THUMB_DIR, youTubeVideoId, escapeHtml, scanMedia, thumbSlugFor, embedYouTube, instagramShortcode, fetchInstagramThumb, fetchThumbnail }
