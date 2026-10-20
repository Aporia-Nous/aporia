/**
 * AP-BF-05 standalone loopback CDP pixel relay (Electron DEV when Vite plugin is not the host).
 * Listens only on 127.0.0.1 — consented Edge/Chrome captureScreenshot → JPEG.
 */
import { createServer } from "node:http"
import { computerCdpRelayPlugin } from "../vite.computer-cdp.mjs"

const PORT = Number(process.env.AN_CDP_RELAY_PORT || 5199)
const HOST = "127.0.0.1"

/** Reuse the Vite middleware function without a Vite server. */
const plugin = computerCdpRelayPlugin()
const fakeServer = {
  middlewares: {
    use(fn) {
      fakeServer.handler = fn
    },
  },
  handler: null,
}
plugin.configureServer(fakeServer)

const server = createServer((req, res) => {
  const next = () => {
    res.statusCode = 404
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ ok: false, error: "Not found." }))
  }
  void fakeServer.handler(req, res, next)
})

server.listen(PORT, HOST, () => {
  console.log(`AP-BF-05 CDP pixel relay on http://${HOST}:${PORT}`)
})
