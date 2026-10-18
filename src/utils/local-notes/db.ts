import type { EntityTable } from "dexie"
import type { LocalNoteRecord } from "./types"
import { upperCamelCase } from "case-anything"
import { Dexie } from "dexie"
import { APP_NAME } from "@/utils/constants/app"

/**
 * The local-only build's notes, in a database of their own rather than a new
 * version of `AppDB`: upstream bumps that schema on its own schedule, and two
 * branches each adding "version 7" is how a browser ends up with a database
 * that disagrees with its code.
 *
 * Not a cache: these are the user's notes and review history, so nothing may
 * clean this table up.
 */
class LocalNotesDB extends Dexie {
  note!: EntityTable<LocalNoteRecord, "id">

  constructor() {
    super(`${upperCamelCase(APP_NAME)}LocalNotesDB`)
    this.version(1).stores({
      note: `
        id,
        &[actionId+matchKey],
        actionId,
        due,
        createdAt`,
    })
  }
}

export const localNotesDb = new LocalNotesDB()
