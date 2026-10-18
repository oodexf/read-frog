import { useQuery } from "@tanstack/react-query"
import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react"
import { ArrowUpRightIcon } from "@/components/icons/arrow-up-right-icon"
import { i18n } from "@/utils/i18n"
import { LOCAL_NOTES_DUE_COUNT_QUERY_KEY } from "@/utils/local-notes/query-keys"
import { sendMessage } from "@/utils/message"

// Stands in for the count in the localized text, which sets it in its own style.
const COUNT_MARK = ""

/**
 * `ReviewDueTab` for the local-only build: the number of local notes due for
 * review, opening the review page in the extension's settings. Renders
 * nothing when nothing is due.
 */
export function LocalReviewDueTab() {
  const prefersReducedMotion = useReducedMotion() ?? false
  const { data: count = 0 } = useQuery({
    queryKey: LOCAL_NOTES_DUE_COUNT_QUERY_KEY,
    queryFn: async (): Promise<number> => await sendMessage("countDueLocalNotes", undefined),
    retry: false,
    staleTime: 60_000,
    // A learning card comes due within minutes of being graded, so the count
    // is re-read while the popover stays open rather than only when it mounts.
    refetchInterval: 60_000,
    meta: { suppressToast: true },
  })

  if (count === 0) {
    return null
  }

  const [before, after] = i18n
    .t(count === 1 ? "action.reviewDueOne" : "action.reviewDueOther", [COUNT_MARK])
    .split(COUNT_MARK)

  return (
    <LazyMotion features={domAnimation}>
      <m.button
        type="button"
        initial="normal"
        whileHover={prefersReducedMotion ? undefined : "animate"}
        className="flex shrink-0 cursor-pointer items-center gap-1 self-end rounded-tl-lg border-t border-l bg-popover py-1 pr-3 pl-2.5 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-muted/40"
        onClick={() => {
          void sendMessage("openOptionsPage", { route: "/notes/review" })
        }}
      >
        <span>
          {before}
          <span className="font-semibold text-accent dark:text-[var(--rf-cornflower-300)]">
            {count}
          </span>
          {after}
        </span>
        <ArrowUpRightIcon className="size-3.5" />
      </m.button>
    </LazyMotion>
  )
}
