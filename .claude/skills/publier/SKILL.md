---
name: publier
description: "Publie le site pixelle : synchronise les notes du coffre Obsidian vers content/, construit, vérifie, commite et pousse vers GitHub Pages. À utiliser quand l'utilisateur demande de publier, mettre en ligne ou déployer le site."
argument-hint: "[message de commit, optionnel]"
allowed-tools: Read, Bash, Glob, Grep
---

Tu publies le site pixelle : coffre Obsidian → `content/` → GitHub Pages.

## Garde-fous

- **`content/` est généré.** `scripts/sync-vault.mjs` calcule l'état voulu et **supprime**
  ce qui n'en fait pas partie. Ne corrige jamais une note dans `content/` : édite-la dans
  le coffre, puis relance la synchronisation.
- **Le push est une action visible de l'extérieur.** Il déclenche la CI et met le site en
  ligne. **Demande confirmation avant de pousser**, sauf si l'utilisateur a déjà dit
  explicitement d'aller jusqu'au bout.
- Publier, c'est publier : une note retirée du site peut rester dans les caches et
  l'historique git. Mieux vaut vérifier avant qu'après.

## 1. État de départ

```bash
git status --short
git log --oneline -3
```

S'il y a déjà des modifications non commitées dans `content/`, comprends-les avant de
synchroniser : elles vont probablement être écrasées.

## 2. Synchroniser

```bash
npm run sync
```

Lis le rapport :

- `+ fichier` — note ou pièce jointe copiée.
- `- fichier (unpublished)` — **retirée du site** : le drapeau `publish` a disparu, ou la
  note a été supprimée/renommée dans le coffre. Vérifie que c'est voulu.
- **liens manquants** — attendu quand une note publiée cite une note privée ou non encore
  écrite. Ne rien copier de plus ; signaler seulement si la cible devrait être publiée.
- **pièces jointes ambiguës** — deux fichiers de même nom dans le coffre ; le premier est
  retenu. À signaler si le mauvais est choisi.

## 3. Vérifier

Lance le skill `verifier-publication` (ou, en version courte, ses contrôles 2 et 5) :

```bash
grep -rn '```\(dataview\|mapview\|leaflet\|zoommap\)' content --include="*.md" \
  || echo "OK — aucun bloc non rendu"
npm run build:ci
```

La construction doit se terminer sans erreur. **Ne pousse pas** si un bloc non rendu
subsiste ou si la construction échoue — le site publierait la casse.

Si le contenu touche les notes de l'Odyssée, vérifie aussi que les listes d'événements
sont peuplées (`public/odyssée/chants/chant-NN.html`).

## 4. Commiter

`content/` porte le contenu, mais **ce n'est pas suffisant** : la CI construit à partir
de la configuration **commitée**. Tout fichier dont dépend la construction doit partir
avec le contenu, sinon le site déployé ne correspond pas à ce que tu viens de vérifier
en local — `quartz.config.yaml` d'abord, mais aussi `scripts/sync-vault.mjs`,
`package.json` / `package-lock.json`, `.github/workflows/`.

> Cas vécu : masquer une propriété du tableau touche **à la fois** une note et
> `excludedProperties`. Commiter la note seule aurait laissé le résumé complet en clair
> sur le site, alors que la vérification locale était verte.

`public/` est ignoré par git, `.claude/settings.local.json` aussi.

```bash
git add -A content quartz.config.yaml
git status --short
```

Puis relis ce que `git status` montre encore : s'il reste un fichier qui influence la
construction, il part aussi. Ce qui reste non commité doit être un choix explicite, pas
un oubli.

C'est aussi le dernier moment où une note privée partie par erreur peut être arrêtée.

Message : `$ARGUMENTS` s'il est fourni, sinon un résumé factuel de ce qui change —
`Publie : <titre>`, `Chant NN : …`, `Retire : <titre>`. Pas de message générique.

## 5. Pousser — après confirmation

```bash
git push
```

Rappelle à l'utilisateur ce qui part, puis demande. Après le push, la CI
(`.github/workflows/deploy.yml`) reconstruit et déploie sur push vers `main`. Elle lance
**`build:ci`**, jamais `sync` : le coffre n'existe pas sur le runner, le site déployé
reflète exactement le `content/` **commité**. Synchroniser sans commiter ne publie rien.

Suivi facultatif :

```bash
timeout 20 curl -s "https://api.github.com/repos/PierreBx/pixelle/actions/runs?per_page=1" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['status'], r.get('conclusion'), r['html_url'])"
```

## 6. Compte rendu

Indique ce qui a été publié ou retiré, l'état de la CI, et l'URL du site
(`https://pierrebx.github.io/pixelle`). Signale toute anomalie rencontrée en chemin.
