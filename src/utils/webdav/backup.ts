import type { WebdavCredentials, WebdavFile } from "./client"
import type { Config } from "@/types/config/config"
import type { GlossarySyncDocument } from "@/utils/glossary/sync/document"
import { storage } from "#imports"
import { isAPIProviderConfig } from "@/types/config/provider"
import { getObjectWithoutAPIKeys } from "@/utils/config/api"
import { migrateConfig } from "@/utils/config/migration"
import { CONFIG_SCHEMA_VERSION } from "@/utils/constants/config"
import { MAX_GLOSSARIES, MAX_GLOSSARY_TERMS } from "@/utils/constants/glossary"
import { buildGlossaryDocument, readGlossaryDocument } from "@/utils/glossary/sync/document"
import { checkGlossaryCaps, readLocalGlossary } from "@/utils/glossary/sync/local-store"
import { i18n } from "@/utils/i18n"
import { logger } from "@/utils/logger"
import { deleteFile, ensureFolder, getFile, listFiles, putFile } from "./client"

/**
 * Kept apart from the config on purpose: the config is exported, backed up and synced to Google
 * Drive, and a WebDAV password has no business riding along to any of those.
 */
const WEBDAV_BACKUP_SETTINGS_KEY = "local:webdavBackupSettings"

export const BACKUP_FILE_PREFIX = "read-frog-backup-"
const BACKUP_FILE_SUFFIX = ".json"

export const DEFAULT_MAX_WEBDAV_BACKUPS = 10
export const MAX_WEBDAV_BACKUPS_LIMIT = 100

export interface WebdavBackupSettings extends WebdavCredentials {
  includeApiKeys: boolean
  /** Older backups past this count are deleted after each upload. */
  maxBackups: number
}

export const DEFAULT_WEBDAV_BACKUP_SETTINGS: WebdavBackupSettings = {
  url: "",
  username: "",
  password: "",
  includeApiKeys: false,
  maxBackups: DEFAULT_MAX_WEBDAV_BACKUPS,
}

export async function getWebdavBackupSettings(): Promise<WebdavBackupSettings> {
  const stored = await storage.getItem<Partial<WebdavBackupSettings>>(WEBDAV_BACKUP_SETTINGS_KEY)
  return { ...DEFAULT_WEBDAV_BACKUP_SETTINGS, ...stored }
}

export async function setWebdavBackupSettings(settings: WebdavBackupSettings): Promise<void> {
  await storage.setItem<WebdavBackupSettings>(WEBDAV_BACKUP_SETTINGS_KEY, settings)
}

export function isWebdavConfigured(settings: WebdavCredentials): boolean {
  return settings.url.trim().length > 0
}

/** `read-frog-backup-2026-10-18T08-30-00-000Z.json`: sorts by name in time order. */
export function buildBackupFileName(date: Date): string {
  return `${BACKUP_FILE_PREFIX}${date.toISOString().replaceAll(":", "-").replaceAll(".", "-")}${BACKUP_FILE_SUFFIX}`
}

function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX)
}

/**
 * The same shape the manual export writes, so a file from either route can be imported by
 * either: `{ config, schemaVersion, glossary? }`.
 */
export function buildBackupContent({
  config,
  includeApiKeys,
  glossary,
}: {
  config: Config
  includeApiKeys: boolean
  glossary?: ReturnType<typeof buildGlossaryDocument>
}): string {
  return JSON.stringify(
    {
      config: includeApiKeys ? config : getObjectWithoutAPIKeys(config),
      schemaVersion: CONFIG_SCHEMA_VERSION,
      ...(glossary ? { glossary } : {}),
    },
    null,
    2,
  )
}

