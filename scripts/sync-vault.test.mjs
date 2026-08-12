/**
 * Tests de `sync-vault.mjs`.
 *
 *   npm test
 *
 * Le script calcule l'état voulu de `content/` puis **supprime** tout le reste.
 * C'est ce qui rend ses garde-fous précieux et une régression coûteuse : on
 * teste donc en priorité les cas où une erreur détruit du travail — racine
 * introuvable, zéro note publiée, dépublication — plutôt que le chemin heureux.
 *
 * Chaque test se donne un coffre jetable et un `content/` jetable, et lance le
 * vrai script dans un processus séparé : c'est son comportement de bout en bout
 * qui est vérifié, pas celui d'une fonction extraite pour l'occasion.
 *
 * `YOUTUBE_EMBED=0` partout : aucun test ne doit dépendre du réseau.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { globbySync } from "globby"

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "sync-vault.mjs")

/** Crée un coffre jetable à partir d'une description `{ chemin: contenu }`. */
function makeVault(files) {
  const root = mkdtempSync(path.join(tmpdir(), "pixelle-vault-"))
  for (const [rel, body] of Object.entries(files)) {
    const dest = path.join(root, rel)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, body)
  }
  return root
}

function makeContentDir(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "pixelle-content-"))
  for (const [rel, body] of Object.entries(files)) {
    const dest = path.join(root, rel)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, body)
  }
  return root
}

function sync(vault, content, { args = [], env = {} } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      VAULT_PATH: vault,
      CONTENT_DIR: content,
      YOUTUBE_EMBED: "0",
      NO_COLOR: "1",
      ...env,
    },
  })
  return {
    code: r.status,
    out: `${r.stdout}${r.stderr}`,
    files: existsSync(content) ? globbySync("**/*", { cwd: content, dot: false }).sort() : [],
  }
}

const note = (body = "corps", extra = "") =>
  `---\npublish: true\ncreated: 2026-01-01\n${extra}---\n\n${body}\n`

// ── Ce qui sort, et ce qui ne sort pas ──────────────────────────────────────

test("ne copie que les notes marquées `publish: true`", () => {
  const vault = makeVault({
    "public/blog/Oui.md": note(),
    "public/blog/Non.md": "---\ncreated: 2026-01-01\n---\n\nnon publiée\n",
    "public/blog/Faux.md": "---\npublish: false\n---\n\nnon publiée\n",
  })
  const { code, files } = sync(vault, makeContentDir())
  assert.equal(code, 0)
  assert.ok(files.includes("blog/Oui.md"))
  assert.ok(!files.some((f) => f.includes("Non") || f.includes("Faux")))
})

test("ignore une note publiée hors de la racine de publication", () => {
  const vault = makeVault({
    "public/blog/Dedans.md": note(),
    "private/santé/Dehors.md": note(),
  })
  const { files } = sync(vault, makeContentDir())
  assert.ok(files.includes("blog/Dedans.md"))
  assert.ok(!files.some((f) => f.includes("Dehors")))
})

test("retire de content/ une note qui n'est plus publiée", () => {
  const vault = makeVault({ "public/blog/Reste.md": note() })
  const content = makeContentDir({
    "blog/Reste.md": "vieux",
    "blog/Partie.md": "à supprimer",
  })
  const { files } = sync(vault, content)
  assert.ok(files.includes("blog/Reste.md"))
  assert.ok(!files.includes("blog/Partie.md"))
})

// ── Les deux garde-fous ─────────────────────────────────────────────────────

test("refuse de tourner si la racine de publication est introuvable", () => {
  const vault = makeVault({ "public/blog/A.md": note() })
  const content = makeContentDir({ "blog/A.md": "déjà là" })
  const { code, out, files } = sync(vault, content, { env: { PUBLIC_ROOT: "publik" } })
  assert.equal(code, 1)
  assert.match(out, /Publication root not found/)
  assert.deepEqual(files, ["blog/A.md"], "content/ doit rester intact")
})

test("refuse de vider content/ quand plus aucune note n'est publiée", () => {
  const vault = makeVault({ "public/blog/A.md": "---\npublish: false\n---\n\nx\n" })
  const content = makeContentDir({ "blog/A.md": "déjà publié" })
  const { code, out, files } = sync(vault, content)
  assert.equal(code, 1)
  assert.match(out, /Refus/)
  assert.deepEqual(files, ["blog/A.md"], "content/ doit rester intact")
})

test("--force passe outre et vide bien content/", () => {
  const vault = makeVault({ "public/blog/A.md": "---\npublish: false\n---\n\nx\n" })
  const content = makeContentDir({ "blog/A.md": "déjà publié" })
  const { code, files } = sync(vault, content, { args: ["--force"] })
  assert.equal(code, 0)
  assert.ok(!files.includes("blog/A.md"))
})

test("--dry-run n'écrit rien", () => {
  const vault = makeVault({ "public/blog/A.md": note() })
  const content = makeContentDir()
  const { code, files } = sync(vault, content, { args: ["--dry-run"] })
  assert.equal(code, 0)
  assert.deepEqual(files, [])
})

// ── Page d'accueil ──────────────────────────────────────────────────────────

test("`homepage: true` devient index.md", () => {
  const vault = makeVault({ "public/Accueil.md": note("bienvenue", "homepage: true\n") })
  const { files } = sync(vault, makeContentDir())
  assert.ok(files.includes("index.md"))
  assert.ok(!files.includes("Accueil.md"))
})

