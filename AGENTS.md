# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Stack & tooling

Atlas is a space/permission management admin app: React 19 + Vite 6 frontend, Hono + Drizzle + `bun:sqlite` backend. **Bun 1.3.14 is the runtime, package manager, and test runner** — there is no Node/npm/Docker. Bun workspaces link `apps/*` and `packages/*`; `@atlas/shared` is consumed via `workspace:*`. Windows is unsupported (`bun:sqlite` requires WSL2).

## Commands

```bash
bun install                                  # install (auto-links workspaces)
bun run --filter @atlas/api db:migrate       # apply committed migrations
bun run --filter @atlas/api db:seed          # reset DB + load demo fixtures
bun dev                                       # migrate, then run web + api together
bun dev:web / bun dev:api                      # run one side (api migrates first)
bun run build / bun run typecheck              # all workspaces
bun run lint / bun run fmt                      # Biome check / format
bun test apps/api/src                          # run API tests
bun test apps/api/src/server.test.ts           # single test file
```

After editing `apps/api/src/db/schema.ts`: `db:generate` → `db:migrate` → `db:seed`, then re-run `bun test apps/api/src`.

Web runs at `:5173`, API at `:3000`. Vite proxies `/api/*` → `:3000`, so **all frontend calls use the `/api` prefix**. Demo login (after seed): any seeded email (e.g. `lin@atlas.team`, admin) with password `atlas-demo-password`.

## Architecture

**Three-tier permission model** (enforced in `apps/api/src/lib/permissions.ts`, not in routes):
- Workspace role (`admin`/`editor`/`viewer`) — only `admin` manages members, spaces, trash, and audit.
- Space role (`editor`/`viewer`/`null`) — space editors create/edit docs in that space.
- Per-document member role (`editor`/`viewer`/`null`) — grants single-doc access to users without space access.

Read/write checks compose these: public docs are world-readable; `invite` docs reachable by admin/author/space-member/doc-member; `private` docs only admin/author. Use the `require*` helpers (`requireSpaceEditor`, `requireDocumentEditor`, `requireDocumentRead`) and list helpers (`listReadableSpaces`, `listReadableDocuments`) rather than re-deriving access. Soft-deleted docs (`deletedAt`) are excluded everywhere except admin trash routes.

**Request flow** (`apps/api/src/server.ts`): global middleware order is `logger → cors → authMiddleware → csrfMiddleware`, then routers mounted under `/auth`, `/spaces`, `/documents`, `/members`. Errors are centralized in `app.onError` — throw `HttpError` (via `forbidden()`/`notFound()`/`unauthorized()` from `lib/http-error.ts`) or let `ZodError` bubble; both map to JSON `{ code, message }`. Don't hand-craft error responses in routes.

**Auth/CSRF** (`apps/api/src/lib/auth.ts`): session via `atlas_session` cookie (HttpOnly, SameSite=Lax, 30d) or `Bearer` token. Non-GET requests require an `X-Atlas-CSRF` header matching the session's CSRF token (except `/auth/login`); the web `api-client.ts` injects it from the `atlas_csrf` cookie. Unauthenticated requests proceed as guests (public docs only) — routes gate with `requireUser(c.get('user'))`.

**Shared contracts** (`packages/shared/src/index.ts`): Zod schemas + inferred domain types are the single source of truth shared by both apps. Seed fixtures live in `apps/api/src/db/seed-data.ts`. `html-metadata.ts` extracts title/summary from uploaded HTML.

**Frontend** (`apps/web/src/`, flat structure): React Query (`data-hooks.ts`) for all server state; `api-client.ts` is the only fetch layer (keeps `bun:sqlite` types out of the browser build). Uploaded HTML is rendered in a sandboxed iframe. URL routing via react-router. `.tsx` files are covered by typecheck and Biome; loose prototype typing is centralized in `loose-types.ts`.

## Conventions

- Biome: single quotes, semicolons, 2-space indent, 100-col width. `biome.json` excludes generated/build directories, `*.html`, `apps/web/src/styles.css`, and migrations meta.
- TS is strict with `noUncheckedIndexedAccess`; uses `.ts` extension imports (`allowImportingTsExtensions`) and `verbatimModuleSyntax` (use `import type` for types).
- DB default path is resolved relative to the API package dir, so scripts behave the same from repo root or `apps/api`. Tests use a separate `test-atlas.sqlite` (override via `DATABASE_URL`).

`todo.md` and `README.md` track current MVP status and known gaps (no email verification/SSO, no e2e, production CSP hardening pending).
