# Changelog

All notable changes to this project will be documented in this file.

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
