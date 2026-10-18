import { describe, expect, it } from "vitest"
import {
  createNewSchedule,
  DEFAULT_EASE,
  formatReviewInterval,
  isDue,
  previewReviewIntervals,
  scheduleReview,
} from "../scheduler"

const NOW = new Date("2026-10-18T08:00:00.000Z")
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function offset(date: Date) {
  return date.getTime() - NOW.getTime()
}

describe("local note scheduler", () => {
  it("makes a new card due at once", () => {
    const schedule = createNewSchedule(NOW)
    expect(isDue(schedule, NOW)).toBe(true)
    expect(schedule).toMatchObject({ reps: 0, lapses: 0, ease: DEFAULT_EASE, intervalDays: 0 })
  })

  it("keeps a learning card within minutes until it is answered good", () => {
    const fresh = createNewSchedule(NOW)
    expect(offset(scheduleReview(fresh, "again", NOW).due)).toBe(MINUTE)
    expect(offset(scheduleReview(fresh, "hard", NOW).due)).toBe(6 * MINUTE)
    expect(scheduleReview(fresh, "again", NOW).reps).toBe(0)

    const graduated = scheduleReview(fresh, "good", NOW)
    expect(graduated).toMatchObject({ reps: 1, intervalDays: 1, lastReviewedAt: NOW })
    expect(offset(graduated.due)).toBe(DAY)

    const easy = scheduleReview(fresh, "easy", NOW)
    expect(easy.intervalDays).toBe(4)
    expect(easy.ease).toBeGreaterThan(DEFAULT_EASE)
  })

  it("grows a review card's interval by its ease", () => {
    const card = { ...createNewSchedule(NOW), reps: 2, intervalDays: 10 }
    expect(scheduleReview(card, "good", NOW).intervalDays).toBe(25)
    expect(scheduleReview(card, "hard", NOW).intervalDays).toBe(12)
    expect(scheduleReview(card, "easy", NOW).intervalDays).toBe(33)
  })

  it("always moves a passed card at least a day further out", () => {
    const card = { ...createNewSchedule(NOW), reps: 1, intervalDays: 1, ease: 1.3 }
    expect(scheduleReview(card, "hard", NOW).intervalDays).toBe(2)
    expect(scheduleReview(card, "good", NOW).intervalDays).toBe(2)
  })

  it("sends a lapsed card back to relearning and lowers its ease", () => {
    const card = { ...createNewSchedule(NOW), reps: 3, intervalDays: 30 }
    const lapsed = scheduleReview(card, "again", NOW)
    expect(lapsed).toMatchObject({ reps: 0, lapses: 1, intervalDays: 0, ease: 2.3 })
    expect(offset(lapsed.due)).toBe(10 * MINUTE)
  })

  it("never lets the ease fall below 1.3", () => {
    let card = { ...createNewSchedule(NOW), reps: 1, intervalDays: 1 }
    for (let i = 0; i < 20; i++) {
      card = { ...scheduleReview(card, "again", NOW), reps: 1, intervalDays: 1 }
    }
    expect(card.ease).toBe(1.3)
  })

  it("previews what each grade would do", () => {
    expect(previewReviewIntervals(createNewSchedule(NOW), NOW)).toEqual({
      again: "1m",
      hard: "6m",
      good: "1d",
      easy: "4d",
    })
  })

  it("formats intervals in the largest sensible unit", () => {
    expect(formatReviewInterval(30_000)).toBe("1m")
    expect(formatReviewInterval(3 * 60 * MINUTE)).toBe("3h")
    expect(formatReviewInterval(45 * DAY)).toBe("2mo")
    expect(formatReviewInterval(548 * DAY)).toBe("1.5y")
  })
})
