# Changelog

All notable changes to ClawController will be documented in this file.

## [1.1.0] - 2026-02-07

### Added

#### Stuck Task Detection System
- Background monitoring every 30 minutes for tasks stuck in same status too long
- Configurable thresholds: 24-48h for normal tasks, 12-24h for urgent
- Offline agent detection and alerts
- Notification cooldown to prevent spam (6-hour minimum between alerts)
- Consecutive detection escalation (alerts after 2 detections)
- Frontend floating monitor widget with real-time dashboard
- API endpoints: `/api/monitoring/stuck-tasks/check` and `/status`

#### Backup/Fallback Models Per Agent
- Configure primary and fallback models for each agent
- Automatic fallback switching when primary model fails
- Failure count tracking and reset on model changes
- Manual restoration to primary model via dashboard
- New "Models" tab in agent edit modal
- Visual indicators on agent cards showing fallback status
- Activity logging for all model operations
- Agent notifications when fallback activates

#### Review Gate Enforcement
- Agents cannot set tasks to DONE directly - must go through REVIEW first
- Only the designated reviewer can approve tasks to DONE
- API-level enforcement (not just UI)
- Prevents workflow bypass

#### Auto-Reviewer Notification
- Automatically notifies the reviewer when a task is submitted for review
- Uses OpenClaw agent messaging for real-time alerts
- Configurable notification preferences

#### Deliverables System Improvements
- File path support for deliverables
- Preview modal for viewing deliverable contents
- Deliverables included in task list endpoint
- Removed checkbox concept - deliverables are files, not checklists

### Changed
- Agent cards now show model status indicators
- Task modal includes enhanced activity timeline
- Improved error handling for agent notifications

### Fixed
- Import dialog z-index issues
- Dialog positioning in modals
- Database path handling for portable installations

---

## [1.0.4] - 2026-02-06

### Added
- Route agent generation to main agent via OpenClaw
- Agent config improvements: models from OpenClaw, default paths

---

## [1.0.3] - 2026-02-05

### Added
- Orchestrator initialization flow for empty state
- Import dialog improvements

### Fixed
- SQLite database path handling
- Data directory creation

---

## [1.0.2] - 2026-02-05

### Fixed
- Portable paths in start/stop scripts

---

## [1.0.1] - 2026-02-05

### Added
- Empty State UI with setup wizard
- OpenClaw Import functionality
- Dynamic lead agent support
- AGENT_INSTRUCTIONS.md for integration

### Fixed
- Frontend source files packaging
- npm postinstall loop

---

## [1.0.0] - 2026-02-04

### Added
- Initial release
- Kanban board with drag-drop task management
- Real OpenClaw agent status integration
- Task workflow with approve/reject
- Squad Chat with @mention routing
- Live Feed and Announcements
- Due dates, attachments, activity log
- Agent Management (create/edit/delete)
- Recurring Tasks
- NPM package and bash installer
