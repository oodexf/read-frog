import type { LocalNoteField } from "@/utils/local-notes/types"
import { cn } from "@/utils/styles/utils"

export function formatLocalNoteValue(value: LocalNoteField["value"]): string {
  return value === null ? "" : String(value)
}

/** A note's fields after the first (the card's front), each under its name. Empty ones are left out. */
export function LocalNoteBackFields({
  fields,
  className,
}: {
  fields: LocalNoteField[]
  className?: string
}) {
  const shown = fields.slice(1).filter((field) => field.value !== null)
  if (shown.length === 0) {
    return null
  }

  return (
    <dl className={cn("space-y-2", className)}>
      {shown.map((field) => (
        <div key={field.id}>
          <dt className="text-xs text-muted-foreground">{field.name}</dt>
          <dd className="text-sm whitespace-pre-wrap text-foreground">
            {formatLocalNoteValue(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
