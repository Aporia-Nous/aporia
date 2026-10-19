/**
 * AP-STAGE4-19: free-path .docx → plain text for Review Documents (no paid Office deps).
 * OOXML is ZIP + word/document.xml; inflate via DecompressionStream (browser/Electron) or zlib (Bun).
 */

const LOCAL_FILE_SIG = 0x04034b50

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Bun / Node test path
  try {
    const zlib = await import("node:zlib")
    return new Uint8Array(zlib.inflateRawSync(data))
  } catch {
    // browser / Electron
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("deflate inflate unavailable")
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** Pull word/document.xml bytes from a .docx (OOXML ZIP). */
export async function readDocxDocumentXml(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length < 30 || readU32(bytes, 0) !== LOCAL_FILE_SIG) return null
  let offset = 0
  while (offset + 30 <= bytes.length) {
    if (readU32(bytes, offset) !== LOCAL_FILE_SIG) break
    const method = readU16(bytes, offset + 8)
    const compSize = readU32(bytes, offset + 18)
    const nameLen = readU16(bytes, offset + 26)
    const extraLen = readU16(bytes, offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen + compSize > bytes.length) return null
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd))
    const dataStart = nameEnd + extraLen
    const dataEnd = dataStart + compSize
    const payload = bytes.subarray(dataStart, dataEnd)
    if (name === "word/document.xml" || name.endsWith("/word/document.xml")) {
      let xmlBytes: Uint8Array
      if (method === 0) xmlBytes = payload
      else if (method === 8) xmlBytes = await inflateRaw(payload)
      else return null
      return new TextDecoder("utf-8").decode(xmlBytes)
    }
    offset = dataEnd
  }
  return null
}

/** Strip OOXML tags to readable plain text (paragraph-aware). */
export function docxXmlToPlainText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<w:tab\b[^/]*\/>/gi, "\t")
    .replace(/<w:br\b[^/]*\/>/gi, "\n")
  const noTags = withBreaks.replace(/<[^>]+>/g, "")
  return noTags
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function extractDocxPlainText(bytes: Uint8Array): Promise<string | null> {
  try {
    const xml = await readDocxDocumentXml(bytes)
    if (!xml) return null
    const text = docxXmlToPlainText(xml)
    return text.length ? text : null
  } catch {
    return null
  }
}

export function officePreviewResidual(ext: string): string {
  switch (ext) {
    case "docx":
      return "Could not extract Word text from this .docx — open externally. Free OOXML path only (no paid Office SDK)."
    case "xlsx":
    case "xlsm":
      return "Spreadsheet binary — Review does not render Excel grids yet; open externally (no paid Office deps)."
    case "pptx":
    case "pptm":
      return "Presentation binary — Review does not render slides yet; open externally (no paid Office deps)."
    case "doc":
    case "xls":
    case "ppt":
      return "Legacy Office binary — not supported in Review; open externally."
    default:
      return "Office/binary document — open in an external viewer; Review shows text surfaces only."
  }
}
