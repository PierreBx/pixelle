/**
 * Sert `public/` tel quel, pour regarder le site avant de le publier.
 *
 *   npm run preview        # sync + build de production + ce serveur
 *
 * Pourquoi pas `quartz build --serve` : le mode serveur désactive le hachage des
 * actifs (`useHashing = !ctx.argv.serve` dans componentResources.ts) et vide
 * `data-basepath`. Il produit donc un `public/` qui n'est pas celui que la CI
 * déploie — l'aperçu est approximatif, et la vérification du déploiement de
 * l'étape 4, qui compare les pages servies au build local, ne peut pas aboutir.
 * Ici le build est celui de production ; ce serveur ne fait que le servir.
 *
 * Pourquoi pas `serve-handler`, pourtant présent : il place le nom de fichier
 * brut dans un en-tête `Content-Disposition`, et Node refuse les caractères
 * non-ASCII. Le dépôt en est plein (`köln-concert`, `la-vie-d'adèle`, `odyssée/`,
 * des emoji) : le serveur mourait à la première page accentuée.
 *
 * Les URL sans extension sont résolues comme sur GitHub Pages : `/sommaire` sert
 * `sommaire.html`. Sans cela toutes les pages répondraient 404.
 *
 * Le site est servi à la racine alors qu'il est construit pour `/pixelle`. Sans
 * conséquence : les liens des pages sont relatifs. Seule la page 404 lit
 * `data-basepath`, et son lien « retour à l'accueil » pointera vers `/pixelle/`.
 */
import http from "node:http"
import path from "node:path"
import { existsSync, statSync, createReadStream, readFileSync } from "node:fs"

const PORT = Number(process.env.PORT ?? 8080)
const ROOT = path.resolve("public")

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
}

if (!existsSync(path.join(ROOT, "index.html"))) {
  console.error("public/ est vide — lancer `npm run build` d'abord.")
  process.exit(1)
}

/** Le fichier à servir pour une URL, ou null. Mêmes règles que GitHub Pages. */
function resolveFile(urlPath) {
  let rel
  try {
    rel = decodeURIComponent(urlPath)
  } catch {
    return null // séquence d'échappement invalide
  }
  const target = path.resolve(ROOT, "." + rel)
  // Ne jamais sortir de public/, quoi qu'on demande.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null

  for (const candidate of [target, target + ".html", path.join(target, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const server = http.createServer((req, res) => {
  // `new URL("//", base)` lève : `//` est une URL protocol-relative sans hôte.
  // Sans ce filet, une seule requête malformée — un lien coquillé, un scanner —
  // tuait le serveur d'aperçu au milieu d'une relecture.
  let pathname
  try {
    pathname = new URL(req.url, "http://localhost").pathname
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("400 — adresse illisible")
    return
  }
  const file = resolveFile(pathname)
  if (!file) {
    const notFound = path.join(ROOT, "404.html")
    res.writeHead(404, { "Content-Type": TYPES[".html"] })
    res.end(existsSync(notFound) ? readFileSync(notFound) : "404")
    return
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    // L'aperçu doit montrer le dernier build, jamais une copie du navigateur.
    "Cache-Control": "no-store",
  })
  createReadStream(file).pipe(res)
})

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà pris — un aperçu tourne peut-être déjà.`)
    console.error(`  arrêter : pkill -f scripts/preview.mjs`)
    console.error(`  ou      : PORT=8081 npm run preview`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, () => {
  console.log(`\n  Aperçu de pixelle : http://localhost:${PORT}/`)
  console.log(`  Ctrl+C pour arrêter.\n`)
})
