---
publish: true
title: "Carte de l'Odyssée"
created: 2026-07-11
modified: 2026-07-11
---

## Carte De l'Odyssée

Tous les lieux localisés de l'Odyssée, via le plugin **Map View** (clé front-matter `location`). Les lieux `nature: mythical` sans coordonnées réelles (ex. Ogygie) n'apparaissent pas encore—ils rejoindront une carte **Leaflet** sur fond d'image antique à une itération ultérieure (voir CLAUDE.md).

```mapview
{
  "name": "Tous les lieux de l'Odyssée",
  "query": "tag:#odyssey/place",
  "autoFit": true,
  "embeddedHeight": 500
}
```
