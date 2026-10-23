import { SubtitleFileInput } from "./subtitle-file-input"
import { SubtitleFilePreview } from "./subtitle-file-preview"

export function SubtitleFileTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SubtitleFileInput />
      <SubtitleFilePreview />
    </div>
  )
}
