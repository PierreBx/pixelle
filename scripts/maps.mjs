/**
 * Cartes : un SVG engendré à la synchronisation, à partir des coordonnées des
 * notes de lieux.
 *
 * Pourquoi pas une vraie carte glissante : Quartz ne rend ni `leaflet` ni
 * `mapview` — le paquet qui en porte le nom est un gabarit vide — et des tuiles
 * OpenStreetMap seraient une requête tierce à chaque déplacement, sur un site
 * qui n'en fait aucune. Le SVG est calculé une fois, servi depuis le site, et
 * ne parle à personne.
 *
 * Conséquence assumée : **sans fond de carte, ce n'est pas une carte mais un
 * repère.** Les positions relatives sont justes — c'est une projection
 * équirectangulaire, avec la correction en cosinus de la latitude — mais rien
 * ne dessine les côtes. Une définition de carte peut fournir un fond
 * (`basemap` + `bbox`) : il est alors dessiné derrière, et les points s'y
 * placent. Tant qu'aucun fond n'est fourni, on affiche un quadrillage gradué,
 * qui situe honnêtement sans prétendre à la géographie.
 */

/** Projection équirectangulaire. La longitude est comprimée par cos(lat). */
function project(places) {
  const lats = places.map((p) => p.lat)
  const lons = places.map((p) => p.lon)
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const kx = Math.cos((midLat * Math.PI) / 180) || 1
  return {
    x: (lon) => lon * kx,
    y: (lat) => -lat,
    kx,
  }
}

