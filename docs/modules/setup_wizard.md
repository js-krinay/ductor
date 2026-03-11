# Setup Wizard and CLI Entry

Covers `klir` command behavior, onboarding flow, and lifecycle commands.

## Files

- `klir/__main__.py`: CLI dispatch + config helpers + `run_telegram`
- `klir/cli_commands/lifecycle.py`: start/stop/restart/upgrade/uninstall logic
- `klir/cli_commands/status.py`: `klir status` + `klir help`
- `klir/cli_commands/service.py`: service command routing
- `klir/cli_commands/docker.py`: docker subcommands
- `klir/cli_commands/api_cmd.py`: API enable/disable commands
- `klir/cli_commands/agents.py`: sub-agent registry commands
- `klir/infra/docker_extras.py`: optional Docker package registry + Dockerfile generation
- `klir/cli/init_wizard.py`: onboarding + smart reset

## CLI commands

- `klir`: start bot (auto-onboarding if needed)
- `klir onboarding` / `klir reset`: onboarding flow (with smart reset when configured)
- `klir status`
- `klir stop`
- `klir restart`
- `klir upgrade`
- `klir uninstall`
- `klir service <install|status|start|stop|logs|uninstall>`
- `klir docker <rebuild|enable|disable|mount|unmount|mounts|extras|extras-add|extras-remove>`
- `klir api <enable|disable>`
- `klir agents <list|add|remove>`
- `klir help`

## Configuration gate

`_is_configured()` currently requires:

- valid non-placeholder `telegram_token`
- non-empty `allowed_user_ids`

`allowed_group_ids` controls group authorization but does not satisfy startup configuration alone.

## Onboarding flow (`run_onboarding`)

1. banner
2. provider install/auth check
3. disclaimer
4. Telegram bot token prompt
5. Telegram user ID prompt
6. Docker choice
7. Docker extras selection (only when Docker enabled)
8. timezone choice
9. write merged config + initialize workspace
10. optional service install

Step 7 shows a Rich table of optional AI/ML packages grouped by category (Audio/Speech, Vision/OCR, Document Processing, Scientific/Data, ML Frameworks, Web/Browser) with descriptions and size estimates. Users select via `questionary.checkbox`. Transitive dependencies are auto-resolved.

Return semantics:

- `True` when service install was completed
- `False` otherwise

Caller behavior:

- default `klir`: onboarding if needed, then foreground start unless service install path returned `True`
- `klir onboarding/reset`: calls `stop_bot()` first, then onboarding, then same service/foreground logic

## Lifecycle command behavior

### `stop_bot()`

Shutdown sequence:

1. stop installed service (prevents auto-respawn)
2. kill PID-file instance
3. kill remaining klir processes
4. short lock-release wait on Windows
5. stop Docker container when enabled

### Restart

- `cmd_restart()` = `stop_bot()` + process re-exec
- restart code `42` is used for service-managed restart semantics

### Upgrade

- dev installs: no self-upgrade, show guidance
- upgradeable installs: stop -> upgrade pipeline -> verify version -> restart

### Uninstall

- stop bot/service
- optional Docker image cleanup
- remove `~/.klir` via robust filesystem helper
- uninstall package (`pipx` or `pip`)

## Status panel

`klir status` shows:

- running state/PID/uptime
- provider/model
- Docker state
- error count from newest `klir*.log`
- key paths
- sub-agent status table when configured (live health if bot is running)

Note: runtime primary log file is `~/.klir/logs/agent.log`; status error counter is currently `klir*.log`-based.

## Docker command notes

`klir docker ...` commands update `config.json` and/or container/image state.

- mount/unmount paths are resolved and validated
- mount list shows host path, container target, status
- restart/rebuild is required for mount flag changes to affect running container

### Docker extras management

- `klir docker extras` shows a table of all available optional packages with their status (selected / —) and a hint to rebuild after changes.
- `klir docker extras-add <id>` adds an extra (+ transitive dependencies) to `config.json`.
- `klir docker extras-remove <id>` removes an extra from `config.json`, warns about reverse dependencies.
- without `<id>`, `extras-add` / `extras-remove` list available choices.
- after add/remove, the user must run `klir docker rebuild` to apply changes to the Docker image.
- selected extras are compiled into additional `RUN` blocks appended to the base `Dockerfile.sandbox` at build time.

## API command notes

`klir api enable`:

- requires PyNaCl
- writes/updates `config.api`
- generates token when missing

`klir api disable`:

- sets `config.api.enabled=false` (keeps token/settings)

Both require bot restart to apply.

## Service command routing

`klir service ...` delegates to platform backends:

- Linux: systemd user service
- macOS: launchd Launch Agent
- Windows: Task Scheduler

`klir service logs`:

- Linux: `journalctl --user -u klir -f`
- macOS/Windows: tail from `~/.klir/logs/agent.log` (fallback newest `*.log`)
