import type { LocalNoteRecord } from "@/utils/local-notes/types"
import { Icon } from "@iconify/react"
import { IconTrash } from "@tabler/icons-react"
import { useMemo, useState } from "react"
import { Link } from "react-router"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/base-ui/alert-dialog"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button, buttonVariants } from "@/components/ui/base-ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/base-ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { i18n } from "@/utils/i18n"
import { formatLocalNotesCsv } from "@/utils/local-notes/build"
import { isDue } from "@/utils/local-notes/scheduler"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"
import { formatLocalNoteValue, LocalNoteBackFields } from "./note-fields"
import {
  useDeleteAllLocalNotes,
  useDeleteLocalNote,
  useDueLocalNotesCount,
  useLocalNotes,
} from "./use-local-notes"

const ALL_ACTIONS = "__all__"
const UTF8_BOM = "﻿"

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatDue(note: LocalNoteRecord, now: Date): string {
  return isDue(note, now)
    ? i18n.t("localNotes.dueNow")
    : i18n.t("localNotes.dueOn", [note.due.toLocaleDateString()])
}

function LocalNoteItem({ note, now }: { note: LocalNoteRecord; now: Date }) {
  const { mutate: deleteNote, isPending } = useDeleteLocalNote()

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-medium break-words text-foreground">
          {formatLocalNoteValue(note.fields[0]?.value ?? null)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          title={i18n.t("localNotes.delete")}
          aria-label={i18n.t("localNotes.delete")}
          disabled={isPending}
          onClick={() => deleteNote(note.id)}
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
      <LocalNoteBackFields fields={note.fields} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{note.actionName}</Badge>
        <span>{formatDue(note, now)}</span>
        {note.sourceUrl && (
          <a
            href={note.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={note.sourceUrl}
            className="inline-flex max-w-72 items-center gap-1 truncate hover:text-foreground hover:underline"
          >
            <Icon icon="tabler:external-link" className="size-3.5 shrink-0" />
            <span className="truncate">{note.sourceTitle || i18n.t("localNotes.openSource")}</span>
          </a>
        )}
      </div>
    </li>
  )
}

function DeleteAllButton({ disabled }: { disabled: boolean }) {
  const { mutateAsync: deleteAll, isPending } = useDeleteAllLocalNotes()
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="destructive" size="sm" disabled={disabled || isPending} />}
      >
        <IconTrash className="size-4" />
        {i18n.t("localNotes.deleteAll")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.t("localNotes.deleteAll")}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.t("localNotes.deleteAllConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.t("localNotes.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              void deleteAll().finally(() => setOpen(false))
            }}
          >
            {i18n.t("localNotes.deleteAll")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The local-only build's stand-in for Notebase: every note saved from the
 * selection toolbar, newest first, with what it said and when it is next due.
 */
export function LocalNotesPage() {
  const { data: notes = [] } = useLocalNotes()
  const { data: dueCount = 0 } = useDueLocalNotesCount()
  const [actionFilter, setActionFilter] = useState<string>(ALL_ACTIONS)
  // When the page opened; the due labels are a snapshot, the review count refreshes itself.
  const [now] = useState(() => new Date())

  const actions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const note of notes) {
      if (!byId.has(note.actionId)) {
        byId.set(note.actionId, note.actionName)
      }
    }
    return [...byId].map(([id, name]) => ({ id, name }))
  }, [notes])

  const visibleNotes =
    actionFilter === ALL_ACTIONS ? notes : notes.filter((note) => note.actionId === actionFilter)

  return (
    <PageLayout
      title={i18n.t("localNotes.title")}
      description={i18n.t("localNotes.pageDescription")}
      innerClassName="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/notes/review"
          aria-disabled={dueCount === 0}
          className={cn(
            buttonVariants({ variant: "brand", size: "sm" }),
            dueCount === 0 && "pointer-events-none opacity-50",
          )}
        >
          <Icon icon="tabler:cards" />
          {dueCount > 0
            ? i18n.t("localNotes.reviewWithCount", [dueCount])
            : i18n.t("localNotes.review")}
        </Link>
        <Select
          value={actionFilter}
          onValueChange={(value) => setActionFilter(value ?? ALL_ACTIONS)}
        >
          <SelectTrigger size="sm" className="max-w-60">
            <SelectValue>
              {actionFilter === ALL_ACTIONS
                ? i18n.t("localNotes.allActions")
                : (actions.find((action) => action.id === actionFilter)?.name ?? "")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_ACTIONS}>{i18n.t("localNotes.allActions")}</SelectItem>
              {actions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={visibleNotes.length === 0}
            onClick={() =>
              download(
                UTF8_BOM + formatLocalNotesCsv(visibleNotes),
                "read-frog-notes.csv",
                "text/csv;charset=utf-8",
              )
            }
          >
            <Icon icon="tabler:file-export" />
            {i18n.t("localNotes.exportCsv")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={visibleNotes.length === 0}
            onClick={() =>
              download(
                JSON.stringify(visibleNotes, null, 2),
                "read-frog-notes.json",
                "application/json",
              )
            }
          >
            <Icon icon="tabler:braces" />
            {i18n.t("localNotes.exportJson")}
          </Button>
          <DeleteAllButton disabled={notes.length === 0} />
        </div>
      </div>

      {notes.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>{i18n.t("localNotes.empty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {i18n.t("localNotes.count", [visibleNotes.length])}
          </p>
          <ul className="space-y-3">
            {visibleNotes.map((note) => (
              <LocalNoteItem key={note.id} note={note} now={now} />
            ))}
          </ul>
        </>
      )}
    </PageLayout>
  )
}
