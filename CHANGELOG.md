# Changelog

All notable changes to this project will be documented in this file.

## [5.0.0] - 2026-02-19

### Added
- **`context_export`** — export all memory (notes, optionally credentials) to an encrypted `.json.enc` file for backup or machine transfer
- **`context_import`** — restore memory from an exported file, merging notes without overwriting existing data
- **Auto-backup** — `session_notes.md` is automatically backed up before every modification (`.backups/` folder, 30-day retention with auto-pruning)

## [4.0.0] - 2026-02-19

### Added
- **`context_status`** — diagnostics tool showing server health, session count, notes, disk usage, encryption status
- **AES-256-GCM encryption** for credentials (machine-bound key via `scrypt`)
- **Auto-migration** from plaintext `.credentials` to encrypted `.credentials.enc`
- **Input validation** — path existence checks, session ID format validation
- **Response truncation** — 50,000 char limit with `[TRUNCATED]` warning

### Changed
- Every tool handler wrapped in try/catch with descriptive `❌` error messages
- Version bumped to 4.0.0

## [3.0.0] - 2026-02-19

### Added
- **`save_note`** — persistent notes with tags (codeword, instruction, decision, credential, todo)
- **`recall_notes`** — search across saved notes with tag filtering

### Changed
- `recall` and `recall_session` now include session notes in output

## [2.0.0] - 2026-02-19

### Added
- **`recall_sessions`** — compact index of recent sessions with dates and titles
- **`recall_session`** — full details of a specific session by ID
- **Project-aware filtering** — `project_path` parameter for scoping results

### Changed
- `recall` redesigned for progressive context loading (task.md only, not everything)

## [1.0.0] - 2026-02-18

### Added
- Initial release
- **`recall`** — basic context recall from brain directory
- **`list_projects`** — list tracked projects
- **`get_credentials`** / **`save_credentials`** — project-scoped credential storage
- **`save_context_file`** — write AGENT_CONTEXT.md to project directory