/** Newest first. */
export async function listWebdavBackups(settings: WebdavCredentials): Promise<WebdavFile[]> {
  const files = await listFiles(settings)
  return files
    .filter((file) => isBackupFile(file.name))
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** The backups past `maxBackups`, oldest last — the ones an upload should delete. */
export function selectBackupsToPrune(files: readonly WebdavFile[], maxBackups: number) {
  const keep = Math.max(1, Math.floor(maxBackups))
  return [...files]
    .filter((file) => isBackupFile(file.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(keep)
}

export interface WebdavBackupResult {
  fileName: string
  /** The glossary could not be read, so the backup holds the settings alone. */
  glossaryFailed: boolean
  /** Old backups could not be cleaned up; the new one was still written. */
  pruneFailed: boolean
}

export async function createWebdavBackup(
  settings: WebdavBackupSettings,
  config: Config,
  now = new Date(),
): Promise<WebdavBackupResult> {
  // Best effort, like the manual export: a glossary database that will not open must not stop
  // the settings from getting out — but the result says so.
  let glossary: ReturnType<typeof buildGlossaryDocument> | undefined
  let glossaryFailed = false
  try {
    glossary = buildGlossaryDocument(await readLocalGlossary())
  } catch (error) {
    glossaryFailed = true
    logger.error("Could not read the glossary for the WebDAV backup", error)
  }

  await ensureFolder(settings)
  const fileName = buildBackupFileName(now)
  await putFile(
    settings,
    fileName,
    buildBackupContent({ config, includeApiKeys: settings.includeApiKeys, glossary }),
  )

  let pruneFailed = false
  try {
    const stale = selectBackupsToPrune(await listWebdavBackups(settings), settings.maxBackups)
    for (const file of stale) {
      await deleteFile(settings, file.name)
    }
  } catch (error) {
    pruneFailed = true
    logger.warn("Could not delete old WebDAV backups", error)
  }

  return { fileName, glossaryFailed, pruneFailed }
}

/**
 * Puts back the API keys a backup made without them would otherwise wipe: a provider the backup
 * holds with no key keeps the key the same provider has right now.
 */
export function restoreMissingApiKeys(restored: Config, current: Config): Config {
  const currentKeys = new Map<string, string>()
  for (const provider of current.providersConfig) {
    if (isAPIProviderConfig(provider) && provider.apiKey) {
      currentKeys.set(provider.id, provider.apiKey)
    }
  }

  return {
    ...restored,
    providersConfig: restored.providersConfig.map((provider) => {
      if (!isAPIProviderConfig(provider) || provider.apiKey) return provider
      const apiKey = currentKeys.get(provider.id)
      return apiKey ? { ...provider, apiKey } : provider
    }),
  }
}

export interface PreparedWebdavRestore {
  config: Config
  glossary: GlossarySyncDocument | null
}

/**
 * Reads, migrates and checks a backup file without writing anything, so a file that cannot be
 * restored in full is refused before the settings are touched — the same three refusals the
 * manual import makes.
 */
export async function prepareWebdavRestore(
  content: string,
  currentConfig: Config,
): Promise<PreparedWebdavRestore> {
  const parsed = JSON.parse(content) as {
    schemaVersion?: unknown
    config?: unknown
    glossary?: unknown
  }

  if (typeof parsed.schemaVersion !== "number" || !Number.isInteger(parsed.schemaVersion)) {
    throw new TypeError("Invalid config schemaVersion")
  }
  if (parsed.config === undefined) {
    throw new TypeError("Missing config payload")
  }

  const config = restoreMissingApiKeys(
    await migrateConfig(parsed.config, parsed.schemaVersion),
    currentConfig,
  )

  const glossary = parsed.glossary === undefined ? null : readGlossaryDocument(parsed.glossary)
  if (glossary && !glossary.ok) {
    throw new Error(
      glossary.reason === "version-too-new"
        ? i18n.t("options.preference.config.manualSync.glossaryVersionTooNew")
        : i18n.t("options.preference.config.manualSync.glossaryMalformed"),
    )
  }

  const overflow = glossary?.ok ? checkGlossaryCaps(glossary.document) : null
  if (overflow) {
    throw new Error(
      i18n.t("options.preference.config.manualSync.glossaryCapExceeded", [
        String(overflow.overflowBy),
        String(overflow.reason === "termCapExceeded" ? MAX_GLOSSARY_TERMS : MAX_GLOSSARIES),
      ]),
    )
  }

  return { config, glossary: glossary?.ok ? glossary.document : null }
}

export async function downloadWebdavBackup(
  settings: WebdavCredentials,
  fileName: string,
): Promise<string> {
  return getFile(settings, fileName)
}

export async function deleteWebdavBackup(
  settings: WebdavCredentials,
  fileName: string,
): Promise<void> {
  await deleteFile(settings, fileName)
}
