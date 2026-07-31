---
name: ajouter-chant
description: "Traite un chant de l'Odyssée de bout en bout dans le coffre Obsidian petersVault : personnages, lieux, événements, note de synthèse (type song), chaînage previous/next, commit, puis propagation vers le site pixelle. À utiliser dès que l'utilisateur demande d'ajouter ou traiter un chant (ex. « Ajoute le chant 2 », « traite le chant III »)."
argument-hint: "<numéro du chant, ex. 2>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
---

Tu ajoutes le **chant $ARGUMENTS** de l'Odyssée d'Homère à la base de connaissances du coffre Obsidian, puis tu répercutes le résultat sur le site pixelle. `$ARGUMENTS` est le numéro du chant (1–24).

## 0. Contexte — ce skill s'exécute depuis pixelle, pas depuis le coffre

Le répertoire courant est le dépôt **pixelle** ; le contenu à écrire vit dans un **autre** répertoire, le coffre Obsidian. Deux conséquences, à traiter avant toute écriture :

- **Résous le chemin du coffre** :
  ```bash
  VAULT="${VAULT_PATH:-/home/ipro0800/Documents/data/obsidian/petersVault}"
  ```
  (même convention que `scripts/sync-vault.mjs`). Tous les chemins de notes ci-dessous sont **relatifs au coffre** : écris-les préfixés par `$VAULT/`. Ne crée jamais de note de l'Odyssée dans `content/` — ce répertoire est **généré** par `npm run sync` et toute écriture directe y sera écrasée ou supprimée.
- **Lis `$VAULT/CLAUDE.md` en premier.** C'est la référence normative (« Conventions de notes », « Le type song », « Les Factions », « Politique anti-spoiler »). Il n'est **pas** chargé automatiquement dans ce projet — sans cette lecture, tu travailles à l'aveugle. Lis aussi ce fichier pour l'« État actuel » (chants déjà traités).
- Toute commande git visant le coffre s'écrit `git -C "$VAULT" …`.

Procède **étape par étape**, dans l'ordre. N'invente jamais de fait : si tu n'es pas sûr du contenu du chant, vérifie (WebSearch/WebFetch sur une traduction de l'Odyssée) ou demande, plutôt que d'extrapoler.

## 1. Garde-fous
- Note `NN` = le numéro **zéro-paddé** (chant 2 → `02`, chant 12 → `12`). Titre de la note de chant : `Chant NN`.
- Si le chant demandé n'est pas le **suivant logique** (le dernier `Chant` existant + 1), signale-le à l'utilisateur et attends confirmation avant de continuer (on construit au rythme de la lecture).
- Obsidian peut être ouvert : écris normalement. Ne touche jamais à `$VAULT/.obsidian/` (config cachée), à ne pas confondre avec `$VAULT/_obsidian/` (contenu éditable).

## 2. Préparation — lire avant d'écrire
1. Relis les fileClasses `$VAULT/_obsidian/_metadata/odyssey-*.md`.
2. Liste l'existant : `$VAULT/odyssée/Personnages`, `Lieux`, `Événements`, `Chants`, `Factions`.
3. Dresse la liste des entités du chant $ARGUMENTS (personnages, lieux, événements majeurs) d'après le texte.

⚠️ Le template `$VAULT/_obsidian/_templates/odyssey song.md` est **obsolète** : il contient encore des blocs Dataview et un bloc `mapview` qui ne sont pas rendus par Quartz et ont été retirés des notes existantes. Ne le recopie pas tel quel — utilise la structure donnée en §5. (Le frontmatter du template reste une référence valable.)

## 3. Mettre à jour l'existant (plutôt que recréer)
- Pour chaque entité déjà présente qui réapparaît : ajoute « Chant $ARGUMENTS » à sa section `## Apparitions (chants)`, et remplis les champs YAML devenus connus **dans ce chant** (respect anti-spoiler). Cela inclut `faction` pour un vétéran de la guerre de Troie qui apparaît enfin (ex. Nestor, Ménélas → `"[[Achéens]]"`).

## 4. Créer les nouvelles entités (fileClasses)
Toute note de l'Odyssée porte **`publish: true`** en frontmatter (les 53 notes existantes l'ont ; sans ce drapeau la note n'atteindra jamais le site).

