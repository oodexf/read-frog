import type { LegacySubtitleEncoding } from "@/utils/subtitles/files"
import { Icon } from "@iconify/react"
import { saveAs } from "file-saver"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useId, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Label } from "@/components/ui/base-ui/label"
import { Progress } from "@/components/ui/base-ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Separator } from "@/components/ui/base-ui/separator"
import { i18n } from "@/utils/i18n"
import { getLanguageName } from "@/utils/language-labels"
import { cn } from "@/utils/styles/utils"
import {
  buildTranslatedSubtitleFileName,
  isLegacySubtitleEncoding,
  LEGACY_SUBTITLE_ENCODINGS,
  SUBTITLE_FILE_PICKER_ACCEPT,
  SUBTITLE_FILE_MIME_TYPES,
} from "@/utils/subtitles/files"
import { detectedSourceLangCodeAtom, sourceLangCodeAtom, targetLangCodeAtom } from "../atoms"
import {
  cancelSubtitleFileTranslationAtom,
  changeSubtitleFileEncodingAtom,
  setSubtitleFileAtom,
  subtitleFileAtom,
  subtitleFileDetectedSourceCodeAtom,
  subtitleFileRunStateAtom,
  subtitleFileTranslatedCountAtom,
  subtitleFileTranslationsAtom,
  subtitleOutputOptionsAtom,
  translateSubtitleFileAtom,
} from "./atoms"
import { getSubtitleEncodingLabel } from "./encoding-labels"
import { loadSubtitleFile } from "./load-subtitle-file"

const FORMAT_LABELS = { srt: "SRT", vtt: "WebVTT", ass: "ASS/SSA" } as const

/**
 * Leads every download: desktop players on Windows otherwise guess a legacy
 * code page and garble anything that isn't ASCII.
 */
const UTF8_BOM = String.fromCodePoint(0xfeff)

export function SubtitleFileInput() {
  const file = useAtomValue(subtitleFileAtom)
  return file ? <SubtitleFileCard /> : <SubtitleFileDropzone />
}

