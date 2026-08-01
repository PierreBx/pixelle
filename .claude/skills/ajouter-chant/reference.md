# Base de connaissances Odyssée — référence

Référence normative des notes de l'Odyssée dans le coffre `petersVault`.
Reprend le `CLAUDE.md` qui vivait à la racine du coffre, devenu inutile depuis que
le skill `ajouter-chant` est ici.

La valeur principale de cette base est la **graph view** : les relations sont
encodées en wikilinks dans le frontmatter YAML, pas dans le corps des notes.

## Emplacement

Tout vit sous `$VAULT/public/odyssée/` :

```
Personnages/   # type character      Chants/     # type song, « Chant 01 »…« Chant 24 »
Lieux/         # type place          Factions/   # type faction (Achéens, Troyens)
Événements/    # type event
Carte de l'Odyssée.md     Itinéraire d'Ulysse.md
```

Hors racine de publication : `_obsidian/_metadata/` (fileClasses Metadata Menu),
`_obsidian/_templates/` (templates `odyssey *.md`), `_obsidian/_bases/` (bases
incorporées).

⚠️ **Homonymes.** Deux fichiers de même nom rendent les wikilinks courts ambigus, et
Obsidian peut relier la mauvaise note — silencieusement, y compris en réécrivant des
liens lors d'un déplacement de dossier. C'est arrivé : un `_inbound/Zeus.md` vide a
capté six liens `[[Zeus]]` de l'Odyssée. Avant de créer une note, vérifier qu'aucune
homonyme n'existe ailleurs : `find "$VAULT" -name "X.md"`.

## Conventions de notes

- **Langue : français** pour le corps, les titres d'événements et les noms propres
  (graphie française : Ulysse, Télémaque, Pénélope, Ithaque). **Exception : les valeurs
  de vocabulaire contrôlé `nature` sont en anglais**, conformément aux `valuesList` des
  fileClasses.
- Chaque note porte un `type` (`character` / `place` / `event` / `song` / `faction`)
  **ET** le tag correspondant (`odyssey/character`…). Redondance volontaire : les tags
  servent aux groupes de couleurs du graphe, `type` aux filtres Bases. Ne jamais
  supprimer l'un des deux.
- Toute note de l'Odyssée porte `publish: true` : sans ce drapeau elle reste invisible
  au site, même sous `public/`.
- Les relations sont des **wikilinks dans le YAML** :
  - personnages : `father`, `mother`, `spouse`, `consort` (liaisons hors mariage),
    `children`, `killed_by`, `patron_of` (dieux), `home`, `faction`
  - lieux : `ruler`, `nature`, `location` (`"lat,lng"`, vide pour les lieux mythiques)
  - événements : `location`, `participants`, `song` (`"[[Chant NN]]"`)
  - chants : `number` (1–24), `characters`, `places`, `previous`, `next`
  - factions : `leader`
- `nature` des personnages : `mortal` / `god` / `nymph` / `monster`. Des lieux :
  `real` / `mythical` / `uncertain`.
- **Cardinalité** selon le type Metadata Menu : les champs `File` prennent un wikilink
  scalaire (`father`, `mother`, `spouse`, `killed_by`, `home`, `faction`, `ruler`,
  `location`, `song`, `previous`, `next`, `leader`) ; les champs `MultiFile` prennent
  une **liste** (`consort`, `children`, `patron_of`, `participants`, `characters`,
  `places`), même à un seul élément : `children: ["[[Télémaque]]"]`.
- Les schémas exacts sont dans `$VAULT/_obsidian/_metadata/odyssey-*.md` (binding par
  tag via `mapWithTag`). **Les lire avant de créer ou modifier des notes** ; ne pas
  inventer de champs hors schéma sans demander.
- **Corps de note** : `## Rôle` + `## Apparitions (chants)` pour les personnages,
  `## Description` pour les lieux, `## Résumé` pour les événements. Pour un chant :
  `## Résumé` puis `## Événements` alimenté par `![[chantEvents.base]]`. Rester concis
  (2–4 phrases par section).
