---
name: verifier-publication
description: "Contrôles avant publication du site pixelle : notes vides, clés de frontmatter nouvellement exposées, dérives de convention, blocs Obsidian non rendus, dates invalides, bases vides. À utiliser avant de commiter/pousser du contenu, ou quand l'utilisateur demande de vérifier ce qui va être publié."
allowed-tools: Read, Bash, Glob, Grep
---

Tu vérifies ce que pixelle s'apprête à publier. **Tu rapportes, tu ne corriges pas** :
plusieurs anomalies apparentes sont des choix assumés.

`content/` est **généré** par `scripts/sync-vault.mjs` — toute correction se fait dans le
coffre (`$VAULT_PATH`, défaut `~/Documents/data/obsidian/petersVault`), jamais ici.

## Les trois commandes

```bash
AUDIT=.claude/skills/verifier-publication/audit.py
npm run sync:dry                    # 1. que va-t-il partir ?
$AUDIT                              # 2. contrôles statiques
npm run build:ci && $AUDIT --built  # 3. construction + contrôles sur public/
```

L'audit n'examine que les notes **modifiées depuis HEAD** — c'est là que sont les erreurs
fraîches. `--all` pour un inventaire du corpus (utile trimestriellement, pas avant chaque
publication : il ressort une dizaine de constats préexistants et assumés).

Le script est exécutable et autonome : il retrouve la racine du dépôt seul, `--help`
détaille tout, il ne modifie rien. L'utilisateur peut donc le lancer sans passer par ce
skill — ne réimplémente pas ses contrôles à la main.

L'audit affiche **tous** ses contrôles, conformes compris, avec ce qu'il a examiné et ce
qu'il a trouvé : `✓` conforme · `?` doute (erreur de saisie probable) · `▲` exposition
(donnée rendue publique sans décision) · `✗` casse (le site publie du faux ou du mort).
Code de sortie 1 dès qu'il y a un `▲` ou un `✗`. `--quiet` masque les conformes.

## Lire les rapports

**`sync:dry`** — trois catégories de bruit **attendu**, à ne pas remonter comme anomalies :

| Signal | Sens |
| --- | --- |
| *liens manquants* (~22, stables) | une note publiée cite une note privée ou non écrite ; le lien s'affiche en texte brut, rien de privé n'est copié |
| *média sans vignette* | la publication Instagram/YouTube est supprimée ou privée ; le lien reste nu |
| *pièce jointe ambiguë* | deux fichiers de même nom, le premier gagne |

En revanche `- fichier (unpublished)` **retire une page du site** : toujours le confirmer.

**`build:ci`** — `isn't yet tracked by git` est bénin (disparaît au commit).
`found invalid date` est réel : la date affichée sera fausse.

## Ce que l'audit sait déjà

Inutile de refaire ces contrôles à la main — mais comprends-les pour interpréter :

- **note vide** — un frontmatter sans corps publie une page dont le seul contenu visible
  est son tableau de propriétés. Les fiches de `_assets/items/` sont volontairement ainsi
  et sont exclues du contrôle ; ailleurs, c'est un brouillon oublié.
- **clé inédite / clé étrangère au dossier** — `note-properties` tourne avec
  `includeAll: true` : toute clé non listée dans `excludedProperties` devient une ligne
  visible. Une clé jamais vue est un ajout non décidé ; une clé absente des notes voisines
  est une dérive de convention. L'audit affiche les clés qu'emploie le dossier, triées par
  fréquence — la bonne réponse y est presque toujours.
- **lien vers soi-même**, **date invalide**, **bloc non rendu**
  (`dataview`/`mapview`/`leaflet`/`zoommap` — aucun équivalent Quartz, rendu en code brut).
- **colonne de plomberie dans une base** — `sync-vault.mjs` retire `publish`/`homepage`
  des colonnes à la copie (`BASE_HIDDEN_COLUMNS`). Un constat ici signale une régression
  de ce filtre, pas une erreur du coffre.
- **base sans entrée** — légitime quand aucune note ne correspond (`Troyens`), suspect
  sinon. Le décompte vient du plugin ; ne jamais se fier à la classe `bases-empty`, qui
  marque aussi les cellules vides.

## Contrat de sortie

Sois bref. L'utilisateur veut décider, pas lire.

1. **Une ligne de verdict** : `N notes, M pièces jointes — X à trancher` (ou
   `rien à signaler`, et tu t'arrêtes là).
2. **Un tableau**, un constat par ligne, `CASSE` d'abord : *quoi · où · effet visible sur
   le site · correction proposée*. Cite la correction dans le coffre, pas dans `content/`.
3. **Une seule question groupée** si des arbitrages restent — jamais une par anomalie.
   Propose l'option recommandée en premier.

N'affiche pas les commandes lancées, ni les sorties brutes, ni les constats verts.
Ne relance pas un contrôle déjà vert pour « confirmer ».

## Pièges vérifiés

- **Les slugs ne se devinent pas.** `Manuel Casares - Piano` donne
  `manuel-casares---piano`. Pour sonder une URL, lis le nom de fichier émis dans `public/`.
- Une base ne voit que `content/`, qui ne contient que du publié : elle ne peut rien
  révéler de privé, et un filtre `publish == true` y est redondant.
