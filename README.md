# Aporetic

**Aporetic by Aporia Nous** — an open-source AI teammate desktop app (Electron).

Built on [OpenCode](https://github.com/anomalyco/opencode) (MIT). Aporetic is not affiliated with or endorsed by OpenCode.

## What this repo is

A **fresh product shell**: Electron desktop (`packages/desktop`) + app UI (`packages/app`), including the AnShell / Aporetic chrome.

It ships **empty user state** by design. Your sessions, teammates history, vault secrets, API keys, and local databases stay on your machine and are gitignored — they are not in this tree.

## Requirements

- [Bun](https://bun.sh) 1.3+
- Windows, macOS, or Linux (desktop packaging via electron-builder)

## Develop (Electron)

```bash
bun install
bun run dev:desktop
```

Package a Windows build:

```bash
bun --cwd packages/desktop run package:win
```

## Status (honest)

This public tree is the **product source** for a clean boot. Features you see in private development evidence, personal missions, or lived-in installs are **not** claimed as production-complete here. Run the app locally and judge what works on your machine.

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

## Security

Do not commit `.env`, vault unlock material, session databases, or conversation exports. See [SECURITY.md](./SECURITY.md) and `.gitignore`.
