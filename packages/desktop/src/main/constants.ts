import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Aporetic Dev",
  beta: "Aporetic Beta",
  prod: "Aporetic",
}

const appIDs: Record<string, string> = {
  dev: "com.aporianous.desktop.dev",
  beta: "com.aporianous.desktop.beta",
  prod: "com.aporianous.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Aporetic Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "com.aporianous.desktop.dev"
