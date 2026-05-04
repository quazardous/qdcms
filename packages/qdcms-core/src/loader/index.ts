/**
 * @quazardous/qdcms-core/loader — npm-pure plugin loading helpers.
 *
 * Phase 2 ships only the manifest adapter (the documented contract for
 * how a Plugin manifest is built from package.json + qdcms-plugin.yaml).
 * Phase 3 will add a NodeModulesPluginLoader that uses this adapter to
 * auto-discover plugins from the host's node_modules.
 */

export {
  buildManifestFromPackageJson,
  defaultIsPluginDependency,
  type QdcmsPackageJson,
  type BuildManifestInput,
} from './packageJsonAdapter'
