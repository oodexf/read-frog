import type { LocalNoteRecord, LocalNoteReviewGrade } from "@/utils/local-notes/types"
import { Icon } from "@iconify/react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { Button, buttonVariants } from "@/components/ui/base-ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/base-ui/empty"
import { i18n } from "@/utils/i18n"
import { listDueLocalNotes } from "@/utils/local-notes/repository"
import { previewReviewIntervals, REVIEW_GRADES } from "@/utils/local-notes/scheduler"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"
import { formatLocalNoteValue, LocalNoteBackFields } from "./note-fields"
import { useReviewLocalNote } from "./use-local-notes"

/**
 * A card that comes back within this long (a learning step) is shown again in
 * this session, after the rest of the queue, the way Anki keeps it in play.
 */
const REQUEUE_WITHIN_MS = 20 * 60_000

const GRADE_LABELS: Record<LocalNoteReviewGrade, () => string> = {
  again: () => i18n.t("localNotes.gradeAgain"),
  hard: () => i18n.t("localNotes.gradeHard"),
  good: () => i18n.t("localNotes.gradeGood"),
  easy: () => i18n.t("localNotes.gradeEasy"),
}

const GRADE_VARIANTS = {
  again: "destructive",
  hard: "outline",
  good: "brand",
  easy: "outline",
} as const

function BackToNotesLink() {
  return (
    <Link to="/notes" className={buttonVariants({ variant: "outline", size: "sm" })}>
      <Icon icon="tabler:arrow-left" />
      {i18n.t("localNotes.backToNotes")}
    </Link>
  )
}

/**
 * Works through the notes that are due, one card at a time: the first field
 * is the question, the rest the answer. Space reveals, 1–4 grade.
 */
export function LocalNotesReviewPage() {
  const [queue, setQueue] = useState<LocalNoteRecord[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const { mutateAsync: review, isPending } = useReviewLocalNote()

  useEffect(() => {
    let cancelled = false
    void listDueLocalNotes().then((notes) => {
      if (!cancelled) {
        setQueue(notes)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const current = queue?.[0]

  const grade = async (value: LocalNoteReviewGrade) => {
    if (!current || isPending) {
      return
    }
    const next = await review({ id: current.id, grade: value })
    setRevealed(false)
    setQueue((previous) => {
      const rest = (previous ?? []).slice(1)
      if (next && next.due.getTime() - Date.now() <= REQUEUE_WITHIN_MS) {
        return [...rest, next]
      }
      return rest
    })
  }

  // The latest handlers for the key listener, which is registered once.
  const keyHandlerRef = useRef({ grade, revealed, setRevealed })
  // oxlint-disable-next-line react/refs -- latest-value ref: writing it during render is what keeps the listener in sync
  keyHandlerRef.current = { grade, revealed, setRevealed }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) {
        return
      }
      const handler = keyHandlerRef.current
      if (!handler.revealed) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          handler.setRevealed(true)
        }
        return
      }
      const index = ["1", "2", "3", "4"].indexOf(event.key)
      if (index !== -1) {
        event.preventDefault()
        void handler.grade(REVIEW_GRADES[index]!)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (queue === null) {
    return null
  }

  return (
    <PageLayout
      title={i18n.t("localNotes.review")}
      description={i18n.t("localNotes.reviewDescription")}
      innerClassName="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-2">
        <BackToNotesLink />
        {current && (
          <span className="text-sm text-muted-foreground">
            {i18n.t("localNotes.remaining", [queue.length])}
          </span>
        )}
      </div>

      {!current ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{i18n.t("localNotes.reviewDone")}</EmptyTitle>
            <EmptyDescription>{i18n.t("localNotes.reviewDoneDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ReviewCard
          key={`${current.id}:${current.lastReviewedAt?.getTime() ?? "new"}`}
          note={current}
          revealed={revealed}
          isPending={isPending}
          onReveal={() => setRevealed(true)}
          onGrade={(value) => void grade(value)}
        />
      )}
    </PageLayout>
  )
}

function ReviewCard({
  note,
  revealed,
  isPending,
  onReveal,
  onGrade,
}: {
  note: LocalNoteRecord
  revealed: boolean
  isPending: boolean
  onReveal: () => void
  onGrade: (grade: LocalNoteReviewGrade) => void
}) {
  // Read once per card (the card remounts per review), not on every render.
  const [now] = useState(() => new Date())
  const intervals = previewReviewIntervals(note, now)

  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-card p-6">
      <div className="space-y-1 text-center">
        <p className="text-xs text-muted-foreground">{note.actionName}</p>
        <p className="text-2xl font-medium break-words text-foreground">
          {formatLocalNoteValue(note.fields[0]?.value ?? null)}
        </p>
      </div>

      {revealed ? (
        <>
          <LocalNoteBackFields fields={note.fields} className="border-t pt-4" />
          <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
            {REVIEW_GRADES.map((value, index) => (
              <Button
                key={value}
                variant={GRADE_VARIANTS[value]}
                disabled={isPending}
                className={cn("h-auto flex-col gap-0.5 py-2")}
                onClick={() => onGrade(value)}
              >
                <span>{GRADE_LABELS[value]()}</span>
                <span className="text-xs opacity-70">
                  {intervals[value]} · {index + 1}
                </span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <Button variant="brand" className="self-center" onClick={onReveal}>
          {i18n.t("localNotes.showAnswer")}
        </Button>
      )}
    </div>
  )
}
