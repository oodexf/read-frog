import type { LocalNoteRecord, LocalNoteSaveInput } from "../types"
import { describe, expect, it } from "vitest"
import {
  buildLocalNoteFields,
  buildLocalNoteMatchKey,
  buildLocalNoteRecord,
  formatLocalNotesCsv,
  hasLocalNoteContent,
} from "../build"

const NOW = new Date("2026-10-18T08:00:00.000Z")
const LATER = new Date("2026-10-20T08:00:00.000Z")

const input: LocalNoteSaveInput = {
  action: {
    id: "dictionary",
    name: "Dictionary",
    outputSchema: [
      { id: "term", name: "Term", type: "string" },
      { id: "definition", name: "Definition", type: "string" },
      { id: "level", name: "Level", type: "number" },
    ],
  },
  results: [],
  sourceUrl: "https://example.com/article",
  sourceTitle: "Article",
}

describe("buildLocalNoteFields", () => {
  it("keeps schema order, trims text, parses numbers and drops extra keys", () => {
    const fields = buildLocalNoteFields(input.action.outputSchema, {
      Definition: "  a fruit ",
      Term: "Apple",
      Level: "3",
      Extra: "ignored",
    })
    expect(fields).toEqual([
      { id: "term", name: "Term", type: "string", value: "Apple" },
      { id: "definition", name: "Definition", type: "string", value: "a fruit" },
      { id: "level", name: "Level", type: "number", value: 3 },
    ])
  })

  it("turns blanks and unparseable numbers into null", () => {
    const fields = buildLocalNoteFields(input.action.outputSchema, {
      Term: "   ",
      Level: "many",
    })
    expect(fields.map((field) => field.value)).toEqual([null, null, null])
    expect(hasLocalNoteContent(fields)).toBe(false)
  })
})

describe("buildLocalNoteMatchKey", () => {
  it("ignores case and surrounding or repeated whitespace", () => {
    const a = buildLocalNoteFields(input.action.outputSchema, { Term: "Make  Up" })
    const b = buildLocalNoteFields(input.action.outputSchema, { Term: " make up" })
    expect(buildLocalNoteMatchKey(a)).toBe("make up")
    expect(buildLocalNoteMatchKey(a)).toBe(buildLocalNoteMatchKey(b))
  })

  it("is empty when the front is empty", () => {
    expect(buildLocalNoteMatchKey(buildLocalNoteFields(input.action.outputSchema, {}))).toBe("")
  })
})

describe("buildLocalNoteRecord", () => {
  const fields = buildLocalNoteFields(input.action.outputSchema, { Term: "Apple" })

  it("starts a new note due now", () => {
    const record = buildLocalNoteRecord({
      id: "new-id",
      input,
      fields,
      matchKey: "apple",
      existing: undefined,
      now: NOW,
    })
    expect(record).toMatchObject({
      id: "new-id",
      actionId: "dictionary",
      actionName: "Dictionary",
      matchKey: "apple",
      sourceUrl: "https://example.com/article",
      sourceTitle: "Article",
      createdAt: NOW,
      updatedAt: NOW,
      due: NOW,
      reps: 0,
    })
  })

  it("keeps an existing note's id, creation time and schedule when saved again", () => {
    const existing: LocalNoteRecord = {
      ...buildLocalNoteRecord({
        id: "old-id",
        input,
        fields,
        matchKey: "apple",
        existing: undefined,
        now: NOW,
      }),
      due: LATER,
      reps: 3,
      intervalDays: 7,
      ease: 2.7,
    }
    const updatedFields = buildLocalNoteFields(input.action.outputSchema, {
      Term: "Apple",
      Definition: "a fruit",
    })
    const record = buildLocalNoteRecord({
      id: "new-id",
      input: { ...input, action: { ...input.action, name: "Renamed" } },
      fields: updatedFields,
      matchKey: "apple",
      existing,
      now: LATER,
    })
    expect(record).toMatchObject({
      id: "old-id",
      actionName: "Renamed",
      createdAt: NOW,
      updatedAt: LATER,
      due: LATER,
      reps: 3,
      intervalDays: 7,
      ease: 2.7,
      fields: updatedFields,
    })
  })
})

describe("formatLocalNotesCsv", () => {
  it("unions field names across actions and escapes cells", () => {
    const dictionary = buildLocalNoteRecord({
      id: "1",
      input,
      fields: buildLocalNoteFields(input.action.outputSchema, {
        Term: 'say "hi"',
        Definition: "line one\nline two",
      }),
      matchKey: "say",
      existing: undefined,
      now: NOW,
    })
    const other = buildLocalNoteRecord({
      id: "2",
      input: {
        action: {
          id: "grammar",
          name: "Grammar, notes",
          outputSchema: [{ id: "rule", name: "Rule", type: "string" }],
        },
        results: [],
      },
      fields: [{ id: "rule", name: "Rule", type: "string", value: "SVO" }],
      matchKey: "svo",
      existing: undefined,
      now: NOW,
    })

    const iso = NOW.toISOString()
    expect(formatLocalNotesCsv([dictionary, other])).toBe(
      [
        "action,Term,Definition,Level,Rule,sourceUrl,createdAt,due",
        `Dictionary,"say ""hi""","line one\nline two",,,https://example.com/article,${iso},${iso}`,
        `"Grammar, notes",,,,SVO,,${iso},${iso}`,
      ].join("\n"),
    )
  })
})
