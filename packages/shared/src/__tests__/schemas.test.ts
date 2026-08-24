import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  signUpSchema, signInSchema, targetingConfigSchema, paginationSchema, uuidSchema,
} from '../schemas'

describe('schemas', () => {
  it('uuid validates', () => {
    expect(uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBeTypeOf('string')
    expect(() => uuidSchema.parse('nope')).toThrow(z.ZodError)
  })

  it('pagination has defaults', () => {
    const r = paginationSchema.parse({})
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
  })

  it('signup validates email and password', () => {
    expect(() => signUpSchema.parse({ email: 'bad', password: 'short' })).toThrow()
    expect(signUpSchema.parse({ email: 'a@b.com', password: 'password123' })).toBeTruthy()
  })

  it('targeting has sensible defaults', () => {
    const r = targetingConfigSchema.parse({})
    expect(r.minFollowers).toBe(100)
    expect(r.maxFollowers).toBe(50000)
    expect(r.enabledActions).toEqual(['like', 'follow'])
    expect(r.unfollowAfterDays).toBe(14)
    expect(r.skipPrivateAccounts).toBe(true)
  })
})
