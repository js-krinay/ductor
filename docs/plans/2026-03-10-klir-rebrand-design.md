# Design: Full Rebrand to klir + uv Publish

## Goal

Rename the project from `ductor` to `klir` across the entire codebase, reset
the version to 0.1.0, switch to `uv build`/`uv publish` for packaging, and
publish to PyPI under the new name.

## Naming Map

| Current | New |
|---|---|
| PyPI package: `ductor` | `klir` |
| Module directory: `ductor_bot/` | `klir/` |
| CLI command: `ductor` | `klir` |
| Class: `DuctorPaths` | `KlirPaths` |
| Config key: `ductor_home` | `klir_home` |
| Default path: `~/.ductor` | `~/.klir` |
| Env vars: `DUCTOR_*` | `KLIR_*` |
| Docker image: `ductor-sandbox` | `klir-sandbox` |
| Docker container: `ductor-sandbox` | `klir-sandbox` |
| systemd service: `ductor` | `klir` |
| launchd label: `dev.ductor` | `dev.klir` |
| Windows task: `ductor` | `klir` |
| Images dir: `ductor_images/` | `klir_images/` |

## Metadata

| Field | Value |
|---|---|
| Version | `0.1.0` |
| Author | Jinay Shah |
| Credits | Originally forked from [ductor](https://github.com/PleasePrompto/ductor) by PleasePrompto |
| GitHub repo | `js-krinay/klir` (rename from `js-krinay/ductor`) |

## Build System

The build backend stays as hatchling. The change is using `uv build` and
`uv publish` as the frontend instead of `python -m build` + `twine upload`.

`uv build` calls whatever `build-backend` is specified in pyproject.toml.
It is a frontend, not a replacement for hatchling.

Publish flow:

```bash
uv build
uv publish --token $PYPI_TOKEN
```

## Scope of Changes

### Phase 1: Directory and Module Rename

1. Rename `ductor_bot/` -> `klir/`
2. Rename `ductor_bot/bot/ductor_images/` -> `klir/bot/klir_images/`
3. Delete image files from `klir/bot/klir_images/` and `docs/images/ductor-*.jpeg`
   (new images will be generated separately)

### Phase 2: Global Find-Replace

All source files, in order:

1. `ductor_bot` -> `klir` (Python imports, config refs, build config)
2. `DuctorPaths` -> `KlirPaths` (class name)
3. `ductor_home` -> `klir_home` (config field, parameter names)
4. `DUCTOR_` -> `KLIR_` (environment variables)
5. `ductor-sandbox` -> `klir-sandbox` (Docker defaults)
6. `"ductor"` -> `"klir"` (service names, CLI command refs)
7. `~/.ductor` -> `~/.klir` (path strings in docs and defaults)
8. `dev.ductor` -> `dev.klir` (launchd label)
9. `ductor.dev` -> update or remove URLs
10. `PleasePrompto/ductor` -> `js-krinay/klir` (GitHub URLs)
11. `ductor_images` -> `klir_images` (image directory refs)

### Phase 3: pyproject.toml Updates

- `name = "klir"`
- `version = "0.1.0"`
- `authors = [{ name = "Jinay Shah" }]`
- Add `credits` or note in description about PleasePrompto
- Update `keywords` to replace "ductor" with "klir"
- Update all `[project.urls]`
- Entry point: `klir = "klir.__main__:main"`
- Build targets: `packages = ["klir"]`
- `known-first-party = ["klir"]`
- Ruff/mypy excludes updated to `klir/`

### Phase 4: Documentation

- Update README.md (all command examples, paths, install instructions)
- Update CLAUDE.md (module map, commands, paths)
- Update GitHub issue templates
- Update workspace defaults (`_home_defaults/` RULES and tool scripts)

### Phase 5: GitHub Repo Rename

- Rename `js-krinay/ductor` to `js-krinay/klir` via GitHub settings
- GitHub auto-redirects the old URL

### Phase 6: Publish

```bash
uv build
uv publish --token $PYPI_TOKEN
```

## What Does NOT Change

- All logic, architecture, and runtime behavior
- hatchling as build backend
- Test structure and conventions
- Dependency list
