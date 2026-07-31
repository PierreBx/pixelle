# pixelle

Publie une sélection de notes du coffre Obsidian **petersVault** sur GitHub Pages, avec [Quartz 5](https://quartz.jzhao.xyz/).

Le coffre lui-même n'est jamais poussé sur GitHub. Seules les notes explicitement marquées `publish: true` sont copiées dans `content/`, commitées, puis publiées.

## Le principe : opt-in explicite

Une note est publiée **si et seulement si** son frontmatter contient `publish: true` :

```yaml
---
title: Annie Hall
tags: [movie]
publish: true
---
```

Sans ce drapeau, la note est invisible pour ce dépôt — quel que soit son
emplacement dans le coffre. C'est volontaire : le coffre contient `santé/`,
`france travail/` et `_inbound/`, qui ne doivent jamais sortir.

Deux barrières indépendantes appliquent cette règle :

| Barrière | Où | Rôle |
| --- | --- | --- |
| `scripts/sync-vault.mjs` | en local | Ne copie que les notes marquées. Rien d'autre n'entre dans `content/`. |
| Plugin `explicit-publish` | à la construction | Écarte toute page sans le drapeau, même si un fichier traînait dans `content/`. |

La seconde barrière est un filet de sécurité : ne la désactivez pas dans
`quartz.config.yaml`.

## Utilisation quotidienne

```bash
npm run sync        # copie les notes publiées du coffre vers content/
npm run serve       # sync + build + aperçu local sur http://localhost:8080
npm run sync:dry    # montre ce qui serait copié, sans rien écrire
```

Pour publier :

```bash
npm run sync
git add -A content
git commit -m "Publie : <titre de la note>"
git push
```

GitHub Actions reconstruit le site et le déploie. Le workflow ne lance
**pas** `sync` : le coffre n'existe pas sur le runner, la construction part
uniquement du `content/` commité.

### Dépublier une note

Retirez `publish: true` (ou passez-le à `false`) dans le coffre, puis relancez
`npm run sync`. Le script supprime le fichier de `content/`. Commitez la
suppression et poussez.

> L'historique git garde une trace des versions publiées précédemment. Pour une
> note qui n'aurait jamais dû sortir, retirer le fichier ne suffit pas : il faut
> réécrire l'historique et considérer le contenu comme compromis.

## Ce que fait la synchronisation

- Parcourt le coffre en ignorant `.obsidian`, `.trash`, `.git`, `.idea`.
- Copie chaque note `publish: true` en conservant son arborescence, pour que
  les liens `[[wiki]]` continuent de résoudre.
- Copie les images, PDF et médias **uniquement** s'ils sont référencés par une
  note publiée. Une pièce jointe non citée n'est jamais copiée.
- Ne suit jamais un lien vers une note non publiée. Un lien vers une note privée
  reste un lien mort — le contenu privé n'est pas aspiré.
- Supprime de `content/` tout ce qui n'est plus publié.
- Signale en fin d'exécution les liens qui pointent hors du périmètre publié.

### À surveiller : les liens morts

Un lien vers une note non publiée **révèle son nom de fichier** dans le HTML
généré (`<a href="../santé/bilan">`). Le contenu ne fuit pas, le titre si. Le
script liste ces liens à chaque exécution : si l'un d'eux est révélateur,
retirez-le de la note avant de publier.

## Configuration

Tout est dans `quartz.config.yaml` :

- `pageTitle` — le titre du site.
- `baseUrl` — **doit** correspondre à l'URL réelle, sans protocole ni slash
  final. Sinon le RSS, le sitemap et les images OpenGraph pointeront à côté.
- `locale` — `fr-FR`.
- `analytics: null` — aucun traceur tiers.

`quartz.config.default.yaml` est la référence livrée par Quartz ; il sert de
base de comparaison lors des mises à jour et n'est pas lu par la construction.

Le chemin du coffre est codé dans `scripts/sync-vault.mjs` et surchargeable :

```bash
VAULT_PATH=/autre/coffre npm run sync
```

## Mise en place de GitHub Pages

1. Créer un dépôt **public** sur GitHub.
2. `git remote add origin git@github.com:<utilisateur>/<dépôt>.git`
3. Dans *Settings → Pages*, choisir **GitHub Actions** comme source.
4. Renseigner `baseUrl` dans `quartz.config.yaml`.
5. Pousser sur `main`.

## Mettre Quartz à jour

Quartz est copié dans ce dépôt (pas de submodule). Pour mettre à jour, comparez
avec l'amont :

```bash
git clone --depth 1 https://github.com/jackyzha0/quartz.git /tmp/quartz-new
diff -ru /tmp/quartz-new/quartz ./quartz | less
```

Reportez les changements de `quartz/`, `package.json` et
`quartz.config.default.yaml`. Ne perdez pas les réglages de
`quartz.config.yaml`, notamment `explicit-publish: enabled: true`.
