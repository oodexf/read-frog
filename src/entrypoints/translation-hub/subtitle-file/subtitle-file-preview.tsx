import type { SubtitleUnit } from "@/utils/subtitles/files"
import { Icon } from "@iconify/react"
import { useAtomValue } from "jotai"
import { memo } from "react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/base-ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/base-ui/table"
import { i18n } from "@/utils/i18n"
import { formatTimestamp } from "@/utils/subtitles/transcript"
import { subtitleFileAtom, subtitleFileTranslationsAtom } from "./atoms"

export function SubtitleFilePreview() {
  const file = useAtomValue(subtitleFileAtom)
  const translations = useAtomValue(subtitleFileTranslationsAtom)

  if (!file) {
    return (
      <Empty className="h-96 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon="tabler:file-text" className="size-6" />
          </EmptyMedia>
          <EmptyTitle>{i18n.t("translationHub.subtitleFile.previewEmpty")}</EmptyTitle>
          <EmptyDescription>
            {i18n.t("translationHub.subtitleFile.previewEmptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="h-96 overflow-auto rounded-lg border">
      <Table className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-20">{i18n.t("translationHub.subtitleFile.time")}</TableHead>
            <TableHead>{i18n.t("translationHub.subtitleFile.original")}</TableHead>
            <TableHead>{i18n.t("translationHub.subtitleFile.translation")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {file.parsed.units.map((unit, index) => (
            <PreviewRow
              // oxlint-disable-next-line react/no-array-index-key -- units never reorder within a file
              key={index}
              unit={unit}
              translation={translations[index] ?? ""}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Memoized: a long track re-renders on every batch, and only five rows change each time. */
const PreviewRow = memo(function PreviewRow({
  unit,
  translation,
}: {
  unit: SubtitleUnit
  translation: string
}) {
  return (
    <TableRow>
      <TableCell className="align-top text-xs text-muted-foreground tabular-nums">
        {formatTimestamp(unit.start)}
      </TableCell>
      <TableCell className="align-top whitespace-pre-wrap">{unit.text}</TableCell>
      <TableCell className="align-top whitespace-pre-wrap">
        {translation || <span className="text-muted-foreground/60">—</span>}
      </TableCell>
    </TableRow>
  )
})