function niceStep(span) {
  const raw = span / 4
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow
  return 10 * pow
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * @param places [{ name, slug, lat, lon, parentSlug }]
 * @param opts   { title, width, basemap?: {href, bbox:[west,south,east,north]} }
 * @returns le SVG, prêt à être inséré dans une note.
 */
export function renderMap(places, opts = {}) {
  const { title = "Carte", width = 760 } = opts
  if (places.length === 0) {
    return `<p class="map-empty">Aucun lieu situé pour cette carte.</p>`
  }

  const proj = project(places)
  const pts = places.map((p) => ({ ...p, px: proj.x(p.lon), py: proj.y(p.lat) }))

  // Cadre : les points, plus une marge, avec un minimum pour qu'un lieu isolé
  // ne soit pas affiché à l'échelle du mètre.
  const minSpan = 0.15
  let [x0, x1] = [Math.min(...pts.map((p) => p.px)), Math.max(...pts.map((p) => p.px))]
  let [y0, y1] = [Math.min(...pts.map((p) => p.py)), Math.max(...pts.map((p) => p.py))]
  if (x1 - x0 < minSpan) [x0, x1] = [(x0 + x1) / 2 - minSpan / 2, (x0 + x1) / 2 + minSpan / 2]
  if (y1 - y0 < minSpan) [y0, y1] = [(y0 + y1) / 2 - minSpan / 2, (y0 + y1) / 2 + minSpan / 2]
  const padX = (x1 - x0) * 0.14
  const padY = (y1 - y0) * 0.18
  ;[x0, x1, y0, y1] = [x0 - padX, x1 + padX, y0 - padY, y1 + padY]

  // Le cadre est ramené dans des proportions lisibles. Une poignée de salles
  // bordelaises et une grotte du Périgord tiennent dans une bande six fois plus
  // large que haute : exact, et illisible. On élargit le côté trop court —
  // c'est de la marge ajoutée, pas une déformation : l'échelle reste la même
  // sur les deux axes, et les positions relatives ne bougent pas.
  const MIN_RATIO = 0.4
  const MAX_RATIO = 0.85
  const grow = (a, b, target) => {
    const mid = (a + b) / 2
    return [mid - target / 2, mid + target / 2]
  }
  const spanX = x1 - x0
  const spanY = y1 - y0
  if (spanY / spanX < MIN_RATIO) [y0, y1] = grow(y0, y1, spanX * MIN_RATIO)
  else if (spanY / spanX > MAX_RATIO) [x0, x1] = grow(x0, x1, spanY / MAX_RATIO)

  const height = Math.round((width * (y1 - y0)) / (x1 - x0))
  const sx = (x) => ((x - x0) / (x1 - x0)) * width
  const sy = (y) => ((y - y0) / (y1 - y0)) * height
  const byName = new Map(pts.map((p) => [p.name, p]))

  const out = []
  out.push(
    `<svg class="pixelle-map" viewBox="0 0 ${width} ${height}" width="100%" ` +
      `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)} : ${pts.length} lieux">`,
    `<title>${esc(title)}</title>`,
  )

  if (opts.basemap) {
    const [w, s, e, n] = opts.basemap.bbox
    const bx = sx(proj.x(w))
    const bw = sx(proj.x(e)) - bx
    const by = sy(proj.y(n))
    const bh = sy(proj.y(s)) - by
    out.push(
      `<image href="${esc(opts.basemap.href)}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" ` +
        `width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" preserveAspectRatio="none"/>`,
    )
  } else {
    // Quadrillage gradué : il situe sans prétendre dessiner la géographie.
    const stepLon = niceStep((x1 - x0) / proj.kx)
    const stepLat = niceStep(y1 - y0)
    out.push(`<g stroke="currentColor" stroke-width="0.5" opacity="0.16">`)
    for (let lon = Math.ceil((x0 / proj.kx) / stepLon) * stepLon; proj.x(lon) <= x1; lon += stepLon) {
      const X = sx(proj.x(lon)).toFixed(1)
      out.push(`<line x1="${X}" y1="0" x2="${X}" y2="${height}"/>`)
    }
    for (let lat = Math.ceil(-y1 / stepLat) * stepLat; -lat >= y0; lat += stepLat) {
      const Y = sy(-lat).toFixed(1)
      out.push(`<line x1="0" y1="${Y}" x2="${width}" y2="${Y}"/>`)
    }
    out.push(`</g>`)
  }

  // Rattachement au parent : la hiérarchie devient visible.
  out.push(`<g stroke="currentColor" stroke-width="1" opacity="0.28" stroke-linecap="round">`)
  for (const p of pts) {
    const parent = p.parentName && byName.get(p.parentName)
    if (!parent) continue
    out.push(
      `<line x1="${sx(p.px).toFixed(1)}" y1="${sy(p.py).toFixed(1)}" ` +
        `x2="${sx(parent.px).toFixed(1)}" y2="${sy(parent.py).toFixed(1)}"/>`,
    )
  }
  out.push(`</g>`)

  // Les lieux, du plus englobant au plus précis, pour que les étiquettes des
  // feuilles passent au-dessus.
  const depth = (p) => {
    let d = 0
    let cur = p
    const seen = new Set()
    while (cur?.parentName && !seen.has(cur.name)) {
      seen.add(cur.name)
      cur = byName.get(cur.parentName)
      d++
    }
    return d
  }
  // Placement glouton des étiquettes. Sans lui, trois salles bordelaises
  // distantes de deux cents mètres écrivent leur nom au même endroit. On essaie
  // quatre positions autour du point et on garde la première libre ; si tout
  // est pris, le point reste, sans nom — mieux vaut une étiquette manquante
  // qu'un empilement illisible.
  const placed = []
  const CH = 6.6 // largeur approchée d'un caractère à 13 px
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  for (const p of [...pts].sort((a, b) => depth(b) - depth(a))) {
    const X = sx(p.px)
    const Y = sy(p.py)
    const r = p.parentName ? 4 : 5.5
    const w = p.name.length * CH
    const h = 15
    const candidates = [
      { anchor: "start", x: X + r + 5, y: Y + 4 },
      { anchor: "end", x: X - r - 5, y: Y + 4 },
      { anchor: "start", x: X + r + 5, y: Y - 9 },
      { anchor: "end", x: X - r - 5, y: Y - 9 },
      { anchor: "middle", x: X, y: Y - r - 6 },
      { anchor: "middle", x: X, y: Y + r + 15 },
    ]
    let chosen = null
    for (const cand of candidates) {
      const left = cand.anchor === "end" ? cand.x - w : cand.anchor === "middle" ? cand.x - w / 2 : cand.x
      const box = { x: left, y: cand.y - 11, w, h }
      if (box.x < 0 || box.x + box.w > width || box.y < 0 || box.y + box.h > height) continue
      if (placed.some((b) => overlaps(box, b))) continue
      placed.push(box)
      chosen = cand
      break
    }
    out.push(
      `<a href="${esc(p.href)}" class="internal">`,
      `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${r}" fill="currentColor" opacity="0.75"/>`,
    )
    if (chosen) {
      out.push(
        `<text x="${chosen.x.toFixed(1)}" y="${chosen.y.toFixed(1)}" ` +
          `text-anchor="${chosen.anchor}" font-size="13" fill="currentColor" ` +
          `paint-order="stroke" stroke="var(--light)" stroke-width="3.5" stroke-linejoin="round">` +
          `${esc(p.name)}</text>`,
      )
    }
    out.push(`</a>`)
  }

  out.push(`</svg>`)
  return out.join("\n")
}
