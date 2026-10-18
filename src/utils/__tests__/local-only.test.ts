import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createLocalOnlyFetch,
  getOfficialServiceTargets,
  installLocalOnlyFetchGuard,
  isOfficialServiceUrl,
  LocalOnlyBlockedError,
} from "../local-only"

const mockEnv = vi.hoisted(() => ({
  WXT_API_URL: "https://api.readfrog.app",
  WXT_WEBSITE_URL: "https://www.readfrog.app",
  WXT_OFFICIAL_SITE_ORIGINS: ["https://readfrog.app", "https://www.readfrog.app"],
  WXT_AUTH_COOKIE_DOMAINS: ["readfrog.app"],
  WXT_LOCAL_ONLY: false,
}))

vi.mock("@/env", () => ({ env: mockEnv }))

const targets = getOfficialServiceTargets()

describe("isOfficialServiceUrl", () => {
  it("matches the configured official origins", () => {
    expect(isOfficialServiceUrl("https://api.readfrog.app/api/rpc", targets)).toBe(true)
    expect(isOfficialServiceUrl("https://www.readfrog.app/api/blog/latest", targets)).toBe(true)
    expect(isOfficialServiceUrl(new URL("https://readfrog.app/"), targets)).toBe(true)
  })

  it("matches every subdomain of the official domain", () => {
    expect(isOfficialServiceUrl("https://feedback.readfrog.app/en", targets)).toBe(true)
  })

  it("leaves other hosts alone, including lookalikes", () => {
    expect(isOfficialServiceUrl("https://api.openai.com/v1/chat/completions", targets)).toBe(false)
    expect(isOfficialServiceUrl("https://edge.microsoft.com/translate", targets)).toBe(false)
    expect(isOfficialServiceUrl("https://notreadfrog.app/", targets)).toBe(false)
    expect(isOfficialServiceUrl("https://readfrog.app.example.com/", targets)).toBe(false)
  })

  it("treats relative urls as not official", () => {
    expect(isOfficialServiceUrl("/assets/icon.png", targets)).toBe(false)
  })

  it("never matches localhost as a domain, so local models keep working", () => {
    mockEnv.WXT_AUTH_COOKIE_DOMAINS = ["localhost"]
    try {
      const localTargets = getOfficialServiceTargets()
      expect(localTargets.domains).toEqual([])
      expect(isOfficialServiceUrl("http://localhost:11434/api/chat", localTargets)).toBe(false)
    } finally {
      mockEnv.WXT_AUTH_COOKIE_DOMAINS = ["readfrog.app"]
    }
  })
})

describe("createLocalOnlyFetch", () => {
  it("refuses official requests without calling the network", async () => {
    const baseFetch = vi.fn<typeof fetch>()
    const guardedFetch = createLocalOnlyFetch(baseFetch, targets)

    await expect(guardedFetch("https://api.readfrog.app/api/auth/get-session")).rejects.toThrow(
      LocalOnlyBlockedError,
    )
    await expect(
      guardedFetch(new Request("https://www.readfrog.app/api/blog/latest")),
    ).rejects.toBeInstanceOf(TypeError)
    expect(baseFetch).not.toHaveBeenCalled()
  })

  it("passes every other request through unchanged", async () => {
    const response = new Response("ok")
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(response)
    const guardedFetch = createLocalOnlyFetch(baseFetch, targets)
    const init = { method: "POST", body: "{}" }

    await expect(guardedFetch("https://api.openai.com/v1/responses", init)).resolves.toBe(response)
    expect(baseFetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", init)
  })
})

describe("installLocalOnlyFetchGuard", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockEnv.WXT_LOCAL_ONLY = false
  })

  it("leaves fetch untouched when local-only is off", () => {
    const baseFetch = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", baseFetch)

    installLocalOnlyFetchGuard()

    expect(globalThis.fetch).toBe(baseFetch)
  })

  it("guards the global fetch when local-only is on", async () => {
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", baseFetch)
    mockEnv.WXT_LOCAL_ONLY = true

    installLocalOnlyFetchGuard()

    await expect(fetch("https://api.readfrog.app/api/rpc")).rejects.toThrow(LocalOnlyBlockedError)
    await expect(fetch("https://translate.googleapis.com/")).resolves.toBeInstanceOf(Response)
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })
})
