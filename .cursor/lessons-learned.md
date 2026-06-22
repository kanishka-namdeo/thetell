# Lessons Learned

This file tracks mistakes, anti-patterns, and lessons learned during development.
Updated by the continuous-improvement rule after debugging failures or receiving code review feedback.

---

<!-- Add entries below in the format:
## [Date] - [Brief Title]

- **Mistake**: What happened
- **Root cause**: Why it happened
- **Rule/Skill updated**: Which file was changed
- **Pattern added**: One-line description of the new guidance
-->

## 2026-06-19 - Test Credential Confusion (Corrected)

- **Mistake**: Initially wrote rules saying tests should NEVER use real credentials or database. User clarified the opposite: agents should USE the real local database and seeded credentials for testing.
- **Root cause**: Misunderstood the testing philosophy. The project uses a local Docker database with seeded test data specifically for testing. Agents were confused about whether to mock everything or use the real local resources.
- **Rule/Skill updated**: `environment.mdc`, `testing.mdc`, `testing-conventions.mdc`
- **Pattern added**: Tests SHOULD use the local database and seeded credentials (admin@thetell.com / password123). Only mock external services (LLM APIs, HTTP requests). The local database is the test database.

