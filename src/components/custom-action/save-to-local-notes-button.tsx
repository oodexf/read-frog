import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { IconBookmarkPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/base-ui/button"
import { SELECTION_TOOLBAR_FOOTER_COMPACT_CLASSES } from "@/components/ui/selection-popover/selection-toolbar-footer-compact"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { useSaveToLocalNotes } from "./use-save-to-local-notes"

/** `SaveToNotebaseButton` for the local-only build: no account, no connection. */
export function SaveToLocalNotesButton({
  action,
  isRunning,
  result,
}: {
  action: SelectionToolbarCustomAction
  isRunning: boolean
  result: Record<string, unknown> | null
}) {
  const { save, isSaving } = useSaveToLocalNotes()
  const label = isSaving ? i18n.t("localNotes.saving") : i18n.t("localNotes.save")

  return (
    <Button
      type="button"
      variant="brand"
      size="sm"
      className={cn("min-w-0 shrink", SELECTION_TOOLBAR_FOOTER_COMPACT_CLASSES.button)}
      title={label}
      disabled={isRunning || !result || isSaving}
      onClick={() => {
        if (result) {
          void save({ action, results: [result] })
        }
      }}
    >
      <IconBookmarkPlus className={SELECTION_TOOLBAR_FOOTER_COMPACT_CLASSES.icon} />
      <span className={cn("truncate", SELECTION_TOOLBAR_FOOTER_COMPACT_CLASSES.label)}>
        {label}
      </span>
    </Button>
  )
}
