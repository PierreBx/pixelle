# pixelle — notes pour Claude

Site [Quartz 5](https://quartz.jzhao.xyz/) publié sur GitHub Pages
(`git@github.com:PierreBx/pixelle.git` → `pierrebx.github.io/pixelle`). Le contenu
provient d'un coffre Obsidian **externe au dépôt**.

## La règle la plus importante : `content/` est généré

`content/` est **produit** par `scripts/sync-vault.mjs` à partir du coffre. Le script
calcule l'état exact voulu et **supprime** (`rm`) tout fichier de `content/` qui n'en
fait pas partie.

**N'éditez jamais `content/` directement.** Toute modification y sera écrasée ou
effacée au prochain `npm run sync`. Pour changer une note publiée, éditez-la **dans le
coffre**, puis relancez la synchronisation.

Chemin du coffre — même convention partout (script, skills) :

```bash
VAULT="${VAULT_PATH:-/home/ipro0800/Documents/data/obsidian/petersVault}"
```

Le coffre est un dépôt git distinct, aussi synchronisé par **Obsidian Sync** : commits
simples uniquement, jamais de rebase ni de force push.

### Racine de publication (`PUBLIC_ROOT`), défaut `public`

Le coffre range ses notes sous trois racines :

```
petersVault/
  public/    blog/ (billets écrits à la main) + posts/ (liens triés depuis
             staging/) + odyssée/ + _items/     <- seul sous-arbre publiable
  private/   santé/, france travail/, royan/, projets/, references/, spectacles/
  staging/   captures iOS et Web Clipper, en attente de tri
```

Chaque racine porte ses propres pièces jointes dans `_assets/` : `images/`, `bases/`,
et pour `public/` aussi `templates/` et `metadata/`. Plus rien d'autre à la racine du
coffre.

La synchronisation ne considère que `public/`. Aucune variable à penser : un
`npm run sync` nu se comporte correctement. Pour parcourir tout le coffre (ancien
schéma à plat), passer une valeur **vide** : `PUBLIC_ROOT= npm run sync`.

- Une note hors de cette racine n'est plus publiée, drapeau ou non : le rangement
  devient une barrière et non une convention. `publish: true` reste néanmoins requis
  **à l'intérieur** de `public/` — les deux conditions se cumulent.
- Les chemins de destination sont calculés **relativement à la racine** : `public/blog/X.md`
  devient `content/blog/X.md`. Le nom du dossier n'apparaît jamais dans une URL, et les
  adresses existantes ne bougent pas.
- Les **pièces jointes** restent cherchées dans tout le coffre (elles vivent souvent hors
  de la racine : `_assets/`, `_obsidian/_bases/`) et conservent leur chemin. Elles ne sont
  de toute façon copiées que si une note publiée les référence.

Deux garde-fous : une racine introuvable arrête le script, et une synchronisation qui
publierait zéro note alors que `content/` n'est pas vide est refusée (`--force` pour
passer outre). Sans eux, une racine mal orthographiée viderait `content/` en silence.

## Publication : opt-in explicite, deux barrières

Une note n'est publiée que si son frontmatter porte `publish: true`. Le coffre contient
`santé/`, `france travail/`, `royan/` — rien ne doit en sortir par accident.

| Barrière | Où | Rôle |
| --- | --- | --- |
| `scripts/sync-vault.mjs` | local | Ne copie que les notes marquées. |
| plugin `explicit-publish` | construction | Écarte toute page sans le drapeau, même si un fichier traînait dans `content/`. |

La seconde est un filet de sécurité : **ne pas la désactiver** dans `quartz.config.yaml`.

Les pièces jointes (images, PDF, `.base`) ne sont copiées que si une note publiée les
**référence** réellement. Une note publiée qui pointe vers une note non publiée produit
un « lien manquant » dans le rapport de sync : c'est **attendu**, pas une erreur — rien
de privé n'est copié, le lien s'affiche en texte brut.

`homepage: true` désigne la note qui devient `content/index.md`. Sans elle, un
`index.md` est généré automatiquement.

## Commandes

```bash
npm run sync      # coffre -> content/
npm run sync:dry  # montre ce qui serait copié, sans écrire
npm run preview   # sync + build de production + aperçu sur http://localhost:8080
npm run serve     # serveur de dév Quartz — actifs non hachés, à éviter pour l'aperçu
npm run build     # sync + build
npm run build:ci  # build seul, sans sync (ce que fait la CI)
```

La CI (`.github/workflows/deploy.yml`) se déclenche sur push vers `main` et lance
**`build:ci`**, jamais `sync` : le coffre n'existe pas sur le runner. Le site déployé
reflète donc exactement le `content/` **commité**. Synchroniser sans commiter ne publie
rien.

Elle enchaîne ensuite `audit.py --since HEAD^ --built`, avant le téléversement : un
audit rouge n'envoie pas d'artefact et le site en ligne reste celui d'avant. Les
garde-fous ne dépendent donc plus de la bonne volonté de celui qui commite. Ce n'est
pas une raison de sauter l'étape 3 : la CI constate, elle ne regarde pas une page.

## Pièces jointes : allégées à la copie

`content/` ne reçoit pas les originaux du coffre.

- **Images** — ré-encodées en WebP, plus grand côté ramené à 1600 px. C'est le plus
  grand côté et non la largeur : une photo en hauteur respecte une limite de largeur
  tout en pesant trois mégapixels. L'orientation EXIF est appliquée avant l'encodage,
  sinon les photos de téléphone ressortent couchées.
