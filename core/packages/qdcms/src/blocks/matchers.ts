import type {
  CmsContext,
  ContentStackLevel,
  PlacementConditions,
  RouteCondition,
  StackCondition,
  StackLevelTemplate,
} from '../types'

export function matchStackLevel(
  template: StackLevelTemplate,
  level: ContentStackLevel
): boolean {
  if (template.type !== undefined && template.type !== level.type) return false
  if (template.name !== undefined && template.name !== level.name) return false
  if (template.id !== undefined && template.id !== level.id) return false
  return true
}

export function matchStack(condition: StackCondition, stack: ContentStackLevel[]): boolean {
  if (condition.empty !== undefined) {
    if (condition.empty && stack.length > 0) return false
    if (!condition.empty && stack.length === 0) return false
  }

  if (condition.depth !== undefined) {
    if (typeof condition.depth === 'number') {
      if (stack.length !== condition.depth) return false
    } else {
      if (condition.depth.min !== undefined && stack.length < condition.depth.min) return false
      if (condition.depth.max !== undefined && stack.length > condition.depth.max) return false
    }
  }

  if (condition.top) {
    if (stack.length === 0) return false
    if (!matchStackLevel(condition.top, stack[stack.length - 1])) return false
  }

  if (condition.contains) {
    if (!stack.some((level) => matchStackLevel(condition.contains!, level))) return false
  }

  return true
}

export function matchRoute(condition: RouteCondition, route: string): boolean {
  if (typeof condition === 'function') return condition(route)
  if (condition instanceof RegExp) return condition.test(route)
  if (Array.isArray(condition)) return condition.some((c) => matchRoute(c, route))
  if (typeof condition === 'string') {
    if (condition === route) return true
    if (condition.includes('*')) {
      const re = new RegExp(
        '^' +
          condition
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*') +
          '$'
      )
      return re.test(route)
    }
    return false
  }
  return false
}

export function matchConditions(
  conditions: PlacementConditions | undefined,
  ctx: CmsContext
): boolean {
  if (!conditions) return true

  if (conditions.stack !== undefined && !matchStack(conditions.stack, ctx.stack)) {
    return false
  }

  if (conditions.route !== undefined && !matchRoute(conditions.route, ctx.route)) {
    return false
  }

  if (conditions.auth !== undefined) {
    if (Boolean(ctx.auth.isAuthenticated) !== conditions.auth) return false
  }

  if (conditions.roles !== undefined) {
    if (typeof conditions.roles === 'function') {
      if (!conditions.roles(ctx.auth.roles)) return false
    } else {
      const required = Array.isArray(conditions.roles) ? conditions.roles : [conditions.roles]
      const hasAny = required.some((r) => ctx.auth.roles.includes(r))
      if (!hasAny) return false
    }
  }

  if (conditions.tenant !== undefined) {
    const allowed = Array.isArray(conditions.tenant) ? conditions.tenant : [conditions.tenant]
    if (!ctx.tenant || !allowed.includes(ctx.tenant)) return false
  }

  if (conditions.locale !== undefined && ctx.locale) {
    const allowed = Array.isArray(conditions.locale) ? conditions.locale : [conditions.locale]
    if (!allowed.includes(ctx.locale)) return false
  }

  if (conditions.predicate && !conditions.predicate(ctx)) return false

  return true
}
