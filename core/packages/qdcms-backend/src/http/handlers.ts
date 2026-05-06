/**
 * Route handlers — plugins, entity CRUD, schema-state.
 *
 * Each handler is a plain async function `(req, ctx) → response`.
 * Phase 3.b validates the basic surface; richer concerns (auth,
 * pagination cursors, partial responses, hateoas) come later.
 */

import {
  badRequest,
  conflict,
  created,
  noContent,
  notFound,
  ok,
  serverError,
  type QdcmsHandler,
} from './types'

// ─── /plugins ────────────────────────────────────────────────────────────

/**
 * GET /plugins — list all registered plugin manifests.
 *
 * Returns an array of `{ id, version, prefix, title?, description?,
 * dependencies?, state }`. Schema definitions (entities, extensions)
 * are intentionally NOT included — they're a backend implementation
 * detail. Use the `/schema-state` route for the actual applied state.
 */
export const getPlugins: QdcmsHandler = async (_req, ctx) => {
  const entries = ctx.backend.registry.list()
  const body = entries.map(
    (e: { manifest: Record<string, unknown>; state: string }) => ({
      id: e.manifest.id,
      version: e.manifest.version,
      prefix: e.manifest.prefix,
      title: e.manifest.title,
      description: e.manifest.description,
      dependencies: e.manifest.dependencies,
      state: e.state,
    }),
  )
  return ok({ plugins: body })
}

// ─── /entity/:name ───────────────────────────────────────────────────────

/**
 * Resolve an entity name to its plugin owner + physical table name.
 * Returns null if no installed plugin owns it.
 */
function resolveEntity(
  ctx: { backend: { registry: { list(): { manifest: Record<string, unknown>; state: string }[] } } },
  entityName: string,
): { componentId: string; tableName: string } | null {
  for (const e of ctx.backend.registry.list()) {
    if (e.state !== 'installed' && e.state !== 'active') continue
    const m = e.manifest as {
      id: string
      prefix: string
      entities?: Array<{ name: string; tableName: string }>
    }
    const ent = (m.entities ?? []).find((x) => x.name === entityName)
    if (ent) {
      const tableName = ent.tableName.startsWith(`${m.prefix}_`)
        ? ent.tableName
        : `${m.prefix}_${ent.tableName}`
      return { componentId: m.id, tableName }
    }
  }
  return null
}

function intParam(value: string | string[] | undefined, fallback: number | undefined): number | undefined {
  if (value === undefined) return fallback
  const v = Array.isArray(value) ? value[0] : value
  const n = Number(v)
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback
}

/** GET /entity/:name — list rows. Supports ?limit + ?offset. */
export const listEntity: QdcmsHandler = async (req, ctx) => {
  const entityName = ctx.params.name
  const resolved = resolveEntity(ctx, entityName)
  if (!resolved) return notFound(`entity "${entityName}" not found`)

  const limit = intParam(req.query?.limit, 100)
  const offset = intParam(req.query?.offset, 0)

  const conn = ctx.backend.storage.getOrm().em.getConnection()
  try {
    const rows = (await conn.execute(
      `SELECT * FROM ${resolved.tableName} LIMIT ? OFFSET ?`,
      [limit, offset],
    )) as unknown[]
    const totalRows = (await conn.execute(
      `SELECT COUNT(*) AS n FROM ${resolved.tableName}`,
    )) as Array<{ n: number }>
    const total = Number(totalRows[0]?.n ?? 0)
    return ok({
      entity: entityName,
      total,
      limit,
      offset,
      items: rows,
    })
  } catch (cause) {
    return serverError(`failed to list ${entityName}`, (cause as Error).message)
  }
}

/** GET /entity/:name/:id — fetch one row by id. */
export const getEntity: QdcmsHandler = async (_req, ctx) => {
  const { name, id } = ctx.params
  const resolved = resolveEntity(ctx, name)
  if (!resolved) return notFound(`entity "${name}" not found`)

  const conn = ctx.backend.storage.getOrm().em.getConnection()
  try {
    const rows = (await conn.execute(
      `SELECT * FROM ${resolved.tableName} WHERE id = ? LIMIT 1`,
      [id],
    )) as unknown[]
    if (rows.length === 0) return notFound(`${name} ${id} not found`)
    return ok(rows[0])
  } catch (cause) {
    return serverError(`failed to read ${name}`, (cause as Error).message)
  }
}

