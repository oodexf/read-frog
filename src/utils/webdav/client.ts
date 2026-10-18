/**
 * The handful of WebDAV verbs a backup needs, on plain `fetch`. Extension pages hold host
 * permission for every site, so a server that sends no CORS headers (Nextcloud, Jianguoyun …)
 * still answers.
 */

export interface WebdavCredentials {
  /** The folder backups live in, e.g. `https://dav.example.com/remote.php/dav/files/me/read-frog`. */
  url: string
  username: string
  password: string
}

export interface WebdavFile {
  name: string
  size: number | null
  lastModified: Date | null
}

export class WebdavError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "WebdavError"
  }
}

const DAV_NAMESPACE = "DAV:"

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
  </d:prop>
</d:propfind>`

/** The folder URL with exactly one trailing slash, so file names resolve inside it. */
export function normalizeFolderUrl(url: string): string {
  const parsed = new URL(url.trim())
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new WebdavError(`Unsupported protocol: ${parsed.protocol}`)
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/`
  return parsed.href
}

function fileUrl(credentials: WebdavCredentials, name: string): string {
  return new URL(encodeURIComponent(name), normalizeFolderUrl(credentials.url)).href
}

function basicAuth({ username, password }: WebdavCredentials): string {
  // `btoa` takes one byte per character, so non-ASCII credentials go in as their UTF-8 bytes.
  const utf8 = encodeURIComponent(`${username}:${password}`).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  return `Basic ${btoa(utf8)}`
}

async function request(
  credentials: WebdavCredentials,
  url: string,
  method: string,
  init: { headers?: Record<string, string>; body?: string; okStatuses?: number[] } = {},
): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: basicAuth(credentials), ...init.headers },
    body: init.body,
    credentials: "omit",
    cache: "no-store",
  })
  if (!response.ok && !init.okStatuses?.includes(response.status)) {
    throw new WebdavError(`${method} ${url} failed: ${response.status}`, response.status)
  }
  return response
}

/** Lists the files (not sub-folders) directly inside the folder. */
export function parsePropfindFiles(xml: string, folderUrl: string): WebdavFile[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new WebdavError("The server returned an unreadable folder listing")
  }

  const folderPath = decodeURIComponent(new URL(folderUrl).pathname)
  const files: WebdavFile[] = []
  for (const response of Array.from(doc.getElementsByTagNameNS(DAV_NAMESPACE, "response"))) {
    const href = response.getElementsByTagNameNS(DAV_NAMESPACE, "href")[0]?.textContent?.trim()
    if (!href) continue
    const isCollection = response.getElementsByTagNameNS(DAV_NAMESPACE, "collection").length > 0
    const path = decodeURIComponent(new URL(href, folderUrl).pathname)
    if (isCollection || path.replace(/\/+$/, "/") === folderPath) continue

    const name = path.slice(path.lastIndexOf("/") + 1)
    if (!name) continue

    const length = response
      .getElementsByTagNameNS(DAV_NAMESPACE, "getcontentlength")[0]
      ?.textContent?.trim()
    const modified = response
      .getElementsByTagNameNS(DAV_NAMESPACE, "getlastmodified")[0]
      ?.textContent?.trim()
    const lastModified = modified ? new Date(modified) : null
    files.push({
      name,
      size: length && Number.isFinite(Number(length)) ? Number(length) : null,
      lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null,
    })
  }
  return files
}

/**
 * Makes sure the folder exists, creating it (one level) when it does not. Doubles as the
 * connection test: a wrong password or URL throws here.
 */
export async function ensureFolder(credentials: WebdavCredentials): Promise<void> {
  const folderUrl = normalizeFolderUrl(credentials.url)
  const probe = await request(credentials, folderUrl, "PROPFIND", {
    headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
    body: PROPFIND_BODY,
    okStatuses: [404],
  })
  if (probe.status !== 404) return

  // 405: someone created it between the two requests.
  await request(credentials, folderUrl, "MKCOL", { okStatuses: [405] })
}

export async function listFiles(credentials: WebdavCredentials): Promise<WebdavFile[]> {
  const folderUrl = normalizeFolderUrl(credentials.url)
  const response = await request(credentials, folderUrl, "PROPFIND", {
    headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    body: PROPFIND_BODY,
  })
  return parsePropfindFiles(await response.text(), folderUrl)
}

export async function putFile(
  credentials: WebdavCredentials,
  name: string,
  content: string,
): Promise<void> {
  await request(credentials, fileUrl(credentials, name), "PUT", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: content,
  })
}

export async function getFile(credentials: WebdavCredentials, name: string): Promise<string> {
  const response = await request(credentials, fileUrl(credentials, name), "GET")
  return response.text()
}

export async function deleteFile(credentials: WebdavCredentials, name: string): Promise<void> {
  // 404: already gone, which is what was asked for.
  await request(credentials, fileUrl(credentials, name), "DELETE", { okStatuses: [404] })
}
