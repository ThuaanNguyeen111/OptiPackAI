import { apiRequest } from '../lib/api'
import type { SyncOption } from './order-sync-settings.api'

/**
 * 31/10/2026 (AOFP-223) — Quy tắc gộp đơn bổ sung `/order-sync-settings/rules`.
 * Hợp đồng: GUIDE_DOC/INTEGRATION_GUIDE_ORDERS.md mục 7c, API_LIST.md mục 28.
 */

export type RuleMatch = 'normalized' | 'exact'
export type RuleFieldMatch = { field: string; match: RuleMatch }

export type ConsolidationRule = {
  id: string
  name: string
  sourceText: string | null
  fields: RuleFieldMatch[]
  platforms: string[]
  maxWindowHours: number | null
  enabled: boolean
}

/** Body gửi lên BE (snake_case) — cũng là dạng `rule` mà /translate trả về. */
export type ConsolidationRuleBody = {
  name: string
  source_text: string | null
  fields: RuleFieldMatch[]
  platforms: string[]
  max_window_hours: number | null
  enabled: boolean
}

export type ConsolidationRulesState = {
  version: number | null
  rules: ConsolidationRule[]
  recomputingKeys: boolean
  limits: { maxRules: number; requiredOneOf: string[] }
  options: { fields: SyncOption[]; matches: SyncOption[]; platforms: SyncOption[] }
}

export type RulesPreview = {
  ordersScanned: number
  truncated: boolean
  currentGroups: number
  baselineGroups: number
  projectedGroups: number
  groupsMergedByRules: number
  skippedMissingData: { ruleName: string; orders: number }[]
  examples: { ruleNames: string[]; platformOrderIds: string[]; phoneLast3: string[] }[]
}

export type RuleTranslation = {
  model: string | null
  rule: ConsolidationRuleBody | null
  unsupported: string[]
  warnings: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function options(value: unknown): SyncOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    if (!row || typeof row.value !== 'string') return []
    return [{ value: row.value, label: typeof row.label === 'string' ? row.label : row.value }]
  })
}

function fieldMatches(value: unknown): RuleFieldMatch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    if (!row || typeof row.field !== 'string') return []
    return [{ field: row.field, match: row.match === 'exact' ? 'exact' : 'normalized' }]
  })
}

function mapRule(value: unknown): ConsolidationRule | null {
  const row = asRecord(value)
  if (!row || typeof row.id !== 'string') return null
  return {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : row.id,
    sourceText: typeof row.sourceText === 'string' && row.sourceText.length > 0 ? row.sourceText : null,
    fields: fieldMatches(row.fields),
    platforms: strings(row.platforms),
    maxWindowHours: nullableNum(row.maxWindowHours),
    enabled: row.enabled !== false,
  }
}

function mapRuleBody(value: unknown): ConsolidationRuleBody | null {
  const row = asRecord(value)
  if (!row) return null
  return {
    name: typeof row.name === 'string' ? row.name : '',
    source_text: typeof row.source_text === 'string' ? row.source_text : null,
    fields: fieldMatches(row.fields),
    platforms: strings(row.platforms),
    max_window_hours: nullableNum(row.max_window_hours),
    enabled: row.enabled !== false,
  }
}

function mapState(raw: unknown): ConsolidationRulesState {
  const row = asRecord(raw)
  if (!row) throw new Error('Danh sách quy tắc gộp không đúng định dạng.')
  const limits = asRecord(row.limits) ?? {}
  const optionBlock = asRecord(row.options) ?? {}
  return {
    version: typeof row.version === 'number' ? row.version : null,
    rules: Array.isArray(row.rules) ? row.rules.flatMap((r) => mapRule(r) ?? []) : [],
    recomputingKeys: row.recomputingKeys === true,
    limits: {
      maxRules: num(limits.maxRules, 10),
      requiredOneOf: strings(limits.requiredOneOf).length > 0 ? strings(limits.requiredOneOf) : ['phone', 'address_line1'],
    },
    options: {
      fields: options(optionBlock.fields),
      matches: options(optionBlock.matches),
      platforms: options(optionBlock.platforms),
    },
  }
}

