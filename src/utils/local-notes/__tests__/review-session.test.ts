import type { LocalNoteRecord } from "../types"
import { describe, expect, it } from "vitest"
import { completeReview, promoteDueCards, startReviewSession } from "../review-session"
import { scheduleReview } from "../scheduler"

const NOW = new Date("2026-10-18T08:00:00.000Z")
const MINUTE = 60_000

function note(id: string, due = NOW): LocalNoteRecord {
  return {
    id,
    actionId: "dictionary",
    actionName: "Dictionary",
    matchKey: id,
    fields: [{ id: "term", name: "Term", type: "string", value: id }],
    sourceUrl: null,
    sourceTitle: null,
    createdAt: NOW,
    updatedAt: NOW,
    due,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  }
}

function graded(card: LocalNoteRecord, grade: "again" | "hard" | "good") {
  return { ...card, ...scheduleReview(card, grade, NOW) }
}

describe("review session", () => {
  it("does not show the only card again before its learning step is due", () => {
    const card = note("a")
    const session = completeReview(startReviewSession([card]), graded(card, "hard"), NOW)

    expect(session.ready).toEqual([])
    expect(session.waiting.map((n) => n.id)).toEqual(["a"])

    expect(promoteDueCards(session, new Date(NOW.getTime() + 5 * MINUTE))).toBe(session)
    const later = promoteDueCards(session, new Date(NOW.getTime() + 6 * MINUTE))
    expect(later.ready.map((n) => n.id)).toEqual(["a"])
    expect(later.waiting).toEqual([])
  })

  it("moves on to the next due card while a learning card waits", () => {
    const a = note("a")
    const b = note("b")
    const session = completeReview(startReviewSession([a, b]), graded(a, "again"), NOW)
    expect(session.ready.map((n) => n.id)).toEqual(["b"])
    expect(session.waiting.map((n) => n.id)).toEqual(["a"])
  })

  it("drops a card that graduates out of the session", () => {
    const card = note("a")
    const session = completeReview(startReviewSession([card]), graded(card, "good"), NOW)
    expect(session).toEqual({ ready: [], waiting: [] })
  })

  it("brings waiting cards back soonest first", () => {
    const a = note("a")
    const b = note("b")
    let session = completeReview(startReviewSession([a, b]), graded(a, "hard"), NOW)
    session = completeReview(session, graded(b, "again"), NOW)
    expect(session.waiting.map((n) => n.id)).toEqual(["b", "a"])

    const all = promoteDueCards(session, new Date(NOW.getTime() + 10 * MINUTE))
    expect(all.ready.map((n) => n.id)).toEqual(["b", "a"])
  })
})
