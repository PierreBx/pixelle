# pixelle

Publie une sélection de notes du coffre Obsidian **petersVault** sur GitHub Pages, avec [Quartz 5](https://quartz.jzhao.xyz/).

Le coffre lui-même n'est jamais poussé sur GitHub. Seules les notes rangées sous `public/` **et** marquées `publish: true` sont copiées dans `content/`, commitées, puis publiées.

> **Vous venez écrire, pas bricoler la machine ?** → [`MEMENTO.md`](MEMENTO.md) : que faire pour un billet, une trouvaille, un chant, une correction. Ce README-ci explique le fonctionnement ; le mémento, les gestes.

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
npm run preview     # sync + build de production + aperçu sur http://localhost:8080
npm run serve       # serveur de dév Quartz — actifs non hachés, à éviter
npm run build       # sync + build
npm run build:ci    # build seul, sans sync — ce que lance la CI
npm test            # tests de la synchronisation
npm run links       # cherche les liens externes morts (après un build)
```

### Les tests

`npm test` lance la suite de `scripts/sync-vault.test.mjs`. Elle vise en priorité les cas où une régression **détruit du travail** — racine introuvable, zéro note publiée, dépublication, collision de noms — plutôt que le chemin heureux. Chaque test se donne un coffre jetable et lance le vrai script dans un processus séparé, si bien que c'est son comportement de bout en bout qui est vérifié.

`CONTENT_DIR` n'existe que pour cela : le script supprime ce qu'il ne reconnaît pas, et une suite de tests qui viserait le vrai `content/` le viderait à la première exécution.

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

`✓` conforme · `?` doute · `▲` exposition · `✗` casse. Code de sortie 1 dès qu'il y a un `▲` ou un `✗`. `--all` pour un inventaire du corpus, `--built` pour ajouter les contrôles sur `public/`, `--since REF` pour comparer à un commit plutôt qu'à l'arbre de travail, `--quiet` pour ne voir que ce qui cloche.

`--built` ajoute trois contrôles sur la sortie construite, dont la **résolution des liens internes** : un lien mort sur la page d'accueil y est une anomalie bloquante, puisque rien n'y est censé pointer dans le vide.

Deux contrôles portent sur ce que la page fait charger, et ceux-là ignorent le périmètre du diff — le poids d'une page est un fait du site entier, pas d'une modification :

- **poids des images** — doute au-delà de 500 Ko, casse au-delà de 2 Mo. Après synchronisation aucune image ne devrait en approcher : un dépassement signale une image passée à côté du ré-encodage.
- **texte alternatif** — toute image incorporée sans alternative est une casse. Elle se corrige dans le coffre, en nommant l'alias de l'incorporation :

  ```markdown
  ![[2026-08-09-Marqueyssac.png|Les buis taillés en vagues, dominant la vallée]]
  ```

  Obsidian affiche cet alias comme légende, Quartz le rend en `alt`. Un alias purement numérique (`|300`, `|300x200`) désigne des dimensions, pas un texte : il ne compte pas.
- **trouvailles décrites** — une note de `posts/` est un lien ; sans `description`, sa page n'est qu'une vignette et rien n'y dit pourquoi le lien a été gardé. Le contrôle distingue les deux situations : un lien **qui arrive** sans description est une casse, un lien **déjà en ligne** n'est qu'un doute. Sans cette nuance, retoucher une vieille note pour une virgule ferait échouer la CI.

### La veille des liens morts

```bash
npm run build:ci && npm run links
```

Le site cite des dizaines de vidéos et de pages tierces ; quand l'une disparaît, la vignette reste et le lien ne mène plus nulle part. Un travail planifié (`.github/workflows/link-check.yml`) passe chaque lundi et ouvre un ticket s'il trouve quelque chose.

Le vérificateur lit le site **construit**, pas les notes. Une URL nue collée dans une note n'a pas de fin évidente — le corpus en contient qui se terminent par un emoji, ou soudées au mot suivant, parce qu'une description de vidéo a été copiée telle quelle. Deviner leur limite dans le markdown reviendrait à inventer des liens morts ; dans le HTML, ce qui est dans un `href` est exactement ce qu'un lecteur peut cliquer.

Il ne prétend pas tout savoir :

- **YouTube** est fiable — la vignette répond 404 quand la vidéo est supprimée ou privée, le même test que fait la synchronisation.
- **Instagram** n'est pas vérifiable depuis un runner : Meta bloque. Ces liens sont comptés, jamais jugés.
- **Le reste** n'est déclaré mort que sur un 404 ou un 410. Un 403, un 429 ou un délai dépassé sont les réponses qu'on donne à un robot, pas les signes d'une page disparue : ils sont rangés en « indéterminé ».

### L'audit tourne aussi en intégration continue

Le workflow lance `audit.py --since HEAD^ --built` **après** la construction et **avant** le téléversement : un audit rouge n'envoie pas d'artefact, le déploiement ne part pas, et le site en ligne reste celui d'avant.

`--since HEAD^` et non `--all` : le contrôle des clés de frontmatter mesure une *nouveauté*, ce qui n'a de sens que par rapport à un état antérieur. En local, l'état antérieur est HEAD et la nouveauté est ce que vous venez de synchroniser ; en CI, tout est déjà commité et `git status` ne montrerait jamais rien.

Cela ne dispense pas de l'étape 3 : la CI constate, elle ne relit pas une page rendue.

## Confidentialité : le frontmatter est public

Le plugin `note-properties` tourne avec `includeAll: true`. **Toute** clé de frontmatter d'une note publiée devient une ligne visible du tableau de propriétés, sauf celles listées dans `excludedProperties` (`publish`, `homepage`, `created`, `modified`, `summary`, `title`, `tags`).

`title` et `tags` sont exclus parce qu'ils sont rendus ailleurs — le titre en H1, les étiquettes en pastilles cliquables sous le titre. Les notes de `posts/`, dont le frontmatter se réduit à ces clés, n'affichent donc plus de tableau du tout.

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
- **Allège les images** et **délie les documents** (voir ci-dessous).
- Retire les colonnes `publish`/`homepage` des vues de bases à la copie — utiles dans Obsidian, sans objet sur le site.
- Supprime de `content/` tout ce qui n'est plus publié.

### Images allégées, documents liés

Le coffre garde ses originaux ; c'est la copie vers `content/` qui est allégée. Deux mesures, parce que deux poids :

| | Ce qui part avec la page | Traitement |
| --- | --- | --- |
| **Image** | toujours, demandée ou non | ré-encodée en WebP, plus grand côté ramené à 1600 px |
| **Document** (PDF) | seulement si le lecteur clique | déplacé sous `_assets/docs/`, et **lié** au lieu d'être incorporé |

`![[programme.pdf]]` fait rendre à Quartz un cadre qui télécharge le fichier entier au chargement de la page. La synchronisation le remplace par un lien qui annonce ce qu'il coûte — `[Programme de salle — PDF, 1,3 Mo]` — et le fichier ne part qu'au clic.

C'est **le plus grand côté** qui est borné, pas la largeur : une photo en hauteur de 1600×2133 respecte n'importe quelle limite de largeur tout en pesant trois mégapixels. C'est la surface qui fait le poids.

En plus de l'image servie, deux largeurs supplémentaires sont émises — 480 et 960 px — et l'incorporation devient une balise `<img>` portant un `srcset`. Un téléphone télécharge alors ce dont il a besoin : la page des Grottes de Rouffignac passe de 691 Ko à **89 Ko**.

La balise emporte aussi les **dimensions réelles**, que Quartz écrivait « auto ». Sans elles, le navigateur ne peut rien réserver et le texte saute à l'arrivée de chaque image.

Un piège vérifié : les adresses sont slugifiées par la synchronisation, avec la fonction de Quartz. Quartz réécrit `src` mais **ignore `srcset`** — sans cette précaution, `src` pointait vers `grottes-de-rouffignac-2.webp` pendant que `srcset` annonçait `Grottes%20de%20Rouffignac-2-480.webp`, inexistant. Le navigateur aurait choisi une variante introuvable, précisément sur les petits écrans qu'elle sert.

Deux détails qui ont leur raison d'être :

- l'orientation EXIF est appliquée avant l'encodage. Sans cela une photo prise au téléphone ressort couchée, sharp retirant les métadonnées ;
- les vignettes de vidéos, elles, gardent leur extension `.jpg` et sont ré-encodées en JPEG sur place. Leur nom sert de cache de téléchargement : le changer forcerait à re-télécharger quatre-vingts vignettes d'un coup, ce qu'Instagram — scrapé, pas interrogé par une API — a toutes les raisons de refuser.

Si deux images du coffre portent le même nom à l'extension près (`photo.png` et `photo.jpg`), elles viseraient le même `photo.webp` : la synchronisation le détecte, les laisse toutes deux sous leur nom d'origine et le signale. Renommez-en une dans le coffre.

`OPTIMISE_IMAGES=0` rétablit la copie brute, pour comparer.

Une image n'est ré-encodée que si l'original du coffre est plus récent que la copie. Changer `IMAGE_QUALITY` ou `IMAGE_MAX_SIDE` ne suffit donc pas à reconvertir l'existant : il faut supprimer les copies pour forcer le passage.

```bash
find content/_assets/images -maxdepth 1 -type f -delete && npm run sync
```

Les vignettes, elles, ne sont réécrites que si le ré-encodage gagne au moins un dixième du poids. Sans ce seuil, une vignette restée juste au-dessus de la limite repassait à la moulinette à chaque synchronisation, perdant un peu de qualité à chaque fois.

### Lieux : la chaîne des parents devient une étiquette

Une note de contenu désigne **un** lieu ; une note de lieu désigne **son** parent. La synchronisation remonte la chaîne et écrit dans la copie une étiquette hiérarchique :

```yaml
# dans le coffre                    # dans content/
place: "[[places/Grand-Théatre]]"   tags: [music, location/france/bordeaux/grand-théatre]
```

Pourquoi la déduire plutôt que la laisser écrire : Quartz ne sait pas remonter une chaîne. Ses liens retour ne font qu'un pas et une base ne récurse pas, si bien que « tout ce qui s'est passé en France » n'est pas calculable à partir des seuls `parent:`. Les étiquettes, elles, s'agrègent toutes seules — `/tags/location/france` regroupe ses descendants sans que personne l'entretienne. Chaque mécanisme fait donc ce qu'il sait faire : le lien donne la page du lieu et ses liens retour, l'étiquette donne les pages d'agrégat.

Un lieu sans `coordinates` n'apparaît sur aucune carte. C'est le cas voulu d'un pays : sa position ne serait qu'un centroïde, qui étirerait le cadre de plusieurs centaines de kilomètres et relierait des salles de concert à un point qui n'existe nulle part.

### Cartes : un SVG calculé, aucune tuile

`<!-- carte: world -->`, seul sur sa ligne d'une note publiée, est remplacé par un SVG engendré depuis les coordonnées des lieux. Trois cartes existent : `blog`, `odyssey`, `world`.

Quartz ne rend ni `leaflet` ni `mapview`, et des tuiles OpenStreetMap seraient une requête tierce à chaque déplacement, sur un site qui n'en fait aucune.

Le fond est donc **vectoriel** : le trait de côte mondial de Natural Earth (domaine public), stocké dans `scripts/data/` et découpé au cadre de chaque carte. Un trait vectoriel porte ses coordonnées — chaque point est une longitude et une latitude — là où une image de fond exigerait de deviner ses coins, et l'erreur se verrait aussitôt sur des salles distantes de deux cents mètres. La même donnée sert toutes les échelles, du golfe de Corinthe à l'estuaire de la Gironde.

Ce fichier ne part jamais chez le visiteur : seuls les tracés découpés finissent dans le SVG.

Une définition de carte accepte par ailleurs `basemap: { href, bbox }` pour poser une image géoréférencée derrière, si un fond dessiné devient souhaitable.

Deux détails de rendu qui ont leur raison d'être : le cadre est ramené entre 0,4 et 0,85 de proportion — quelques salles bordelaises et une grotte du Périgord tiennent sinon dans une bande six fois plus large que haute, exacte et illisible ; et les étiquettes sont placées par essais successifs autour de leur point, celles qui ne trouvent pas de place étant omises plutôt qu'empilées.

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

C'est aujourd'hui `public/Pixelle.md` qui tient ce rôle, dans le coffre. La page se compose de trois entrées : les billets, listés sur place par `blogEntriesBase` ; les [[Trouvailles]], c'est-à-dire les liens triés ; et le [[Sommaire]], qui garde l'index complet, Odyssée comprise.

Pour l'éditer, ouvrez la note dans Obsidian — jamais `content/index.md`, qui en est la copie.

Par défaut, en l'absence d'une telle note, `content/index.md` est **généré** : une liste des notes publiées, groupée par dossier. Pour écrire l'accueil vous-même, ajoutez `homepage: true` :

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

### Aucune requête tierce, et un contrôle qui le vérifie

Le site ne fait charger au navigateur **aucune ressource extérieure** : pas de traceur, les polices rapatriées à la construction, les vidéos derrière une vignette qui ne contacte YouTube ou Instagram qu'au clic.

Cette promesse a été fausse pendant des mois sans que personne le voie : le greffon `latex`, actif par défaut, chargeait KaTeX depuis `cdn.jsdelivr.net` — une feuille de style et un script — sur les 384 pages, alors qu'aucune note ne contient de formule. Quartz ouvrait en plus un `preconnect` vers Cloudflare.

D'où le contrôle **« aucune requête tierce »** de l'audit, qui lit la sortie construite et échoue sur tout `script`, `link`, `img`, `iframe`, `video` ou `@import` visant un autre hôte que `baseUrl`. Un `<a href>` vers l'extérieur n'est pas concerné : c'est un lien, il attend un clic.

Le prochain greffon activé ne pourra donc plus rouvrir la brèche en silence.
- `excludedProperties` — les clés de frontmatter masquées sur le site.

La palette « bleu nuit » a été mesurée au contraste WCAG (≥ 4.5:1 dans les deux modes) : conservez les ratios notés en commentaire si vous y touchez.

`quartz.config.default.yaml` est la référence livrée par Quartz ; il sert de base de comparaison lors des mises à jour et n'est pas lu par la construction.

Variables d'environnement :

```bash
VAULT_PATH=/autre/coffre npm run sync   # chemin du coffre
PUBLIC_ROOT= npm run sync               # parcourir tout le coffre
YOUTUBE_EMBED=0 npm run sync            # laisser les liens nus (YouTube *et* Instagram)
OPTIMISE_IMAGES=0 npm run sync          # copier les images telles quelles
IMAGE_MAX_SIDE=2000 npm run sync        # plus grand côté servi (défaut 1600)
IMAGE_QUALITY=90 npm run sync           # qualité WebP (défaut 80)
```

## Le workflow, étape par étape

Le dépôt embarque des skills Claude Code dans `.claude/skills/`. Leur contenu est en
anglais ; ce README et `CLAUDE.md` restent en français.

| # | Étape | Skill | Utilisable sans Claude |
| --- | --- | --- | --- |
| — | Mettre à jour le coffre | — | Obsidian |
| 0 | Trier la file `staging/` *(facultatif)* | `0-vault-triage-staging` | — |
| 1 | Ajouter un chant de l'Odyssée *(facultatif)* | `1-vault-add-chant` | — |
| 2 | Construire et regarder en local | `2-site-construct-locally` | `npm run preview` |
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

### Modifications locales à reporter

Le code de Quartz est modifié à **trois** endroits, chacun signalé par un commentaire `LOCAL MODIFICATION`. Vérifiez qu'ils sont toujours là après une mise à jour :

```bash
grep -rn "LOCAL MODIFICATION" quartz/
```

**`quartz/components/Head.tsx`** — deux ajouts. Le premier force le mode sombre par défaut, ce que le plugin `darkmode` ne sait pas configurer. Le second **retire** le `preconnect` vers `cdnjs.cloudflare.com` que Quartz ouvrait sur chaque page : un preconnect est une résolution DNS et une poignée de main TLS, donc l'adresse IP du visiteur remise à Cloudflare à chaque visite — et pour rien, ce site ne chargeant rien de cdnjs.

**`quartz/plugins/pageTypes/dispatcher.ts`** — déliste les pages engendrées sous `_assets/`.

Le greffon `bases-page` fabrique une page autonome par fichier `.base`, en plus des tableaux incorporés dans les notes. Ces cinq pages n'ont aucun intérêt pour un lecteur — un tableau sans titre ni contexte — et se retrouvaient pourtant dans l'explorateur, dans `sitemap.xml`, dans le flux RSS et dans la recherche, sous des noms de plomberie (« blogEntriesBase »). Elles apparaissaient même en « Liens retour » au bas de chaque billet.

Les deux correctifs qu'on essaie d'abord ne marchent pas :

- `ignorePatterns: _assets` empêcherait de lire les fichiers `.base`, donc casserait les tableaux incorporés ;
- `unlisted: true` dans le fichier `.base` reste sans effet : le greffon fabrique lui-même le frontmatter de ces pages et ignore les clés du fichier.

Ces pages naissent à l'**émission**, après les transformateurs : le seul point où les marquer est leur construction. Le drapeau `unlisted` est ensuite respecté par `content-index` (donc le sitemap, le flux et `contentIndex.json`, dont dépendent la recherche et l'explorateur) et par `backlinks`. Les pages restent servies à leur URL ; seules les listes les ignorent.
