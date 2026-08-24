import type { PlanEntitlements, PlanTier } from './types'

export const PLAN_TIERS: PlanTier[] = ['starter', 'growth', 'scale', 'agency', 'enterprise']

export const PLANS: Record<PlanTier, PlanEntitlements> = {
  starter: {
    tier: 'starter', displayName: 'Starter', priceMonthly: 39, priceAnnual: 390,
    dailyActionBudget: 250, maxAccounts: 1, aiQualityScoring: 'basic',
    supportLevel: 'email', hasSoc2Report: false, hasCustomPacing: false,
    hasWhiteLabel: false, hasApiAccess: false,
  },
  growth: {
    tier: 'growth', displayName: 'Growth', priceMonthly: 79, priceAnnual: 790,
    dailyActionBudget: 600, maxAccounts: 3, aiQualityScoring: 'advanced',
    supportLevel: 'priority', hasSoc2Report: false, hasCustomPacing: false,
    hasWhiteLabel: false, hasApiAccess: false,
  },
  scale: {
    tier: 'scale', displayName: 'Scale', priceMonthly: 149, priceAnnual: 1490,
    dailyActionBudget: 1200, maxAccounts: 10, aiQualityScoring: 'realtime',
    supportLevel: 'chat', hasSoc2Report: true, hasCustomPacing: true,
    hasWhiteLabel: false, hasApiAccess: true,
  },
  agency: {
    tier: 'agency', displayName: 'Agency', priceMonthly: 299, priceAnnual: 2990,
    dailyActionBudget: 4000, maxAccounts: 25, aiQualityScoring: 'realtime',
    supportLevel: 'account_manager', hasSoc2Report: true, hasCustomPacing: true,
    hasWhiteLabel: true, hasApiAccess: true,
  },
  enterprise: {
    tier: 'enterprise', displayName: 'Enterprise', priceMonthly: 0, priceAnnual: 0,
    dailyActionBudget: 100000, maxAccounts: 9999, aiQualityScoring: 'custom',
    supportLevel: 'dedicated_se', hasSoc2Report: true, hasCustomPacing: true,
    hasWhiteLabel: true, hasApiAccess: true,
  },
}

export function getPlan(tier: PlanTier): PlanEntitlements {
  const plan = PLANS[tier]
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`)
  return plan
}

export function planHasFeature(
  tier: PlanTier,
  feature: keyof Pick<PlanEntitlements, 'hasSoc2Report' | 'hasCustomPacing' | 'hasWhiteLabel' | 'hasApiAccess'>,
): boolean {
  return getPlan(tier)[feature]
}

export function publicPlans(): PlanEntitlements[] {
  return [PLANS.starter, PLANS.growth, PLANS.scale, PLANS.agency]
}
