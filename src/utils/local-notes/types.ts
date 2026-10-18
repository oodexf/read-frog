import type { SelectionToolbarCustomActionOutputType } from "@/types/config/selection-toolbar"

export type LocalNoteFieldValue = string | number | null

export interface LocalNoteField {
  /** The output field's id, which survives a rename of the field. */
  id: string
  /** The field's name when the note was saved. */
  name: string
  type: SelectionToolbarCustomActionOutputType
  value: LocalNoteFieldValue
}

/** Where a note is in its review schedule (SM-2, the scheduler Anki started from). */
export interface LocalNoteSchedule {
  /** When the card is next due. A new card is due the moment it is saved. */
  due: Date
  /** Days until the next review once the card has graduated; 0 while learning. */
  intervalDays: number
  /** SM-2 ease factor: how much the interval grows per successful review. */
  ease: number
  /** Successful reviews in a row; an "again" resets it. */
  reps: number
  lapses: number
  lastReviewedAt: Date | null
}

export interface LocalNoteRecord extends LocalNoteSchedule {
  /** Dexie primary key. */
  id: string
  actionId: string
  /** The action's name when the note was last saved. */
  actionName: string
  /**
   * The first field's text, normalized. Saving the same thing from the same
   * action again updates that note instead of adding a second card for it.
   */
  matchKey: string
  /** In the action's output-schema order; the first one is the card's front. */
  fields: LocalNoteField[]
  sourceUrl: string | null
  sourceTitle: string | null
  createdAt: Date
  updatedAt: Date
}

/** What a content script sends the background to save. */
export interface LocalNoteSaveInput {
  action: {
    id: string
    name: string
    outputSchema: Array<{ id: string; name: string; type: SelectionToolbarCustomActionOutputType }>
  }
  /** One record per note, keyed by output-field name. */
  results: Array<Record<string, unknown>>
  sourceUrl?: string
  sourceTitle?: string
}

export type LocalNoteReviewGrade = "again" | "hard" | "good" | "easy"
