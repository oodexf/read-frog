import type { ReviewSession } from "@/utils/local-notes/review-session"
import type { LocalNoteRecord, LocalNoteReviewGrade } from "@/utils/local-notes/types"
import { Icon } from "@iconify/react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { Button, buttonVariants } from "@/components/ui/base-ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/base-ui/empty"
import { i18n } from "@/utils/i18n"
import { listDueLocalNotes } from "@/utils/local-notes/repository"
import {
  completeReview,
  promoteDueCards,
  startReviewSession,
} from "@/utils/local-notes/review-session"
import {
  formatReviewInterval,
  previewReviewIntervals,
  REVIEW_GRADES,
} from "@/utils/local-notes/scheduler"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"
import { formatLocalNoteValue, LocalNoteBackFields } from "./note-fields"
import { useReviewLocalNote } from "./use-local-notes"

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
  const [session, setSession] = useState<ReviewSession | null>(null)
  // Ticks while a learning card waits, to bring it back once due and show the countdown.
  const [now, setNow] = useState(() => new Date())
  const [revealed, setRevealed] = useState(false)
  const { mutateAsync: review, isPending } = useReviewLocalNote()

  useEffect(() => {
    let cancelled = false
    void listDueLocalNotes().then((notes) => {
      if (!cancelled) {
        setSession(startReviewSession(notes))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hasWaiting = (session?.waiting.length ?? 0) > 0
  useEffect(() => {
    const timer = hasWaiting
      ? window.setInterval(() => {
          const tick = new Date()
          setNow(tick)
          setSession((previous) => previous && promoteDueCards(previous, tick))
        }, 1_000)
      : undefined
    return () => window.clearInterval(timer)
  }, [hasWaiting])

  const current = session?.ready[0]

  const grade = async (value: LocalNoteReviewGrade) => {
    if (!current || isPending) {
      return
    }
    const next = await review({ id: current.id, grade: value })
    const gradedAt = new Date()
    setRevealed(false)
    setNow(gradedAt)
    setSession((previous) => previous && completeReview(previous, next, gradedAt))
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

  if (session === null) {
    return null
  }
  const remaining = session.ready.length + session.waiting.length
  const nextWaiting = session.waiting[0]

  return (
    <PageLayout
      title={i18n.t("localNotes.review")}
      description={i18n.t("localNotes.reviewDescription")}
      innerClassName="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-2">
        <BackToNotesLink />
        {remaining > 0 && (
          <span className="text-sm text-muted-foreground">
            {i18n.t("localNotes.remaining", [remaining])}
          </span>
        )}
      </div>

      {!current && nextWaiting ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {i18n.t("localNotes.nextCardIn", [
                formatReviewInterval(Math.max(0, nextWaiting.due.getTime() - now.getTime())),
              ])}
            </EmptyTitle>
            <EmptyDescription>{i18n.t("localNotes.waitingDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !current ? (
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
