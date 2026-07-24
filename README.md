# HealthThread

[![CI](https://github.com/patricktran1/HealthThread/actions/workflows/ci.yml/badge.svg)](https://github.com/patricktran1/HealthThread/actions/workflows/ci.yml)
[![CodeQL](https://github.com/patricktran1/HealthThread/actions/workflows/codeql.yml/badge.svg)](https://github.com/patricktran1/HealthThread/actions/workflows/codeql.yml)

**A patient-controlled health memory workspace for organizing events, documents, trends, and physician-facing summaries.**

HealthThread helps a person maintain a longitudinal thread across visits, laboratory results, medications, symptoms, procedures, imaging, and imported documents. The product combines a Supabase-backed event record with bounded memory and generation integrations.

## Current product surface

- structured health-event timeline
- document import and private signed URLs
- patient profile and onboarding
- trend views and physician-facing summaries
- conversational retrieval over the user's health memory
- explicit disclaimers that generated output is not a diagnosis or treatment plan

## Deterministic safety boundaries

Health-event input is normalized before database or memory writes:

- calendar dates must use valid `YYYY-MM-DD` values
- event types are restricted to an explicit allowlist
- titles and optional fields have bounded lengths
- tags are trimmed, bounded, and deduplicated case-insensitively
- database values and memory text are derived from the same normalized record
- document display names and file kinds are parsed without trusting query strings or malformed encoding

These controls improve consistency and failure behavior. They do not establish medical accuracy, completeness, or fitness for clinical use.

## Quality gates

Every pull request runs:

1. repository and secret-hygiene checks
2. high-severity dependency auditing with a retained JSON artifact
3. strict ESLint validation
4. TypeScript validation
5. deterministic domain regression tests
6. native Node coverage reporting with a retained artifact
7. a production application build
8. CodeQL extended security analysis

Dependabot maintains both npm and GitHub Actions dependencies.

## Development

Requires Node.js 22 or later.

```bash
cp .env.example .env
npm ci
npm run validate
npm run dev
```

The repository never requires a committed `.env`. Client-side Supabase publishable configuration belongs in local or deployment environment settings. Service-role credentials must never enter this repository.

## Repository map

```text
src/lib/health-event.ts       health-event normalization and bounds
src/lib/document-path.ts      pure document path and kind helpers
src/routes/                   TanStack Start product routes
src/integrations/supabase/    database and authentication integration
supabase/migrations/          schema and row-level-security migrations
test/                         deterministic domain regression tests
.github/workflows/            CI and CodeQL automation
```

## Scope

This is an early-stage health-information product, not a medical device, diagnostic system, emergency service, or substitute for a physician. The application should not be used to make autonomous care decisions.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution and review expectations.
