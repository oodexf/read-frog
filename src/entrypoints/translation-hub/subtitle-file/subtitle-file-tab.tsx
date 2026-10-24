import { useEffect } from "react"
import { SubtitleFileInput } from "./subtitle-file-input"
import { SubtitleFilePreview } from "./subtitle-file-preview"

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false
}

/**
 * A file dropped anywhere but the dropzone would otherwise be opened by the
 * browser in place of the hub, taking the loaded file, its translations and
 * any run in progress with it. Likely once a file is loaded, since the card
 * that replaces the dropzone takes no drops. The dropzone's own handler runs
 * first and still loads what lands on it.
 */
function usePreventStrayFileDrops() {
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault()
      }
    }
    window.addEventListener("dragover", preventFileNavigation)
    window.addEventListener("drop", preventFileNavigation)
    return () => {
      window.removeEventListener("dragover", preventFileNavigation)
      window.removeEventListener("drop", preventFileNavigation)
    }
  }, [])
}

export function SubtitleFileTab() {
  usePreventStrayFileDrops()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SubtitleFileInput />
      <SubtitleFilePreview />
    </div>
  )
}
