import readFrogLogo from "@/assets/icons/read-frog.png"
import { APP_NAME } from "@/utils/constants/app"

// Holds the header's left slot in local-only builds, where there is no account
// menu to put there; without it the icon rail floats alone over an empty row.
export function PopupBrand() {
  return (
    <div className="flex h-8 min-w-0 items-center gap-2">
      <img src={readFrogLogo} alt="" className="size-6 shrink-0 rounded-full" />
      <span className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</span>
    </div>
  )
}
