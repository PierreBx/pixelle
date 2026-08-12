# Mémento

Le guide de l'auteur du site : que faire, concrètement, selon ce qu'on veut publier.

`README.md` explique comment la machine fonctionne ; ce fichier-ci ne dit que ce
qu'il y a à faire. En cas de contradiction, c'est le README qui a raison.

---

## La règle qui les résume toutes

> **On écrit dans le coffre. Jamais dans `content/`.**

`content/` est **fabriqué** par `npm run sync` à partir du coffre Obsidian. Ce que
vous y taperiez serait écrasé — ou supprimé — à la synchronisation suivante.
Le coffre est la source ; le dépôt n'en est que la copie publiée.

Une note n'est publiée que si **les deux** conditions sont réunies :

1. elle est rangée sous `public/` dans le coffre ;
2. son frontmatter porte `publish: true`.

Rien d'autre ne sort. `private/` ne sort jamais, drapeau ou pas.

---

## Les quatre gestes qui publient

Quoi que vous ayez écrit, la mise en ligne est toujours la même suite :

| # | Étape | Comment |
| --- | --- | --- |
| **1** | Écrire dans Obsidian | à la main |
| **2** | Construire et regarder | `/2-site-construct-locally` — ou `npm run preview`, puis <http://localhost:8080> |
| **3** | Vérifier | `/3-site-check-local` — ou `.claude/skills/3-site-check-local/audit.py --built` |
| **4** | Publier | `/4-site-commit-and-publish` — ou `.claude/skills/4-site-commit-and-publish/commit-and-publish.sh --push` |

**L'étape 2 n'est pas une formalité.** Certaines casses ne se voient que sur une
page rendue : l'accueil est un jour parti en ligne avec 173 liens morts. L'audit
en attrape beaucoup depuis, mais l'œil reste le dernier filet.

**Synchroniser ne publie pas.** Le site en ligne reflète exactement ce qui est
**commité**. L'étape 4 est celle qui compte.

---

## J'écris un billet

Un **billet** est un texte : un concert, un film, un lieu, un livre. Il vit dans
`public/blog/` et c'est la seule chose qui s'affiche sur la page d'accueil.

Créez la note dans `public/blog/<Titre>.md` :

```yaml
---
publish: true
created: 2026-08-12
modified: 2026-08-12
category: [event]
tags: [music]
place: "[[places/Grand-Théatre|Grand-Théatre]]"
description: Une phrase qui donne envie de lire — elle sert aussi d'aperçu sur les réseaux.
---
```

Trois axes, et **on n'écrit jamais deux fois la même chose** :

| | | |
| --- | --- | --- |
| le **corpus** | le dossier | `blog/` le dit déjà — jamais dans une étiquette |
| la **nature** | `category` | `work` · `event` · `place` · `photo` — une seule valeur |
| la **discipline** | `tags` | `film` `series` `music` (`music/piano`) `opera` `dance` `theatre` `literature` `poetry` `photography` `fitness` `beauty` `humor` `society` `history` `science` |

- `place` — le lieu exact, en lien vers une note de `places/`. La synchronisation
  en déduit toute seule l'étiquette `location/france/bordeaux/…` : **ne l'écrivez
  pas à la main.**
- `created` — **mettez-la**. C'est elle qui range le billet dans l'accueil et dans
  le journal ; sans elle, il remonte en tête sans raison.

Puis écrivez le texte. Pour une image :

```markdown
![[2026-08-12-Mon Billet.png|Ce que montre l'image, en une ligne]]
```

Le texte après le `|` est **obligatoire** : c'est ce que lit un visiteur qui ne
voit pas l'image, et l'audit refuse de publier sans lui. Obsidian l'affiche comme
légende.

Pour un PDF (programme de salle, dossier de presse) :

```markdown
![[CALA_LaFluteEnchantee_2026_2.pdf|Programme de salle]]
```

Vous l'incorporez, la synchronisation en fait un **lien** qui annonce son poids.
Nommez-le : sans alias, le lien s'appellera `CALA_LaFluteEnchantee_2026_2`.

---

## Je garde une trouvaille

Une **trouvaille** est un lien : une vidéo, un extrait, un compte à suivre. Elle
vit dans `public/posts/` et s'affiche sur la page *Trouvailles* et dans le journal.

