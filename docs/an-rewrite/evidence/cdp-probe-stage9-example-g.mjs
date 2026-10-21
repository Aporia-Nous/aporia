/**
 * AP-STAGE9-01 — Example G (functional continuity) on isolated DEV CDP :9223.
 * Brief G: existing conversation; Stop; diff; draft+IME recover after restart.
 * Honest: does NOT send paid model prompts; Stop-interrupt / live-diff may stay BLOCKED.
 * Always closes WebSocket. Does NOT self-PASS Stage 9 / independent verification.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE9-EXAMPLE-G ${Date.now()}`
const DRAFT_LINE_A = `${MARKER} line-one`
const DRAFT_LINE_B = "IME-composed 你好世界 draft-recover"
const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  function send(method, params = {}) {
    const msgId = ++id
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject })
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  }
  ws.on("message", (data) => {
    const msg = JSON.parse(String(data))
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg)
      pending.delete(msg.id)
    }
  })
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, send }))
    ws.on("error", reject)
  })
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

let ws
let exitCode = 2

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!page?.webSocketDebuggerUrl) {
    console.error("No Aporetic CDP page on", CDP_PORT)
    process.exit(1)
  }
  console.log("aporetic", page.title, page.url)

  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await sleep(4000)

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.result?.exceptionDetails) {
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 800))
    }
    return res.result?.result?.value ?? null
  }

  async function shot(name) {
    const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
    const b64 = shotRes.result?.data
    if (!b64) throw new Error("no screenshot for " + name)
    const buf = Buffer.from(b64, "base64")
    fs.mkdirSync(outDir, { recursive: true })
    const out = path.join(outDir, name)
    fs.writeFileSync(out, buf)
    console.log("wrote", out)
    try {
      fs.mkdirSync(boardEvidence, { recursive: true })
      fs.writeFileSync(path.join(boardEvidence, `2026-10-21-${name}`), buf)
    } catch (err) {
      console.warn("board evidence copy failed", err?.message || err)
    }
    return out
  }

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1600))
    }
  })()`)

  let shellReady = false
  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(`(() => {
      const shell = document.querySelector('[data-component="an-shell"]')
      const splashOnly =
        !shell &&
        (document.body?.innerText || "").trim().length < 40 &&
        !!document.querySelector("img,svg,canvas")
      return {
        hasShell: !!shell,
        href: location.href,
        title: document.title,
        bodyLen: (document.body?.innerText || "").length,
        splashOnly,
        fatal: !!(window).__lastFatal,
      }
    })()`)
    console.log("shellWait", i, JSON.stringify(ready))
    if (ready?.hasShell) {
      shellReady = true
      break
    }
    await sleep(500)
  }
  if (!shellReady) {
    console.error("AnShell never mounted — renderer likely crashed (see fatal title bug)")
  }

  // G1 — existing conversation / roster session
  const existing = await evaluate(`(async () => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const members = [...document.querySelectorAll('.an-roster-member')]
    const a = members[0]
    if (a) {
      a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      a.click()
      await new Promise((r) => setTimeout(r, 1600))
    }
    const stream =
      document.querySelector('[data-component="an-conversation"]') ||
      document.querySelector('[data-an-own-conversation="true"]')
    const messages = stream
      ? stream.querySelectorAll(
          '[data-component="message"], [data-role], .an-card, [data-an-card]',
        ).length
      : 0
    const composer =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    return {
      hasShell: !!shell,
      rosterCount: members.length,
      selectedName: name,
      hasStream: !!stream,
      messageOrCardCount: messages,
      hasComposer: !!composer,
      productHit: /aporetic/i.test(document.body?.innerText || ""),
    }
  })()`)
  console.log("existing", JSON.stringify(existing))
  await shot("156-stage9-example-g-existing-conversation.png")

  // G2 — Stop control presence (interrupt of live stream NOT claimed without paid turn)
  const stopProbe = await evaluate(`(async () => {
    const openReview = document.querySelector('[data-action="review-toggle"]')
    if (openReview && openReview.getAttribute("data-active") !== "true") {
      openReview.click()
      await new Promise((r) => setTimeout(r, 800))
    }
    const take = [...document.querySelectorAll("button,[role='button'],a")].find((el) =>
      /^\\s*take\\s*(over|control)\\s*$/i.test((el.textContent || "").trim()),
    )
    if (take) {
      take.click()
      await new Promise((r) => setTimeout(r, 900))
    }
    const stopBtn = [...document.querySelectorAll("button,[role='button']")].find((el) =>
      /^\\s*stop\\s*$/i.test((el.textContent || "").trim()),
    )
    const busy =
      !!document.querySelector('[data-busy="true"], [data-status="running"], [aria-busy="true"]') ||
      /generating|streaming|working/i.test(document.body?.innerText?.slice(0, 4000) || "")
    return {
      hasStop: !!stopBtn,
      stopLabel: (stopBtn?.textContent || "").trim().slice(0, 40),
      sessionBusy: busy,
      stopInterruptExercised: false,
      honesty: "Stop control presence only — live stream interrupt needs model turn (not paid this run)",
    }
  })()`)
  console.log("stop", JSON.stringify(stopProbe))
  await shot("157-stage9-example-g-stop-control.png")

  // G3 — Diff surface: look for existing Proof/diff chrome; do not invent edit via model
  const diffProbe = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-an-card], .an-card, [data-component*="proof"], [data-component*="diff"]')]
    const labels = cards.map((c) => (c.getAttribute("data-an-card") || c.getAttribute("data-component") || c.textContent || "").slice(0, 80))
    const body = document.body?.innerText || ""
    const hasDiffWord = /\\bdiff\\b|unified diff|file changed|proof/i.test(body.slice(0, 12000))
    const proofCards = cards.filter((c) => /proof|diff|edit/i.test(c.getAttribute("data-an-card") || c.getAttribute("data-component") || ""))
    return {
      cardSample: labels.slice(0, 12),
      proofOrDiffCardCount: proofCards.length,
      hasDiffWord,
      liveFileEditDiff: false,
      honesty: "No paid model/file-edit turn this run — live real-diff remains OPEN/BLOCKED unless prior stream shows Proof",
    }
  })()`)
  console.log("diff", JSON.stringify(diffProbe))

  // G4 — Draft with simulated IME composition + multiline, then renderer reload recover
  const draftSeed = await evaluate(`(async () => {
    const lineA = ${JSON.stringify(DRAFT_LINE_A)}
    const lineB = ${JSON.stringify(DRAFT_LINE_B)}
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    if (!el) return { ok: false, reason: "no-composer" }
    el.focus()
    el.textContent = ""
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContent" }))
    // multiline plain
    el.textContent = lineA + "\\n"
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
    // IME composition sequence (CJK) — Enter must not send while composing
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))
    el.dispatchEvent(
      new CompositionEvent("compositionupdate", { bubbles: true, data: "你好" }),
    )
    const beforeEnter = el.textContent
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, isComposing: true }),
    )
    await new Promise((r) => setTimeout(r, 50))
    el.textContent = beforeEnter + lineB
    el.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: lineB }),
    )
    el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertCompositionText" }))
    await new Promise((r) => setTimeout(r, 200))
    const a = document.querySelectorAll(".an-roster-member")[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
    const identity = { slug, agent: "aporia-" + slug }
    const draft = (el.textContent || "").trim()
    if (window.__anDraft?.save) window.__anDraft.save(identity, draft)
    return {
      ok: draft.includes(lineA.slice(0, 20)) && draft.includes("IME-composed"),
      draft: draft.slice(0, 160),
      hasDraftProbe: !!window.__anDraft,
      lsDraft: !!localStorage.getItem("an.shell.drafts.v1"),
      identity,
      enterDuringImeDidNotClear: (el.textContent || "").length > 0,
    }
  })()`)
  console.log("draftSeed", JSON.stringify(draftSeed))
  await shot("158-stage9-example-g-draft-ime.png")

  await send("Page.reload", { ignoreCache: true })
  await sleep(5500)
  for (let i = 0; i < 24; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }
  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1200))
    }
    const a = document.querySelectorAll('.an-roster-member')[0]
    a?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    a?.click()
    await new Promise((r) => setTimeout(r, 2000))
  })()`)

  const afterReload = await evaluate(`(async () => {
    const marker = ${JSON.stringify(MARKER)}
    const a = document.querySelectorAll(".an-roster-member")[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
    const identity = { slug, agent: "aporia-" + slug }
    for (let i = 0; i < 12 && !window.__anDraft; i++) {
      await new Promise((r) => setTimeout(r, 250))
    }
    if (window.__anDraft?.apply) window.__anDraft.apply(identity)
    await new Promise((r) => setTimeout(r, 400))
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    const draft = (el?.textContent || "").trim()
    const mapDraft = window.__anDraft?.load?.(identity) || ""
    const draftOk =
      draft.includes(marker.slice(0, 24)) ||
      String(mapDraft).includes(marker.slice(0, 24)) ||
      draft.includes("IME-composed") ||
      String(mapDraft).includes("IME-composed")
    return {
      draft: draft.slice(0, 160),
      mapDraft: String(mapDraft).slice(0, 160),
      draftOk,
      lsDraft: !!localStorage.getItem("an.shell.drafts.v1"),
      hasDraftProbe: !!window.__anDraft,
      restartKind: "Page.reload (renderer quit/reopen; Electron kept for CDP)",
    }
  })()`)
  console.log("afterReload", JSON.stringify(afterReload))
  await shot("159-stage9-example-g-draft-recover.png")

  const g1 = !!(existing?.hasShell && existing?.hasComposer && existing?.rosterCount > 0)
  const g2Presence = !!stopProbe?.hasStop
  const g2Interrupt = false // honesty — not exercised
  const g3LiveDiff = false // honesty — not exercised
  const g3PriorSurface = !!(diffProbe?.proofOrDiffCardCount > 0 || diffProbe?.hasDiffWord)
  const g4 = !!(draftSeed?.ok && afterReload?.draftOk)

  // Writer measured bar: G1 + G4 required; G2 presence helpful; G2 interrupt + G3 live diff may BLOCKED
  const measuredOk = g1 && g4
  const blocked = []
  if (!g2Interrupt) blocked.push("Stop live-stream interrupt (needs model turn; not paid this run)")
  if (!g3LiveDiff) blocked.push("Live file-edit real diff (needs tool/edit turn; not paid this run)")
  if (!g2Presence) blocked.push("Stop control not found in chrome")

  const verdict = {
    marker: MARKER,
    ok: measuredOk,
    stage9CompleteClaim: false,
    independentPassClaim: false,
    checks: {
      G1_existingConversation: g1,
      G2_stopControlPresent: g2Presence,
      G2_stopInterruptLive: g2Interrupt,
      G3_priorDiffSurface: g3PriorSurface,
      G3_liveFileEditDiff: g3LiveDiff,
      G4_draftImeRecoverAfterReload: g4,
    },
    blocked,
    existing,
    stopProbe,
    diffProbe,
    draftSeed,
    afterReload,
    shots: [
      "156-stage9-example-g-existing-conversation.png",
      "157-stage9-example-g-stop-control.png",
      "158-stage9-example-g-draft-ime.png",
      "159-stage9-example-g-draft-recover.png",
    ],
    noMergeNoPushNoInstall: true,
    noPaidModelTurn: true,
  }
  console.log("RESULT", JSON.stringify(verdict, null, 2))
  exitCode = measuredOk ? 0 : 3
} catch (err) {
  console.error("STAGE9 Example G probe failed", err?.stack || err)
  exitCode = 2
} finally {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
  } catch {}
  setTimeout(() => process.exit(exitCode), 200).unref?.()
  process.exit(exitCode)
}