- **Personnages** (`type: character`, tag `odyssey/character`) : `nature` en **anglais** (`mortal`/`god`/`nymph`/`monster`) ; relations en wikilinks entre guillemets. Champs **MultiFile** (`consort`, `children`, `patron_of`) en **listes** même à un élément (`children: ["[[X]]"]`) ; champs File (`father`, `mother`, `spouse`, `killed_by`, `home`, `faction`) en wikilink scalaire.
  - **`faction`** (camp de la guerre de Troie) : `"[[Achéens]]"` ou `"[[Troyens]]"` pour un vétéran/allié — **mortels ET dieux** (Athéna/Poséidon = Achéens ; Apollon/Aphrodite/Arès = Troyens ; Zeus neutre = vide) ; **vide** pour qui n'a pas fait la guerre (prétendants, serviteurs, Télémaque…). À distinguer de `home` (la cité). **Pas un spoiler**. Réutilise `Factions/Achéens` et `Factions/Troyens` ; n'en crée une nouvelle que si un camp inédit apparaît (avec son `leader`).
- **Lieux** (`type: place`, tag `odyssey/place`) : `nature` (`real`/`mythical`/`uncertain`). Lieu **réel** → `location: "lat,lng"` ; lieu **mythique** → `location: ""`.
- **Événements** (`type: event`, tag `odyssey/event`) : une note par scène majeure ; `location` = wikilink du lieu, `participants` = **liste**, et `song: "[[Chant NN]]"`. Ce champ `song` n'est pas décoratif : c'est **lui** qui alimente la liste « Événements » de la note de chant sur le site (base `chantEvents.base`). Un événement sans `song` correct n'apparaîtra nulle part. Les morts **mineures** se notent via `killed_by` du personnage, sans note dédiée.
- **Anti-spoiler** : ne renseigne un fait que s'il est raconté ou rappelé dans un chant déjà lu (≤ $ARGUMENTS).

## 5. Note de synthèse du chant (type song)
Crée `$VAULT/odyssée/Chants/Chant NN.md` avec **exactement** cette structure :

```markdown
---
publish: true
type: song
number: <N>
tags: [odyssey/song]
characters: ["[[…]]", "[[…]]"]
places: ["[[…]]"]
previous: "[[Chant (N-1 zéro-paddé)]]"
next:
created: <AAAA-MM-JJ>
modified: <AAAA-MM-JJ>
---

## Résumé

<3–5 phrases>

## Événements

![[chantEvents.base]]
```

- `characters` / `places` = **listes de wikilinks** couvrant **toutes** les entités mentionnées dans le chant. Elles sont affichées automatiquement sur le site (tableau de propriétés) : n'ajoute **pas** de sections `## Personnages` / `## Lieux` dans le corps, ce serait un doublon.
- `next:` reste **vide** ; **chaîne la lecture** en renseignant `next: "[[Chant NN]]"` sur la note du chant précédent.
- N'ajoute **pas** de section `## Carte` : les blocs `mapview` ne sont pas rendus par Quartz.

## 6. Vérification (coffre)
- Aucun champ hors schéma ; wikilinks entre guillemets ; MultiFile en listes ; `song` bien un wikilink vers `Chant NN` ; `publish: true` partout ; `nature`/`type`/`tags` en anglais, le reste en français.
- Aucun bloc ` ```dataview `, ` ```mapview `, ` ```leaflet ` ou ` ```zoommap ` dans les notes créées : Quartz ne les rend pas, ils s'afficheraient en bloc de code brut sur le site.

## 7. Commit du coffre
```bash
git -C "$VAULT" add odyssée/
git -C "$VAULT" commit -m "Chant $ARGUMENTS : personnages, lieux, événements"
```
Commit simple uniquement — pas de rebase/force (le coffre est aussi synchronisé par Obsidian Sync).

## 8. Propager vers le site pixelle
Depuis le dépôt pixelle (répertoire courant) :

1. `npm run sync` — copie les notes `publish: true` vers `content/`. Lis le rapport : les **liens manquants** signalés sont normaux pour un personnage cité mais pas encore créé ; tout autre avertissement mérite un examen.
2. `npx quartz build` puis vérifie la page du nouveau chant dans `public/odyssée/chants/chant-NN.html` : la liste « Événements » doit contenir les événements du chant (elle est rendue à la construction, pas côté navigateur).
3. Si l'utilisateur veut publier : `git add -A content`, commit `Publie : Chant $ARGUMENTS`, puis `git push`. **Demande avant de pousser** — la publication est une action visible de l'extérieur.

## 9. Compte rendu
Résume ce qui a été créé/mis à jour (compte des personnages/lieux/événements, note de chant, chaînage), signale les liens non résolus, et **demande à l'utilisateur de vérifier le rendu** dans Obsidian (graphe) et sur le site.
