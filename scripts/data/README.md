# Données de fond de carte

`coastline-50m.json` — le trait de côte mondial de **Natural Earth**, échelle
1:50 000 000, réduit à sa géométrie.

**Domaine public.** Natural Earth le dit sans ambiguïté : *« No permission is
needed to use Natural Earth. Crediting the authors is unnecessary. »*
Source : <https://www.naturalearthdata.com/> — copie utilisée :
[`nvkelso/natural-earth-vector`](https://github.com/nvkelso/natural-earth-vector),
fichier `geojson/ne_50m_coastline.geojson`.

## Pourquoi ce format, et pas une image

Une carte a besoin d'un **géoréférencement** : sans lui, on ne sait pas où
poser un point. Une image trouvée quelque part n'en a pas — il faudrait deviner
ses coins, et l'erreur se voit immédiatement sur des salles distantes de deux
cents mètres. Un trait de côte vectoriel, lui, porte ses coordonnées : chaque
point est une longitude et une latitude, et se projette exactement comme les
lieux du site.

Il est en outre indépendant de l'échelle : la même donnée sert la carte du
monde et celle d'une région, découpée à la volée sur le cadre demandé.

## Ce qui a été retiré

Les propriétés (toutes descriptives) et la structure GeoJSON. Il ne reste qu'un
tableau de polylignes, chacune à plat — `[lon, lat, lon, lat, …]` — et les
coordonnées arrondies à trois décimales, soit une centaine de mètres. 1 602 Ko
deviennent ainsi 876 Ko.

**Ce fichier ne part jamais chez le visiteur.** Il est lu à la synchronisation ;
seuls les tracés découpés au cadre de chaque carte finissent dans le SVG.

## Le remplacer

```bash
curl -sL -o /tmp/ne.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson
```

puis réduire comme ci-dessus. Le 1:10 000 000 existe aussi — dix fois plus
détaillé, dix fois plus lourd (9,9 Mo), utile seulement si les cartes descendent
à l'échelle d'une ville.
