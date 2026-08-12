# pixelle — notes pour Claude

Site [Quartz 5](https://quartz.jzhao.xyz/) publié sur GitHub Pages
(`git@github.com:PierreBx/pixelle.git` → `pierrebx.github.io/pixelle`). Le contenu
provient d'un coffre Obsidian **externe au dépôt**.

`MEMENTO.md` est le guide de l'auteur du site : les gestes, cas par cas. Quand une
réponse tient en « voici quoi faire pour publier X », c'est là qu'elle est écrite —
et c'est là qu'il faut la corriger si elle vieillit.

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
npm test          # tests de sync-vault.mjs (coffres jetables, processus séparé)
npm run links     # liens externes morts, lus dans le site construit
```

`CONTENT_DIR` n'existe que pour les tests : le script supprime ce qu'il ne
reconnaît pas, et une suite qui viserait le vrai `content/` le viderait.

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

- **Le moteur ne sait pas comparer une date.** Un tri sur `file.ctime` retombe sur
  `String(date).localeCompare(…)`, c'est-à-dire sur le **nom du jour de la semaine** :
  l'ordre obtenu est stable, plausible et absurde. Trier sur `created`, la clé du
  frontmatter, qui arrive en chaîne ISO. Pour la même raison, ne pas afficher de colonne
  de date : elle sort en JSON entre guillemets, dans un bloc de code.
- **`publish == true` n'est pas redondant** dans un filtre, contrairement à ce qu'on
  croirait : `content/` ne contient que du publié, mais l'index de Quartz contient aussi
  les pages de dossier qu'il engendre — `posts/index` passait le filtre de chemin.

Bases existantes : `blogEntriesBase` (les 17 billets), `postsEntriesBase` (les trouvailles),
`odysseeEntriesBase` (le wiki), `journalBase` (billets + trouvailles + chants, par date),
`chantEvents` (événements d'un chant), `factionMembers` (membres d'une faction).

## Classement : trois axes, jamais répétés

| axe | porté par | valeurs |
| --- | --- | --- |
| corpus | **le dossier** | `blog/` · `posts/` · `odyssée/` · `places/` |
| nature | `category` | `work` · `event` · `place` · `photo` — liste fermée |
| discipline | `tags` | anglais, sans préfixe de corpus, hiérarchique quand c'est un sous-sujet (`music/piano`) |

Les préfixes `post/` et `odyssey/` ont été retirés : ils répétaient le dossier, et
séparaient le même sujet en deux pages qui s'ignoraient (`movie` 5 · `post/movie` 4).
Le type d'une fiche d'Odyssée est déjà dit par son dossier **et** par `type:`.

## Lieux : un saut à la fois, la chaîne est calculée

Une note de contenu désigne un lieu : `place: "[[places/Grand-Théatre|Grand-Théatre]]"`.
Une note de lieu désigne **son** parent, jamais la chaîne entière.

Quartz ne sait pas remonter une chaîne — ses liens retour ne font qu'un pas, une base
ne récurse pas. « Tout ce qui s'est passé en France » n'est donc pas calculable à
partir des `parent:`. Les **étiquettes**, elles, s'agrègent seules. D'où la division du
travail :

- le lien `place:` donne la page-carrefour du lieu exact, ses liens retour, ses
  coordonnées ;
- `scripts/sync-vault.mjs` remonte la chaîne et écrit dans la copie une étiquette
  `location/france/bordeaux/grand-théatre`, d'où naissent gratuitement
  `/tags/location/france` et `/tags/location/france/bordeaux`.

Rien n'est écrit deux fois. Ne jamais taper une étiquette `location/…` à la main :
elle est déduite, et l'audit l'exclut de son contrôle de vocabulaire pour cette raison.

Un lieu sans `coordinates` n'est pas tracé sur les cartes — c'est voulu pour un pays,
dont la position ne serait qu'un centroïde. Il reste un maillon de la hiérarchie.

## Cartes : un SVG engendré, jamais de tuiles

`<!-- carte: world -->` dans une note publiée est remplacé à la synchronisation par un
SVG calculé depuis les `coordinates` (`scripts/maps.mjs`). Trois cartes : `blog`,
`odyssey`, `world`.

Quartz ne rend ni `leaflet` ni `mapview`, et des tuiles seraient une requête tierce à
chaque déplacement. Conséquence assumée : **sans fond de carte, c'est un repère, pas
une carte.** Une définition peut recevoir `basemap: { href, bbox }` — le bbox doit être
celui de l'image, sans quoi les points tombent à côté.

## Confidentialité : `note-properties` affiche tout

`note-properties` tourne avec `includeAll: true` : **toute** clé de frontmatter d'une
note publiée devient visible, sauf celles listées dans `excludedProperties`
(`publish`, `homepage`, `created`, `modified`, `summary`, `title`, `tags`).

`title` et `tags` en sont exclus parce qu'ils sont **rendus ailleurs** : le titre en H1
par `article-title`, les étiquettes en pastilles sous le titre par `tag-list`. Les
laisser dans le tableau les affichait deux fois. Conséquence agréable : les notes de
`posts/`, dont le frontmatter se réduit à ces clés, n'ont plus de tableau du tout.

Conséquence : ajouter une clé au frontmatter d'une note publiée l'expose **sans décision
explicite**. Vérifier avant de publier (`/3-site-check-local`).

## Workflow et skills

Le coffre se modifie à la main ; les étapes suivantes sont outillées. Les skills sont nommés en anglais et leur contenu est en
anglais ; le reste du dépôt (ce fichier, `README.md`, les notes) reste en français.

| # | Étape | Skill |
| --- | --- | --- |
| — | Mise à jour manuelle du coffre | l'utilisateur, dans Obsidian |
| 0 | Tri de la file `staging/` (facultatif) | `/0-vault-triage-staging` |
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

Le tri des captures de `staging/` vers `public/posts/` a désormais son skill (étape 0).
Il ne publie rien : il prépare des notes, que les étapes 2 à 4 publient ensuite. La
taxonomie des étiquettes (`post/<thème>`) est close en pratique — le skill la relit dans
le coffre plutôt que d'en inventer une.

## Divers

- `quartz.config.yaml` est la configuration réelle ; `quartz.config.default.yaml` est la
  référence amont, à ne pas éditer.
- La palette « bleu nuit » a été mesurée au contraste WCAG (≥ 4.5:1 dans les deux modes) :
  conserver les ratios notés en commentaire si on y touche.
- Pas d'analytics : `analytics: null`, volontairement.
- **Aucune requête tierce**, et l'audit le vérifie sur la sortie construite
  (« aucune requête tierce », `--built`). Le greffon `latex` chargeait KaTeX depuis
  un CDN sur les 384 pages sans qu'aucune note n'en ait besoin : il est désactivé,
  et le `preconnect` de `Head.tsx` retiré. Avant d'activer un greffon, vérifier ce
  qu'il fait charger — le contrôle échouera, mais autant le savoir avant.
- `baseUrl` doit correspondre à l'hébergement réel, sinon RSS, sitemap et images OG
  pointent au mauvais endroit.
