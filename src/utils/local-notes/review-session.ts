import type { LocalNoteRecord } from "./types"

/**
 * A card that comes back within this long (a learning step) is shown again in
 * this session once it is due, the way Anki keeps it in play. Later ones wait
 * for a future session.
 */
export const REQUEUE_WITHIN_MS = 20 * 60_000

export interface ReviewSession {
  /** Due now, in the order they are shown; the first is the current card. */
  ready: LocalNoteRecord[]
  /** Graded this session and due again soon, soonest first. */
  waiting: LocalNoteRecord[]
}

export function startReviewSession(dueNotes: LocalNoteRecord[]): ReviewSession {
  return { ready: dueNotes, waiting: [] }
}

/** Moves waiting cards that have come due to the back of the ready queue. */
export function promoteDueCards(session: ReviewSession, now: Date): ReviewSession {
  const dueIndex = session.waiting.findIndex((note) => note.due.getTime() > now.getTime())
  const dueCount = dueIndex === -1 ? session.waiting.length : dueIndex
  if (dueCount === 0) {
    return session
  }
  return {
    ready: [...session.ready, ...session.waiting.slice(0, dueCount)],
    waiting: session.waiting.slice(dueCount),
  }
}

/**
 * Takes the current card off the queue. A card graded back into learning waits
 * until it is due rather than reappearing at once, even when it is the only
 * card left.
 */
export function completeReview(
  session: ReviewSession,
  reviewed: LocalNoteRecord | undefined,
  now: Date,
): ReviewSession {
  const ready = session.ready.slice(1)
  if (!reviewed || reviewed.due.getTime() - now.getTime() > REQUEUE_WITHIN_MS) {
    return promoteDueCards({ ready, waiting: session.waiting }, now)
  }
  const waiting = [...session.waiting, reviewed].sort((a, b) => a.due.getTime() - b.due.getTime())
  return promoteDueCards({ ready, waiting }, now)
}
