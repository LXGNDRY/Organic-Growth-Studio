import { z } from 'zod'

export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const signUpSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  companyName: z.string().min(1).max(200).optional(),
})

export const signInSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
})

export const actionTypeSchema = z.enum(['like', 'follow', 'unfollow', 'story_view', 'comment'])
export const targetSourceSchema = z.enum([
  'competitor_followers', 'hashtag_engagers', 'location_tagged',
  'similar_accounts', 'custom_list', 'ai_suggested',
])

export const targetingConfigSchema = z.object({
  competitors: z.array(z.string().min(1).max(100)).default([]),
  hashtags: z.array(z.string().min(1).max(100)).default([]),
  locations: z.array(z.string().min(1).max(200)).default([]),
  minFollowers: z.number().int().min(0).max(10_000_000).default(100),
  maxFollowers: z.number().int().min(0).max(100_000_000).default(50000),
  minFollowing: z.number().int().min(0).default(0),
  maxFollowing: z.number().int().min(0).default(10000),
  minPosts: z.number().int().min(0).default(3),
  gender: z.enum(['male', 'female', 'any']).default('any'),
  languages: z.array(z.string().min(1).max(10)).default(['en']),
  enabledActions: z.array(actionTypeSchema).default(['like', 'follow']),
  dailyLikeLimit: z.number().int().min(0).max(2000).default(200),
  dailyFollowLimit: z.number().int().min(0).max(1000).default(100),
  dailyUnfollowLimit: z.number().int().min(0).max(1000).default(100),
  dailyStoryViewLimit: z.number().int().min(0).max(5000).default(500),
  dailyCommentLimit: z.number().int().min(0).max(200).default(0),
  unfollowAfterDays: z.number().int().min(1).max(90).default(14),
  skipPrivateAccounts: z.boolean().default(true),
  skipBusinessAccounts: z.boolean().default(false),
  blacklistedUsernames: z.array(z.string().min(1)).default([]),
})

export type TargetingConfigInput = z.infer<typeof targetingConfigSchema>
