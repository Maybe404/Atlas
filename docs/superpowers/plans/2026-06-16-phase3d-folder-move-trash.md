# Phase 3d — Folder move + soft-delete to trash

**Goal:** Make folder management non-destructive: move a whole folder (subtree, no file loss), warn which files are affected on move/delete, and soft-delete folders to the trash (folder shown in trash; click reveals its files; restorable).

**Constraint:** Reader page left-side animation/interaction unchanged.

## Model

New columns:
- `folders`: `deletedAt`, `deletedBy`(→members), `purgeAfter`, `trashedUnderFolderId` (the trash-root folder this folder was cascade-deleted under; NULL ⇒ this folder is itself the root the user deleted).
- `documents`: `trashedUnderFolderId` (the trash-root folder a doc was cascade-trashed under; NULL ⇒ loose/independently trashed).

Invariants:
- Live folder tree = folders with `deletedAt IS NULL`.
- Trash folder entries = folders with `deletedAt IS NOT NULL AND trashedUnderFolderId IS NULL` (roots only).
- Files inside a trashed folder X = docs with `trashedUnderFolderId = X.id`.
- Loose trashed docs (current behavior) = docs with `deletedAt IS NOT NULL AND trashedUnderFolderId IS NULL`.
- Docs never change `folderId` on folder delete → **no file loss**; restore re-reveals them in place.

## Backend

1. `schema.ts`: add columns above + `folders.deletedAt` index. `db:generate` → migrate → seed.
2. `spaces.ts` `foldersBySpaceIds`: filter `isNull(folders.deletedAt)`.
3. `folders.ts`:
   - DELETE → soft cascade: compute subtree (root + descendants), set `deletedAt/deletedBy/purgeAfter` on subtree folders (root.trashedUnderFolderId=null, descendants=root.id) and on live docs whose `folderId ∈ subtree` (trashedUnderFolderId=root.id). Return `{ ok, folders, docs }` counts. Already-trashed docs untouched.
   - POST `/:id/restore` (admin): clear delete columns on root + folders/docs with `trashedUnderFolderId = id`; if root's parent is missing/deleted, reset `parentId = null`.
   - GET `/trash` (admin): root deleted folders each with `spaceName`, counts, and `files` (docs where `trashedUnderFolderId = root.id`).
   - DELETE `/:id/permanent` (admin): hard-delete subtree folders + their cascade docs (root must be a trashed root).
4. `documents.ts` `/trash`: return only docs with `trashedUnderFolderId IS NULL` (loose), so cascade docs show under their folder, not twice. Extend `/trash/purge-expired` to also purge expired trashed folders + their docs.

## Frontend

5. `data-hooks.ts`: `restoreFolder`, `permanentDeleteFolder` mutations; `atlasKeys.trashFolders`; deleteFolder toast → "已移至回收站"; invalidate trash keys.
6. `dialogs.tsx` SpaceManagerDialog: per-folder **移动** action (inline parent `<select>` of valid targets = space folders minus self+descendants, plus 根目录) → `updateFolder(id,{parentId})`. Delete confirm shows affected file count (computed from live folders+children) and states it goes to trash.
7. `trash-pane.tsx`: render trashed-folder groups (expandable → files) above loose docs; restore-folder + permanent-delete-folder buttons.
8. `styles.css`: trash folder group styles.

## Verify
`typecheck` 0, `lint` 0 errors, `build` ok, `bun test apps/api/src` green (add folder soft-delete/restore test to server.test.ts). Then `bun dev` visual.