test("deux prétendantes : la première par ordre alphabétique gagne, l'autre est publiée", () => {
  const vault = makeVault({
    "public/Bbb.md": note("b", "homepage: true\n"),
    "public/Aaa.md": note("a", "homepage: true\n"),
  })
  const { out, files } = sync(vault, makeContentDir())
  assert.ok(files.includes("index.md"))
  assert.ok(files.includes("Bbb.md"), "la perdante reste publiée à son chemin normal")
  assert.match(out, /only one can be the landing page/)
  assert.match(out, /Aaa\.md/, "le rapport doit nommer celle qui a été retenue")
})

test("sans note d'accueil, un index.md est engendré", () => {
  const vault = makeVault({ "public/blog/A.md": note() })
  const { files } = sync(vault, makeContentDir())
  assert.ok(files.includes("index.md"))
})

// ── Pièces jointes ──────────────────────────────────────────────────────────

test("une pièce jointe non citée n'est jamais copiée", () => {
  const vault = makeVault({
    "public/blog/A.md": note("sans image"),
    "public/_assets/images/orpheline.png": "binaire",
  })
  const { files } = sync(vault, makeContentDir())
  assert.ok(!files.some((f) => f.includes("orpheline")))
})

test("une pièce jointe citée mais rangée hors de la racine est copiée", () => {
  const vault = makeVault({
    "public/blog/A.md": note("![[hors-racine.svg|un dessin]]"),
    "_assets/images/hors-racine.svg": "<svg/>",
  })
  const { files } = sync(vault, makeContentDir())
  assert.ok(
    files.includes("_assets/images/hors-racine.svg"),
    `attendu la copie, obtenu ${JSON.stringify(files)}`,
  )
})

test("un PDF est rangé sous _assets/docs/ et devient un lien", () => {
  const vault = makeVault({
    "public/blog/A.md": note("![[prog.pdf|Programme]]"),
    "public/_assets/images/prog.pdf": "%PDF-1.4 ...",
  })
  const { files } = sync(vault, makeContentDir())
  assert.ok(files.includes("_assets/docs/prog.pdf"))
  assert.ok(!files.some((f) => f.startsWith("_assets/images/")))
})

test("une note dépubliée entraîne la suppression de sa pièce jointe", () => {
  const vault = makeVault({
    "public/blog/Garde.md": note("rien"),
    "public/blog/Retiree.md": "---\npublish: false\n---\n\n![[img.svg|x]]\n",
    "public/_assets/images/img.svg": "<svg/>",
  })
  const content = makeContentDir({ "_assets/images/img.svg": "<svg/>" })
  const { files } = sync(vault, content)
  assert.ok(!files.some((f) => f.includes("img.svg")))
})

test("une image devient un .webp, et la note qui la cite est réécrite", async () => {
  const sharp = (await import("sharp")).default
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#3366aa" },
  })
    .png()
    .toBuffer()

  const vault = makeVault({
    "public/blog/A.md": note("![[photo.png|Un aplat bleu]]"),
    "public/_assets/images/photo.png": png,
  })
  const content = makeContentDir()
  const { files } = sync(vault, content)

  assert.ok(files.includes("_assets/images/photo.webp"), "l'image doit être convertie")
  assert.ok(!files.includes("_assets/images/photo.png"), "l'original ne doit pas être copié")

  const body = readFileSync(path.join(content, "blog/A.md"), "utf8")
  assert.match(body, /!\[\[photo\.webp\|Un aplat bleu\]\]/, "la référence doit suivre le renommage")

  const header = readFileSync(path.join(content, "_assets/images/photo.webp")).subarray(8, 12)
  assert.equal(header.toString("ascii"), "WEBP", "le fichier doit vraiment être du WebP")
})

test("OPTIMISE_IMAGES=0 recopie l'image telle quelle", async () => {
  const sharp = (await import("sharp")).default
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#000" },
  })
    .png()
    .toBuffer()
  const vault = makeVault({
    "public/blog/A.md": note("![[photo.png|noir]]"),
    "public/_assets/images/photo.png": png,
  })
  const { files } = sync(vault, makeContentDir(), { env: { OPTIMISE_IMAGES: "0" } })
  assert.ok(files.includes("_assets/images/photo.png"))
  assert.ok(!files.includes("_assets/images/photo.webp"))
})

test("deux images de même nom à l'extension près gardent leur nom d'origine", async () => {
  const sharp = (await import("sharp")).default
  const make = (fmt) =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })[fmt]().toBuffer()

  const vault = makeVault({
    "public/blog/A.md": note("![[m.png|un]]\n\n![[m.jpg|deux]]"),
    "public/_assets/images/m.png": await make("png"),
    "public/_assets/images/m.jpg": await make("jpeg"),
  })
  const { out, files } = sync(vault, makeContentDir())
  assert.ok(files.includes("_assets/images/m.png"), "collision : l'original est conservé")
  assert.ok(files.includes("_assets/images/m.jpg"), "collision : l'original est conservé")
  assert.match(out, /collision/i, "la collision doit être signalée")
})

// ── Confidentialité ─────────────────────────────────────────────────────────

test("un lien vers une note non publiée ne l'entraîne pas dans content/", () => {
  const vault = makeVault({
    "public/blog/A.md": note("voir [[Secret]]"),
    "private/Secret.md": note("confidentiel"),
  })
  const { out, files } = sync(vault, makeContentDir())
  assert.ok(!files.some((f) => f.includes("Secret")))
  assert.match(out, /missing target/)
})
