import { env } from "@/env"
import { useSaveToLocalNotes } from "./use-save-to-local-notes"
import { useSaveToNotebase } from "./use-save-to-notebase"

/**
 * Where a note goes: the extension's own database in a local-only build,
 * Notebase otherwise. `env` is fixed at build time, so each build only ever
 * calls one of the two hooks.
 */
export const useSaveNotes = env.WXT_LOCAL_ONLY ? useSaveToLocalNotes : useSaveToNotebase
