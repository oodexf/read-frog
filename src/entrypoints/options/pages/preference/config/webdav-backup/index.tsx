import type { WebdavBackupSettings } from "@/utils/webdav/backup"
import type { WebdavFile } from "@/utils/webdav/client"
import { Icon } from "@iconify/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
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
import { Button } from "@/components/ui/base-ui/button"
import { ButtonGroup } from "@/components/ui/base-ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/base-ui/empty"
import { Input } from "@/components/ui/base-ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/base-ui/item"
import { Label } from "@/components/ui/base-ui/label"
import { Spinner } from "@/components/ui/base-ui/spinner"
import { Switch } from "@/components/ui/base-ui/switch"
import { toastManager } from "@/components/ui/base-ui/toast"
import { ConfigDetailSection } from "@/entrypoints/options/components/config-detail-section"
import { ConfigItem } from "@/entrypoints/options/components/config-item"
import { PageLayout } from "@/entrypoints/options/components/page-layout"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { addBackup } from "@/utils/backup/storage"
import { EXTENSION_VERSION } from "@/utils/constants/app"
import { replaceGlossary } from "@/utils/glossary/sync/local-store"
import { i18n } from "@/utils/i18n"
import { queryClient } from "@/utils/tanstack-query"
import {
  createWebdavBackup,
  deleteWebdavBackup,
  downloadWebdavBackup,
  getWebdavBackupSettings,
  isWebdavConfigured,
  listWebdavBackups,
  MAX_WEBDAV_BACKUPS_LIMIT,
  prepareWebdavRestore,
  setWebdavBackupSettings,
} from "@/utils/webdav/backup"
import { ensureFolder, normalizeFolderUrl } from "@/utils/webdav/client"
import { useGlossaryInvalidation } from "../../../advanced/glossary/use-glossary"

const SETTINGS_QUERY_KEY = ["webdav-backup-settings"] as const
const LIST_QUERY_KEY = ["webdav-backups"] as const

function errorDescription(error: unknown) {
  return error instanceof Error ? error.message : undefined
}

export function WebdavBackupPage() {
  const { data: settings } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getWebdavBackupSettings,
  })

  return (
    <PageLayout
      title={i18n.t("options.preference.title")}
      description={i18n.t("options.preference.pageDescription")}
    >
      <ConfigDetailSection
        backTo="/preference"
        title={<span id="webdav-backup">{i18n.t("options.preference.config.webdav.title")}</span>}
      >
        {settings ? (
          <div className="space-y-8">
            {/* Keyed on the stored settings, so the form starts over after a save elsewhere. */}
            <SettingsForm key={JSON.stringify(settings)} saved={settings} />
            {isWebdavConfigured(settings) && <RemoteBackups settings={settings} />}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Spinner />
          </div>
        )}
      </ConfigDetailSection>
    </PageLayout>
  )
}

