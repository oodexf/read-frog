import { countDueLocalNotes, saveLocalNotes } from "@/utils/local-notes/repository"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"

/**
 * Serves the local-only build's notes to content scripts, which cannot open
 * the extension's IndexedDB themselves (theirs belongs to the host page). The
 * options page shares the extension's origin and reads the database directly.
 */
export function setupLocalNotesMessageHandlers() {
  onMessage("saveLocalNotes", async ({ data }) => saveLocalNotes(data))

  // A count is decoration on the popover; a failure shows nothing rather than an error.
  onMessage("countDueLocalNotes", async () => {
    try {
      return await countDueLocalNotes()
    } catch (error) {
      logger.error("Failed to count due local notes", error)
      return 0
    }
  })
}
