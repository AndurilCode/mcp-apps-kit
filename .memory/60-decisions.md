# Decision Log

## 2026-01-10: Weather example strategy
- **Decision**: Use a free weather API (no key required) for runtime, but fully mock in tests.
- **Rationale**: Keep the demo realistic while ensuring deterministic CI tests.
- **Candidate APIs**:
  - Open-Meteo (no API key) as default.
  - Mock-only fallback if network constraints exist.

