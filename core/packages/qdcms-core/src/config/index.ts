/**
 * @quazardous/qdcms-core/config — instance config compiler.
 *
 * Public barrel. Anything imported from a deeper path is
 * internal and may break in any release.
 *
 * See docs/config.md for the architecture, naming convention,
 * schema contract, and compile pipeline behaviour.
 */

export { ConfigModule } from './ConfigModule'

export { builtinSchemas } from './builtin-schemas'

export { compileConfig } from './compile'
export type {
  CompileConfigOptions,
  CompileConfigResult,
  ParsedConfigFile,
} from './types'

export {
  defineConfigSchema,
  field,
} from './schema'
export type {
  AnnotatedSchema,
  ConceptSchemaInput,
  DeprecationInfo,
  FieldOptions,
  NamespaceSchema,
  NamespaceSchemaInput,
} from './schema'

export type {
  CompileWarning,
  ValidateConceptResult,
} from './validate'
