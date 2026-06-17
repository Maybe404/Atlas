# Phase 4 — Visibility rework (access + folder restricted) Implementation Plan

**Goal:** Replace document `visibility (public|invite|private)` with `access (inherit|restricted)`; make public exposure flow solely through `share_links`; enable the deferred `folders.restricted` enforcement in the read/write resolution chain.

**Architecture:** Resolution collapses to a single source of truth (`canReadDocumentWithLookup` / `canEditDocumentWithLookup`); async `canRead/canEditDocument` delegate to the lookup variants. `loadPermissionLookup` now always carries folder metadata (parent chain + restricted set), space owners, published-doc set, plus member grants on space/folder/document. Reader left-side animation untouched.

## Resolution (read)
1. `deletedAt` → deny.
2. enabled+unrevoked+unexpired public share link (`publishedDocIds`) → allow (guest channel).
3. no user → deny.
4. admin / author / space `ownerId` → allow.
5. direct document grant → allow (explicit, any access mode).
6. `access = restricted` → deny (no inheritance).
7. `access = inherit` → walk folder chain to space: a folder grant anywhere in chain → allow; else a `restricted` folder in chain → deny (space grant doesn't penetrate); else space grant → allow.
8. else deny.

Write = same chain requiring effective `editor` (author/admin/owner still allow).

> Folder-grant UI lands in Phase 5; in Phase 4 folder grants are simply honored if present. The observable Phase-4 behavior is: a `restricted` folder hides its `inherit` docs from space-grantees (only admin/author/owner/doc-grantee see them).

## Backend
- `packages/shared`: `AccessSchema = enum(inherit,restricted)`; `DocumentSchema.access` (+ `published?`), `Create/UpdateDocumentSchema.access`; drop `VisibilitySchema`.
- `schema.ts`: `documents.access text notNull default 'inherit'`; swap `visibility` indexes → `access`. Migration 0010 (hand-authored): add `access`, backfill `private→restricted else inherit`, drop visibility indexes + column, create access indexes.
- `permissions.ts`: expand `PermissionLookup`; rewrite `loadPermissionLookup`, both `canRead*`/`canEdit*` (lookup = source of truth, async delegates), `listReadableDocuments` (JS-filter via lookup, accepts optional lookup).
- `documents.ts`: create/upload/patch use `access`; share GET returns `access`; share PATCH drops the private-doc invite ban (restricted docs are now shareable); `toDoc`/hydrate emit `access`+`published`.
- `spaces.ts` `toDoc`: emit `access`+`published`.
- `seed-data.ts`/`seed.ts`: fixtures use `access`+`published`; seed creates share links for published docs (keep `demo-d1-public-link`).

## Frontend
- `labels.ts`: `accessLabel`. `space-index`/`admin-docs`: filter + chip on access/published; create default `access:'inherit'`. `upload-view`: `meta.access`, form field `access`. `reader-view`: lock chip/copy use `access` (no animation change). `dialogs.tsx` share: remove `isPrivateDoc` invite gate, use `share.access`. `auth.tsx` `firstPublicDoc` + `app.tsx` use `published`. `data-hooks` directoryFields `visibility→access`.

## Tests (`server.test.ts`)
- Guest list test → assert published/locked via `published`/`canRead` (not `visibility`).
- Replace "rejects member invitations on private documents" → "allows member invitations on restricted documents".
- New: restricted-folder hides inherit doc from a space-viewer; admin/author still read.
- Update create/upload bodies `visibility→access`.

## Verify
`db:generate`→`db:migrate`→`db:seed`; `bun test apps/api/src`; `bun run typecheck`; `bun run lint`; `bun run build`.
