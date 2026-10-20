import { describe, expect, test } from "bun:test"
import {
  classifyComposerText,
  classifyFlowTrigger,
  isZeroTokenPath,
  routeComposerAdmission,
} from "./intent-gate"

describe("AP-CE-02 app intent-gate mirror", () => {
  const registered = ["greet", "fetch-shape"]

  test("registered slash is mechanical zero-token", () => {
    const d = classifyComposerText('/greet {"who":"ali"}', registered)
    expect(d.kind).toBe("mechanical")
    expect(isZeroTokenPath(d)).toBe(true)
  })

  test("routeComposerAdmission skips session on gate", async () => {
    let sessionCalls = 0
    const routed = await routeComposerAdmission({
      text: "/fetch-shape",
      registered,
      sessionPrompt: async () => {
        sessionCalls += 1
        return "session"
      },
      startFlow: async (s) => ({ flowId: s.flowId, tokens: s.expectedModelTokens }),
    })
    expect(routed.path).toBe("mechanical")
    expect(sessionCalls).toBe(0)
    if (routed.path === "mechanical") expect(routed.modelTokens).toBe(0)
  })

  test("manual trigger classification", () => {
    expect(classifyFlowTrigger("greet", "manual", {}, registered).kind).toBe("mechanical")
    expect(classifyFlowTrigger("missing", "manual", {}, registered).kind).toBe("session")
  })
})
