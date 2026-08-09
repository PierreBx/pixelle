# pixelle

Publie une sélection de notes du coffre Obsidian **petersVault** sur GitHub Pages, avec [Quartz 5](https://quartz.jzhao.xyz/).

Le coffre lui-même n'est jamais poussé sur GitHub. Seules les notes rangées sous `public/` **et** marquées `publish: true` sont copiées dans `content/`, commitées, puis publiées.

## `content/` est un dossier généré

`scripts/sync-vault.mjs` calcule l'état exact voulu et **supprime** tout fichier de `content/` qui n'en fait pas partie.

**N'éditez jamais `content/` directement** : toute modification y sera écrasée au prochain `npm run sync`. Pour corriger une note publiée, éditez-la dans le coffre, puis resynchronisez.

## Le principe : deux conditions cumulatives

### 1. Être rangé sous `public/`

Le coffre a trois racines, dont une seule est publiable :

```
petersVault/
  public/    blog/ · posts/ · odyssée/ · _assets/      <- seul sous-arbre publiable
  private/   santé/ · france travail/ · royan/ · projets/ · references/
  staging/   captures iOS et Web Clipper, en attente de tri
```

Une note hors de `public/` n'est pas publiée, drapeau ou non. Le rangement devient une barrière, pas une simple convention.

Les chemins sont calculés **relativement à la racine** : `public/blog/X.md` devient `content/blog/X.md`. Le nom du dossier n'apparaît jamais dans une URL.

La racine est réglable par `PUBLIC_ROOT`. Une valeur vide parcourt tout le coffre (ancien schéma à plat) :

```bash
PUBLIC_ROOT= npm run sync
```

### 2. Porter `publish: true`

```yaml
---
title: Annie Hall
tags: [movie]
publish: true
---
```

Deux barrières indépendantes appliquent cette règle :

| Barrière | Où | Rôle |
| --- | --- | --- |
| `scripts/sync-vault.mjs` | en local | Ne copie que les notes marquées. Rien d'autre n'entre dans `content/`. |
| Plugin `explicit-publish` | à la construction | Écarte toute page sans le drapeau, même si un fichier traînait dans `content/`. |

La seconde est un filet de sécurité : ne la désactivez pas dans `quartz.config.yaml`.

### Deux garde-fous contre l'effacement silencieux

- Une racine de publication introuvable **arrête** le script.
- Une synchronisation qui publierait **zéro note** alors que `content/` n'est pas vide est **refusée**. `--force` pour passer outre.

Sans eux, un `PUBLIC_ROOT` mal orthographié viderait `content/` sans un mot.

## Utilisation quotidienne

```bash
npm run sync        # coffre -> content/
npm run sync:dry    # montre ce qui serait copié, sans rien écrire
npm run serve       # sync + build + aperçu sur http://localhost:8080
npm run build       # sync + build
npm run build:ci    # build seul, sans sync — ce que lance la CI
```

Pour publier, un script fait l'enchaînement complet :

```bash
.claude/skills/4-site-commit-and-publish/commit-and-publish.sh -m "Publie : <titre>"   # sync, audit, build, commit
.claude/skills/4-site-commit-and-publish/commit-and-publish.sh --push                  # pousse, puis vérifie le déploiement
```

Il s'arrête sur un constat d'audit bloquant, et refuse de commiter si un fichier dont
dépend la construction est modifié sans être mis en scène. Il **ne pousse jamais** sans
`--push`. `--dry-run` montre l'enchaînement sans rien écrire, `--help` détaille le reste.

GitHub Actions reconstruit et déploie. Le workflow lance **`build:ci`**, jamais `sync` : le coffre n'existe pas sur le runner. **Le site déployé reflète exactement le `content/` commité** — synchroniser sans commiter ne publie rien.

Si la construction dépend d'un fichier que vous venez de changer (`quartz.config.yaml`, `scripts/sync-vault.mjs`, `package.json`, `.github/workflows/`), il doit partir dans le même commit que le contenu. Sinon le site déployé ne correspond pas à ce que vous avez vérifié en local.

## Vérifier avant de publier

```bash
.claude/skills/3-site-check-local/audit.py --help
```

L'audit n'examine par défaut que les notes **modifiées depuis HEAD**, et affiche tous ses contrôles avec ce qu'il a examiné et ce qu'il y a trouvé :

```
  CONTENT
   ✓ frontmatter parses      2 notes analysed — all readable
   ✓ publish: true flag      2 examined — all flagged
   ? note body               2 examined — 1 empty note
       doubt blog/Rouffignac.md — would publish a page with no content
```

`✓` conforme · `?` doute · `▲` exposition · `✗` casse. Code de sortie 1 dès qu'il y a un `▲` ou un `✗`. `--all` pour un inventaire du corpus, `--built` pour ajouter les contrôles sur `public/`, `--quiet` pour ne voir que ce qui cloche.

`--built` ajoute trois contrôles sur la sortie construite, dont la **résolution des liens internes** : un lien mort sur la page d'accueil y est une anomalie bloquante, puisque rien n'y est censé pointer dans le vide.

## Confidentialité : le frontmatter est public

Le plugin `note-properties` tourne avec `includeAll: true`. **Toute** clé de frontmatter d'une note publiée devient une ligne visible du tableau de propriétés, sauf celles listées dans `excludedProperties` (`publish`, `homepage`, `created`, `modified`, `summary`).

Conséquence : ajouter une clé au frontmatter d'une note publiée l'expose **sans décision explicite**. L'audit signale toute clé inédite ou étrangère aux conventions de son dossier.

### Les liens morts révèlent un nom de fichier

Un lien vers une note non publiée produit `<a href="../santé/bilan">` dans le HTML. Le contenu ne fuit pas, le titre si. Le script liste ces liens à chaque exécution : si l'un d'eux est révélateur, retirez-le de la note avant de publier.

C'est du bruit **attendu** dans le rapport de sync — une note publiée cite souvent une note privée ou pas encore écrite.

## Ce que fait la synchronisation

- Parcourt `public/` en ignorant `.obsidian`, `.trash`, `.git`, `.idea`.
- Copie chaque note `publish: true` en conservant son arborescence, pour que les liens `[[wiki]]` continuent de résoudre.
- Copie images, PDF, médias et fichiers `.base` **uniquement** s'ils sont référencés par une note publiée. Une pièce jointe non citée n'est jamais copiée. Les pièces jointes sont cherchées dans tout le coffre, y compris hors de `public/`.
- Ne suit jamais un lien vers une note non publiée.
- Remplace les liens YouTube et Instagram par une **vignette cliquable** (voir ci-dessous).
- Retire les colonnes `publish`/`homepage` des vues de bases à la copie — utiles dans Obsidian, sans objet sur le site.
- Supprime de `content/` tout ce qui n'est plus publié.

### Vignettes : aucune requête tierce avant le clic

Les notes gardent un simple lien markdown, lisible dans Obsidian. C'est la synchronisation qui le remplace, **dans `content/` uniquement**, par une vignette cliquable. Le coffre n'est jamais modifié.

Un `<iframe>` YouTube contacte Google au chargement de la page, dépose des cookies et trace le visiteur avant tout clic — ce que `analytics: null` refuse. Ici la vignette est téléchargée à la synchronisation et servie depuis le site ; l'iframe n'est construit qu'au clic, sur `youtube-nocookie.com`.

Quand la publication source est supprimée ou privée, aucune vignette n'est récupérable : le lien reste en texte brut. Le rapport de sync le signale.

Désactivable par `YOUTUBE_EMBED=0` — le nom est trompeur, le drapeau coupe aussi Instagram.

## Ce que Quartz ne sait pas rendre

Ces blocs Obsidian s'affichent en **bloc de code brut** sur le site publié :

- ` ```dataview ` — remplacé par des bases (voir ci-dessous)
- ` ```mapview `, ` ```leaflet `

Ils restent utilisables dans le coffre sur des notes **non publiées**. Le paquet `@quartz-community/obsidian-plugin-leaflet` porte le nom mais ne contient pas de code Leaflet : l'installer ne règle rien.

### Bases (remplaçant de Dataview)

Les `.base` vivent dans le coffre (`public/_assets/bases/`) et sont copiés quand une note publiée les incorpore (`![[nom.base]]`).

Points non évidents du moteur :

- `this` désigne la note qui **incorpore** la base, mais n'expose que `file.name` / `path` / `folder` / `ext` — **pas** le frontmatter.
- Filtrer sur un lien de frontmatter s'écrit `contains(list(champ), this)` : cette forme gère `[[Cible]]`, `[[Cible|alias]]` et les chemins complets.
- `file.hasLink()` compare à des slugs Quartz (`odyssée/chants/chant-01`), qui ne valent jamais `this.file.name` (`Chant 01`).
- Une propriété absente n'échoue pas : la note est simplement exclue.
- Les chaînes d'interface du plugin sont en anglais, même avec `locale: fr-FR`.

Une base ne voit que `content/`, qui ne contient que du publié : elle ne peut rien révéler de privé.

## Choisir la page d'accueil

Par défaut, `content/index.md` est **généré** : une liste des notes publiées, groupée par dossier. Pour écrire l'accueil vous-même, ajoutez `homepage: true` :

```yaml
---
title: Bienvenue
publish: true
homepage: true
---
```

La note est copiée vers `content/index.md`, et la génération automatique est désactivée.

Trois garde-fous :

- `homepage: true` **n'implique pas** la publication. Sans `publish: true`, la note reste invisible ; le script le signale.
- Si plusieurs notes portent le drapeau, la première dans l'ordre alphabétique gagne ; les autres sont publiées normalement, avec un avertissement. Le résultat ne dépend pas de l'ordre du système de fichiers.
- La note change d'adresse : elle est servie à la racine. Un lien `[[Ma note d'accueil]]` ailleurs ne résoudra plus.

## Dépublier une note

Retirez `publish: true` (ou passez-le à `false`) dans le coffre, puis relancez `npm run sync`. Le script supprime le fichier de `content/`. Commitez la suppression et poussez.

> L'historique git garde une trace des versions publiées. Pour une note qui n'aurait jamais dû sortir, retirer le fichier ne suffit pas : il faut réécrire l'historique et considérer le contenu comme compromis.

## Configuration

Tout est dans `quartz.config.yaml` :

- `pageTitle` — le titre du site.
- `baseUrl` — **doit** correspondre à l'URL réelle, sans protocole ni slash final. Sinon RSS, sitemap et images OpenGraph pointent à côté.
- `locale` — `fr-FR`.
- `analytics: null` — aucun traceur tiers, volontairement.
- `excludedProperties` — les clés de frontmatter masquées sur le site.

La palette « bleu nuit » a été mesurée au contraste WCAG (≥ 4.5:1 dans les deux modes) : conservez les ratios notés en commentaire si vous y touchez.

`quartz.config.default.yaml` est la référence livrée par Quartz ; il sert de base de comparaison lors des mises à jour et n'est pas lu par la construction.

Variables d'environnement :

```bash
VAULT_PATH=/autre/coffre npm run sync   # chemin du coffre
PUBLIC_ROOT= npm run sync               # parcourir tout le coffre
YOUTUBE_EMBED=0 npm run sync            # laisser les liens nus (YouTube *et* Instagram)
```

## Le workflow, étape par étape

Le dépôt embarque des skills Claude Code dans `.claude/skills/`. Leur contenu est en
anglais ; ce README et `CLAUDE.md` restent en français.

| # | Étape | Skill | Utilisable sans Claude |
| --- | --- | --- | --- |
| — | Mettre à jour le coffre | — | Obsidian |
| 1 | Ajouter un chant de l'Odyssée *(facultatif)* | `1-vault-add-chant` | — |
| 2 | Construire et regarder en local | `2-site-construct-locally` | `npm run serve` |
| 3 | Vérifier le site construit | `3-site-check-local` | `audit.py --built` |
| 4 | Commiter et publier | `4-site-commit-and-publish` | `commit-and-publish.sh` |

L'étape 2 n'est pas une formalité : certaines casses ne se voient que sur une page rendue.
L'accueil généré est un jour parti en ligne avec ses 173 liens morts, ce qu'un coup d'œil
sur `localhost:8080` aurait arrêté. L'audit `--built` contrôle désormais cette classe de
défaut, mais l'œil humain reste le dernier filet.

## Mise en place de GitHub Pages

1. Créer un dépôt **public** sur GitHub.
2. `git remote add origin git@github.com:<utilisateur>/<dépôt>.git`
3. Dans *Settings → Pages*, choisir **GitHub Actions** comme source.
4. Renseigner `baseUrl` dans `quartz.config.yaml`.
5. Pousser sur `main`.

## Mettre Quartz à jour

Quartz est copié dans ce dépôt (pas de submodule). Pour mettre à jour, comparez avec l'amont :

```bash
git clone --depth 1 https://github.com/jackyzha0/quartz.git /tmp/quartz-new
diff -ru /tmp/quartz-new/quartz ./quartz | less
```

Reportez les changements de `quartz/`, `package.json` et `quartz.config.default.yaml`. Ne perdez pas les réglages de `quartz.config.yaml`, notamment `explicit-publish: enabled: true`.

### Modification locale à reporter

`quartz/components/Head.tsx` contient un ajout signalé par un commentaire `LOCAL MODIFICATION`. Il force le mode sombre par défaut, ce que le plugin `darkmode` ne sait pas configurer. Sans lui, un visiteur dont le système demande le mode clair verrait le site en clair.

C'est le seul endroit où le code de Quartz est modifié. Vérifiez qu'il est toujours là après une mise à jour :

```bash
grep -n "LOCAL MODIFICATION" quartz/components/Head.tsx
```
