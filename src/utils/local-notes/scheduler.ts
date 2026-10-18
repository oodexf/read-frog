import type { LocalNoteReviewGrade, LocalNoteSchedule } from "./types"

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3
const MAX_INTERVAL_DAYS = 36_500

/** Short steps a card goes through before it graduates to day intervals. */
const LEARNING_AGAIN_MS = MINUTE_MS
const LEARNING_HARD_MS = 6 * MINUTE_MS
const RELEARNING_MS = 10 * MINUTE_MS
const GRADUATING_INTERVAL_DAYS = 1
const EASY_GRADUATING_INTERVAL_DAYS = 4

const HARD_INTERVAL_FACTOR = 1.2
const EASY_BONUS = 1.3

export function createNewSchedule(now: Date): LocalNoteSchedule {
  return {
    due: now,
    intervalDays: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  }
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.round(ease * 100) / 100)
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)))
}

function inDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

function inMs(now: Date, ms: number): Date {
  return new Date(now.getTime() + ms)
}

/**
 * SM-2 as Anki runs it, trimmed to one learning step: a card still being
 * learned (no successful review yet) comes back within minutes until "good"
 * graduates it to a one-day interval; after that each grade grows, shrinks or
 * resets the interval and nudges the ease factor.
 */
export function scheduleReview(
  schedule: LocalNoteSchedule,
  grade: LocalNoteReviewGrade,
  now: Date,
): LocalNoteSchedule {
  const base = { ...schedule, lastReviewedAt: now }

  if (schedule.reps === 0) {
    if (grade === "again") {
      return { ...base, intervalDays: 0, due: inMs(now, LEARNING_AGAIN_MS) }
    }
    if (grade === "hard") {
      return { ...base, intervalDays: 0, due: inMs(now, LEARNING_HARD_MS) }
    }
    if (grade === "good") {
      return {
        ...base,
        reps: 1,
        intervalDays: GRADUATING_INTERVAL_DAYS,
        due: inDays(now, GRADUATING_INTERVAL_DAYS),
      }
    }
    return {
      ...base,
      reps: 1,
      ease: clampEase(schedule.ease + 0.15),
      intervalDays: EASY_GRADUATING_INTERVAL_DAYS,
      due: inDays(now, EASY_GRADUATING_INTERVAL_DAYS),
    }
  }

  if (grade === "again") {
    return {
      ...base,
      reps: 0,
      lapses: schedule.lapses + 1,
      ease: clampEase(schedule.ease - 0.2),
      intervalDays: 0,
      due: inMs(now, RELEARNING_MS),
    }
  }

  const previous = Math.max(1, schedule.intervalDays)
  const [ease, factor] =
    grade === "hard"
      ? [clampEase(schedule.ease - 0.15), HARD_INTERVAL_FACTOR]
      : grade === "good"
        ? [schedule.ease, schedule.ease]
        : [clampEase(schedule.ease + 0.15), schedule.ease * EASY_BONUS]
  const intervalDays = clampInterval(Math.max(previous + 1, previous * factor))
  return { ...base, reps: schedule.reps + 1, ease, intervalDays, due: inDays(now, intervalDays) }
}

export function isDue(schedule: Pick<LocalNoteSchedule, "due">, now: Date): boolean {
  return schedule.due.getTime() <= now.getTime()
}

/** "1m", "6m", "3d", "2mo", "1.5y": how long a grade would put the card away for. */
export function formatReviewInterval(ms: number): string {
  const minutes = ms / MINUTE_MS
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))}m`
  }
  const hours = minutes / 60
  if (hours < 24) {
    return `${Math.round(hours)}h`
  }
  const days = ms / DAY_MS
  if (days < 30) {
    return `${Math.round(days)}d`
  }
  if (days < 365) {
    return `${Math.round(days / 30)}mo`
  }
  return `${Math.round((days / 365) * 10) / 10}y`
}

export const REVIEW_GRADES: readonly LocalNoteReviewGrade[] = ["again", "hard", "good", "easy"]

export function previewReviewIntervals(
  schedule: LocalNoteSchedule,
  now: Date,
): Record<LocalNoteReviewGrade, string> {
  const preview = {} as Record<LocalNoteReviewGrade, string>
  for (const grade of REVIEW_GRADES) {
    const next = scheduleReview(schedule, grade, now)
    preview[grade] = formatReviewInterval(next.due.getTime() - now.getTime())
  }
  return preview
}
