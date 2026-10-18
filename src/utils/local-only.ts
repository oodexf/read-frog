import { env } from "@/env"

/** Where Read Frog's own services live, as configured for this build. */
export interface OfficialServiceTargets {
  /** Exact origins: the API, the website and the official site origins. */
  origins: readonly string[]
  /** Registrable domains whose every subdomain is official (e.g. `feedback.readfrog.app`). */
  domains: readonly string[]
}

// Local-packages builds point the auth cookie domain at `localhost`, which is also
// where a user's own Ollama or LM Studio lives. Matching it as a domain would cut
// those off too, so it only ever blocks through the exact origins above.
const NON_EXCLUSIVE_DOMAINS = new Set(["localhost"])

export function getOfficialServiceTargets(): OfficialServiceTargets {
  return {
    origins: [env.WXT_API_URL, env.WXT_WEBSITE_URL, ...env.WXT_OFFICIAL_SITE_ORIGINS].map(
      (url: string) => new URL(url).origin,
    ),
    domains: env.WXT_AUTH_COOKIE_DOMAINS.filter(
      (domain: string) => !NON_EXCLUSIVE_DOMAINS.has(domain),
    ),
  }
}

export function isOfficialServiceUrl(input: string | URL, targets: OfficialServiceTargets) {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    // Relative URLs resolve against the extension's own origin, never a remote one.
    return false
  }

  if (targets.origins.includes(url.origin)) {
    return true
  }

  return targets.domains.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  )
}

/**
 * A `TypeError`, like the one `fetch` rejects with when the network is down, so
 * every caller's existing offline handling covers a refused request too.
 */
export class LocalOnlyBlockedError extends TypeError {
  constructor(message: string) {
    super(message)
    this.name = "LocalOnlyBlockedError"
  }
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

export function createLocalOnlyFetch(
  baseFetch: typeof fetch,
  targets: OfficialServiceTargets,
): typeof fetch {
  return (input, init) => {
    const url = getRequestUrl(input)
    if (isOfficialServiceUrl(url, targets)) {
      return Promise.reject(
        new LocalOnlyBlockedError(`Blocked a request to ${new URL(url).origin}: local-only build`),
      )
    }
    return baseFetch(input, init)
  }
}

/**
 * Refuses every `fetch` to Read Frog's services in the current context. The
 * background is the one context that needs it: content scripts and extension
 * pages reach the API only through the background's proxy fetch, and the
 * background's own oRPC, auth and analytics clients all fetch from there.
 */
export function installLocalOnlyFetchGuard() {
  if (!env.WXT_LOCAL_ONLY) return

  const guardedFetch = createLocalOnlyFetch(
    globalThis.fetch.bind(globalThis),
    getOfficialServiceTargets(),
  )
  Object.assign(globalThis, { fetch: guardedFetch })
}
