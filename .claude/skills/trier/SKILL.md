---
name: trier
description: "Vide la file d'attente staging/ du coffre Obsidian : pour chaque capture (post Instagram, vidéo YouTube, page web), renomme, nettoie le frontmatter du clipper, puis publie vers public/posts/, archive en privé, reporte ou jette. Sans argument, traite toute la file en une passe. À utiliser quand l'utilisateur veut publier un lien mis de côté, trier, dépiler ou vider staging."
argument-hint: "[titre ou fragment du nom d'une note ; vide = toute la file]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

Tu vides la file d'attente `staging/`. `$ARGUMENTS` désigne une note (fragment de nom) ;
**sans argument, tu traites la file entière** en une passe (voir §1 bis).

## Principe : staging est une file, pas un dépôt

Il n'existe **aucun marqueur « traité »**, et il ne faut pas en inventer : toute décision
**sort la note de `staging/`**. Ce qui reste dans `staging/` est donc, par construction,
ce qui n'a pas encore été traité — visible d'un coup d'œil dans l'explorateur d'Obsidian,
sans état à maintenir.

Quatre destinations, jamais « rester sur place » :

| Décision | Destination |
| --- | --- |
| Publier | `public/posts/` |
| Garder, mais privé | `private/posts/` |
| Décider plus tard | `staging/_plus-tard/` |
| Jeter | suppression (`git rm`) |

Pourquoi pas un drapeau en frontmatter : le linter Obsidian réécrit le frontmatter à
chaque modification, la clé serait invisible dans l'explorateur, et si la note est
publiée un jour, `includeAll: true` afficherait cet état interne sur la page publique.

## 0. Contexte

Le coffre a trois racines : `staging/` (captures brutes venues du partage iOS et du Web
Clipper), `public/` (publiable), `private/`. Seul `public/` est synchronisé vers le site.

```bash
VAULT="${VAULT_PATH:-/home/ipro0800/Documents/data/obsidian/petersVault}"
```

**Ne modifie jamais `content/`** : c'est une sortie générée. Tout se passe dans le coffre.

**Ne touche pas au lien lui-même.** L'encapsulation des vidéos YouTube et des posts
Instagram est automatique : `sync-vault.mjs` reconnaît l'URL, télécharge la vignette et
produit une vignette cliquable. Un lien laissé tel quel est le comportement voulu.

## 1. Montrer avant d'agir

Lis la note et propose un plan : nouveau nom, clés de frontmatter retirées, destination.
**Attends l'accord** avant d'écrire quoi que ce soit. Un déplacement dans le coffre
déclenche la réécriture des liens par Obsidian ; ce n'est pas anodin.

## 1 bis. Passe complète (sans argument)

Le mécanique se traite en lot ; deux choses ne s'automatisent pas : **le titre** et le
**« est-ce que ça mérite une page ? »**. Ne pose donc pas 80 questions — présente **un
seul tableau** couvrant toute la file, et laisse l'utilisateur le corriger d'un bloc.

1. Inventorie : `ls "$VAULT/staging"/*.md`, puis pour chaque note relève la plateforme
   (Instagram / YouTube / page web / autre) et l'URL.
2. Propose un tableau `note actuelle | titre proposé | décision`, **groupé par
   plateforme** — les captures se ressemblent, les décisions vont par paquets.
3. Par défaut, propose `plus tard` plutôt que `publier` : mieux vaut une file qui se vide
   lentement qu'un site rempli de pages d'un seul lien. Ne propose `publier` que pour ce
   qui a manifestement sa place sur le site.
4. **Un seul accord**, puis exécute tout — en signalant à la fin ce qui a bougé où.

Traite par lots de 15 à 20 notes si la file est longue : un tableau de 80 lignes ne se
relit pas.

## 2. Renommer

Le nom de fichier devient **le titre de la page et son URL**. Les captures arrivent avec
des noms inutilisables :

```
Clásica Vids | Música & Historia sur Instagram.md
@bboykilo sur Instagram.md
👉 Nobleclassics • The Classical Vault sur Instagram.md
```

Propose un titre court et parlant, en français, décrivant **le contenu** et non sa
source : « Argerich joue Rachmaninov », pas « Classical Music sur Instagram ». Retire le
suffixe « sur Instagram », les pseudonymes, les emoji et les barres verticales.

⚠️ **Vérifie qu'aucune note homonyme n'existe** ailleurs dans le coffre avant de
renommer : `find "$VAULT" -name "<nom>.md"`. Deux fichiers de même nom rendent les
wikilinks courts ambigus et Obsidian relie alors la mauvaise note, silencieusement.

## 3. Nettoyer le frontmatter

`note-properties` tourne avec `includeAll: true` : **toute clé survivante s'affiche** sur
la page publiée, dans un tableau au-dessus du texte.