function SettingsForm({ saved }: { saved: WebdavBackupSettings }) {
  const [draft, setDraft] = useState(saved)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const update = <K extends keyof WebdavBackupSettings>(key: K, value: WebdavBackupSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const validate = () => {
    const url = normalizeFolderUrl(draft.url)
    const maxBackups = Math.min(
      MAX_WEBDAV_BACKUPS_LIMIT,
      Math.max(1, Math.floor(draft.maxBackups || 1)),
    )
    return { ...draft, url, maxBackups }
  }

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const next = validate()
      await setWebdavBackupSettings(next)
      return next
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
      toastManager.add({
        type: "success",
        title: i18n.t("options.preference.config.webdav.saveSuccess"),
      })
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: i18n.t("options.preference.config.webdav.invalidUrl"),
        description: errorDescription(error),
      })
    },
  })

  const { mutate: testConnection, isPending: isTesting } = useMutation({
    mutationFn: async () => ensureFolder(validate()),
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: i18n.t("options.preference.config.webdav.testSuccess"),
      })
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: i18n.t("options.preference.config.webdav.testError"),
        description: errorDescription(error),
      })
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {i18n.t("options.preference.config.webdav.description")}
      </p>
      <div className="grid gap-2">
        <Label htmlFor="webdav-url">{i18n.t("options.preference.config.webdav.url")}</Label>
        <Input
          id="webdav-url"
          type="url"
          required
          placeholder="https://dav.example.com/read-frog/"
          value={draft.url}
          onChange={(event) => update("url", event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {i18n.t("options.preference.config.webdav.urlHint")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="webdav-username">
            {i18n.t("options.preference.config.webdav.username")}
          </Label>
          <Input
            id="webdav-username"
            autoComplete="username"
            value={draft.username}
            onChange={(event) => update("username", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="webdav-password">
            {i18n.t("options.preference.config.webdav.password")}
          </Label>
          <Input
            id="webdav-password"
            type="password"
            autoComplete="current-password"
            value={draft.password}
            onChange={(event) => update("password", event.target.value)}
          />
        </div>
      </div>
      <ConfigItem
        title={i18n.t("options.preference.config.webdav.includeApiKeys")}
        description={i18n.t("options.preference.config.webdav.includeApiKeysDescription")}
      >
        <Switch
          checked={draft.includeApiKeys}
          onCheckedChange={(checked) => update("includeApiKeys", checked)}
        />
      </ConfigItem>
      <ConfigItem
        title={i18n.t("options.preference.config.webdav.maxBackups")}
        description={i18n.t("options.preference.config.webdav.maxBackupsDescription")}
      >
        <Input
          type="number"
          min={1}
          max={MAX_WEBDAV_BACKUPS_LIMIT}
          className="w-24"
          value={draft.maxBackups}
          onChange={(event) => update("maxBackups", Number(event.target.value))}
        />
      </ConfigItem>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isTesting || !draft.url.trim()}
          onClick={() => testConnection()}
        >
          {isTesting ? <Spinner /> : <Icon icon="tabler:plug-connected" />}
          {i18n.t("options.preference.config.webdav.test")}
        </Button>
        <Button type="submit" size="sm" disabled={isSaving || !isDirty}>
          {isSaving ? <Spinner /> : <Icon icon="tabler:device-floppy" />}
          {i18n.t("options.preference.config.webdav.save")}
        </Button>
      </div>
    </form>
  )
}

function RemoteBackups({ settings }: { settings: WebdavBackupSettings }) {
  const config = useAtomValue(configAtom)
  const {
    data: backups,
    isPending,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [...LIST_QUERY_KEY, settings],
    queryFn: () => listWebdavBackups(settings),
    retry: false,
  })

  const { mutate: backupNow, isPending: isBackingUp } = useMutation({
    mutationFn: () => createWebdavBackup(settings, config),
    onSuccess: ({ glossaryFailed, pruneFailed }) => {
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
      const warnings = [
        glossaryFailed && i18n.t("options.preference.config.manualSync.exportGlossaryFailed"),
        pruneFailed && i18n.t("options.preference.config.webdav.pruneFailed"),
      ].filter(Boolean)
      toastManager.add({
        type: warnings.length > 0 ? "warning" : "success",
        title: i18n.t("options.preference.config.webdav.backupSuccess"),
        description: warnings.length > 0 ? warnings.join(" ") : undefined,
      })
    },
    onError: (backupError) => {
      toastManager.add({
        type: "error",
        title: i18n.t("options.preference.config.webdav.backupError"),
        description: errorDescription(backupError),
      })
    },
  })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {i18n.t("options.preference.config.webdav.remoteBackups")}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            <Icon icon="tabler:refresh" />
            {i18n.t("options.preference.config.webdav.refresh")}
          </Button>
          <Button size="sm" disabled={isBackingUp} onClick={() => backupNow()}>
            {isBackingUp ? <Spinner /> : <Icon icon="tabler:cloud-upload" />}
            {i18n.t("options.preference.config.webdav.backupNow")}
          </Button>
        </div>
      </div>

      {isPending && (
        <div className="py-6 text-center text-muted-foreground">
          <Spinner />
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive">
          {i18n.t("options.preference.config.webdav.listError")} {errorDescription(error)}
        </p>
      )}
      {backups?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{i18n.t("options.preference.config.webdav.empty")}</EmptyTitle>
            <EmptyDescription>
              {i18n.t("options.preference.config.webdav.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {backups?.map((file) => (
        <RemoteBackupItem key={file.name} file={file} settings={settings} />
      ))}
    </section>
  )
}

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function RemoteBackupItem({
  file,
  settings,
}: {
  file: WebdavFile
  settings: WebdavBackupSettings
}) {
  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>{file.lastModified?.toLocaleString() ?? file.name}</ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-4 text-xs">
          <span className="break-all">{file.name}</span>
          {file.size !== null && <span>{formatSize(file.size)}</span>}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ButtonGroup>
          <RestoreButton file={file} settings={settings} />
          <DeleteButton file={file} settings={settings} />
        </ButtonGroup>
      </ItemActions>
    </Item>
  )
}

function RestoreButton({ file, settings }: { file: WebdavFile; settings: WebdavBackupSettings }) {
  const [open, setOpen] = useState(false)
  const currentConfig = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const invalidateGlossary = useGlossaryInvalidation()

  const { mutate: restore, isPending } = useMutation({
    mutationFn: async () => {
      const content = await downloadWebdavBackup(settings, file.name)
      // Everything is checked before the first write, so a file that cannot be restored in
      // full changes nothing.
      const prepared = await prepareWebdavRestore(content, currentConfig)

      await addBackup(currentConfig, EXTENSION_VERSION)
      await setConfig(prepared.config)
      if (prepared.glossary) {
        const replaced = await replaceGlossary(prepared.glossary)
        if (!replaced.ok) throw new Error(i18n.t("options.preference.config.webdav.glossaryError"))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["config-backups"] })
      void invalidateGlossary()
      toastManager.add({
        type: "success",
        title: i18n.t("options.preference.config.webdav.restoreSuccess"),
      })
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: i18n.t("options.preference.config.webdav.restoreError"),
        description: errorDescription(error),
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isPending} />}>
        {isPending ? <Spinner /> : <Icon icon="tabler:restore" />}
        {i18n.t("options.preference.config.backup.item.restore")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {i18n.t("options.preference.config.webdav.restoreTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {i18n.t("options.preference.config.webdav.restoreDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {i18n.t("options.preference.config.backup.restore.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() => restore(undefined, { onSettled: () => setOpen(false) })}
          >
            {i18n.t("options.preference.config.backup.restore.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteButton({ file, settings }: { file: WebdavFile; settings: WebdavBackupSettings }) {
  const [open, setOpen] = useState(false)
  const { mutate: remove, isPending } = useMutation({
    mutationFn: () => deleteWebdavBackup(settings, file.name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: i18n.t("options.preference.config.webdav.deleteError"),
        description: errorDescription(error),
      })
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            disabled={isPending}
            aria-label={i18n.t("options.preference.config.backup.item.delete")}
          />
        }
      >
        {isPending ? <Spinner /> : <Icon icon="tabler:trash" />}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {i18n.t("options.preference.config.webdav.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {i18n.t("options.preference.config.webdav.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {i18n.t("options.preference.config.backup.delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() => remove(undefined, { onSettled: () => setOpen(false) })}
          >
            {i18n.t("options.preference.config.backup.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
