#!/usr/bin/env node
/**
 * Cherche, parmi les liens externes de `content/`, ceux qui sont morts.
 *
 *   node scripts/check-links.mjs            # rapport lisible
 *   node scripts/check-links.mjs --markdown # rapport pour un ticket
 *
 * Le site cite 85 vidéos et publications tierces. Quand l'une disparaît, la
 * vignette reste et le lien ne mène plus nulle part : le site vieillit sans le
 * dire. Ce script est la veille correspondante.
 *
 * Ce qu'il sait faire, et ce qu'il ne sait pas :
 *
 *   - **YouTube** — la vignette `img.youtube.com/vi/<id>/hqdefault.jpg` répond
 *     404 quand la vidéo est supprimée ou privée. C'est exactement le test que
 *     fait déjà la synchronisation, et il est fiable.
 *   - **Instagram** — non vérifiable. La disponibilité ne s'y lit qu'en
 *     scrapant `/embed`, ce que Meta bloque depuis une adresse d'intégration
 *     continue. Un test ferait croire à des liens morts qui ne le sont pas :
 *     on préfère ne rien dire que mentir. Les liens Instagram sont comptés,
 *     jamais jugés.
 *   - **Le reste** — une requête HEAD, puis GET si le serveur refuse HEAD.
 *     Seuls 404 et 410 comptent comme morts. Un 403, un 429, un délai dépassé
 *     ou une erreur serveur sont rangés en « indéterminé » : ce sont les
 *     réponses qu'un site donne à un robot, pas les signes d'une page disparue.
 *
 * Sortie 1 s'il y a au moins un lien mort — de quoi faire échouer un travail
 * planifié et ouvrir un ticket.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { globby } from "globby"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PUBLIC_DIR = path.join(REPO_ROOT, "public")

const MARKDOWN = process.argv.includes("--markdown")
const CONCURRENCY = Number(process.env.LINK_CONCURRENCY ?? 6)
const TIMEOUT_MS = Number(process.env.LINK_TIMEOUT_MS ?? 15000)

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

/**
 * Relève les cibles externes dans le site **construit**, et non dans les notes.
 *
 * Ce détail décide de la justesse du rapport. Une URL nue collée dans une note
 * n'a pas de fin évidente — le site en contient qui se terminent par un emoji,
 * ou soudées au mot suivant, parce qu'une description de vidéo a été copiée
 * telle quelle. Deviner leur limite dans le markdown, c'est inventer des liens
 * morts ou en manquer. Le HTML, lui, ne laisse aucune ambiguïté : ce qui est
 * dans un `href` est exactement ce qu'un lecteur peut cliquer. Une URL mal
 * découpée à la source y apparaît telle qu'elle est publiée, donc telle qu'elle
 * casse.
 *
 * Les vignettes vidéo font exception : leur `<iframe>` n'est construit qu'au
 * clic, l'identifiant vit dans `data-yt` / `data-ig`.
 */
async function collect() {
  const pages = await globby("**/*.html", { cwd: PUBLIC_DIR })
  if (pages.length === 0) {
    console.error(c.red(`Aucune page dans ${PUBLIC_DIR} — lancez d'abord \`npm run build:ci\`.`))
    process.exit(2)
  }

  const youtube = new Map() // id -> pages
  const instagram = new Map() // id ou url -> pages
  const others = new Map() // url -> pages

  // Les pages de bases et les index republient la description d'une note, donc
  // ses liens. Les citer alourdirait le rapport sans rien apprendre : on ne
  // retient que la page qui porte réellement le lien.
  const INDEXES = new Set(["index.html", "journal.html", "sommaire.html", "trouvailles.html"])
  const add = (map, key, page) => {
    if (page.startsWith("_assets/") || INDEXES.has(page)) return
    if (!map.has(key)) map.set(key, [])
    if (!map.get(key).includes(page)) map.get(key).push(page)
  }

  for (const rel of pages) {
    const html = await readFile(path.join(PUBLIC_DIR, rel), "utf8")

    for (const m of html.matchAll(/data-yt="([\w-]+)"/g)) add(youtube, m[1], rel)
    for (const m of html.matchAll(/data-ig="([\w-]+)"/g)) add(instagram, m[1], rel)

    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const url = decodeHtml(m[1])
      let host
      try {
        host = new URL(url).hostname.replace(/^www\./, "")
      } catch {
        continue
      }
      if (host.endsWith("instagram.com")) {
        add(instagram, url, rel)
        continue
      }
      if (host.endsWith("youtube.com") || host === "youtu.be") {
        const id =
          url.match(/[?&]v=([\w-]+)/)?.[1] ??
          url.match(/youtu\.be\/([\w-]+)/)?.[1] ??
          url.match(/embed\/([\w-]+)/)?.[1]
        if (id) {
          add(youtube, id, rel)
          continue
        }
      }
      // Le site lui-même, et les hôtes que Quartz cite dans son gabarit.
      if (host === "pierrebx.github.io" || host === "quartz.jzhao.xyz") continue
      add(others, url, rel)
    }
  }
  return { youtube, instagram, others }
}

