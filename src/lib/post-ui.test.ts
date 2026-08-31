import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPostTime, paidReactionClass } from './post-ui'

describe('post UI helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-10T03:04:05.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats recent post time as relative time', () => {
    const result = formatPostTime('2020-01-10T02:04:05.000Z', 'UTC', 'en')
    expect(result.relative).toBe(true)
    expect(result.text).toBe('1 hour ago')
  })

  it('formats older post time with timezone-aware absolute parts', () => {
    const result = formatPostTime('2020-01-02T03:04:05.000Z', 'America/New_York', 'en')
    expect(result.relative).toBe(false)
    expect(result.month).toBe('Jan')
    expect(result.day).toBe('1')
    expect(result.year).toBe('2020')
    expect(result.text).toBe('Jan 1, 2020')
  })

  it('falls back to english for invalid locales', () => {
    const result = formatPostTime('2020-01-02T03:04:05.000Z', 'UTC', 'unknown-locale')
    expect(result.relative).toBe(false)
    expect(result.text).toBe('Jan 2, 2020')
  })

  it('exposes a stable semantic class for paid reactions', () => {
    expect(paidReactionClass).toBe('reaction-paid')
  })
})
