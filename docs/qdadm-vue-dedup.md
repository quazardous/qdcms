# qdadm × qdcms — Vue / vue-router dedup

## Le problème

qdadm est consommé par qdcms via un `file:` link cross-repo :

```
/home/.../quazardous/
├── qdcms/         # ce repo, npm install ici
│   └── node_modules/vue, vue-router, @vue/...
└── qdadm/         # repo sibling, npm install séparé
    └── node_modules/vue, vue-router, @vue/...   ← copies distinctes
```

Conséquences :

- **Runtime** : Vite déduplique via `resolve.dedupe` — pas d'impact.
- **TypeScript** : la règle de résolution module marche depuis le
  `node_modules` le plus proche du fichier. Quand `vue-tsc` traverse
  les sources qdadm pendant le type-check du démo, les imports
  `from 'vue'` dedans résolvent vers `qdadm/node_modules/vue`, alors
  que le code du démo résout vers `qdcms/node_modules/vue`. Deux
  types `Component` / `App` / `Router` distincts → erreurs
  d'incompatibilité partout.

## La solution : symlink

`qdadm/node_modules/{vue, vue-router, @vue}` → symlinks vers les
copies de qdcms. Une seule copie physique, un seul type.

```
qdadm/node_modules/vue        -> ../../qdcms/node_modules/vue
qdadm/node_modules/vue-router -> ../../qdcms/node_modules/vue-router
qdadm/node_modules/@vue       -> ../../qdcms/node_modules/@vue
```

## Le script

`scripts/dedup-qdadm-vue.sh` — idempotent, supprime les dirs existants
et recrée les symlinks. Exécuté automatiquement après chaque
`npm install` de qdcms (`postinstall` hook). Si tu fais `npm install`
côté qdadm (qui repeuple ses node_modules avec ses propres copies de
vue), relance le script à la main :

```sh
npm run dedup
```

## Pourquoi pas X ?

Voir `docs/qdadm-vue-dedup.md` pour l'historique complet. TL;DR :

- `tsconfig paths` : ne s'applique pas aux fichiers transitivement
  importés (qdadm/src/*.ts).
- `dist/types` compilés côté qdadm : les `.d.ts` gardent
  `import 'vue'` et résolvent toujours via qdadm/node_modules.
- Retirer vue de qdadm/node_modules : `@vue/test-utils` et
  `@vue/tsconfig` (devDeps) le repullent transitivement → casse les
  tests qdadm.
- Pull qdadm dans le workspace npm de qdcms : conflate deux repos
  séparés.

Le symlink est la seule voie qui respecte l'autonomie des deux
projets ET déduplique au niveau npm/TS.

## Quand re-syncer

| Situation | Action |
|---|---|
| `npm install` dans qdcms | Auto (postinstall) |
| `npm install` dans qdadm | `npm run dedup` côté qdcms |
| Bump version vue/vue-router dans qdcms | `npm run dedup` (les symlinks restent valides mais autant être sûr) |
| Erreur TS `Type 'X' is not assignable to type 'X'` cross-package | `npm run dedup` |

## Vérifier que c'est bien en place

```sh
ls -la ../qdadm/node_modules/{vue,vue-router,@vue}
# attendu : lrwxrwxrwx ... -> ../../qdcms/node_modules/...
```

Si tu vois des dirs réguliers (`drwxr-xr-x`) au lieu de symlinks,
relance `npm run dedup`.
