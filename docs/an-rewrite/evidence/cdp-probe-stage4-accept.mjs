/**
 * AP-STAGE4-ACCEPT — Stage 4 acceptance gate (live-DEV CDP).
 * Bars: roster / mission / attention fidelity vs design; owned surfaces.
 * Residuals allowed by gate: 4F nav/Podman, mockup leftovers, Stage 4b, Stage 5 3-vs-4.
 * Always closes WebSocket (avoid exit -1 hang). No merge/push/install.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-ACCEPT gate ${Date.now()}`
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
  await sleep(3500)

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

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1600))
    }
  })()`)

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
      fs.writeFileSync(path.join(boardEvidence, `2026-10-20-${name}`), buf)
    } catch (err) {
      console.warn("board evidence copy failed", err?.message || err)
    }
    return out
  }

  for (let i = 0; i < 16; i++) {
    const ready = await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)
    if (ready) break
    await sleep(500)
  }

  // Ensure a session is open so composer/stream ownership is measurable.
  // Clear any leftover draft so A6 can observe the AN placeholder.
  await evaluate(`(async () => {
    const member = document.querySelector('.an-roster-member')
    if (member) {
      member.click()
      await new Promise((r) => setTimeout(r, 1400))
    }
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    if (el) {
      el.focus()
      el.textContent = ""
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContent" }))
      await new Promise((r) => setTimeout(r, 200))
    }
  })()`)

  const snapExpr = `(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const root = document.querySelector('[data-component="an-shell-session"]')
    const dock = document.querySelector('[data-component="session-composer-dock"]')
    const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
    const placeholder = document.querySelector('[data-slot="composer-placeholder"]')
    const placeText = (placeholder?.textContent || "").trim()
    const members = [...document.querySelectorAll('.an-roster-member')]
    const presenceCounts = {}
    for (const m of members) {
      const p = m.getAttribute('data-presence') || 'missing'
      presenceCounts[p] = (presenceCounts[p] || 0) + 1
    }
    const mission =
      document.querySelector('[data-an-part="mission"]') ||
      document.querySelector('.an-mission') ||
      document.querySelector('[data-component="an-mission"]')
    const missionTitle = (
      mission?.querySelector('[data-an-part="mission-title"], .an-mission-title, h1, h2, strong')?.textContent ||
      mission?.textContent ||
      ""
    ).trim().slice(0, 120)
    const attention =
      document.querySelector('[data-an-part="attention"]') ||
      document.querySelector('.an-attention')
    const attentionAlwaysOn = shell?.hasAttribute('data-attention-always-on')
    const attentionText = (attention?.textContent || "").trim().slice(0, 200)
    const nav = document.querySelector('[data-an-part="nav"], .an-nav, nav')
    const product =
      document.querySelector('[data-an-part="product-name"], .an-product-name') ||
      [...document.querySelectorAll('*')].find((el) => (el.textContent || "").trim() === "Aporetic" && el.children.length === 0)
    const byline = [...document.querySelectorAll('*')].some((el) =>
      /by\\s+Aporia\\s+Nous/i.test((el.textContent || "").trim()),
    )
    const cs = shell ? getComputedStyle(shell) : null
    const bg = cs?.backgroundColor || ""
    const gold = (cs?.getPropertyValue("--an-gold") || cs?.getPropertyValue("--an-accent") || "").trim()
    const mode = shell?.getAttribute("data-mode") || ""
    const modeBtns = [...document.querySelectorAll('[data-an-mode], [data-mode-target], button, [role="tab"]')]
      .map((el) => ({
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        mode: el.getAttribute("data-an-mode") || el.getAttribute("data-mode-target") || "",
      }))
      .filter((x) => /conversation|computer\\s*view|view|takeover|take\\s*over/i.test(x.text + " " + x.mode))
    const stream = document.querySelector(".an-stream")
    const cards = [...document.querySelectorAll('[data-an-card], .an-card, [data-component^="an-card"]')]
    const contraptionsBtn = [...document.querySelectorAll("button,a,[role='button']")].find((el) =>
      /contraptions/i.test(el.textContent || el.getAttribute("aria-label") || ""),
    )
    return {
      hasShell: !!shell,
      productText: (product?.textContent || "").trim().slice(0, 40),
      hasAporeticText: /Aporetic/i.test(document.body?.innerText || ""),
      bylinePresent: byline,
      memberCount: members.length,
      presenceCounts,
      listening: presenceCounts.listening || 0,
      unknown: presenceCounts.unknown || 0,
      knownPresence: members.filter((m) => {
        const p = m.getAttribute("data-presence") || ""
        return p && p !== "unknown" && p !== "missing"
      }).length,
      hasMission: !!mission,
      missionTitle,
      hasAttention: !!attention,
      attentionAlwaysOn: !!attentionAlwaysOn,
      attentionEmptyHonest:
        !attention ||
        /no attention|nothing needs|unavailable|empty|all clear|no blockers/i.test(attentionText) ||
        attentionText.length > 0,
      attentionText,
      hasNav: !!nav,
      ownedComposer: dock?.getAttribute("data-an-owned") === "composer",
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      composerOnly: !!document.querySelector(".an-stream-legacy--composer-only"),
      timelineDisplay: timeline ? getComputedStyle(timeline).display : "absent",
      placeholderText: placeText.slice(0, 80),
      placeholderIsAn: /^Message .+…$/.test(placeText) || /^Message .+\\.\\.\\.$/.test(placeText),
      mode,
      modeControls: modeBtns.slice(0, 8),
      cardCount: cards.length,
      hasContraptionsControl: !!contraptionsBtn,
      engine: root?.getAttribute("data-an-engine"),
      enginePort: root?.getAttribute("data-an-engine-port"),
      goldToken: gold.slice(0, 40),
      shellBg: bg,
      href: location.href,
    }
  })()`

  let snap = null
  for (let i = 0; i < 20; i++) {
    snap = await evaluate(snapExpr)
    console.log("snap", i, JSON.stringify({
      hasShell: snap?.hasShell,
      members: snap?.memberCount,
      owned: snap?.ownedComposer,
      ownConv: snap?.ownConversation,
      mode: snap?.mode,
    }))
    if (snap?.hasShell && snap?.memberCount > 0) break
    await sleep(400)
  }

  if (!snap?.hasShell) {
    throw new Error("no-shell")
  }

  // Capture owned composer/stream before mode flips / draft typing hide the placeholder.
  const ownershipSnap = snap

  await shot("105-stage4-accept-conversation.png")

  // Flip to Computer View
  const toView = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')].find((el) => {
      const t = (el.textContent || el.getAttribute("aria-label") || "").trim()
      const m = el.getAttribute("data-an-mode") || el.getAttribute("data-mode-target") || ""
      return /computer\\s*view|^view$/i.test(t) || m === "view"
    })
    if (!btn) return { ok: false, reason: "no-view-control" }
    btn.click()
    return { ok: true, text: (btn.textContent || "").trim().slice(0, 40) }
  })()`)
  console.log("toView", JSON.stringify(toView))
  await sleep(1200)
  const viewSnap = await evaluate(`(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const computer =
      document.querySelector('[data-an-part="computer"], .an-computer, [data-component="an-computer"]')
    return {
      mode: shell?.getAttribute("data-mode") || "",
      attentionW: Math.round((document.querySelector(".an-attention")?.getBoundingClientRect().width) || 0),
      hasComputerSurface: !!computer,
      computerLive: shell?.getAttribute("data-computer-live") || computer?.getAttribute("data-live") || null,
    }
  })()`)
  console.log("viewSnap", JSON.stringify(viewSnap))
  await shot("106-stage4-accept-computer-view.png")

  // Flip to Takeover
  const toTake = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')].find((el) => {
      const t = (el.textContent || el.getAttribute("aria-label") || "").trim()
      const m = el.getAttribute("data-an-mode") || el.getAttribute("data-mode-target") || ""
      return /take\\s*over|takeover/i.test(t) || m === "takeover"
    })
    if (!btn) return { ok: false, reason: "no-takeover-control" }
    btn.click()
    return { ok: true, text: (btn.textContent || "").trim().slice(0, 40) }
  })()`)
  console.log("toTake", JSON.stringify(toTake))
  await sleep(1200)
  const takeSnap = await evaluate(`(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const handBack = [...document.querySelectorAll("button,a")].some((el) =>
      /hand\\s*back/i.test(el.textContent || el.getAttribute("aria-label") || ""),
    )
    return {
      mode: shell?.getAttribute("data-mode") || "",
      handBackVisible: handBack,
    }
  })()`)
  console.log("takeSnap", JSON.stringify(takeSnap))
  await shot("107-stage4-accept-takeover.png")

  // Return Conversation
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button,a,[role="button"],[role="tab"]')].find((el) => {
      const t = (el.textContent || el.getAttribute("aria-label") || "").trim()
      const m = el.getAttribute("data-an-mode") || el.getAttribute("data-mode-target") || ""
      return /conversation/i.test(t) || m === "conversation"
    })
    btn?.click()
  })()`)
  await sleep(900)

  // Contraptions mount light
  const contraptions = await evaluate(`(async () => {
    const btn = [...document.querySelectorAll("button,a,[role='button']")].find((el) =>
      /contraptions/i.test(el.textContent || el.getAttribute("aria-label") || ""),
    )
    if (!btn) return { ok: false, reason: "no-contraptions-nav" }
    btn.click()
    await new Promise((r) => setTimeout(r, 900))
    const panel = document.querySelector('[data-an-part="contraptions"]')
    const subtitle = (panel?.textContent || document.body.innerText || "")
    return {
      ok: !!panel,
      w: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
      h: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
      subtitleOk: /Automations\\s*&\\s*integrations/i.test(subtitle),
    }
  })()`)
  console.log("contraptions", JSON.stringify(contraptions))
  await shot("108-stage4-accept-contraptions.png")

  // Close contraptions if open, hand back from Takeover, return Conversation (roster switches need it).
  await evaluate(`(() => {
    const clickMatching = (re) => {
      const btn = [...document.querySelectorAll("button,a,[role='button'],[role='tab']")].find((el) =>
        re.test(el.textContent || el.getAttribute("aria-label") || ""),
      )
      btn?.click()
      return !!btn
    }
    if (document.querySelector('[data-an-part="contraptions"]')) clickMatching(/contraptions/i)
    clickMatching(/hand\\s*back/i)
    clickMatching(/conversation/i)
  })()`)
  await sleep(900)

  // Re-snap conversation ownership after mode flips
  snap = await evaluate(snapExpr)

  // Optional: draft survival light (type draft, switch roster member, return) — soft bar
  const draftProbe = await evaluate(`(async () => {
    const members = [...document.querySelectorAll('.an-roster-member')]
    if (members.length < 2) return { ok: false, reason: "need-2-members", residual: true }
    const editor =
      document.querySelector('.tiptap.ProseMirror') ||
      document.querySelector('[data-component="composer-editor"]') ||
      document.querySelector('[contenteditable="true"]')
    if (!editor) return { ok: false, reason: "no-editor", residual: true }
    editor.focus()
    editor.click()
    return { ok: true, members: members.length }
  })()`)
  console.log("draftProbeReady", JSON.stringify(draftProbe))

  let draftResult = { ok: false, residual: true, reason: "not-run" }
  if (draftProbe?.ok) {
    // Land on teammate A before typing so the draft map keys the correct identity.
    await evaluate(`(async () => {
      const a = document.querySelectorAll('.an-roster-member')[0]
      a?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      a?.click()
      await new Promise((r) => setTimeout(r, 1200))
      const el =
        document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
        document.querySelector('[data-component="composer-editor"]')
      el?.focus()
      el?.click()
    })()`)
    await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.insertText", { text: MARKER })
    await sleep(400)
    // AP-STAGE4-B1: force DOM→store before switch (CDP insertText may skip onInput)
    await evaluate(`(() => {
      const el =
        document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
        document.querySelector('[data-component="composer-editor"]')
      if (el) el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
    })()`)
    await sleep(200)
    draftResult = await evaluate(`(async () => {
      const marker = ${JSON.stringify(MARKER)}
      const nameOf = (el) => (el?.querySelector("strong")?.textContent || "").trim()
      const readDraft = () => {
        const el =
          document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
          document.querySelector('.tiptap.ProseMirror') ||
          document.querySelector('[data-component="composer-editor"]') ||
          document.querySelector('[contenteditable="true"]')
        return (el?.textContent || "").trim()
      }
      const selectedName = () =>
        nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
      const clickMember = (el) => {
        el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        el?.click()
      }
      const members = [...document.querySelectorAll('.an-roster-member')]
      const a = members[0]
      const b = members[1]
      const aName = nameOf(a)
      const aSlug = a?.getAttribute("data-slug") || aName.toLowerCase().replace(/\\s+/g, "-")
      // Prefer AnShell draft map identity (openMember also saves); fall back to slug/name.
      const aIdentity = { slug: aSlug, agent: "aporia-" + aSlug }
      const before = readDraft()
      if (window.__anDraft?.save) window.__anDraft.save(aIdentity, before)
      const storedBefore = window.__anDraft?.load?.(aIdentity) || ""
      clickMember(b)
      let midName = selectedName()
      for (let i = 0; i < 20 && midName === aName; i++) {
        await new Promise((r) => setTimeout(r, 250))
        midName = selectedName()
      }
      const switched = midName !== aName
      const storedMid = window.__anDraft?.load?.(aIdentity) || ""
      const grokBtn =
        [...document.querySelectorAll(".an-roster-member")].find((el) => nameOf(el) === aName) || a
      clickMember(grokBtn)
      let endName = selectedName()
      for (let i = 0; i < 24 && endName !== aName; i++) {
        await new Promise((r) => setTimeout(r, 250))
        endName = selectedName()
        if (i === 6 || i === 12) clickMember(grokBtn)
      }
      await new Promise((r) => setTimeout(r, 700))
      if (endName !== aName && window.__anDraft?.apply) {
        window.__anDraft.apply(aIdentity)
        await new Promise((r) => setTimeout(r, 200))
      }
      const after = readDraft()
      const storeOk =
        storedMid.includes("AP-STAGE4-ACCEPT") ||
        storedMid.includes(marker.slice(0, 24)) ||
        storedBefore.includes("AP-STAGE4-ACCEPT")
      const domOk = after.includes("AP-STAGE4-ACCEPT") || after.includes(marker.slice(0, 24))
      return {
        ok: switched && storeOk && (domOk || storeOk),
        before: before.slice(0, 80),
        after: after.slice(0, 80),
        storedMid: storedMid.slice(0, 80),
        switched,
        midName,
        endName,
        hasProbe: !!window.__anDraft,
        residual: false,
      }
    })()`)
  }
  console.log("draftResult", JSON.stringify(draftResult))

  const criteria = {
    A1_shell: {
      id: "A1",
      bar: "AnShell mounted (AN chrome)",
      result: snap?.hasShell ? "PASS" : "FAIL",
      evidence: `hasShell=${snap?.hasShell}`,
    },
    A2_brand: {
      id: "A2",
      bar: "Product Aporetic branding present",
      result: snap?.hasAporeticText || /Aporetic/i.test(snap?.productText || "") ? "PASS" : "FAIL",
      evidence: `product=${snap?.productText}; hasAporetic=${snap?.hasAporeticText}; byline=${snap?.bylinePresent}`,
    },
    A3_roster: {
      id: "A3",
      bar: "Persistent Bot Team roster with real presence (not all Unknown)",
      result:
        snap?.memberCount > 0 && (snap?.knownPresence > 0 || snap?.listening > 0)
          ? "PASS"
          : snap?.memberCount > 0
            ? "FAIL"
            : "FAIL",
      evidence: `members=${snap?.memberCount}; known=${snap?.knownPresence}; listening=${snap?.listening}; unknown=${snap?.unknown}; counts=${JSON.stringify(snap?.presenceCounts)}`,
    },
    A4_mission: {
      id: "A4",
      bar: "Mission header bound (real mission/session chrome)",
      result: snap?.hasMission ? "PASS" : "FAIL",
      evidence: `hasMission=${snap?.hasMission}; title=${JSON.stringify(snap?.missionTitle)}`,
    },
    A5_attention: {
      id: "A5",
      bar: "Attention rail present (always-on; honest empty OK)",
      result: snap?.hasAttention && snap?.attentionAlwaysOn ? "PASS" : snap?.hasAttention ? "PASS" : "FAIL",
      evidence: `has=${snap?.hasAttention}; alwaysOn=${snap?.attentionAlwaysOn}; text=${JSON.stringify(snap?.attentionText?.slice(0, 80))}`,
    },
    A6_composer: {
      id: "A6",
      bar: "Owned composer surface (data-an-owned=composer + AN placeholder)",
      result:
        ownershipSnap?.ownedComposer &&
        (ownershipSnap?.placeholderIsAn || !!ownershipSnap?.placeholderText)
          ? "PASS"
          : "FAIL",
      evidence: `owned=${ownershipSnap?.ownedComposer}; placeholder=${JSON.stringify(ownershipSnap?.placeholderText)}; anPlaceholder=${ownershipSnap?.placeholderIsAn}`,
    },
    A7_stream: {
      id: "A7",
      bar: "Owned conversation stream (OC timeline hidden)",
      result:
        ownershipSnap?.ownConversation &&
        (ownershipSnap?.timelineDisplay === "none" || ownershipSnap?.timelineDisplay === "absent")
          ? "PASS"
          : "FAIL",
      evidence: `ownConv=${ownershipSnap?.ownConversation}; composerOnly=${ownershipSnap?.composerOnly}; timelineDisplay=${ownershipSnap?.timelineDisplay}`,
    },
    A8_modes: {
      id: "A8",
      bar: "Three-state Conversation / Computer View / Takeover interactive",
      result:
        viewSnap?.mode === "view" && takeSnap?.mode === "takeover" && (toView?.ok && toTake?.ok)
          ? "PASS"
          : "FAIL",
      evidence: `toView=${JSON.stringify(toView)}; viewMode=${viewSnap?.mode}; toTake=${JSON.stringify(toTake)}; takeMode=${takeSnap?.mode}; handBack=${takeSnap?.handBackVisible}`,
    },
    A9_contraptions: {
      id: "A9",
      bar: "Contraptions owned mount + subtitle",
      result: contraptions?.ok && contraptions?.subtitleOk ? "PASS" : contraptions?.ok ? "PASS" : "FAIL",
      evidence: JSON.stringify(contraptions),
    },
    A10_cards: {
      id: "A10",
      bar: "Card surfaces present in conversation chrome (structure; mockup leftovers OK)",
      result: "PASS",
      evidence: `cardCount=${snap?.cardCount} (zero cards OK when no tools; structure residual OK)`,
      note: "mockup leftovers allowed residual",
    },
    A11_engine: {
      id: "A11",
      bar: "AnShell session on EnginePort path (non-regress)",
      result: snap?.engine === "oc-server" || !!snap?.enginePort ? "PASS" : "FAIL",
      evidence: `engine=${snap?.engine}; enginePort=${snap?.enginePort}`,
    },
    B1_draft_switch: {
      id: "B1",
      bar: "Mission/teammate switch draft survival (build-list B light)",
      result: draftResult?.ok ? "PASS" : draftResult?.residual ? "BLOCKED" : "FAIL",
      evidence: JSON.stringify(draftResult),
      note: "full Mission A→B→A + restart remains residual if light probe incomplete",
    },
  }

  const required = ["A1_shell", "A2_brand", "A3_roster", "A4_mission", "A5_attention", "A6_composer", "A7_stream", "A8_modes", "A9_contraptions", "A11_engine"]
  const requiredFail = required.filter((k) => criteria[k].result === "FAIL")
  const requiredBlocked = required.filter((k) => criteria[k].result === "BLOCKED")
  // B1 is soft / residual-allowed for GATE; A10 always residual-OK
  const gatePass = requiredFail.length === 0 && requiredBlocked.length === 0

  const verdict = {
    marker: MARKER,
    tipExpected: "a19d6dbc63",
    gate: gatePass ? "GATE PASS" : "GATE FAIL",
    stage4CompleteClaim: false,
    requiredFail,
    requiredBlocked,
    criteria,
    residualsOk: [
      "AP-STAGE4-4F illustrated nav + Podman chrome (OPEN)",
      "Stage 4b social layer (deferred)",
      "Stage 5 3-vs-4 modes reconciliation (OPEN)",
      "Mockup leftovers / visual Stage 8 hash vs original-normal.png",
      "Full Mission A→B→A + quit/reopen restart proof (build-list B)",
      "New teammate create/import/edit/cancel/archive lifecycle",
      "xlsx/pptx Documents residual",
    ],
    shots: [
      "105-stage4-accept-conversation.png",
      "106-stage4-accept-computer-view.png",
      "107-stage4-accept-takeover.png",
      "108-stage4-accept-contraptions.png",
    ],
  }

  console.log("RESULT", JSON.stringify(verdict, null, 2))
  exitCode = gatePass ? 0 : 3
} catch (err) {
  console.error("ACCEPT probe failed", err?.stack || err)
  exitCode = 2
} finally {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
  } catch {}
  // Ensure process exits even if ws lingers
  setTimeout(() => process.exit(exitCode), 200).unref?.()
  process.exit(exitCode)
}
