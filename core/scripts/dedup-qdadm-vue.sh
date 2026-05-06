#!/usr/bin/env bash
# core/scripts/dedup-qdadm-vue.sh
#
# Symlink qdadm/node_modules/{vue, vue-router, @vue/<sub>} to qdcms's
# canonical copies (under core/node_modules) so cross-package
# TypeScript sees one set of types instead of two distinct-but-
# identical ones (qdadm consumed via `file:` link from a sibling
# repo means npm doesn't dedupe by default).
#
# IMPORTANT: we symlink each `@vue/<sub>` SUB-package individually,
# never the whole `@vue` scope dir — qdadm has packages there that
# qdcms doesn't (notably `@vue/tsconfig`). Wiping the whole scope
# breaks qdadm's own tsconfig chain. Iterating qcms's @vue/* and
# symlinking each into qdadm/@vue/* leaves qdadm-only entries alone.
#
# Run after `npm install` in either qdcms/core or qdadm — the
# latter will recreate qdadm/node_modules/{vue,@vue/*} from
# scratch and undo the symlinks. Idempotent. Safe to run multiple
# times.

set -euo pipefail

# Resolve paths relative to this script (works from any cwd).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
qdcms_core="$(cd "$here/.." && pwd)"          # core/
qdcms_repo="$(cd "$qdcms_core/.." && pwd)"     # the qdcms repo root
qdadm_root="$(cd "$qdcms_repo/../qdadm" && pwd)"

if [[ ! -d "$qdadm_root/node_modules" ]]; then
  echo "[dedup-vue] qdadm/node_modules missing — run 'npm install' in qdadm first."
  exit 0
fi

if [[ ! -d "$qdcms_core/node_modules/vue" ]]; then
  echo "[dedup-vue] core/node_modules/vue missing — skipping (run 'npm install' in core first)."
  exit 0
fi

cd "$qdadm_root/node_modules"

# Top-level packages: simple symlinks.
# qdadm/node_modules/vue → ../../qdcms/core/node_modules/vue
for dep in vue vue-router; do
  rm -rf "$dep"
  ln -s "../../qdcms/core/node_modules/$dep" "$dep"
done

# @vue/* sub-packages: iterate qdcms's tree, only symlink overlaps so
# qdadm-only entries like @vue/tsconfig stay intact.
mkdir -p @vue
for sub_path in "$qdcms_core"/node_modules/@vue/*/; do
  sub="$(basename "$sub_path")"
  rm -rf "@vue/$sub"
  ln -s "../../../qdcms/core/node_modules/@vue/$sub" "@vue/$sub"
done

echo "[dedup-vue] qdadm/node_modules → qdcms/core/node_modules: vue, vue-router, @vue/* (per-sub)"
