import type { Reaction } from '../types'

export const paidReactionClass = 'reaction-paid'

export interface PostTimeResult {
  relative: boolean
  text: string
  month?: string
  day?: string
  year?: string
}

const weekInMs = 7 * 24 * 60 * 60 * 1000

function resolveLocale(locale = 'en'): string {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale)[0] ?? 'en'
  }
  catch {
    return 'en'
  }
}

function roundRelativeTime(diffInMs: number, unitInMs: number): number {
  return Math.sign(diffInMs) * Math.round(Math.abs(diffInMs) / unitInMs)
}

function formatRelativeTime(date: Date, locale: string): string {
  const diffInMs = date.getTime() - Date.now()
  const absoluteDiffInMs = Math.abs(diffInMs)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })

  if (absoluteDiffInMs < 60 * 1000) {
    return formatter.format(roundRelativeTime(diffInMs, 1000), 'second')
  }

  if (absoluteDiffInMs < 60 * 60 * 1000) {
    return formatter.format(roundRelativeTime(diffInMs, 60 * 1000), 'minute')
  }

  if (absoluteDiffInMs < 24 * 60 * 60 * 1000) {
    return formatter.format(roundRelativeTime(diffInMs, 60 * 60 * 1000), 'hour')
  }

  return formatter.format(roundRelativeTime(diffInMs, 24 * 60 * 60 * 1000), 'day')
}

function formatAbsoluteTime(date: Date, timezone: string | undefined, locale: string): PostTimeResult {
  const month = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: timezone,
  }).format(date)
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: timezone,
  }).format(date)
  const year = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    timeZone: timezone,
  }).format(date)

  return {
    relative: false,
    text: `${month} ${day}, ${year}`,
    month,
    day,
    year,
  }
}

export function formatPostTime(datetime: string, timezone?: string, locale?: string): PostTimeResult {
  const resolvedLocale = resolveLocale(locale)
  const postTime = new Date(datetime)
  const isOlderThanWeek = postTime.getTime() < Date.now() - weekInMs

  return isOlderThanWeek
    ? formatAbsoluteTime(postTime, timezone, resolvedLocale)
    : { relative: true, text: formatRelativeTime(postTime, resolvedLocale) }
}

export function getTagHref(tag: string): string {
  return `/search/result?q=${encodeURIComponent(`#${tag}`)}`
}

export function getReactionLabel(reaction: Reaction): string {
  const reactionName = reaction.isPaid ? 'Paid reaction' : `${reaction.emoji || 'Custom emoji'} reaction`

  return `${reactionName}, count ${reaction.count}`
}
