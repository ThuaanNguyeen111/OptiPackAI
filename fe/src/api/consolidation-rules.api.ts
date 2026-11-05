import { apiRequest } from '../lib/api'
import type { SyncOption } from './order-sync-settings.api'

export type RuleField = { field: string; match: string }

/** Quy tắc đã lưu (response dùng camelCase). */
export type ConsolidationRule = {
  id: string
  name: string
  sourceText: string | null
  fields: RuleField[]
  platforms: string[]
  maxWindowHours: number | null
  enabled: boolean
}

/** Nội dung gửi lên (body dùng snake_case, cũng là dạng AI dịch trả về). */
export type ConsolidationRuleBody = {
  name: string
  source_text: string | null
  fields: RuleField[]
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

export type ConsolidationRulesPreview = {
  ordersScanned: number
  truncated: boolean
  currentGroups: number
  baselineGroups: number
  projectedGroups: number
  groupsMergedByRules: number
  skippedMissingData: { ruleName: string; orders: number }[]
  examples: { ruleNames: string[]; platformOrderIds: string[]; phoneLast3: string[] }[]
}

export type ConsolidationRuleTranslation = {
  source: string
  model: string | null
  rule: ConsolidationRuleBody | null
  unsupported: string[]
  warnings: string[]
}

const BASE = '/order-sync-settings/rules'

export function ruleToBody(rule: ConsolidationRule): ConsolidationRuleBody {
  return {
    name: rule.name,
    source_text: rule.sourceText,
    fields: rule.fields,
    platforms: rule.platforms,
    max_window_hours: rule.maxWindowHours,
    enabled: rule.enabled,
  }
}

export function listConsolidationRules(): Promise<ConsolidationRulesState> {
  return apiRequest<ConsolidationRulesState>(BASE, { auth: true })
}

export function createConsolidationRule(
  body: ConsolidationRuleBody,
  expectedVersion: number | null,
): Promise<ConsolidationRulesState> {
  return apiRequest<ConsolidationRulesState>(BASE, {
    method: 'POST',
    auth: true,
    body: { ...body, expected_version: expectedVersion },
  })
}

export function updateConsolidationRule(
  ruleId: string,
  body: ConsolidationRuleBody,
  expectedVersion: number | null,
): Promise<ConsolidationRulesState> {
  return apiRequest<ConsolidationRulesState>(`${BASE}/${encodeURIComponent(ruleId)}`, {
    method: 'PUT',
    auth: true,
    body: { ...body, expected_version: expectedVersion },
  })
}

export function deleteConsolidationRule(
  ruleId: string,
  expectedVersion: number,
): Promise<ConsolidationRulesState> {
  return apiRequest<ConsolidationRulesState>(
    `${BASE}/${encodeURIComponent(ruleId)}?expected_version=${String(expectedVersion)}`,
    { method: 'DELETE', auth: true },
  )
}

export function previewConsolidationRules(
  rules: ConsolidationRuleBody[],
): Promise<ConsolidationRulesPreview> {
  return apiRequest<ConsolidationRulesPreview>(`${BASE}/preview`, {
    method: 'POST',
    auth: true,
    body: { rules },
  })
}

export function translateConsolidationRule(text: string): Promise<ConsolidationRuleTranslation> {
  return apiRequest<ConsolidationRuleTranslation>(`${BASE}/translate`, {
    method: 'POST',
    auth: true,
    body: { text },
  })
}
