import type { LocalNoteRecord, LocalNoteReviewGrade, LocalNoteSaveInput } from "./types"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import {
  buildLocalNoteFields,
  buildLocalNoteMatchKey,
  buildLocalNoteRecord,
  hasLocalNoteContent,
} from "./build"
import { localNotesDb } from "./db"
import { scheduleReview } from "./scheduler"

/** Saves each result as a note, updating notes it repeats. Returns how many were written. */
export async function saveLocalNotes(input: LocalNoteSaveInput, now = new Date()): Promise<number> {
  return localNotesDb.transaction("rw", localNotesDb.note, async () => {
    const written = new Map<string, LocalNoteRecord>()

    for (const result of input.results) {
      const fields = buildLocalNoteFields(input.action.outputSchema, result)
      if (!hasLocalNoteContent(fields)) {
        continue
      }
      const matchKey = buildLocalNoteMatchKey(fields)
      // A blank front cannot identify a note, so it never merges into another.
      const existing = matchKey
        ? (written.get(matchKey) ??
          (await localNotesDb.note.where({ actionId: input.action.id, matchKey }).first()))
        : undefined
      const record = buildLocalNoteRecord({
        id: getRandomUUID(),
        input,
        fields,
        matchKey: matchKey || getRandomUUID(),
        existing,
        now,
      })
      written.set(record.matchKey, record)
    }

    const records = [...written.values()]
    await localNotesDb.note.bulkPut(records)
    return records.length
  })
}

/** Newest first. */
export async function listLocalNotes(): Promise<LocalNoteRecord[]> {
  return localNotesDb.note.orderBy("createdAt").reverse().toArray()
}

export async function deleteLocalNote(id: string): Promise<void> {
  await localNotesDb.note.delete(id)
}

export async function deleteAllLocalNotes(): Promise<void> {
  await localNotesDb.note.clear()
}

export async function countDueLocalNotes(now = new Date()): Promise<number> {
  return localNotesDb.note.where("due").belowOrEqual(now).count()
}

/** Most overdue first, so a backlog is worked through in the order it built up. */
export async function listDueLocalNotes(now = new Date()): Promise<LocalNoteRecord[]> {
  return localNotesDb.note.where("due").belowOrEqual(now).sortBy("due")
}

export async function reviewLocalNote(
  id: string,
  grade: LocalNoteReviewGrade,
  now = new Date(),
): Promise<LocalNoteRecord | undefined> {
  return localNotesDb.transaction("rw", localNotesDb.note, async () => {
    const note = await localNotesDb.note.get(id)
    if (!note) {
      return undefined
    }
    const next: LocalNoteRecord = { ...note, ...scheduleReview(note, grade, now) }
    await localNotesDb.note.put(next)
    return next
  })
}
