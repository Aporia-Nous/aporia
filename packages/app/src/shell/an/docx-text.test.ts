import { describe, expect, test } from "bun:test"
import { deflateRawSync } from "node:zlib"
import { docxXmlToPlainText, extractDocxPlainText, officePreviewResidual, readDocxDocumentXml } from "./docx-text"

function zipLocalFile(name: string, payload: Uint8Array, store = false): Uint8Array {
  const nameBytes = new TextEncoder().encode(name)
  const method = store ? 0 : 8
  const comp = store ? payload : new Uint8Array(deflateRawSync(payload))
  const header = new Uint8Array(30 + nameBytes.length + comp.length)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(8, method, true)
  view.setUint32(18, comp.length, true)
  view.setUint32(22, payload.length, true)
  view.setUint16(26, nameBytes.length, true)
  view.setUint16(28, 0, true)
  header.set(nameBytes, 30)
  header.set(comp, 30 + nameBytes.length)
  return header
}

describe("docx-text (AP-STAGE4-19)", () => {
  test("strips OOXML to plain paragraphs", () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World &amp; AN</w:t></w:r></w:p></w:body></w:document>'
    expect(docxXmlToPlainText(xml)).toBe("Hello\nWorld & AN")
  })

  test("reads document.xml from minimal ZIP (deflated)", async () => {
    const xml = new TextEncoder().encode("<w:document><w:p><w:t>Ice glass</w:t></w:p></w:document>")
    const zip = zipLocalFile("word/document.xml", xml, false)
    const got = await readDocxDocumentXml(zip)
    expect(got).toContain("Ice glass")
    const text = await extractDocxPlainText(zip)
    expect(text).toBe("Ice glass")
  })

  test("office residuals are honest", () => {
    expect(officePreviewResidual("xlsx")).toContain("Spreadsheet")
    expect(officePreviewResidual("pptx")).toContain("Presentation")
    expect(officePreviewResidual("docx")).toContain("docx")
  })
})