- **PDF** — déplacés sous `_assets/docs/` et **liés** au lieu d'être incorporés.
  `![[x.pdf]]` fait rendre à Quartz un cadre qui télécharge tout au chargement de la
  page ; le lien produit annonce le poids et ne part qu'au clic.
- **Vignettes de vidéos** — ré-encodées en JPEG *sur place*, sans changer de nom : leur
  nom sert de cache de téléchargement, et le changer relancerait quatre-vingts requêtes
  vers Instagram d'un coup.

Les notes sont réécrites en conséquence **dans la copie seulement** (`![[x.png]]` →
`![[x.webp]]`). Cette réécriture tourne **avant** l'encapsulation des vidéos, qui
produit du HTML dont les `<img src>` ne doivent surtout pas y passer.

Conséquence pour le texte alternatif : il s'écrit dans l'alias de l'incorporation,
`![[image.png|description]]`. Obsidian l'affiche en légende, Quartz le rend en `alt`,
et l'audit refuse désormais une image qui en manque. Un alias purement numérique
(`|300`) désigne des dimensions, pas un texte.

## Ce que Quartz ne sait pas rendre

Ces blocs Obsidian n'ont **aucun** équivalent côté Quartz et s'affichent en **bloc de
code brut** sur le site publié — vérifié, pas supposé :

- ` ```dataview ` — remplacé par des bases (voir ci-dessous)
- ` ```mapview ` (plugin Map View) — retiré des notes publiées
- ` ```leaflet ` — le paquet `@quartz-community/obsidian-plugin-leaflet` porte le nom
  mais **ne contient pas** de code Leaflet (c'est le template de plugin non modifié) :
  ne pas l'installer en croyant régler le problème.

Ils restent utilisables dans le coffre **sur des notes non publiées**.

## Bases (remplaçant de Dataview)

Les `.base` vivent dans le coffre (`public/_assets/bases/`, `private/_assets/bases/`) et
sont copiés comme pièces jointes quand une note publiée les incorpore (`![[nom.base]]`).

Points non évidents du moteur (`@quartz-community/bases-page`) :

- `this` désigne la note qui **incorpore** la base — une seule base sert donc plusieurs
  notes. Mais `this` n'expose que `file.name` / `path` / `folder` / `ext` : **pas** le
  frontmatter. Une base ne peut pas afficher les propriétés de la note courante.
- Filtrer sur un lien de frontmatter s'écrit `contains(list(champ), this)` : cette forme
  gère `[[Cible]]`, `[[Cible|alias]]` et les chemins complets.
- `file.hasLink()` compare à des **slugs** Quartz (`odyssée/chants/chant-01`), qui ne
  valent jamais `this.file.name` (`Chant 01`). Préférer les propriétés de frontmatter
  aux liens sortants.
- Une propriété absente ne fait pas échouer le filtre : la note est simplement exclue.
- Les chaînes d'interface de ce plugin ne sont qu'en anglais (« No data found. »), même
  avec `locale: fr-FR`.

Bases existantes : `allPosts.base` (billets de `blog/` — ne couvre **pas** `posts/`), `chantEvents.base` (événements d'un chant),
`factionMembers.base` (membres d'une faction).

## Confidentialité : `note-properties` affiche tout

`note-properties` tourne avec `includeAll: true` : **toute** clé de frontmatter d'une
note publiée devient visible, sauf celles listées dans `excludedProperties`
(`publish`, `homepage`, `created`, `modified`, `summary`).

Conséquence : ajouter une clé au frontmatter d'une note publiée l'expose **sans décision
explicite**. Vérifier avant de publier (`/3-site-check-local`).

## Workflow et skills

Le coffre se modifie à la main ; les quatre étapes suivantes sont outillées. Les skills sont nommés en anglais et leur contenu est en
anglais ; le reste du dépôt (ce fichier, `README.md`, les notes) reste en français.

| # | Étape | Skill |
| --- | --- | --- |
| — | Mise à jour manuelle du coffre | l'utilisateur, dans Obsidian |
| 1 | Ajout d'un chant de l'Odyssée (facultatif) | `/1-vault-add-chant N` |
| 2 | Construction locale + URL de test | `/2-site-construct-locally` |
| 3 | Vérification du site construit | `/3-site-check-local` |
| 4 | Commit et publication | `/4-site-commit-and-publish` |

Deux de ces skills s'appuient sur un script utilisable seul, sans passer par Claude :

```bash
.claude/skills/3-site-check-local/audit.py --help
.claude/skills/4-site-commit-and-publish/commit-and-publish.sh --help
```

`commit-and-publish.sh` ne pousse qu'avec `--push`, et vérifie ensuite le déploiement en comparant les
pages servies au build local — la sortie de Quartz est déterministe, donc l'égalité prouve
que le nouveau contenu est bien en ligne. Ne pas se fier à l'API GitHub Actions : elle a
rapporté des états périmés, et son quota anonyme (60 requêtes/heure) s'épuise vite.

Le tri des captures de `staging/` vers `public/posts/` se fait à la main, dans le coffre :
il n'y a pas de skill pour ça.

## Divers

- `quartz.config.yaml` est la configuration réelle ; `quartz.config.default.yaml` est la
  référence amont, à ne pas éditer.
- La palette « bleu nuit » a été mesurée au contraste WCAG (≥ 4.5:1 dans les deux modes) :
  conserver les ratios notés en commentaire si on y touche.
- Pas d'analytics : `analytics: null`, volontairement.
- `baseUrl` doit correspondre à l'hébergement réel, sinon RSS, sitemap et images OG
  pointent au mauvais endroit.
