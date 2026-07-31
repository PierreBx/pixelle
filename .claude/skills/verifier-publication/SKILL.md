---
name: verifier-publication
description: "Contrôles avant publication du site pixelle : blocs Obsidian non rendus par Quartz, notes sans publish, liens manquants, clés de frontmatter exposées publiquement, et bases vides. À utiliser avant de commiter/pousser du contenu, ou quand l'utilisateur demande de vérifier ce qui va être publié."
allowed-tools: Read, Bash, Glob, Grep
---

Tu vérifies ce que le site pixelle s'apprête à publier. **Ne corrige rien sans accord** :
rapporte, explique, propose. Certaines anomalies sont des choix délibérés.

Lance les contrôles depuis la racine du dépôt. Ils portent sur `content/`, qui est
**généré** — toute correction se fait dans le coffre Obsidian, jamais dans `content/`.

## 1. Que va-t-on publier ?

```bash
npm run sync:dry
```

Lis le rapport. Les **liens manquants** y sont normaux : une note publiée qui cite une
note privée ou non encore écrite. Rien de privé n'est copié ; le lien s'affiche en texte
brut. À signaler seulement si la cible *devrait* être publiée.

Note aussi les fichiers marqués supprimés (`- …`) : ils disparaîtront du site.

## 2. Blocs que Quartz ne rend pas

```bash
grep -rn '```\(dataview\|mapview\|leaflet\|zoommap\)' content --include="*.md"
```

Chaque occurrence s'affichera en **bloc de code brut** sur le site publié. Rappel : ces
blocs fonctionnent dans Obsidian — les retirer d'une note publiée, c'est perdre la
fonctionnalité côté coffre. Proposer les options plutôt que trancher :

- retirer le bloc de la note (le site est propre, Obsidian perd la carte) ;
- retirer `publish: true` de la note (Obsidian garde tout, la page quitte le site) ;
- convertir en base quand c'est possible (cas Dataview).

## 3. Notes sans `publish: true`

```bash
python3 -c "
import glob,re
bad=[f for f in glob.glob('content/**/*.md',recursive=True)
     if not re.search(r'^publish:\s*true\s*\$',open(f,encoding='utf8').read(),re.M)]
print('\n'.join(bad) if bad else 'OK — toutes marquées')
"
```

Une note présente dans `content/` sans le drapeau serait écartée à la construction par
`explicit-publish` : elle produirait un lien mort. Normalement impossible (le script de
sync ne copie que les notes marquées) — si le cas se présente, c'est un résidu à
comprendre avant de l'effacer.

## 4. Clés de frontmatter exposées publiquement

`note-properties` tourne avec `includeAll: true` : **toute** clé de frontmatter d'une
note publiée est affichée, sauf `excludedProperties`.

```bash
python3 -c "
import glob,re,yaml,collections
cfg=yaml.safe_load(open('quartz.config.yaml',encoding='utf8'))
opts=next(p for p in cfg['plugins'] if p['source'].endswith('/note-properties'))['options']
excl=set(opts.get('excludedProperties') or [])
c=collections.Counter()
for f in glob.glob('content/**/*.md',recursive=True):
    m=re.match(r'^---\n(.*?)\n---',open(f,encoding='utf8').read(),re.S)
    if not m: continue
    try: d=yaml.safe_load(m.group(1)) or {}
    except Exception: continue
    for k in d: c[k]+=1
print('exclues :',sorted(excl),'\n')
print('VISIBLES SUR LE SITE :')
for k,n in sorted(c.items()):
    if k not in excl: print(f'  {k:16} {n:3} note(s)')
"
```

Parcours la liste et signale **toute clé qui ne devrait pas être publique** (notes
personnelles, identifiants, chemins locaux, champs de travail). Une clé apparaissant sur
une ou deux notes seulement mérite un coup d'œil : c'est souvent un ajout récent, exposé
sans décision explicite.

Remède : ajouter la clé à `excludedProperties` dans `quartz.config.yaml`, ou la retirer
de la note dans le coffre.

## 5. Construction et rendu

```bash
npm run build:ci
```

Puis vérifier qu'aucun bloc non rendu n'a atteint la sortie :

```bash
grep -rlo 'data-language="\(dataview\|mapview\|leaflet\|zoommap\)"' public/ || echo "OK — aucun"
```

Et que les bases incorporées ont bien trouvé des entrées :

```bash
python3 -c "
import glob,re,html
for f in sorted(glob.glob('public/**/*.html',recursive=True)):
    s=open(f,encoding='utf8').read()
    if 'bases-inline' not in s: continue
    n=[html.unescape(m) for m in re.findall(r'class=\"bases-view-meta\"[^>]*>([^<]*)<',s)]
    print(f'{f}\n    {n or \"VIDE — aucune entrée\"}')
"
```

(Compter les entrées via le décompte du plugin lui-même. Ne pas se fier à la classe
`bases-empty` : elle marque aussi les **cellules** vides d'un tableau, par dizaines.)

Une base à zéro entrée n'est pas forcément une erreur (c'est le cas de `Troyens` :
aucun personnage publié ne porte cette faction). Mais une base qui *devrait* être
peuplée et ne l'est pas signale un champ de frontmatter mal renseigné — vérifier
l'orthographe du wikilink dans la note source.

## 6. Rapport

Résume : ce qui serait publié, les anomalies par ordre de gravité, et pour chacune une
proposition concrète. Distingue clairement **ce qui casse le site** (bloc brut, lien
mort) de **ce qui est un choix** (lien manquant volontaire, base vide légitime).
