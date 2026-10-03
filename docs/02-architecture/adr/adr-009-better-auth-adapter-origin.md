---
title: "Better Auth Drizzle Adapter Origin"
slug: "adr-009-better-auth-adapter-origin"
category: "adr"
status: "accepted"
version: "1.0.0"
owner: "@auth-owner"
reviewers: ["@tech-lead"]
module: "auth"
tags: ["architecture", "decision", "better-auth", "adapter"]
audience: ["dev", "architect"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related: []
replaces: []
replaced-by: null
---

# ADR-009: Better Auth Drizzle Adapter Origin

## Context

The codebase imports the Drizzle adapter from `@better-auth/drizzle-adapter`. Initial investigation suggested this might not be the official package.

## Decision

The import `import { drizzleAdapter } from '@better-auth/drizzle-adapter'` is correct and uses the official package.

## Evidence

- Package: `@better-auth/drizzle-adapter@1.6.26`
- Repository: `https://github.com/better-auth/better-auth` (monorepo, `packages/drizzle-adapter`)
- Registry: npm public registry
- Homepage: `https://www.better-auth.com/docs/adapters/drizzle`
- The alternative import path `better-auth/adapters/drizzle` does not exist in the installed `better-auth` package

## Consequences

- No code change required
- The dependency remains in `package.json` as a direct dependency (also pulled as peer via `better-auth`)
- Version stays aligned with `better-auth` (currently 1.6.26)

## Alternatives Rejected

- Changing import to `better-auth/adapters/drizzle` — path does not exist
- Removing `@better-auth/drizzle-adapter` from dependencies — would break resolution since it's not re-exported by `better-auth`
