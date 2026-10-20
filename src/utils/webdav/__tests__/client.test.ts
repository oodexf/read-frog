// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { ensureFolder, normalizeFolderUrl, parsePropfindFiles, putFile } from "../client"

const credentials = {
  url: "https://dav.example.com/dav/read-frog",
  username: "frog",
  password: "pässword",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("normalizeFolderUrl", () => {
  it("ends the folder with exactly one slash", () => {
    expect(normalizeFolderUrl(" https://dav.example.com/dav/read-frog ")).toBe(
      "https://dav.example.com/dav/read-frog/",
    )
    expect(normalizeFolderUrl("https://dav.example.com/dav/read-frog//")).toBe(
      "https://dav.example.com/dav/read-frog/",
    )
  })

  it("refuses anything but http(s)", () => {
    expect(() => normalizeFolderUrl("ftp://dav.example.com/")).toThrow("Unsupported protocol")
    expect(() => normalizeFolderUrl("not a url")).toThrow("Invalid URL")
  })
})

describe("parsePropfindFiles", () => {
  const folderUrl = "https://dav.example.com/dav/read-frog/"

  it("lists the files and skips the folder itself and its sub-folders", () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/read-frog/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/read-frog/old/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/read-frog/read-frog-backup-2026.json</d:href>
    <d:propstat><d:prop>
      <d:resourcetype/>
      <d:getcontentlength>1234</d:getcontentlength>
      <d:getlastmodified>Sun, 18 Oct 2026 08:30:00 GMT</d:getlastmodified>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`

    expect(parsePropfindFiles(xml, folderUrl)).toEqual([
      {
        name: "read-frog-backup-2026.json",
        size: 1234,
        lastModified: new Date("2026-10-18T08:30:00Z"),
      },
    ])
  })

  it("reads a listing in the default namespace with absolute, encoded hrefs", () => {
    const xml = `<?xml version="1.0"?>
<multistatus xmlns="DAV:">
  <response>
    <href>https://dav.example.com/dav/read-frog/my%20backup.json</href>
    <propstat><prop><resourcetype/></prop></propstat>
  </response>
</multistatus>`

    expect(parsePropfindFiles(xml, folderUrl)).toEqual([
      { name: "my backup.json", size: null, lastModified: null },
    ])
  })

  it("throws on a listing that is not XML", () => {
    expect(() => parsePropfindFiles("<html>", folderUrl)).toThrow("unreadable")
  })
})

describe("requests", () => {
  it("creates the folder when it does not exist, with UTF-8 basic auth", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await ensureFolder(credentials)

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://dav.example.com/dav/read-frog/", "PROPFIND"],
      ["https://dav.example.com/dav/read-frog/", "MKCOL"],
    ])
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>
    expect(headers.Depth).toBe("0")
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("frog:pässword", "utf8").toString("base64")}`,
    )
  })

  it("leaves an existing folder alone", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 207 }))
    vi.stubGlobal("fetch", fetchMock)

    await ensureFolder(credentials)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("throws with the status when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
    )

    await expect(ensureFolder(credentials)).rejects.toMatchObject({
      name: "WebdavError",
      status: 401,
    })
  })

  it("puts a file inside the folder", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await putFile(credentials, "a b.json", "{}")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dav.example.com/dav/read-frog/a%20b.json",
      expect.objectContaining({ method: "PUT", body: "{}" }),
    )
  })
})