Les notes du **Web Clipper** arrivent avec `title`, `source`, `author`, `published`,
`description`, `tags: keep`, `category: clippings`. La `description` est une copie du
descriptif de la plateforme — jusqu'à 2 800 caractères de discours promotionnel. Publiée
telle quelle, elle noie la page.

- **Retire** `description`, `source`, `author`, `published`, et `title` s'il fait doublon
  avec le nom du fichier.
- **Retire les valeurs artefacts** `clippings` et `keep`, dans `tags` **comme** dans
  `category` — le Web Clipper écrit le plus souvent `tags: [clippings]`, pas seulement
  `category: clippings`. Vider la clé si rien ne reste. Ne pas se contenter de comparer
  la clé à une valeur unique : ce sont des listes.
- Le vocabulaire des billets existants est fait de **mots anglais simples** : `movie`,
  `concert`, `dance`, `books`, `theatre`, `opera`, `series`, `recital`, `picture` ;
  `category` vaut `art`, `event` ou `picture`. Réutiliser ce vocabulaire si un terme
  convient ; **ne pas en inventer** un nouveau sans demander, sinon rien.
- **Garde** `created` / `modified` (déjà masquées à l'affichage).
- **Ajoute** `publish: true`.

Si la `description` contient une information réellement utile, propose de la reformuler
en une phrase dans le corps — pas de la garder en propriété.

## 4. Déplacer

Destination : `$VAULT/public/posts/<Nouveau titre>.md`.

Deux dossiers publiables, à ne pas confondre :

| Dossier | Contenu |
| --- | --- |
| `public/blog/` | billets rédigés à la main. Alimente la liste de l'accueil (base `allPosts`). |
| `public/posts/` | **destination de ce skill** : liens mis de côté et triés depuis `staging/`. |

Symétrie côté privé : `private/posts/` reçoit les liens gardés mais non publiés.

⚠️ `allPosts` — la liste de l'accueil — ne regarde que `blog/`. Une note déposée dans
`posts/` n'y apparaît donc **pas**. Elle est en revanche recensée par la page
**`Sommaire`** (`/sommaire`, base `allEntries`), qui balaie `blog`, `posts` et `odyssée`.
C'est le point d'entrée à indiquer à l'utilisateur après un tri.

```bash
git -C "$VAULT" mv "staging/<ancien nom>.md" "public/posts/<nouveau nom>.md"
```

Pour les trois autres décisions, même geste, autre destination :

```bash
git -C "$VAULT" mv "staging/<nom>.md" "private/posts/<nom>.md"        # privé
git -C "$VAULT" mv "staging/<nom>.md" "staging/_plus-tard/<nom>.md"   # plus tard
git -C "$VAULT" rm "staging/<nom>.md"                                 # jeter
```

Crée le dossier de destination s'il manque. Seules les notes publiées ont besoin d'être
renommées et nettoyées (§2 et §3) : pour les trois autres, déplace tel quel — inutile de
soigner ce qui ne sera pas lu.

⚠️ `staging/_plus-tard/` reste sous `staging/`, donc hors de `public/` : rien n'est
publié par accident. Mais ces notes **ressortiront** à la prochaine passe si tu listes
`staging/**` — ne balaie que `staging/*.md`, à plat.

## 5. Donner un corps à la page

Une page qui ne contient qu'une vignette est pauvre. Propose à l'utilisateur d'ajouter
une ou deux phrases : pourquoi il a gardé ce lien. **N'invente pas son avis** — pose la
question, ou laisse un emplacement visible s'il préfère écrire plus tard.

## 6. Vérifier

```bash
cd ~/Documents/projects/personal/pixelle && npm run sync
```

Dans le rapport :

- `+ posts/<titre>.md` — la note est bien prise ;
- `N/N média(s) encapsulé(s)` — la vignette a été récupérée. Si le média est signalé sans
  vignette, le post est supprimé, privé, ou Instagram a changé sa page : le lien reste un
  lien, ce qui est le repli voulu.

Puis lance le skill `verifier-publication` : son contrôle des clés de frontmatter attrape
précisément ce que l'étape 3 aurait laissé passer.

## 7. Compte rendu

Indique le nouveau titre, l'URL que la page aura, les clés retirées, et si le média a été
encapsulé. Rappelle que rien n'est en ligne tant que `/publier` n'a pas été lancé.

Après une passe complète, donne le solde de la file :

```bash
ls "$VAULT/staging"/*.md 2>/dev/null | wc -l          # reste à traiter
ls "$VAULT/staging/_plus-tard"/*.md 2>/dev/null | wc -l   # reportées
```

C'est le seul indicateur d'avancement, et il suffit : une file qui décroît.
