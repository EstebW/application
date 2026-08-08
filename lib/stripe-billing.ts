import type { PlanId } from '@/lib/plans'

export type StripeBillingSummary = {
  hasStripeCustomer: boolean
  stripeCustomerId: string | null
  subscription: null | {
    id: string
    status: string
    plan: PlanId | null
    priceCents: number | null
    currency: string
    interval: 'week' | 'month' | 'year' | 'day' | null
    creditsPerPeriod: number | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  }
}