- Les **liens non résolus sont voulus** : un personnage mentionné mais pas encore
  rencontré reste un lien gris dans le graphe (file d'attente de création). Ne pas créer
  de note vide juste pour résoudre un lien.

## Le type `song`

- Une note par chant, titre zéro-paddé `Chant NN` pour un tri correct. Elle
  **synthétise** le chant et sert de **hub de graphe**.
- Le champ `song` des **événements** pointe vers elle : les arêtes chant↔événement sont
  ainsi gratuites, sans champ en double. C'est aussi ce champ — et non les liens
  sortants — qui alimente `chantEvents.base` sur le site.
- Personnages et lieux sont listés en liens sortants depuis la note de chant
  (`characters`, `places`). Ils s'affichent automatiquement dans le tableau de
  propriétés : **pas** de sections `## Personnages` / `## Lieux` dans le corps.
- `previous` / `next` chaînent les chants : la progression de lecture devient une
  colonne vertébrale visible dans le graphe.

## Les factions (guerre de Troie)

- Notes-hubs `Achéens` et `Troyens`, chacune avec un `leader` (Agamemnon ; Hector) et
  ses membres via `![[factionMembers.base]]` — base filtrée sur la propriété `faction`
  des personnages, pas sur les liens sortants.
- Les personnages (`mortal` **et** `god`) portent `faction` = leur **camp à Troie**. À
  **distinguer de `home`** (la cité) : un roi allié des Grecs est
  `faction: [[Achéens]]` **et** `home: [[sa cité]]`. Le camp inclut les alliés.
- **Pas un spoiler** : la guerre précède l'Odyssée. Champ **vide** pour qui n'a pas fait
  la guerre (prétendants, serviteurs, Télémaque, Pénélope, Laërte…).
- **Dieux** : `faction` = camp iliadique, distinct du rôle dans l'Odyssée. Poséidon est
  `faction: [[Achéens]]` (pro-Grec à Troie) mais ennemi d'Ulysse ; Zeus reste neutre.
  `faction` et `patron_of` coexistent sans se contredire.

## Politique anti-spoiler

La base se construit **au rythme de la lecture**. Ne renseigner un fait (notamment
`killed_by`) que s'il est raconté ou rappelé dans un chant déjà traité. Exemple :
`Égisthe → killed_by → Oreste` est légitime dès le chant I (récit de Zeus) ; la mort des
prétendants attend le chant XXII. Dans `## Apparitions`, n'inscrire que les chants déjà
lus. Une note de chant ne liste que les entités du chant lu, et son `next` reste vide
tant que le suivant n'est pas traité.

## Cartographie

Les lieux réels portent `location: "lat,lng"`, lue par le plugin **Map View**. Le champ
est à double usage — coordonnées sur les notes `place`, wikilink vers un lieu sur les
notes `event` — sans conséquence (Map View ignore les valeurs non-coordonnées).

⚠️ **Les blocs ` ```mapview ` et ` ```leaflet ` ont été retirés des notes publiées** :
Quartz ne les rend pas et les publiait en bloc de code brut. Ils restent utilisables sur
des notes **non publiées** — mais toutes les notes de l'Odyssée portent `publish: true`,
donc en pratique : ne pas en ajouter. Les cartes se consultent dans Obsidian via les
vues du plugin, pas via des blocs incorporés.

Roadmap :

1. ✅ Map View activé, coordonnées des lieux réels.
2. ✅ Marqueur dédié `tag:#odyssey/place` → ancre violette. ⚠️ Ces règles vivent dans la
   clé **`displayRules`** du plugin (pas `markerIconRules`) ; **toujours passer par
   l'UI**, jamais éditer `data.json` à la main — une édition directe avait écrasé les
   règles blog `#trip`/`#dogs`.
3. 🚧 **Itinéraire d'Ulysse** (Leaflet, carte-image sur fond de Grèce antique). Socle
   posé, bloc retiré du site. Marqueurs posés **en cliquant sur la carte** (coordonnées
   image en pixels/CRS, jamais écrites à la main). Reste à faire : escales mythiques
   liées aux notes, route en polylignes, différenciation réel/mythique. À alimenter aux
   chants IX–XII.
4. Croisements : « lieux introduits au chant N », *mentionné* vs *visité*, GeoJSON.

## État actuel

- **Chants I à III traités**, chaînés `previous`/`next`.
- Factions créées ; `faction` renseigné pour Ulysse, Agamemnon, Athéna, Poséidon,
  Nestor, Ménélas, Antiloque (`[[Achéens]]`), vide ailleurs. Aucun personnage publié ne
  porte `[[Troyens]]` — la base des membres troyens est donc vide, ce qui est normal
  tant qu'Hector n'existe pas.
- Metadata Menu fonctionnel (piège connu : `Select` exige `sourceType: ValuesList`).
- Vues du graphe sauvegardées via Bookmarks ; groupe de couleur `odyssey/song` (or).
- 🐛 **En suspens** : la carte Leaflet renvoyait « there was an issue getting the image
  dimensions ». Piste principale : l'accent dans le chemin
  (`public/odyssée/_obsidian/assets/ancient-greece.jpg`) — le fond de test à chemin sans
  accent fonctionnait. À tester : chemin complet dans `image:`, redémarrage d'Obsidian,
  puis déplacement vers un chemin sans accent.
- 🔜 Regrouper la config Odyssée (fileClasses, templates) sous `public/odyssée/`, comme
  le fond de carte. Attention : cela déplacerait des fichiers référencés par des
  réglages de plugins.

## Contraintes techniques du coffre

- `.obsidian/` (caché) est la vraie config Obsidian : **ne jamais y toucher** sauf
  demande explicite. À ne pas confondre avec `_obsidian/` (non caché), qui est du
  **contenu éditable**.
- Le linter (`lintOnFileChange`) reformate les notes à chaque modification : une note
  peut différer de ce qui vient d'être écrit (titres en capitales, espacement des
  tirets, date `modified`). C'est normal.
- ⚠️ *Paste image rename* pouvait renommer tout **nouveau** fichier du coffre (réglage
  `handleAllAttachments`) en `AAAA-MM-JJ-<note active>` et casser les écritures quand
  Obsidian est ouvert. Réglage désormais désactivé ; en cas de réapparition, fermer
  Obsidian ou écrire en place sans rename (`cp source dest`).
- YAML : espaces uniquement, jamais de tabulations ; wikilinks entre guillemets
  (`"[[Ulysse]]"`).
- Le coffre est aussi synchronisé par **Obsidian Sync** : commits simples uniquement,
  pas de rebase ni de force push.
