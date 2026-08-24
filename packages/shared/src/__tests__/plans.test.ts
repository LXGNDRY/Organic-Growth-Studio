import { describe, expect, it } from 'vitest'
import { PLANS, getPlan, planHasFeature, publicPlans, PLAN_TIERS } from '../plans'
import type { PlanTier } from '../types'

describe('plans', () => {
  it('has all 5 tiers', () => {
    expect(Object.keys(PLANS).length).toBe(5)
    expect(PLAN_TIERS.length).toBe(5)
  })

  it('daily action budgets are strictly increasing', () => {
    const tiers: PlanTier[] = ['starter', 'growth', 'scale', 'agency', 'enterprise']
    let last = 0
    for (const t of tiers) {
      expect(PLANS[t].dailyActionBudget).toBeGreaterThan(last)
      last = PLANS[t].dailyActionBudget
    }
  })

  it('getPlan returns valid plan', () => {
    for (const t of PLAN_TIERS) expect(getPlan(t).tier).toBe(t)
  })

  it('planHasFeature for soc2 is correct', () => {
    expect(planHasFeature('starter', 'hasSoc2Report')).toBe(false)
    expect(planHasFeature('scale', 'hasSoc2Report')).toBe(true)
  })

  it('publicPlans excludes enterprise', () => {
    expect(publicPlans().map(p => p.tier)).not.toContain('enterprise')
    expect(publicPlans().length).toBe(4)
  })
})
