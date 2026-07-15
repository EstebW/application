export type PlanId = 'once' | 'weekly' | 'monthly'

export const PLAN_CREDITS: Record<PlanId, number> = {
  once: 1,
  weekly: 10,
  monthly: 40,
}

export const PLAN_CENTS: Record<PlanId, number> = {
  once: 299,
  weekly: 599,
  monthly: 1299,
}

export const GENERATION_CREDIT_COST = 1

export function isPlanId(value: unknown): value is PlanId {
  return value === 'once' || value === 'weekly' || value === 'monthly'
}
