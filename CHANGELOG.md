# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-23

### Added
- Initial public release
- Real-time SSE event streaming
- 13 monitoring tabs across 5 categories:
  - **Live**: Live Events, Canvas SSE, Chat Pipeline
  - **System**: Services Health, Governor, Structural Health, Agent Infra
  - **Testing**: Test Center
  - **Analytics**: TQI, Metrics, Project Reality
  - **Help**: Language Registry, User Guide
- FastAPI backend with auto-discovery
- VS Code extension support
- Framework detection (React, Vue, Angular, FastAPI, etc.)
- File watcher for project analysis
- Dark theme UI
- GitHub Actions CI workflow

### Security
- Localhost-only by default
- No external dependencies for frontend
