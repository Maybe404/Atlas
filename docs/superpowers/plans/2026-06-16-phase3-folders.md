# Phase 3: Folders (brief plan)

**Goal:** Spaces can hold nested folders; documents can live in a folder (or at space root). New articles pick a path. The reader-left animation/interaction is untouched (directory payload stays backward-compatible — `children` docs remain; folders are an additive field).

**Sequencing note:** the `folders.restricted` flag is *stored* in 3a but *enforced* in Phase 4, where the inherit/restricted resolution chain lands. Enforcing it now against the soon-replaced `visibility` model would be throwaway work. Until Phase 4, folders inherit space access (decision Z's default path).

## 3a — Backend (this step)

1. **schema** (`db/schema.ts`):
   - `folders`: `id`, `spaceId`→spaces (cascade), `parentId`→folders (cascade, nullable), `name`, `restricted` bool default false, `order` int default 0, `createdAt`. Index on `(spaceId)` and `(parentId)`.
   - `documents.folderId`: text nullable → folders, `onDelete set null` (deleting a folder drops its docs to space root, never destroys them).
2. **migration 0008** (`db:generate`; no data backfill — folderId defaults null).
3. **shared** (`packages/shared`): `FolderSchema`, `CreateFolderSchema` (name, parentId?, restricted?), `UpdateFolderSchema` (name?, parentId?, restricted?, order?). Add `folderId` to `DocumentSchema`; add `folders: Folder[]` to `SpaceSchema`. `CreateDocumentSchema` + `UpdateDocumentSchema` gain optional `folderId`.
4. **folders router** (`routes/folders.ts`, mounted `/folders`):
   - `POST /` (body: spaceId, name, parentId?, restricted?) — requireSpaceEditor; validate parent is in the same space; reject cycles (parent chain).
   - `PATCH /:id` — rename / move (parentId) / toggle restricted / reorder; requireSpaceEditor on the folder's space; re-validate no cycle when moving.
   - `DELETE /:id` — requireSpaceEditor; refuse if it has subfolders or live documents (mirror space-delete guard); else delete.
   - List is delivered via the spaces payload (#6), not a separate endpoint.
5. **documents** (`routes/documents.ts`): create + update accept `folderId`; validate the folder exists and belongs to the doc's space (else `badRequest`). `toDoc` includes `folderId`.
6. **spaces** (`routes/spaces.ts`): each space in `GET /` and `GET /:id` includes `folders` (the space's folder rows the user may see — for 3a, all folders of a readable space). `toDoc`/`buildChildren` include `folderId`.
7. **permissions**: a `requireSpaceEditorForFolder(user, folderId)` helper (load folder → its space → requireSpaceEditor). No resolution-chain change yet (restricted deferred to Phase 4).
8. **seed**: add a couple demo folders in a shared space and file 1–2 docs under them (proves nesting + folderId render).
9. **tests** (`server.test.ts`): create folder (editor) / forbidden for non-editor; nested folder; cycle rejected; create doc in a folder; move doc between folders; folder delete refused when non-empty then allowed; spaces payload exposes `folders` + doc `folderId`.
10. **verify**: typecheck + lint + clean migrate/seed + full suite.

## 3b — Frontend (next step, after 3a)

Directory tree renders folders (nested, collapsible) above/around `children`, grouped by `folderId`; create-article dialog gains a path picker (space + folder). Reader-left animation logic unchanged — only the data it iterates gains folder grouping.
