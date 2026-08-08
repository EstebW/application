import Stripe from 'stripe'
import { PLAN_CENTS, PLAN_CREDITS, type PlanId, isPlanId } from '@/lib/plans'

let stripeClient: Stripe | null = null

/** Stripe SDK instance (secret key — server only). */
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY manquante')
  }
  stripeClient = new Stripe(key, {
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
  })
  return stripeClient
}

export function getStripePriceId(plan: PlanId): string {
  const map: Record<PlanId, string | undefined> = {
    once: process.env.STRIPE_PRICE_ONCE?.trim(),
    weekly: process.env.STRIPE_PRICE_WEEKLY?.trim(),
    monthly: process.env.STRIPE_PRICE_MONTHLY?.trim(),
  }
  const priceId = map[plan]
  if (!priceId?.startsWith('price_')) {
    throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} manquant ou invalide`)
  }
  return priceId
}

export function planFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null
  const once = process.env.STRIPE_PRICE_ONCE?.trim()
  const weekly = process.env.STRIPE_PRICE_WEEKLY?.trim()
  const monthly = process.env.STRIPE_PRICE_MONTHLY?.trim()
  if (priceId === once) return 'once'
  if (priceId === weekly) return 'weekly'
  if (priceId === monthly) return 'monthly'
  return null
}

export function planCredits(plan: PlanId): number {
  return PLAN_CREDITS[plan]
}

export function planCents(plan: PlanId): number {
  return PLAN_CENTS[plan]
}

export function parsePlanId(value: unknown): PlanId | null {
  return isPlanId(value) ? value : null
}

export function randomIntegrationSuffix(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export function appOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (env) return env
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}