/** Quy tắc đã lưu → body để gửi lại (sửa / xem trước cả bộ). */
export function ruleToBody(rule: ConsolidationRule): ConsolidationRuleBody {
  return {
    name: rule.name,
    source_text: rule.sourceText,
    fields: rule.fields.map((f) => ({ ...f })),
    platforms: [...rule.platforms],
    max_window_hours: rule.maxWindowHours,
    enabled: rule.enabled,
  }
}

/** Quy tắc mẫu BE trả kèm lỗi 503 (`details.suggestions`). */
export function suggestionsFromDetails(details: Record<string, unknown> | null): ConsolidationRuleBody[] {
  if (!details || !Array.isArray(details.suggestions)) return []
  return details.suggestions.flatMap((s) => mapRuleBody(s) ?? [])
}

const BASE = '/order-sync-settings/rules'

export async function listConsolidationRules(): Promise<ConsolidationRulesState> {
  return mapState(await apiRequest<unknown>(BASE, { auth: true }))
}

export async function createConsolidationRule(
  body: ConsolidationRuleBody,
  expectedVersion: number | null,
): Promise<ConsolidationRulesState> {
  return mapState(
    await apiRequest<unknown>(BASE, { method: 'POST', auth: true, body: { ...body, expected_version: expectedVersion } }),
  )
}

export async function updateConsolidationRule(
  id: string,
  body: ConsolidationRuleBody,
  expectedVersion: number | null,
): Promise<ConsolidationRulesState> {
  return mapState(
    await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      auth: true,
      body: { ...body, expected_version: expectedVersion },
    }),
  )
}

export async function deleteConsolidationRule(id: string, expectedVersion: number): Promise<ConsolidationRulesState> {
  return mapState(
    await apiRequest<unknown>(`${BASE}/${encodeURIComponent(id)}?expected_version=${String(expectedVersion)}`, {
      method: 'DELETE',
      auth: true,
    }),
  )
}

export async function previewConsolidationRules(rules: ConsolidationRuleBody[]): Promise<RulesPreview> {
  const raw = asRecord(await apiRequest<unknown>(`${BASE}/preview`, { method: 'POST', auth: true, body: { rules } })) ?? {}
  return {
    ordersScanned: num(raw.ordersScanned),
    truncated: raw.truncated === true,
    currentGroups: num(raw.currentGroups),
    baselineGroups: num(raw.baselineGroups),
    projectedGroups: num(raw.projectedGroups),
    groupsMergedByRules: num(raw.groupsMergedByRules),
    skippedMissingData: Array.isArray(raw.skippedMissingData)
      ? raw.skippedMissingData.flatMap((s) => {
          const row = asRecord(s)
          return row && typeof row.ruleName === 'string' ? [{ ruleName: row.ruleName, orders: num(row.orders) }] : []
        })
      : [],
    examples: Array.isArray(raw.examples)
      ? raw.examples.flatMap((e) => {
          const row = asRecord(e)
          return row
            ? [{ ruleNames: strings(row.ruleNames), platformOrderIds: strings(row.platformOrderIds), phoneLast3: strings(row.phoneLast3) }]
            : []
        })
      : [],
  }
}

export async function translateConsolidationRule(text: string): Promise<RuleTranslation> {
  const raw = asRecord(await apiRequest<unknown>(`${BASE}/translate`, { method: 'POST', auth: true, body: { text } })) ?? {}
  return {
    model: typeof raw.model === 'string' ? raw.model : null,
    rule: raw.rule === null ? null : mapRuleBody(raw.rule),
    unsupported: strings(raw.unsupported),
    warnings: strings(raw.warnings),
  }
}
