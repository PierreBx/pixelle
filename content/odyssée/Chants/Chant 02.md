---
publish: true
type: song
number: 2
tags: [odyssey/song]
characters: ["[[Télémaque]]", "[[Pénélope]]", "[[Ulysse]]", "[[Athéna]]", "[[Zeus]]", "[[Antinoos]]", "[[Eurymaque]]", "[[Euryclée]]", "[[Laërte]]", "[[Égyptios]]", "[[Halithersès]]", "[[Mentor]]", "[[Léocrite]]", "[[Noémon]]", "[[Icarios]]"]
places: ["[[Ithaque]]", "[[Pylos]]", "[[Sparte]]"]
previous: "[[Chant 01]]"
next: "[[Chant 03]]"
created: 2026-07-11
modified: 2026-07-11
---

## Résumé

Au lever du jour, Télémaque convoque la première assemblée d'Ithaque depuis le départ d'Ulysse et somme les prétendants de quitter le palais. Antinoos rejette la faute sur Pénélope et dévoile la ruse du linceul de Laërte, tissé le jour et défait la nuit. Zeus envoie alors deux aigles qui s'entre-déchirent : le devin Halithersès y voit l'annonce du retour d'Ulysse, mais Eurymaque le raille et Léocrite disperse l'assemblée. Sur le rivage, Télémaque prie ; Athéna, sous les traits de Mentor, lui procure le navire de Noémon et un équipage. Aidé en secret par Euryclée pour les vivres, il appareille de nuit pour Pylos.

## Événements

```dataview
LIST WITHOUT ID file.link
FROM #odyssey/event
WHERE contains(file.outlinks, this.file.link)
SORT file.name
```

## Personnages

```dataview
LIST WITHOUT ID char
FROM "odyssée/Chants"
FLATTEN characters AS char
WHERE file.path = this.file.path
```

## Lieux

```dataview
LIST WITHOUT ID place
FROM "odyssée/Chants"
FLATTEN places AS place
WHERE file.path = this.file.path
```

## Carte

```mapview
{
  "name": "Lieux du chant II",
  "query": "linkedfrom:\"Chant 02\"",
  "autoFit": true,
  "embeddedHeight": 400
}
```
