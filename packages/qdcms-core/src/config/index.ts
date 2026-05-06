/**
 * @quazardous/qdcms-core/config — instance config compiler.
 *
 * Public barrel. Anything imported from a deeper path is
 * internal and may break in any release.
 */

export { compileConfig } from './compile'
export type {
  CompileConfigOptions,
  CompileConfigResult,
  ParsedConfigFile,
} from './types'
