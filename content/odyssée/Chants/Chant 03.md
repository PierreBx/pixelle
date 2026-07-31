---
publish: true
type: song
number: 3
tags: [odyssey/song]
characters: ["[[Télémaque]]", "[[Athéna]]", "[[Nestor]]", "[[Pisistrate]]", "[[Antiloque]]", "[[Ulysse]]", "[[Pénélope]]", "[[Ménélas]]", "[[Agamemnon]]", "[[Égisthe]]", "[[Oreste]]", "[[Clytemnestre]]", "[[Poséidon]]", "[[Zeus]]"]
places: ["[[Pylos]]", "[[Phères]]", "[[Sparte]]", "[[Troie]]", "[[Ithaque]]"]
previous: "[[Chant 02]]"
next: 
created: 2026-07-12
modified: 2026-07-12
---

## Résumé

Conduit par Athéna sous les traits de Mentor, Télémaque aborde Pylos au moment où Nestor sacrifie à Poséidon ; le fils du roi, Pisistrate, l'accueille au festin. Interrogé sur Ulysse, le vieux Nestor conte les retours dispersés des Achéens, la querelle des Atrides, et surtout le meurtre d'Agamemnon par Égisthe puni par Oreste—exemple offert au jeune homme. Faute de nouvelles du héros, il l'engage à pousser jusqu'à Sparte pour interroger Ménélas. Athéna se révèle en s'envolant sous la forme d'un aigle, et Nestor lui immole une génisse aux cornes dorées. Le lendemain, Télémaque part en char avec Pisistrate et fait halte à Phères, chez Dioclès.

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
  "name": "Lieux du chant III",
  "query": "linkedfrom:\"Chant 03\"",
  "autoFit": true,
  "embeddedHeight": 400
}
```