### Le chemin normal

La capture (partage iOS, Web Clipper) atterrit dans `staging/`. Pour vider la
file :

```
/0-vault-triage-staging
```

Le skill lit la file, propose pour chaque capture un titre débarrassé du bruit,
une étiquette et une description, **et attend votre validation**. Il n'écrit rien
avant. Il ne publie pas non plus : les étapes 2 à 4 s'en chargent.

### À la main

Déplacez la note dans `public/posts/<Titre>.md` :

```yaml
---
publish: true
created: 2026-08-12
modified: 2026-08-12
tags:
  - post/music
description: Barenboim explique en trois minutes pourquoi l'Appassionata ne se joue pas vite.
---

[Barenboim sur l'Appassionata](https://www.youtube.com/watch?v=…)
```

- **La `description` est exigée** pour toute nouvelle trouvaille : sans elle, la
  page n'est qu'une vignette et rien n'y dit pourquoi le lien a été gardé.
  L'audit bloque. Une phrase suffit — pas un résumé du titre.
- `tags` — une seule étiquette, prise dans le **même vocabulaire que les
  billets** (voir le tableau plus haut). Plus de préfixe `post/` : le dossier dit
  déjà que c'est une trouvaille, et `film` réunit désormais les billets et les
  liens sur un seul sujet au lieu de deux pages qui s'ignorent.
- **Laissez le lien nu.** Ne fabriquez pas de vignette ni d'`<iframe>` : la
  synchronisation télécharge l'aperçu et construit une vignette qui ne contacte
  YouTube ou Instagram qu'**au clic**. Une note qui contient déjà du HTML l'en
  empêche.
- **Ne nettoyez pas l'URL.** Les `?igsh=…` et autres suffixes sont sans
  importance ; une URL raccourcie à la main peut cesser de résoudre.

---

## J'ajoute un lieu

Un lieu est une note de `public/places/`, et il ne connaît que **son parent** —
jamais toute la chaîne :

```yaml
---
publish: true
type: place
nature: real
map: world
parent: "[[places/Bordeaux|Bordeaux]]"
coordinates: 44.8419,-0.5745
---

L'opéra national de Bordeaux, place de la Comédie.
```

- `parent` — un seul saut. `Grand-Théatre → Bordeaux → France` se construit tout
  seul, un maillon à la fois.
- `coordinates` — `latitude,longitude`. **Un pays n'en a pas** : ce ne serait
  qu'un centroïde, qui étirerait la carte de plusieurs centaines de kilomètres.
  Sans coordonnées, le lieu reste un maillon de la hiérarchie sans être un point.
- Écrivez une ligne de description : une note vide est signalée par l'audit.

