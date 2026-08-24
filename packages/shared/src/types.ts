export type UUID = string
export type TenantId = UUID
export type UserId = UUID
export type AccountId = UUID
export type TargetId = UUID
export type EngagementJobId = UUID
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'
export type PlanTier = 'starter' | 'growth' | 'scale' | 'agency' | 'enterprise'
export type AccountStatus =
  | 'provisioning'
  | 'active'
  | 'paused'
  | 'warming_up'
  | 'throttled'
  | 'action_blocked'
  | 'suspended'
  | 'error'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ActionType = 'like' | 'follow' | 'unfollow' | 'story_view' | 'comment'
export type ActionStatus =
  | 'pending' | 'queued' | 'executing' | 'completed'
  | 'failed' | 'skipped' | 'rate_limited' | 'blocked'
export type TargetSource =
  | 'competitor_followers' | 'hashtag_engagers' | 'location_tagged'
  | 'similar_accounts' | 'custom_list' | 'ai_suggested'

export type PlanEntitlements = {
  tier: PlanTier
  displayName: string
  priceMonthly: number
  priceAnnual: number
  dailyActionBudget: number
  maxAccounts: number
  aiQualityScoring: 'basic' | 'advanced' | 'realtime' | 'custom'
  supportLevel: string
  hasSoc2Report: boolean
  hasCustomPacing: boolean
  hasWhiteLabel: boolean
  hasApiAccess: boolean
}

export type ApiResponse<T> = {
  data: T
  requestId: string
  timestamp: string
}
