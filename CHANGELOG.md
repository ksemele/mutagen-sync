# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] — 2026-09-20

### Added

- Workspace mode (`mutagen.workspaceMode`, off by default): sessions whose local endpoint lies inside an open workspace folder (or whose project is locked there) are shown at the top level; all others go to a collapsed "Other Sessions" group (`mutagen.otherSessions`: `collapsed` | `hidden`). Status bar counts and Pause All / Resume All only cover workspace sessions
- In workspace mode, a `mutagen.yml` in a workspace folder shows as a project node with inline Start / Pause / Resume / Terminate buttons (`mutagen project start|pause|resume|terminate`). A stale `mutagen.yml.lock` without sessions shows both

### Changed

- Session list is read with `mutagen sync list -l` to pick up the `io.mutagen.project` label

## [0.1.1] — 2026-05-08

### Added

- Screenshots in README: panel view with session states, status bar item, panel with colors disabled

## [0.1.0] — 2024-05-06

### Added

- Tree view in Explorer showing all Mutagen sync sessions with status icons
- Status bar item showing overall sync health with session count
- Per-session inline buttons: Pause, Resume, Flush (force sync), Terminate, Hide/Unhide
- View title toolbar: Resume All, Pause All, Refresh, Settings
- Hidden Sessions group with Resume All Hidden, Pause All Hidden, Show All buttons
- Terminate session with optional confirmation dialog (`mutagen.confirmTerminate`)
- Settings: `refreshInterval`, `binaryPath`, `showSessionCounts`, `statusBarColorByStatus`, `coloredIcons`, `alphaLabel`, `betaLabel`, `confirmTerminate`
- Docker-based test environment (`test-env/`) with three sessions demonstrating Watching, Paused, and Disconnected states
- Load generation script (`test-env/gen-load.sh`) for testing active sync display