const decodeHtml = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

async function probe(url, method = "HEAD") {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctl.signal,
      headers: { "user-agent": "pixelle-link-check (+https://pierrebx.github.io/pixelle)" },
    })
    // Certains serveurs refusent HEAD sans que la page soit morte.
    if ((r.status === 405 || r.status === 501) && method === "HEAD") {
      clearTimeout(timer)
      return probe(url, "GET")
    }
    return { status: r.status }
  } catch (err) {
    return { status: 0, error: err.name === "AbortError" ? "délai dépassé" : err.message }
  } finally {
    clearTimeout(timer)
  }
}

/** Exécute `task` sur chaque élément, `CONCURRENCY` à la fois. */
async function mapLimit(items, task) {
  const out = []
  let i = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const index = i++
      out[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

async function main() {
  const { youtube, instagram, others } = await collect()
  const dead = []
  const unknown = []

  const ytIds = [...youtube.keys()]
  await mapLimit(ytIds, async (id) => {
    const { status } = await probe(`https://img.youtube.com/vi/${id}/hqdefault.jpg`)
    if (status === 404) {
      dead.push({ what: `https://youtu.be/${id}`, why: "vidéo supprimée ou privée", notes: youtube.get(id) ?? [] })
    } else if (status !== 200) {
      unknown.push({ what: `https://youtu.be/${id}`, why: `réponse ${status || "aucune"}` })
    }
  })

  const otherUrls = [...others.keys()]
  await mapLimit(otherUrls, async (url) => {
    const { status, error } = await probe(url)
    if (status === 404 || status === 410) {
      dead.push({ what: url, why: `réponse ${status}`, notes: others.get(url) ?? [] })
    } else if (status === 0 || status >= 500 || status === 403 || status === 429) {
      unknown.push({ what: url, why: error ?? `réponse ${status}` })
    }
  })

  const scanned = ytIds.length + otherUrls.length
  if (MARKDOWN) {
    if (dead.length === 0) {
      console.log(`Aucun lien mort. ${scanned} liens vérifiés, ${instagram.size} liens Instagram non vérifiables.`)
    } else {
      console.log(`### ${dead.length} lien(s) mort(s)\n`)
      for (const d of dead) {
        console.log(`- \`${d.what}\` — ${d.why}\n  - page : ${d.notes.map((n) => `\`${n}\``).join(", ")}`)
      }
      console.log(
        `\n${scanned} liens vérifiés. ${instagram.size} liens Instagram ignorés : leur disponibilité n'est pas vérifiable depuis un runner.`,
      )
      if (unknown.length) {
        console.log(`\n<details><summary>${unknown.length} indéterminé(s)</summary>\n`)
        for (const u of unknown) console.log(`- \`${u.what}\` — ${u.why}`)
        console.log(`\n</details>`)
      }
      console.log(`\nÀ corriger **dans le coffre**, puis resynchroniser.`)
    }
    process.exit(dead.length ? 1 : 0)
  }

  console.log(c.bold(`\nVeille des liens externes`))
  console.log(`  ${scanned} vérifiés · ${c.dim(`${instagram.size} Instagram non vérifiables`)}`)
  if (dead.length === 0) console.log(c.green(`  aucun lien mort\n`))
  for (const d of dead) {
    console.log(c.red(`  ✗ ${d.what}`) + c.dim(` — ${d.why}`))
    console.log(c.dim(`      ${d.notes.join(", ")}`))
  }
  if (unknown.length) {
    console.log(c.yellow(`\n  ${unknown.length} indéterminé(s) — refus de robot, pas page disparue :`))
    for (const u of unknown.slice(0, 10)) console.log(c.dim(`    ${u.what} (${u.why})`))
  }
  console.log()
  process.exit(dead.length ? 1 : 0)
}

main()