function SubtitleFileDropzone() {
  const setFile = useSetAtom(setSubtitleFileAtom)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputId = useId()

  const loadFile = async (picked: File) => {
    setError(null)
    let bytes: Uint8Array
    try {
      // Bytes, not `File.text()`: that one is UTF-8 only, and GBK subtitles are common.
      bytes = new Uint8Array(await picked.arrayBuffer())
    } catch {
      setError(i18n.t("translationHub.subtitleFile.errors.readFailed"))
      return
    }

    const result = loadSubtitleFile(picked.name, bytes)
    if ("error" in result) {
      setError(result.error)
      return
    }
    setFile(result.file)
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          const dropped = event.dataTransfer.files[0]
          if (dropped) void loadFile(dropped)
        }}
        className={cn(
          "flex h-96 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input px-6 text-center transition-colors outline-none hover:bg-muted/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon icon="tabler:file-upload" className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium">{i18n.t("translationHub.subtitleFile.dropTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {i18n.t("translationHub.subtitleFile.dropDescription")}
          </p>
        </div>
        {/* sr-only rather than hidden: a display:none input can't take focus, and
            then keyboard users have no way to open the picker. */}
        <input
          id={inputId}
          type="file"
          accept={SUBTITLE_FILE_PICKER_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0]
            // Cleared so picking the same file again after an error still fires.
            event.target.value = ""
            if (picked) void loadFile(picked)
          }}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function SubtitleFileCard() {
  const file = useAtomValue(subtitleFileAtom)!
  const setFile = useSetAtom(setSubtitleFileAtom)
  const [options, setOptions] = useAtom(subtitleOutputOptionsAtom)
  const runState = useAtomValue(subtitleFileRunStateAtom)
  const translations = useAtomValue(subtitleFileTranslationsAtom)
  const translatedCount = useAtomValue(subtitleFileTranslatedCountAtom)
  const translate = useSetAtom(translateSubtitleFileAtom)
  const cancel = useSetAtom(cancelSubtitleFileTranslationAtom)
  const sourceLangCode = useAtomValue(sourceLangCodeAtom)
  const targetLangCode = useAtomValue(targetLangCodeAtom)
  const detectedSourceLangCode = useAtomValue(detectedSourceLangCodeAtom)
  const runDetectedSourceCode = useAtomValue(subtitleFileDetectedSourceCodeAtom)
  const changeEncoding = useSetAtom(changeSubtitleFileEncodingAtom)
  const [encodingError, setEncodingError] = useState<string | null>(null)
  const optionId = useId()

  const { format, units } = file.parsed
  const total = units.length
  const pendingCount = total - translatedCount
  const isRunning = runState.status === "running"
  const effectiveSourceCode = sourceLangCode === "auto" ? runDetectedSourceCode : sourceLangCode

  const handleDownload = () => {
    const content = file.parsed.serialize(translations, options)
    const blob = new Blob([UTF8_BOM, content], {
      type: `${SUBTITLE_FILE_MIME_TYPES[format]};charset=utf-8`,
    })
    saveAs(
      blob,
      buildTranslatedSubtitleFileName(file.name, {
        sourceCode: effectiveSourceCode,
        targetCode: targetLangCode,
        mode: options.mode,
        format,
      }),
    )
  }

  const statusText = isRunning
    ? i18n.t("translationHub.subtitleFile.progress", [translatedCount, total])
    : runState.status === "error"
      ? runState.message
      : pendingCount === 0
        ? i18n.t("translationHub.subtitleFile.done", [total])
        : translatedCount > 0 || runState.status === "done"
          ? i18n.t("translationHub.subtitleFile.partial", [pendingCount])
          : null
  // Why the lines still untranslated failed, so "translate the rest" isn't a blind retry.
  const failureReason =
    runState.status === "done" && runState.errorMessage && pendingCount > 0
      ? i18n.t("translationHub.subtitleFile.failureReason", [runState.errorMessage])
      : null

  return (
    <div className="flex min-h-96 flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon icon="tabler:file-text" className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              FORMAT_LABELS[format],
              i18n.t("translationHub.subtitleFile.lineCount", [total]),
              detectedSourceLangCode && getLanguageName(detectedSourceLangCode),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setFile(null)}
          title={i18n.t("translationHub.subtitleFile.remove")}
          aria-label={i18n.t("translationHub.subtitleFile.remove")}
        >
          <Icon icon="tabler:x" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-4 p-4">
        {isLegacySubtitleEncoding(file.encoding) && (
          <EncodingRow
            encoding={file.encoding}
            disabled={isRunning}
            error={encodingError}
            onChange={(encoding) => setEncodingError(changeEncoding(encoding))}
          />
        )}
        <OptionRow label={i18n.t("translationHub.subtitleFile.output")}>
          <RadioGroup
            value={options.mode}
            onValueChange={(mode) => setOptions((prev) => ({ ...prev, mode }))}
            className="flex flex-wrap gap-x-5 gap-y-2"
          >
            <RadioOption id={`${optionId}-bilingual`} value="bilingual">
              {i18n.t("translationHub.subtitleFile.bilingual")}
            </RadioOption>
            <RadioOption id={`${optionId}-translation-only`} value="translationOnly">
              {i18n.t("translationHub.subtitleFile.translationOnly")}
            </RadioOption>
          </RadioGroup>
        </OptionRow>
        {options.mode === "bilingual" && (
          <OptionRow label={i18n.t("translationHub.subtitleFile.translationPosition")}>
            <RadioGroup
              value={options.translationFirst ? "above" : "below"}
              onValueChange={(position) =>
                setOptions((prev) => ({ ...prev, translationFirst: position === "above" }))
              }
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              <RadioOption id={`${optionId}-below`} value="below">
                {i18n.t("translationHub.subtitleFile.below")}
              </RadioOption>
              <RadioOption id={`${optionId}-above`} value="above">
                {i18n.t("translationHub.subtitleFile.above")}
              </RadioOption>
            </RadioGroup>
          </OptionRow>
        )}
      </div>

      <div className="mt-auto space-y-3 p-4">
        {(isRunning || translatedCount > 0) && (
          <Progress value={Math.round((translatedCount / total) * 100)} />
        )}
        {statusText && (
          <p
            className={cn(
              "text-sm",
              runState.status === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {statusText}
          </p>
        )}
        {failureReason && <p className="text-sm text-destructive">{failureReason}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {isRunning ? (
            <Button variant="outline" onClick={cancel}>
              {i18n.t("translationHub.subtitleFile.cancel")}
            </Button>
          ) : (
            pendingCount > 0 && (
              <Button variant={translatedCount > 0 ? "outline" : "default"} onClick={translate}>
                <Icon icon="tabler:language" />
                {translatedCount > 0
                  ? i18n.t("translationHub.subtitleFile.continue", [pendingCount])
                  : i18n.t("translationHub.subtitleFile.translate")}
              </Button>
            )
          )}
          <Button
            variant={pendingCount === 0 ? "default" : "outline"}
            onClick={handleDownload}
            disabled={translatedCount === 0 || isRunning}
          >
            <Icon icon="tabler:download" />
            {i18n.t("translationHub.subtitleFile.download")}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EncodingRow({
  encoding,
  disabled,
  error,
  onChange,
}: {
  encoding: LegacySubtitleEncoding
  disabled: boolean
  error: string | null
  onChange: (encoding: LegacySubtitleEncoding) => void
}) {
  const items = LEGACY_SUBTITLE_ENCODINGS.map((value) => ({
    value,
    label: getSubtitleEncodingLabel(value),
  }))

  return (
    <div className="space-y-2">
      <OptionRow label={i18n.t("translationHub.subtitleFile.encoding")}>
        <Select
          items={items}
          value={encoding}
          disabled={disabled}
          onValueChange={(value) => {
            if (value) onChange(value)
          }}
        >
          <SelectTrigger size="sm" className="w-60 min-w-0">
            <SelectValue className="min-w-0">
              <span className="truncate">{getSubtitleEncodingLabel(encoding)}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </OptionRow>
      {/* Nothing in a legacy file names its code page, so the guess has to be
          visible and correctable before anything garbled is sent off. */}
      <p className="flex gap-1.5 text-sm text-warning">
        <Icon icon="tabler:alert-triangle" className="mt-0.5 size-4 shrink-0" />
        {i18n.t("translationHub.subtitleFile.encodingWarning", [
          getSubtitleEncodingLabel(encoding),
        ])}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function RadioOption({
  id,
  value,
  children,
}: {
  id: string
  value: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="font-normal">
        {children}
      </Label>
    </div>
  )
}
