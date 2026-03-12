# Installation Guide

## Requirements

1. Python 3.11+
2. `pipx` (recommended) or `pip`
3. At least one authenticated provider CLI:
   - Claude Code CLI: `npm install -g @anthropic-ai/claude-code && claude auth`
   - Codex CLI: `npm install -g @openai/codex && codex auth`
   - Gemini CLI: `npm install -g @google/gemini-cli` and authenticate in `gemini`
4. Telegram bot token from [@BotFather](https://t.me/BotFather)
5. Telegram user ID from [@userinfobot](https://t.me/userinfobot)

## Install

### pipx (recommended)

```bash
pipx install klir
```

### pip

```bash
pip install klir
```

### from source

```bash
git clone https://github.com/js-krinay/klir.git
cd klir
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## First run

```bash
klir
```

On first run, onboarding does:

- checks Claude/Codex/Gemini auth status,
- asks for Telegram token + user ID,
- asks timezone,
- offers service install,
- writes config and seeds `~/.klir/`.

If service install succeeds, onboarding returns without starting foreground bot.

## Platform notes

### Linux

```bash
sudo apt update && sudo apt install python3 python3-pip python3-venv nodejs npm
pip install pipx
pipx ensurepath
pipx install klir
klir
```

### macOS

```bash
brew install python@3.11 node pipx
pipx ensurepath
pipx install klir
klir
```

### Windows (native)

```powershell
winget install Python.Python.3.11
winget install OpenJS.NodeJS
pip install pipx
pipx ensurepath
pipx install klir
klir
```

Native Windows is fully supported, including service management via Task Scheduler.

### Windows (WSL)

WSL works too. Install like Linux inside WSL.

```bash
sudo apt update && sudo apt install python3 python3-pip python3-venv nodejs npm
pip install pipx
pipx ensurepath
pipx install klir
klir
```

## Optional host tools

klir works out of the box with just the provider CLIs. These optional tools unlock extra capabilities that the AI models can't handle natively:

| Tool | Install | What it enables |
|---|---|---|
| FFmpeg | `sudo apt install ffmpeg` | Voice message conversion, video processing |
| Whisper | `pip install openai-whisper` or [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Local voice message transcription |
| Playwright | `pip install playwright && playwright install` | Browser automation, web scraping, screenshots |

None of these are required. If a tool is missing when needed, klir will show an actionable error with install instructions.

## Direct API server (optional)

Preferred enable path:

```bash
klir api enable
```

This writes/updates the `api` block in `config.json` and generates a token if missing.

`klir api enable` requires PyNaCl (used for E2E encryption). If it is missing:

```bash
# pipx install
pipx inject klir PyNaCl

# pip install
pip install "klir[api]"
```

Manual config equivalent:

```json
{
  "api": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 8741,
    "token": "",
    "allow_public": false
  }
}
```

Notes:

- token is generated and persisted by `klir api enable` (runtime also generates it on API start if still empty).
- WebSocket auth frame must include `type="auth"`, `token`, and `e2e_pk` (client ephemeral public key).
- endpoints:
  - WebSocket: `ws://<host>:8741/ws`
  - health: `GET /health`
  - file download: `GET /files?path=...` (Bearer token)
  - file upload: `POST /upload` (Bearer token, multipart)
- default API session uses `api.chat_id` by truthiness (`0` falls back), else first `allowed_user_ids` entry (fallback `1`); clients can override `chat_id` in auth payload.
- recommended deployment is a private network (for example Tailscale).

## Background service

Install:

```bash
klir service install
```

Manage:

```bash
klir service status
klir service start
klir service stop
klir service logs
klir service uninstall
```

Backends:

- Linux: `systemd --user` service `~/.config/systemd/user/klir.service`
- macOS: Launch Agent `~/Library/LaunchAgents/dev.klir.plist`
- Windows: Task Scheduler task `klir`

Linux note:

- user services survive logout/start on boot only when user linger is enabled (`sudo loginctl enable-linger <user>`). Installer attempts this and prints a hint when it cannot set linger.

Windows note:

- service install prefers `pythonw.exe -m klir` (no visible console window),
- installed Task Scheduler service uses logon trigger + restart-on-failure retries,
- some systems require elevated terminal permissions for Task Scheduler operations.

Log command behavior:

- Linux: live `journalctl --user -u klir -f`
- macOS/Windows: recent lines from `~/.klir/logs/agent.log` (fallback newest `*.log`)

## VPS notes

Small Linux VPS is enough. Typical path:

```bash
ssh user@host
sudo apt update && sudo apt install python3 python3-pip python3-venv nodejs npm
pip install pipx
pipx ensurepath
pipx install klir
klir
```

Security basics:

- keep SSH key-only auth
- keep `allowed_user_ids` restricted
- use `/upgrade` or `pipx upgrade klir`

## Troubleshooting

### Bot not responding

1. check `telegram_token` + `allowed_user_ids`
2. run `klir status`
3. inspect `~/.klir/logs/agent.log`
4. run `/diagnose` in Telegram

### CLI installed but not authenticated

Authenticate at least one provider and restart:

```bash
claude auth
# or
codex auth
# or
# authenticate in gemini CLI
```

### Webhooks not arriving

- set `webhooks.enabled: true`
- expose `127.0.0.1:8742` through tunnel/proxy when external sender is used
- verify auth settings and hook ID

## Upgrade and uninstall

Upgrade:

```bash
pipx upgrade klir
```

Uninstall:

```bash
pipx uninstall klir
rm -rf ~/.klir  # optional data removal
```
