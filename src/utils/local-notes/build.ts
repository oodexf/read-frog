import type {
  LocalNoteField,
  LocalNoteFieldValue,
  LocalNoteRecord,
  LocalNoteSaveInput,
} from "./types"
import { createNewSchedule } from "./scheduler"

function toFieldValue(type: LocalNoteField["type"], raw: unknown): LocalNoteFieldValue {
  if (raw === null || raw === undefined) {
    return null
  }
  // A model answers in JSON, so anything that is not text or a number is
  // kept as its JSON rather than "[object Object]".
  const text = (
    typeof raw === "string"
      ? raw
      : typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : JSON.stringify(raw)
  ).trim()
  if (type === "number") {
    const value = typeof raw === "number" ? raw : Number(text)
    return text.length > 0 && Number.isFinite(value) ? value : null
  }
  return text.length > 0 ? text : null
}

/** One field per output field, in schema order; a result's extra keys are dropped. */
export function buildLocalNoteFields(
  outputSchema: LocalNoteSaveInput["action"]["outputSchema"],
  result: Record<string, unknown>,
): LocalNoteField[] {
  return outputSchema.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    value: toFieldValue(field.type, result[field.name]),
  }))
}

/** Case- and whitespace-insensitive, so "Apple" and " apple " are one note. */
export function buildLocalNoteMatchKey(fields: LocalNoteField[]): string {
  const front = fields[0]?.value
  if (front === null || front === undefined) {
    return ""
  }
  return String(front).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
}

export function hasLocalNoteContent(fields: LocalNoteField[]): boolean {
  return fields.some((field) => field.value !== null)
}

/**
 * The record a save writes. Saving over an existing note refreshes what it
 * says but keeps its id, creation time and review schedule, so re-saving a
 * word you are learning does not send it back to the start.
 */
export function buildLocalNoteRecord({
  id,
  input,
  fields,
  matchKey,
  existing,
  now,
}: {
  id: string
  input: LocalNoteSaveInput
  fields: LocalNoteField[]
  matchKey: string
  existing: LocalNoteRecord | undefined
  now: Date
}): LocalNoteRecord {
  const schedule = existing
    ? {
        due: existing.due,
        intervalDays: existing.intervalDays,
        ease: existing.ease,
        reps: existing.reps,
        lapses: existing.lapses,
        lastReviewedAt: existing.lastReviewedAt,
      }
    : createNewSchedule(now)

  return {
    ...schedule,
    id: existing?.id ?? id,
    actionId: input.action.id,
    actionName: input.action.name,
    matchKey,
    fields,
    sourceUrl: input.sourceUrl ?? existing?.sourceUrl ?? null,
    sourceTitle: input.sourceTitle ?? existing?.sourceTitle ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function formatFieldValue(value: LocalNoteFieldValue): string {
  return value === null ? "" : String(value)
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * One CSV per export. Notes from different actions have different fields, so
 * the columns are the union of field names in first-seen order, after the
 * columns every note has.
 */
export function formatLocalNotesCsv(notes: LocalNoteRecord[]): string {
  const fieldNames: string[] = []
  for (const note of notes) {
    for (const field of note.fields) {
      if (!fieldNames.includes(field.name)) {
        fieldNames.push(field.name)
      }
    }
  }

  const header = ["action", ...fieldNames, "sourceUrl", "createdAt", "due"]
  const rows = notes.map((note) => {
    const byName = new Map(note.fields.map((field) => [field.name, field.value]))
    return [
      note.actionName,
      ...fieldNames.map((name) => formatFieldValue(byName.get(name) ?? null)),
      note.sourceUrl ?? "",
      note.createdAt.toISOString(),
      note.due.toISOString(),
    ]
  })

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
}