/** POST /entity/:name — create a row. Body is the row payload. */
export const createEntity: QdcmsHandler = async (req, ctx) => {
  const entityName = ctx.params.name
  const resolved = resolveEntity(ctx, entityName)
  if (!resolved) return notFound(`entity "${entityName}" not found`)

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return badRequest(`POST /entity/${entityName} requires an object body`)
  }
  const payload = req.body as Record<string, unknown>
  const cols = Object.keys(payload)
  if (cols.length === 0) {
    return badRequest('payload is empty')
  }
  const placeholders = cols.map(() => '?').join(', ')
  const sql = `INSERT INTO ${resolved.tableName} (${cols.join(', ')}) VALUES (${placeholders})`

  const conn = ctx.backend.storage.getOrm().em.getConnection()
  try {
    await conn.execute(sql, cols.map((c) => payload[c]))
    return created(payload)
  } catch (cause) {
    const msg = (cause as Error).message
    if (msg.includes('UNIQUE constraint') || msg.includes('Duplicate')) {
      return conflict(`duplicate entry for ${entityName}`, msg)
    }
    return serverError(`failed to insert ${entityName}`, msg)
  }
}

/** PATCH /entity/:name/:id — partial update. */
export const updateEntity: QdcmsHandler = async (req, ctx) => {
  const { name, id } = ctx.params
  const resolved = resolveEntity(ctx, name)
  if (!resolved) return notFound(`entity "${name}" not found`)

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return badRequest(`PATCH /entity/${name}/${id} requires an object body`)
  }
  const payload = req.body as Record<string, unknown>
  const cols = Object.keys(payload).filter((k) => k !== 'id')
  if (cols.length === 0) return badRequest('payload has no updatable columns')

  const setClause = cols.map((c) => `${c} = ?`).join(', ')
  const sql = `UPDATE ${resolved.tableName} SET ${setClause} WHERE id = ?`
  const conn = ctx.backend.storage.getOrm().em.getConnection()
  try {
    await conn.execute(sql, [...cols.map((c) => payload[c]), id])
    const rows = (await conn.execute(
      `SELECT * FROM ${resolved.tableName} WHERE id = ? LIMIT 1`,
      [id],
    )) as unknown[]
    if (rows.length === 0) return notFound(`${name} ${id} not found`)
    return ok(rows[0])
  } catch (cause) {
    return serverError(`failed to update ${name}`, (cause as Error).message)
  }
}

/** DELETE /entity/:name/:id — remove a row. */
export const deleteEntity: QdcmsHandler = async (_req, ctx) => {
  const { name, id } = ctx.params
  const resolved = resolveEntity(ctx, name)
  if (!resolved) return notFound(`entity "${name}" not found`)

  const conn = ctx.backend.storage.getOrm().em.getConnection()
  try {
    await conn.execute(`DELETE FROM ${resolved.tableName} WHERE id = ?`, [id])
    return noContent()
  } catch (cause) {
    return serverError(`failed to delete ${name}`, (cause as Error).message)
  }
}

// ─── /schema-state ───────────────────────────────────────────────────────

/** GET /schema-state — applied migration rows for ALL plugins. */
export const getSchemaState: QdcmsHandler = async (_req, ctx) => {
  const entries = ctx.backend.registry.list()
  const out: Record<string, unknown[]> = {}
  for (const e of entries) {
    const id = e.manifest.id as string
    out[id] = await ctx.backend.store.appliedForExtended(id)
  }
  return ok(out)
}

/** GET /schema-state/:plugin — applied migration rows for one plugin. */
export const getSchemaStateForPlugin: QdcmsHandler = async (_req, ctx) => {
  const componentId = ctx.params.plugin
  if (!ctx.backend.registry.has(componentId)) {
    return notFound(`plugin "${componentId}" not registered`)
  }
  const rows = await ctx.backend.store.appliedForExtended(componentId)
  return ok(rows)
}
