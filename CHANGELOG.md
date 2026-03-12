# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-03-12

### Added

- Bring OpenCode provider to full feature parity (`cli`)

## [0.5.0] - 2026-03-12

### Added

- Add OpenCode CLI as fourth provider (`cli`)
- Add service restart subcommand (`cli`)

### Fixed

- Fix flaky gemini auth and supervisor port tests (`tests`)

## [0.4.2] - 2026-03-12

### Added

- Add uv tool install detection and upgrade support (`infra`)

### Fixed

- Use correct PyPI package name klir-bot (`infra`)

## [0.4.0] - 2026-03-12

### Added

- Add tool loop detection, tool filtering, and rich tool display (`cli`)

### Fixed

- Repair HTML tag splits in Telegram messages (`bot`)

## [0.3.0] - 2026-03-12

### Changed

- **BREAKING:** Remove Docker sandboxing and ML extras

## [0.2.0] - 2026-03-11

### Added

- Add per-run logging, backoff, alerts, and delivery tracking (`cron`)
- Make interagent API port configurable (`config`)
- Add /interrupt command for soft SIGINT (`bot`)
- Add update_check option (`config`)
- Add compact, think, and peer isolation (`session`)
- Add user-defined on-message hooks (`hooks`)

### Fixed

- Improve error handling in interrupt and health check
- Keep stdin open for Codex-in-Docker on Windows (`cli`)
- Add group_mention_only guards and fix is_message_addressed (`bot`)
- Translate Docker container paths to host paths (`files`)
- Increase default CLI timeout to 1800s (`config`)

### Changed

- Remove dead code from orchestrator, cli, session, workspace

## [0.1.0] - 2026-03-11

### Added

- Initial release with Telegram bot routing to provider CLIs
- Network resilience with retry and conflict detection (`bot`)
- Message forwarding and copying support (`bot`)
- Thread binding lifecycle management (`bot`)
- Configurable reply_to_mode setting
- Poll creation from provider CLI output (`bot`)
- Tool execution approval routing
- Channel post support for broadcast channels (`bot`)
- HTTP/SOCKS5 proxy support for Telegram API
- Paired users persistence and pairing prompts (`bot`)
- Per-chat enabled check via resolver (`middleware`)
- ChatConfigResolver for per-chat config layering
- /pair command for admin code generation (`bot`)
- ReactionService for emoji feedback (`bot`)
- Scoped commands registration (private vs group) (`bot`)
- PairingService for code-based user onboarding
- ChatOverrides and PairingConfig schemas (`config`)
- ReactionConfig with level/emoji settings (`config`)
- Group mention-only mode for Telegram group chats
- Multi-agent architecture with single-process supervisor
- Async inter-agent communication with deep identity
- SharedKnowledgeSync: automatic SHAREDMEMORY.md to all agents
- Agent CLI command for sub-agent management
- Named background sessions with follow-ups and session management
- Centralized config hot-reload
- Auth-aware cron task rule files (CLAUDE.md/AGENTS.md/GEMINI.md)
- Docker host mounts, GitHub issue templates, abort word expansion
- WebSocket API server (beta), files module, upgrade pipeline
- Docker Chrome support, mount_host_cache config
- Docker-aware Gemini execution, session recovery
- Gemini CLI provider, auth abstraction
- CLI error classification with user-friendly hints
- Bundled Dockerfile.sandbox, Docker-aware skill sync
- Cross-platform background service, provider-isolated sessions
- Windows compatibility, /stop abort fix, forum topic docs
- Telegram Forum Topic support (message_thread_id propagation)
- SIGKILL auto-recovery, group-chat quick commands
- Automation controls and post-release reliability fixes
- Quiet hours, dependency queuing
- Flexible execution control with per-task model selection
- File browser, bundled skills, workspace rules refresh
- Skill sync, message queue, reliable /stop
- Systemd service management
- Workspace module and home defaults
- Allowed group IDs for group chat authorization
- Topic-based session isolation with transport-agnostic SessionKey
- Named sessions for inter-agent communication
- /stop_all command to kill processes across all agents
- Background task system, timeout controller, startup recovery
- Optional Docker extras for AI/ML packages in sandbox
- Hot-reload .env secrets
- External API secrets via ~/.klir/.env
- Per-topic model/provider selection in forum groups
- Topic-aware task routing
- Group audit on startup, every 24h, and on hot-reload
- Hot-reload allowed_user_ids/allowed_group_ids
- /where, /leave, auto-leave, and chat activity tracking
- Unified MessageBus with Envelope system

### Fixed

- Replace klir.dev branding with klir
- Ignore commands addressed to other bots in group chats (`bot`)
- Read config dynamically for hot-reload, remove unused reaction level
- Delete all scoped commands on shutdown (`bot`)
- Use model_validate for mypy strict compat in ChatConfigResolver
- Prevent CUDA torch replacing CPU-only version in Docker extras
- Propagate chat_id/topic_id through async inter-agent chain
- Windows Docker and Gemini CLI compatibility
- Prevent model cache wipe and add hardcoded fallback models
- Preserve session on CLI timeout for auto-resume
- Deliver task questions/results to originating forum topic
- Make group_mention_only hot-reloadable
- Task result injection sends formatted prompt instead of raw original
- Topic session list rendered as code block due to pipe characters
- Correct model display in CLI service log for cross-provider sessions
- Cross-provider model resolution and @model shorthand for /session
- Pass session provider/model overrides to background observer
- Cron/webhook quiet hours no longer inherit heartbeat defaults
- Cron result delivery race, Windows pipx upgrade PermissionError
- Windows timezone crash with tzdata dependency
- Gemini CLI exit-42 and hang on Windows background tasks
- Verify upgrade version before restart, bypass pip cache
- Send session recovery message as streaming delta
- Restore os.execv restart on POSIX
- Force Gemini model cache refresh on startup
- Show all valid Gemini models instead of filtering by isActiveModel
- Docker multi-agent mode, inter-agent communication, codex parser
- Only show upgrade buttons in changelog when version is newer
- Improve stop flow for service/kill and Windows venv detection
- Mock external CLI lookups and auth in tests (`test`)

### Changed

- Centralize shared code, eliminate duplication across modules
- Split monoliths, centralize shared code, clean architecture
- Extract selectors, providers, lifecycle from orchestrator
- Wire observers to bus in one call, remove wrapper indirection
- Replace /bg with /session, add session tag to responses
- Extract is_windows to infra.platform, inline wrappers, remove dead code
- Cross-platform process tree kill, robust rmtree, global test signal safety
- DRY centralization: shared modules, layer separation, dead code removal
- Type resolver as ChatConfigResolver (`middleware`)
- Unified MessageBus with Envelope system for all delivery paths
- Switch dev workflow to uv

[0.5.1]: https://github.com/js-krinay/klir/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/js-krinay/klir/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/js-krinay/klir/compare/v0.4.0...v0.4.2
[0.4.0]: https://github.com/js-krinay/klir/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/js-krinay/klir/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/js-krinay/klir/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/js-krinay/klir/releases/tag/v0.1.0
