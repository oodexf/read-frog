import type { SaveToNotebaseOutcome, SaveToNotebaseRequest } from "./use-save-to-notebase"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { LOCAL_NOTES_QUERY_KEY } from "@/utils/local-notes/query-keys"
import { sendMessage } from "@/utils/message"

/**
 * The local-only build's "save to Notebase": every output field of each result
 * goes into the extension's own IndexedDB, through the background, since a
 * content script cannot open that database. No connection or mapping to set up.
 */
export function useSaveToLocalNotes() {
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)

  const save = async ({
    action,
    results,
  }: SaveToNotebaseRequest): Promise<SaveToNotebaseOutcome> => {
    setIsSaving(true)
    try {
      const count = await sendMessage("saveLocalNotes", {
        action: {
          id: action.id,
          name: action.name,
          outputSchema: action.outputSchema.map(({ id, name, type }) => ({ id, name, type })),
        },
        results,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
      })
      if (count === 0) {
        toastManager.add({ type: "error", title: i18n.t("localNotes.nothingToSave") })
        return "failed"
      }
      toastManager.add({ type: "success", title: i18n.t("localNotes.saved") })
      void queryClient.invalidateQueries({ queryKey: LOCAL_NOTES_QUERY_KEY })
      return "saved"
    } catch (error) {
      toastManager.add({
        type: "error",
        title: i18n.t("localNotes.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
      })
      return "failed"
    } finally {
      setIsSaving(false)
    }
  }

  return { save, isSaving }
}
