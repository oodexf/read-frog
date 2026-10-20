import type { WebdavBackupSettings } from "../backup"
// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isAPIProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  buildBackupContent,
  buildBackupFileName,
  createWebdavBackup,
  prepareWebdavRestore,
  restoreMissingApiKeys,
  selectBackupsToPrune,
} from "../backup"

vi.mock("@/utils/glossary/sync/local-store", () => ({
  readLocalGlossary: vi.fn<() => Promise<{ glossaries: never[]; terms: never[] }>>(async () => ({
    glossaries: [],
    terms: [],
  })),
  checkGlossaryCaps: vi.fn<() => null>(() => null),
}))

const settings: WebdavBackupSettings = {
  url: "https://dav.example.com/read-frog/",
  username: "frog",
  password: "secret",
  includeApiKeys: false,
  maxBackups: 2,
}

function configWithOpenAiKey(apiKey: string): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  config.providersConfig = config.providersConfig.map((provider) =>
    provider.id === "openai-default" ? { ...provider, apiKey } : provider,
  )
  return config
}

function openAiKey(config: Config) {
  const provider = config.providersConfig.find((item) => item.id === "openai-default")
  return provider && isAPIProviderConfig(provider) ? provider.apiKey : undefined
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buildBackupFileName", () => {
  it("is safe for any server and sorts in time order", () => {
    const earlier = buildBackupFileName(new Date("2026-10-18T08:30:00.000Z"))
    const later = buildBackupFileName(new Date("2026-10-18T10:05:00.000Z"))

    expect(earlier).toBe("read-frog-backup-2026-10-18T08-30-00-000Z.json")
    expect([later, earlier].sort()).toEqual([earlier, later])
  })
})

describe("buildBackupContent", () => {
  it("drops API keys unless asked to keep them", () => {
    const config = configWithOpenAiKey("sk-test")

    expect(buildBackupContent({ config, includeApiKeys: false })).not.toContain("sk-test")
    expect(buildBackupContent({ config, includeApiKeys: true })).toContain("sk-test")
  })
})

describe("selectBackupsToPrune", () => {
  it("returns the oldest backups past the limit and ignores other files", () => {
    const files = ["2026-01", "2026-03", "2026-02"].map((stamp) => ({
      name: `read-frog-backup-${stamp}.json`,
      size: null,
      lastModified: null,
    }))
    files.push({ name: "notes.txt", size: null, lastModified: null })

    expect(selectBackupsToPrune(files, 2).map((file) => file.name)).toEqual([
      "read-frog-backup-2026-01.json",
    ])
    expect(selectBackupsToPrune(files, 0)).toHaveLength(2)
  })
})

describe("restoreMissingApiKeys", () => {
  it("keeps the current key for a provider the backup holds without one", () => {
    const restored = restoreMissingApiKeys(
      structuredClone(DEFAULT_CONFIG),
      configWithOpenAiKey("sk-current"),
    )

    expect(openAiKey(restored)).toBe("sk-current")
  })

  it("prefers the key the backup carries", () => {
    const restored = restoreMissingApiKeys(
      configWithOpenAiKey("sk-backup"),
      configWithOpenAiKey("sk-current"),
    )

    expect(openAiKey(restored)).toBe("sk-backup")
  })
})

describe("prepareWebdavRestore", () => {
  it("reads back what a backup wrote, keeping the current API keys", async () => {
    const content = buildBackupContent({
      config: configWithOpenAiKey("sk-old"),
      includeApiKeys: false,
    })

    const prepared = await prepareWebdavRestore(content, configWithOpenAiKey("sk-current"))

    expect(openAiKey(prepared.config)).toBe("sk-current")
    expect(prepared.glossary).toBeNull()
  })

  it("refuses a file with no schema version", async () => {
    await expect(
      prepareWebdavRestore(JSON.stringify({ config: DEFAULT_CONFIG }), DEFAULT_CONFIG),
    ).rejects.toThrow("schemaVersion")
  })
})

describe("createWebdavBackup", () => {
  it("uploads a backup and deletes the ones past the limit", async () => {
    const listing = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/read-frog/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  ${["2026-10-16", "2026-10-17", "2026-10-18"]
    .map(
      (stamp) => `<d:response><d:href>/read-frog/read-frog-backup-${stamp}.json</d:href>
    <d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>`,
    )
    .join("\n")}
</d:multistatus>`
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "PROPFIND") {
        const depth = (init.headers as Record<string, string>).Depth
        return new Response(depth === "1" ? listing : null, { status: 207 })
      }
      return new Response(null, { status: init?.method === "PUT" ? 201 : 204 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await createWebdavBackup(
      settings,
      configWithOpenAiKey("sk-test"),
      new Date("2026-10-18T09:00:00.000Z"),
    )

    expect(result).toEqual({
      fileName: "read-frog-backup-2026-10-18T09-00-00-000Z.json",
      glossaryFailed: false,
      pruneFailed: false,
    })
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!
    expect(put[0]).toBe(
      "https://dav.example.com/read-frog/read-frog-backup-2026-10-18T09-00-00-000Z.json",
    )
    expect(put[1]!.body).not.toContain("sk-test")
    expect(put[1]!.body).toContain('"glossary"')
    const deleted = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => url)
    expect(deleted).toEqual(["https://dav.example.com/read-frog/read-frog-backup-2026-10-16.json"])
  })
})
