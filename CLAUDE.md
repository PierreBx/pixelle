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

Le coffre range ses notes sous deux racines :

```
petersVault/
  public/    blog/ + odyssée/     <- seul sous-arbre publiable
  private/   santé/, france travail/, royan/, projets/, references/, spectacles/
  _assets/ _obsidian/ _inbound/ _items/   <- hors des deux racines
```

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
`santé/`, `france travail/`, `_inbound/` — rien ne doit en sortir par accident.

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
npm run serve     # sync + build + aperçu sur http://localhost:8080
npm run build     # sync + build
npm run build:ci  # build seul, sans sync (ce que fait la CI)
```

La CI (`.github/workflows/deploy.yml`) se déclenche sur push vers `main` et lance
**`build:ci`**, jamais `sync` : le coffre n'existe pas sur le runner. Le site déployé
reflète donc exactement le `content/` **commité**. Synchroniser sans commiter ne publie
rien.

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

Les `.base` vivent dans le coffre (`_obsidian/_bases/`) et sont copiés comme pièces
jointes quand une note publiée les incorpore (`![[nom.base]]`).

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

Bases existantes : `allPosts.base` (billets), `chantEvents.base` (événements d'un chant),
`factionMembers.base` (membres d'une faction).

## Confidentialité : `note-properties` affiche tout

`note-properties` tourne avec `includeAll: true` : **toute** clé de frontmatter d'une
note publiée devient visible, sauf celles listées dans `excludedProperties`
(`publish`, `homepage`, `created`, `modified`).

Conséquence : ajouter une clé au frontmatter d'une note publiée l'expose **sans décision
explicite**. Vérifier avant de publier (`/verifier-publication`).

## Skills

- `/ajouter-chant N` — traite un chant de l'Odyssée dans le coffre, puis propage ici.
- `/verifier-publication` — contrôles avant publication.
- `/publier` — sync, construction, commit, push.

## Divers

- `quartz.config.yaml` est la configuration réelle ; `quartz.config.default.yaml` est la
  référence amont, à ne pas éditer.
- La palette « bleu nuit » a été mesurée au contraste WCAG (≥ 4.5:1 dans les deux modes) :
  conserver les ratios notés en commentaire si on y touche.
- Pas d'analytics : `analytics: null`, volontairement.
- `baseUrl` doit correspondre à l'hébergement réel, sinon RSS, sitemap et images OG
  pointent au mauvais endroit.
