import fs from "node:fs"
import path from "node:path"
import { deflateRawSync } from "node:zlib"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const xml = new TextEncoder().encode(
  "<w:document><w:body><w:p><w:r><w:t>STAGE4-19 docx fixture Hello AN</w:t></w:r></w:p></w:body></w:document>",
)
const name = "word/document.xml"
const nameBytes = new TextEncoder().encode(name)
const comp = new Uint8Array(deflateRawSync(xml))
const header = new Uint8Array(30 + nameBytes.length + comp.length)
const view = new DataView(header.buffer)
view.setUint32(0, 0x04034b50, true)
view.setUint16(8, 8, true)
view.setUint32(18, comp.length, true)
view.setUint32(22, xml.length, true)
view.setUint16(26, nameBytes.length, true)
view.setUint16(28, 0, true)
header.set(nameBytes, 30)
header.set(comp, 30 + nameBytes.length)
const out = path.join(__dirname, "stage4-19-doc-fixture.docx")
fs.writeFileSync(out, header)
console.log("wrote", out, header.length)