En retour, vous obtenez sans rien faire de plus : une page par lieu avec ses
liens retour (« tout ce qui s'est passé ici »), les pages d'agrégat
`/tags/location/france/bordeaux` (« tout ce qui s'est passé dans cette ville »),
et le point sur les cartes.

**Attention aux homonymes.** Un billet `Bordeaux` et un lieu `Bordeaux`
coexistent : d'où la forme longue `[[places/Bordeaux|Bordeaux]]`, qui ne laisse
aucun doute.

## Les cartes

La page `Cartes` appelle les cartes par un commentaire, seul sur sa ligne —
invisible dans Obsidian :

```markdown
<!-- carte: blog -->
```

Trois existent : `blog` (les lieux des billets), `odyssey`, `world` (tout).
Elles sont dessinées à la synchronisation, à partir des `coordinates`.

Ce sont des **repères, pas des cartes** : les positions relatives sont justes,
mais rien ne dessine les côtes. Une carte glissante demanderait des tuiles, donc
une requête à un tiers à chaque déplacement — ce que ce site ne fait nulle part.
Pour un vrai fond, il faudra fournir une image géoréférencée.

## J'ajoute un chant de l'Odyssée

```
/1-vault-add-chant 4
```

Le skill fait tout dans le coffre : personnages, lieux, événements, la note du
chant, le chaînage précédent/suivant, et un commit. Il travaille au rythme de la
lecture et refuse de sauter un chant.

---

## Je corrige une note déjà en ligne

Ouvrez-la **dans Obsidian**, corrigez, puis les étapes 2 → 4. Ne cherchez pas le
fichier dans `content/` : c'est une copie.

## Je retire une note du site

Retirez `publish: true` (ou passez-le à `false`) dans le coffre, puis les étapes
2 → 4. La synchronisation supprime le fichier de `content/`, et le commit
enregistre la suppression.

> L'historique git garde trace de ce qui a été publié. Pour une note qui n'aurait
> jamais dû sortir, la retirer ne suffit pas : il faut réécrire l'historique et
> considérer le contenu comme compromis.

## Je change la page d'accueil

C'est `public/Pixelle.md` dans le coffre — la note qui porte `homepage: true`.
Modifiez-la comme n'importe quelle note. Ne touchez pas à `content/index.md`,
qui en est la copie.

---

## Ce que le site refuse de publier

L'audit (étape 3) arrête la publication sur tout ce qu'il marque `✗` (casse) ou
`▲` (exposition). Les mêmes contrôles tournent en intégration continue : un
audit rouge n'envoie rien en ligne. Voici ceux que vous rencontrerez.

| Ce qu'il dit | Ce qu'il faut faire |
| --- | --- |
| **image sans texte alternatif** | ajouter `\|description` dans l'incorporation |
| **nouveau lien sans `description`** | écrire une phrase dans le frontmatter de la trouvaille |
| **clé de frontmatter inédite** | une clé qu'aucune autre note ne portait devient publique ; la retirer, ou l'assumer (voir les pièges) |
| **bloc `dataview` / `mapview` / `leaflet`** | Quartz ne sait pas les rendre ; retirer le bloc de la note publiée |
| **`category` hors vocabulaire** | seules quatre valeurs existent : `work` · `event` · `place` · `photo` |
| **date inutilisable** | une date écrite `null` / `none` ; mettre une vraie date |
| **image de plus de 2 Mo** | rare ; signe qu'une image a échappé à la conversion |

Et ces avertissements, qui **ne bloquent pas** mais méritent un regard :

- **note sans contenu** — un billet réduit à son frontmatter. Presque toujours un
  brouillon oublié.
- **trouvaille déjà en ligne sans description** — signalée, jamais bloquante :
  69 des 83 trouvailles sont dans ce cas, et on ne va pas les rattraper d'un coup.
- **étiquette inconnue** — une étiquette qui n'existait sur aucune autre note.
  Le plus souvent une faute de frappe (`photgraphy`) ; parfois un sujet vraiment
  neuf, et alors il n'y a rien à corriger. Signalé, jamais bloquant.
- **lien vers une note privée ou pas encore écrite** — attendu, le lien s'affiche
  en texte simple. Rien de privé n'est copié, mais le **titre** de la note visée
  apparaît dans le HTML : si ce titre est révélateur, retirez le lien.

---

## Deux pièges à connaître

**Le frontmatter est public.** Toute clé que vous ajoutez à une note publiée
devient une ligne visible du tableau de propriétés — sauf `publish`, `homepage`,
`created`, `modified`, `summary`, `title` et `tags`. Ajouter `téléphone:` à une
note publiée l'afficherait. L'audit signale toute clé inédite ; ne passez pas
outre sans y avoir pensé.

**Les dates rangent le site.** L'accueil, le journal et les trouvailles se
trient sur `created`. Une note sans date remonte en tête de liste. Mettez-la à
la création : c'est plus simple que de la retrouver après coup.

---

## Aide-mémoire

```bash
npm run preview   # synchronise, construit, et sert sur http://localhost:8080
npm run sync:dry  # montre ce qui serait copié, sans rien écrire
npm test          # tests de la synchronisation
npm run links     # cherche les liens externes morts (après un build)
```

| Je veux… | |
| --- | --- |
| trier mes captures | `/0-vault-triage-staging` |
| ajouter un chant | `/1-vault-add-chant N` |
| voir le site en local | `/2-site-construct-locally` |
| vérifier avant publication | `/3-site-check-local` |
| publier | `/4-site-commit-and-publish` |

Le coffre : `~/Documents/data/obsidian/petersVault`, sous-dossier `public/`.
