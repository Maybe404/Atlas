# Phase 1: Grants Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two ad-hoc membership tables (`space_members`, `document_members`) with one polymorphic `grants` table as the single source of truth for authorization, with **zero externally observable behavior change**.

**Architecture:** A new `grants(subjectType, subjectId, targetType, targetId, role)` table stores every "subject (member/group) → target (space/folder/document) → role" edge. Phase 1 only exercises `subjectType='member'` and `targetType in ('space','document')`; `group`/`folder` columns exist now so later phases add rows without a migration. A new `lib/grants.ts` data-access module hides the polymorphic SQL; `permissions.ts` and every membership read/write route call it instead of the old tables. Old tables are left defined-but-unwritten and dropped in Phase 6.

**Tech Stack:** Bun 1.3.14 (runtime/test runner), Hono, Drizzle ORM, `bun:sqlite`, Zod (`@atlas/shared`).

**Reference spec:** `docs/superpowers/specs/2026-06-16-permissions-spaces-folders-groups-design.md` (§3.2 grants, §4 resolution, §7 migration).

---

## File Structure

- **Create** `apps/api/src/lib/grants.ts` — data-access for the grants table (upsert/remove/read helpers). One responsibility: grant rows.
- **Create** `apps/api/src/lib/grants.test.ts` — unit tests for the module.
- **Modify** `apps/api/src/db/schema.ts` — add `grants` table (keep `spaceMembers`/`documentMembers` for now).
- **Create** `apps/api/src/db/migrations/0006_*.sql` (generated) — CREATE TABLE + backfill from old tables.
- **Modify** `apps/api/src/lib/permissions.ts` — read every membership fact from grants.
- **Modify** `apps/api/src/routes/spaces.ts` — space-membership reads/writes + space-delete cleanup → grants.
- **Modify** `apps/api/src/routes/documents.ts` — document-membership reads/writes → grants.
- **Modify** `apps/api/src/routes/members.ts` — `GET /permissions` + member-delete cleanup → grants.
- **Modify** `apps/api/src/db/seed.ts` — seed grants instead of old tables.
- **Modify** `apps/api/src/server.test.ts` — white-box assertions that query the old tables → query grants.

**Invariant for the whole phase:** `bun test apps/api/src` must stay green at every commit. The HTTP-level tests are the behavior-preservation proof; only the few white-box assertions (Task 9) change.

---

### Task 1: Add the `grants` table to the schema

**Files:**
- Modify: `apps/api/src/db/schema.ts` (after the `documentMembers` table, before `shareLinks`)

- [ ] **Step 1: Add the table definition**

Insert this block in `apps/api/src/db/schema.ts` immediately after the `documentMembers` table definition (it ends at the line `);` closing `documentMembers`):

```ts
// Unified authorization edges. Replaces space_members + document_members.
// Phase 1 only writes subjectType='member' with targetType in ('space','document');
// 'group' and 'folder' are accepted now so later phases add rows without a migration.
export const grants = sqliteTable(
  'grants',
  {
    subjectType: text('subject_type', { enum: ['group', 'member'] }).notNull(),
    subjectId: text('subject_id').notNull(),
    targetType: text('target_type', { enum: ['space', 'folder', 'document'] }).notNull(),
    targetId: text('target_id').notNull(),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.subjectType, table.subjectId, table.targetType, table.targetId],
    }),
    subjectIdx: index('grants_subject_idx').on(table.subjectType, table.subjectId),
    targetIdx: index('grants_target_idx').on(table.targetType, table.targetId),
  }),
);
```

`sqliteTable`, `text`, `index`, `primaryKey` are already imported at the top of the file — no import change needed.

- [ ] **Step 2: Typecheck the schema compiles**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/schema.ts
git commit -m "feat(db): add unified grants table to schema"
```

---

### Task 2: Generate the migration and append the backfill

**Files:**
- Create: `apps/api/src/db/migrations/0006_<generated-name>.sql`

- [ ] **Step 1: Generate the migration**

Run: `bun run --filter @atlas/api db:generate`
Expected: a new file `apps/api/src/db/migrations/0006_*.sql` containing `CREATE TABLE \`grants\` ...` plus the two indexes, and an updated `meta/` snapshot. Note the exact generated filename.

- [ ] **Step 2: Append the data backfill to that generated `.sql` file**

Open the generated `0006_*.sql` and append these statements at the end (after the `CREATE INDEX` lines). This copies existing membership rows into grants so no access is lost:

```sql
--> statement-breakpoint
INSERT INTO `grants` (`subject_type`, `subject_id`, `target_type`, `target_id`, `role`)
SELECT 'member', `member_id`, 'space', `space_id`, `role` FROM `space_members`;
--> statement-breakpoint
INSERT INTO `grants` (`subject_type`, `subject_id`, `target_type`, `target_id`, `role`)
SELECT 'member', `member_id`, 'document', `document_id`, `role` FROM `document_members`;
```

(`--> statement-breakpoint` is the delimiter Drizzle's bun-sqlite migrator splits on — match the style already used in the file.)

- [ ] **Step 3: Apply the migration against a scratch DB and verify backfill**

Run:
```bash
cd apps/api && DATABASE_URL=./data/scratch.sqlite bun run src/db/migrate.ts && DATABASE_URL=./data/scratch.sqlite bun run src/db/seed.ts && rm -f ./data/scratch.sqlite*; cd -
```
Expected: `migrations applied` then the seed summary line, no errors. (Seed still writes the old tables at this point; that's fine — Task 8 switches it.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/migrations
git commit -m "feat(db): migrate grants table with backfill from membership tables"
```

---

### Task 3: Create the `lib/grants.ts` data-access module

**Files:**
- Create: `apps/api/src/lib/grants.ts`

- [ ] **Step 1: Write the module**

Create `apps/api/src/lib/grants.ts` with exactly:

```ts
import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { grants } from '../db/schema';

// Either the top-level db or a transaction handle works as the executor.
type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

export type GrantSubjectType = 'group' | 'member';
export type GrantTargetType = 'space' | 'folder' | 'document';

// Upsert one grant edge. A null role removes the edge (delete-then-maybe-insert).
export async function setGrant(
  exec: Executor,
  params: {
    subjectType: GrantSubjectType;
    subjectId: string;
    targetType: GrantTargetType;
    targetId: string;
    role: SpaceMemberRole | null;
  },
) {
  await exec
    .delete(grants)
    .where(
      and(
        eq(grants.subjectType, params.subjectType),
        eq(grants.subjectId, params.subjectId),
        eq(grants.targetType, params.targetType),
        eq(grants.targetId, params.targetId),
      ),
    );
  if (params.role) {
    await exec.insert(grants).values({
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      targetType: params.targetType,
      targetId: params.targetId,
      role: params.role,
    });
  }
}

// Member-subject convenience wrappers (the only shapes Phase 1 writes).
export function setMemberSpaceRole(
  exec: Executor,
  memberId: string,
  spaceId: string,
  role: SpaceMemberRole | null,
) {
  return setGrant(exec, {
    subjectType: 'member',
    subjectId: memberId,
    targetType: 'space',
    targetId: spaceId,
    role,
  });
}

export function setMemberDocumentRole(
  exec: Executor,
  memberId: string,
  documentId: string,
  role: SpaceMemberRole | null,
) {
  return setGrant(exec, {
    subjectType: 'member',
    subjectId: memberId,
    targetType: 'document',
    targetId: documentId,
    role,
  });
}

// All space/document grants held by one member (used to build the permission lookup).
export async function listMemberGrants(memberId: string) {
  return db
    .select({ targetType: grants.targetType, targetId: grants.targetId, role: grants.role })
    .from(grants)
    .where(and(eq(grants.subjectType, 'member'), eq(grants.subjectId, memberId)));
}

export async function getMemberSpaceRole(memberId: string, spaceId: string) {
  const [row] = await db
    .select({ role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, memberId),
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaceId),
      ),
    );
  return row?.role ?? null;
}

export async function getMemberDocumentRole(memberId: string, documentId: string) {
  const [row] = await db
    .select({ role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, memberId),
        eq(grants.targetType, 'document'),
        eq(grants.targetId, documentId),
      ),
    );
  return row?.role ?? null;
}

// Members granted on a space / document (used by the management read routes).
export async function listSpaceMemberGrants(spaceId: string) {
  return db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaceId),
      ),
    );
}

export async function listDocumentMemberGrants(documentId: string) {
  return db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'document'),
        eq(grants.targetId, documentId),
      ),
    );
}

// Cleanup helpers (replace the FK cascades the old tables relied on).
export async function removeGrantsForSubject(exec: Executor, subjectId: string) {
  await exec.delete(grants).where(eq(grants.subjectId, subjectId));
}

export async function removeGrantsForTarget(
  exec: Executor,
  targetType: GrantTargetType,
  targetId: string,
) {
  await exec
    .delete(grants)
    .where(and(eq(grants.targetType, targetType), eq(grants.targetId, targetId)));
}
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/api/src/lib/grants.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const testDb = join(import.meta.dir, '../../data/test-grants.sqlite');
process.env.DATABASE_URL = testDb;
rmSync(testDb, { force: true });
rmSync(`${testDb}-shm`, { force: true });
rmSync(`${testDb}-wal`, { force: true });
await import('../db/migrate');

const { db } = await import('../db/client');
const { grants } = await import('../db/schema');
const {
  setMemberSpaceRole,
  setMemberDocumentRole,
  getMemberSpaceRole,
  getMemberDocumentRole,
  listMemberGrants,
  listSpaceMemberGrants,
  removeGrantsForSubject,
  removeGrantsForTarget,
} = await import('./grants');

afterAll(() => {
  rmSync(testDb, { force: true });
  rmSync(`${testDb}-shm`, { force: true });
  rmSync(`${testDb}-wal`, { force: true });
});

beforeEach(async () => {
  await db.delete(grants);
});

describe('grants module', () => {
  test('setMemberSpaceRole inserts then upserts the role', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'viewer');
    expect(await getMemberSpaceRole('u1', 's1')).toBe('viewer');
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    expect(await getMemberSpaceRole('u1', 's1')).toBe('editor');
  });

  test('null role removes the grant', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    await setMemberSpaceRole(db, 'u1', 's1', null);
    expect(await getMemberSpaceRole('u1', 's1')).toBeNull();
  });

  test('document grants are independent of space grants', async () => {
    await setMemberDocumentRole(db, 'u1', 'd1', 'editor');
    expect(await getMemberDocumentRole('u1', 'd1')).toBe('editor');
    expect(await getMemberSpaceRole('u1', 'd1')).toBeNull();
  });

  test('listMemberGrants returns all targets for the member', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    await setMemberDocumentRole(db, 'u1', 'd1', 'viewer');
    const rows = await listMemberGrants('u1');
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ targetType: 'space', targetId: 's1', role: 'editor' });
    expect(rows).toContainEqual({ targetType: 'document', targetId: 'd1', role: 'viewer' });
  });

  test('listSpaceMemberGrants returns members on a space', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    await setMemberSpaceRole(db, 'u2', 's1', 'viewer');
    const rows = await listSpaceMemberGrants('s1');
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ memberId: 'u1', role: 'editor' });
  });

  test('removeGrantsForSubject clears all of a member grants', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    await setMemberDocumentRole(db, 'u1', 'd1', 'viewer');
    await removeGrantsForSubject(db, 'u1');
    expect(await listMemberGrants('u1')).toHaveLength(0);
  });

  test('removeGrantsForTarget clears all grants on a target', async () => {
    await setMemberSpaceRole(db, 'u1', 's1', 'editor');
    await setMemberSpaceRole(db, 'u2', 's1', 'viewer');
    await removeGrantsForTarget(db, 'space', 's1');
    expect(await listSpaceMemberGrants('s1')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `bun test apps/api/src/lib/grants.test.ts`
Expected: PASS (7 tests). If it fails to find the table, re-run Task 2 Step 1.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/grants.ts apps/api/src/lib/grants.test.ts
git commit -m "feat(api): add grants data-access module with tests"
```

---

### Task 4: Point `permissions.ts` reads at grants

**Files:**
- Modify: `apps/api/src/lib/permissions.ts`

This task swaps every `space_members` / `document_members` query for grants, with **no logic change**. The existing HTTP tests are the proof.

- [ ] **Step 1: Update imports**

In `apps/api/src/lib/permissions.ts`, replace the schema import block (currently lines 4–11, importing `documentMembers`, `documents`, `members`, `shareLinks`, `spaceMembers`, `spaces`) so it no longer imports `documentMembers`/`spaceMembers` and instead imports `grants`:

```ts
import { documents, grants, members, shareLinks, spaces } from '../db/schema';
import {
  getMemberDocumentRole,
  getMemberSpaceRole,
  listMemberGrants,
} from './grants';
```

Also add `alias` to the drizzle import at the top. Change:

```ts
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
```
to:
```ts
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
```

Remove the now-unused `SpaceMemberRow` / `DocumentMemberRow` type aliases (lines 18–19).

- [ ] **Step 2: Rewrite `loadPermissionLookup`**

Replace the body of `loadPermissionLookup` (the `Promise.all` of `spaceMembers`/`documentMembers` selects) with a single grants read:

```ts
export async function loadPermissionLookup(user: User | undefined): Promise<PermissionLookup> {
  if (!user || isAdmin(user)) return emptyPermissionLookup();

  const rows = await listMemberGrants(user.id);

  const spaceRolesBySpaceId = new Map<string, SpaceMemberRole>();
  const documentRolesByDocumentId = new Map<string, SpaceMemberRole>();
  for (const row of rows) {
    if (row.targetType === 'space') spaceRolesBySpaceId.set(row.targetId, row.role);
    else if (row.targetType === 'document') documentRolesByDocumentId.set(row.targetId, row.role);
  }
  return { spaceRolesBySpaceId, documentRolesByDocumentId };
}
```

- [ ] **Step 3: Rewrite `getSpaceRole` and the document-direct reads**

In `getSpaceRole`, replace the `db.select()...from(spaceMembers)...` query with:

```ts
export async function getSpaceRole(user: User | undefined, spaceId: string) {
  if (!user) return null;
  if (isAdmin(user)) return 'editor' as const;
  return getMemberSpaceRole(user.id, spaceId);
}
```

In `canReadDocument`, replace the trailing `documentMembers` lookup (the `const [direct] = await db.select()...from(documentMembers)...; return Boolean(direct);`) with:

```ts
  const directRole = await getMemberDocumentRole(user.id, doc.id);
  return Boolean(directRole);
```

In `canEditDocument`, replace the trailing `documentMembers` lookup (`const [direct] = ...; return direct?.role === 'editor';`) with:

```ts
  const directRole = await getMemberDocumentRole(user.id, doc.id);
  return directRole === 'editor';
```

- [ ] **Step 4: Rewrite `listReadableSpaces`**

Replace its `innerJoin(spaceMembers, ...)` query with a grants join:

```ts
  const rows = await db
    .select({ space: spaces })
    .from(spaces)
    .innerJoin(
      grants,
      and(
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaces.id),
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, user.id),
      ),
    );

  return rows.map((row) => row.space);
```

- [ ] **Step 5: Rewrite `listReadableDocuments`**

Replace the two `leftJoin(spaceMembers...)` / `leftJoin(documentMembers...)` and the two `isNotNull(...)` references in the member branch. Use two aliases of `grants`. The member-branch query becomes:

```ts
  const spaceGrant = alias(grants, 'space_grant');
  const docGrant = alias(grants, 'doc_grant');

  const rows = await db
    .select({ doc: documents })
    .from(documents)
    .leftJoin(
      spaceGrant,
      and(
        eq(spaceGrant.targetType, 'space'),
        eq(spaceGrant.targetId, documents.spaceId),
        eq(spaceGrant.subjectType, 'member'),
        eq(spaceGrant.subjectId, user.id),
      ),
    )
    .leftJoin(
      docGrant,
      and(
        eq(docGrant.targetType, 'document'),
        eq(docGrant.targetId, documents.id),
        eq(docGrant.subjectType, 'member'),
        eq(docGrant.subjectId, user.id),
      ),
    )
    .where(
      and(
        isNull(documents.deletedAt),
        ...spaceScope,
        or(
          eq(documents.visibility, 'public'),
          eq(documents.authorId, user.id),
          and(eq(documents.visibility, 'invite'), isNotNull(spaceGrant.subjectId)),
          and(eq(documents.visibility, 'invite'), isNotNull(docGrant.subjectId)),
        ),
      ),
    );

  return rows.map((row) => row.doc);
```

- [ ] **Step 6: Typecheck**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS. (If "spaceMembers is declared but never read" appears, you missed a reference — search the file for `spaceMembers`/`documentMembers`; none should remain.)

- [ ] **Step 7: Run the full API suite**

Run: `bun test apps/api/src/server.test.ts`
Expected: The HTTP-behavior tests PASS. The white-box tests that still `INSERT`/`SELECT` the old tables will also still pass here, because Task 8/9 haven't switched the write path yet — at this point the routes still write the old tables AND grants is only read. **Wait:** grants is now the read source but routes still write old tables, so reads will diverge. Therefore this step is expected to show failures in tests that mutate membership then read it back (e.g. the space-permission and document-share tests). That is expected and resolved in Tasks 5–7 which switch the writes. Record which tests fail; do not "fix" them here.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/permissions.ts
git commit -m "refactor(api): read all membership facts from grants"
```

> Note: the tree is intentionally in a transient state between Tasks 4 and 7 (reads from grants, some writes still to old tables). Tasks 5–7 land the writes; Task 8 re-greens the suite. Keep going.

---

### Task 5: Switch space-membership writes/reads to grants (`spaces.ts`)

**Files:**
- Modify: `apps/api/src/routes/spaces.ts`

- [ ] **Step 1: Update imports**

In `apps/api/src/routes/spaces.ts`, remove `spaceMembers` from the schema import (line 10) and add the grants helpers:

```ts
import { auditLogs, documents, members, spaces } from '../db/schema';
```
Add near the other lib imports:
```ts
import {
  listSpaceMemberGrants,
  removeGrantsForTarget,
  setMemberSpaceRole,
} from '../lib/grants';
```

- [ ] **Step 2: Space creation grant (POST `/`)**

Replace:
```ts
    await db.insert(spaceMembers).values({ spaceId: id, memberId: user.id, role: 'editor' });
```
with:
```ts
    await setMemberSpaceRole(db, user.id, id, 'editor');
```

- [ ] **Step 3: Space delete cleanup (DELETE `/:id`)**

The old `space_members` rows were removed by FK cascade on space delete; grants has no FK, so clean it explicitly. Immediately before `await db.delete(spaces).where(eq(spaces.id, id));` add:
```ts
    await removeGrantsForTarget(db, 'space', id);
```
(There are no live documents at this point — the route already refused otherwise — so no per-document grants need clearing here.)

- [ ] **Step 4: Space member roster (GET `/:id/members`)**

Replace the `db.select(...).from(spaceMembers).innerJoin(members...)` query and its mapping with a grants-sourced version:
```ts
    const grantRows = await listSpaceMemberGrants(spaceId);
    if (grantRows.length === 0) return c.json([]);
    const memberRows = await db
      .select()
      .from(members)
      .where(inArray(members.id, grantRows.map((row) => row.memberId)));
    const roleByMemberId = new Map(grantRows.map((row) => [row.memberId, row.role]));
    return c.json(
      memberRows.map((member) => ({
        ...toPublicMember(member),
        spaceRole: roleByMemberId.get(member.id),
      })),
    );
```
`inArray` is already imported in this file.

- [ ] **Step 5: Batch role update (PUT `/:id/members`)**

Inside the `db.transaction` loop, replace the `tx.delete(spaceMembers)...` + `if (update.role) tx.insert(spaceMembers)...` block with one call:
```ts
        await setMemberSpaceRole(tx, update.memberId, spaceId, update.role);
```
Leave the `tx.insert(auditLogs)...` call that follows unchanged.

- [ ] **Step 6: Single role update (PUT `/:id/members/:memberId`)**

Inside that `db.transaction`, replace the `tx.delete(spaceMembers)...` + `if (body.role) tx.insert(spaceMembers)...` block with:
```ts
      await setMemberSpaceRole(tx, body.memberId, spaceId, body.role);
```
Leave the audit insert unchanged.

- [ ] **Step 7: Typecheck**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS, and no remaining `spaceMembers` reference in `spaces.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/spaces.ts
git commit -m "refactor(api): write space membership through grants"
```

---

### Task 6: Switch document-membership writes/reads to grants (`documents.ts`)

**Files:**
- Modify: `apps/api/src/routes/documents.ts`

- [ ] **Step 1: Update imports**

Remove `documentMembers` from the schema import (line 12):
```ts
import { auditLogs, documents, members, shareLinks, spaces } from '../db/schema';
```
Add the grants helpers near the other lib imports:
```ts
import { listDocumentMemberGrants, setMemberDocumentRole } from '../lib/grants';
```

- [ ] **Step 2: Share roster read (GET `/:id/share`)**

Replace the `roster` query (`db.select({ membership: documentMembers, member: members }).from(documentMembers).innerJoin(...)`) and its later `members:` mapping. Read grants then hydrate members:
```ts
    const grantRows = await listDocumentMemberGrants(doc.id);
    const rosterMembers = grantRows.length
      ? await db.select().from(members).where(inArray(members.id, grantRows.map((r) => r.memberId)))
      : [];
    const roleByMemberId = new Map(grantRows.map((r) => [r.memberId, r.role]));
```
Then change the response `members:` field from the old `roster.map(...)` to:
```ts
      members: rosterMembers.map((member) => ({
        ...toPublicMember(member),
        role: roleByMemberId.get(member.id),
      })),
```
`inArray` is already imported in this file.

- [ ] **Step 3: Share candidate exclusion (GET `/:id/share/members`)**

Replace the `roster` query (`db.select({ memberId: documentMembers.memberId }).from(documentMembers).where(...)`) with:
```ts
    const roster = await listDocumentMemberGrants(doc.id);
```
The downstream `roster.map((row) => row.memberId)` still works (shape `{ memberId, role }`).

- [ ] **Step 4: Share member writes (PATCH `/:id/share`)**

Inside the `db.transaction`, in the `for (const item of memberUpdates)` loop, replace the `tx.delete(documentMembers)...` + `if (parsed.role) tx.insert(documentMembers)...` block with:
```ts
        await setMemberDocumentRole(tx, parsed.memberId, doc.id, parsed.role);
```
Leave the surrounding `SetDocumentMemberRoleSchema.parse(item)` and the audit insert unchanged.

- [ ] **Step 5: Direct member write (PUT `/:id/members/:memberId`)**

Inside that `db.transaction`, replace the `tx.delete(documentMembers)...` + `if (body.role) tx.insert(documentMembers)...` block with:
```ts
      await setMemberDocumentRole(tx, body.memberId, doc.id, body.role);
```
Leave the audit insert unchanged.

- [ ] **Step 6: Typecheck**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS, and no remaining `documentMembers` reference in `documents.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/documents.ts
git commit -m "refactor(api): write document membership through grants"
```

---

### Task 7: Switch `members.ts` permission read + delete cleanup to grants

**Files:**
- Modify: `apps/api/src/routes/members.ts`

- [ ] **Step 1: Update imports**

Remove `spaceMembers` from the schema import (line 5):
```ts
import { documents, members, shareLinks } from '../db/schema';
```
Add:
```ts
import { grants } from '../db/schema';
import { removeGrantsForSubject } from '../lib/grants';
```

- [ ] **Step 2: `GET /permissions`**

Replace the `db.select({...}).from(spaceMembers)` query so it returns the same `{ memberId, spaceId, role }[]` shape sourced from grants:
```ts
    const rows = await db
      .select({
        memberId: grants.subjectId,
        spaceId: grants.targetId,
        role: grants.role,
      })
      .from(grants)
      .where(and(eq(grants.subjectType, 'member'), eq(grants.targetType, 'space')));
    return c.json(rows);
```
Add `and` to the drizzle import at the top of the file (currently only `eq`):
```ts
import { and, eq } from 'drizzle-orm';
```

- [ ] **Step 3: Member delete cleanup (DELETE `/:id`)**

The old tables cascaded on member delete; grants does not. Before `await db.delete(members).where(eq(members.id, id));` add:
```ts
    await removeGrantsForSubject(db, id);
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS, no remaining `spaceMembers` reference in `members.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/members.ts
git commit -m "refactor(api): source member permissions and cleanup from grants"
```

---

### Task 8: Seed grants instead of the old tables

**Files:**
- Modify: `apps/api/src/db/seed.ts`

- [ ] **Step 1: Update imports**

Remove `documentMembers` and `spaceMembers` from the schema import block (lines 2–9) and add `grants`. The block becomes:
```ts
import { documents, grants, members, sessions, shareLinks, spaces } from './schema';
```

- [ ] **Step 2: Replace the table-clear lines**

Replace `await db.delete(documentMembers);` and `await db.delete(spaceMembers);` (lines 16 and 19) with a single line (place it where the `spaceMembers` delete was, keeping deletion order before `spaces`/`members`... grants references neither by FK, so order is irrelevant — put it first):
```ts
await db.delete(grants);
```

- [ ] **Step 3: Write space grants instead of `spaceMembers`**

The `permissions` array (lines 105–116) builds `spaceMembers` insert rows. Keep the loop, but change its element type and the insert. Change the declaration:
```ts
const permissions: { memberId: string; spaceId: string; role: 'viewer' | 'editor' }[] = [];
```
and replace `await db.insert(spaceMembers).values(permissions);` (line 118) with:
```ts
await db.insert(grants).values(
  permissions.map((p) => ({
    subjectType: 'member' as const,
    subjectId: p.memberId,
    targetType: 'space' as const,
    targetId: p.spaceId,
    role: p.role,
  })),
);
```

- [ ] **Step 4: Write document grants instead of `documentMembers`**

Replace the `await db.insert(documentMembers).values([...])` block (lines 120–123) with:
```ts
await db.insert(grants).values([
  { subjectType: 'member', subjectId: 'u2', targetType: 'document', targetId: 'd1', role: 'editor' },
  { subjectType: 'member', subjectId: 'u3', targetType: 'document', targetId: 'd1', role: 'viewer' },
]);
```

- [ ] **Step 5: Re-seed and verify**

Run: `bun run --filter @atlas/api db:seed`
Expected: the seed summary line, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "refactor(db): seed authorization through grants"
```

---

### Task 9: Update white-box test assertions to query grants

**Files:**
- Modify: `apps/api/src/server.test.ts`

The HTTP-level tests already pass unchanged. Only the assertions that directly read/write the old tables need to point at grants. Add two helpers and convert each site.

- [ ] **Step 1: Update the schema destructure + drizzle import**

In the `await import('./db/schema')` destructure (around line 16), remove `documentMembers` and `spaceMembers`, add `grants`. Ensure the top import has `and`:
```ts
import { and, eq } from 'drizzle-orm';
```

- [ ] **Step 2: Add white-box helpers**

After the `request(...)` helper definition, add:
```ts
async function spaceGrantRows(spaceId: string) {
  const rows = await db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaceId),
      ),
    );
  return rows
    .map((r) => ({ spaceId, memberId: r.memberId, role: r.role }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

async function docGrantRows(documentId: string) {
  const rows = await db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'document'),
        eq(grants.targetId, documentId),
      ),
    );
  return rows
    .map((r) => ({ documentId, memberId: r.memberId, role: r.role }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}
```

- [ ] **Step 3: Convert the `space_members` assertion sites**

Replace each `await db.select().from(spaceMembers).where(eq(spaceMembers.spaceId, 's1'))` (currently lines 357, 367, 384, 406, 414) with `await spaceGrantRows('s1')`. The rows now have shape `{ spaceId, memberId, role }`; update the corresponding `expect(...).toEqual([...])` literals to that shape (drop any extra columns, keep `spaceId`/`memberId`/`role`). If an assertion compared unordered rows, it is now sorted by `memberId` — order the expected array the same way.

- [ ] **Step 4: Convert the `document_members` sites**

- The direct insert at line 468 `await db.insert(documentMembers).values({ documentId: 'd6', memberId: 'u5', role: 'viewer' });` becomes:
```ts
  const { setMemberDocumentRole } = await import('./lib/grants');
  await setMemberDocumentRole(db, 'u5', 'd6', 'viewer');
```
(or hoist that import to the top with the other dynamic imports).
- Each `db.select()...from(documentMembers).where(eq(documentMembers.documentId, 'd1'))` (lines 493, 627, 652, 675) and the `'d2'` one (line 916) becomes `await docGrantRows('d1')` / `await docGrantRows('d2')`. Update the matching `expect` literals to `{ documentId, memberId, role }` shape and sort expected arrays by `memberId`.
- The assertion at line 504 wrapping a `db.select()...from(documentMembers)` follows the same swap.

- [ ] **Step 5: Run the full suite**

Run: `bun test apps/api/src`
Expected: ALL tests PASS (server + grants module). If a `toEqual` fails, it is a shape/order mismatch from Steps 3–4 — align the expected literal; do not change production code.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.test.ts
git commit -m "test(api): assert membership through grants"
```

---

### Task 10: Full-phase verification

**Files:** none (verification only)

- [ ] **Step 1: Clean migrate + seed from scratch**

Run:
```bash
rm -f apps/api/data/atlas.sqlite*
bun run --filter @atlas/api db:migrate
bun run --filter @atlas/api db:seed
```
Expected: `migrations applied` then the seed summary, no errors.

- [ ] **Step 2: Typecheck the whole repo**

Run: `bun run typecheck`
Expected: PASS across all workspaces.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: no errors in the files touched (`grants.ts`, `permissions.ts`, routes, seed, tests).

- [ ] **Step 4: Full API test suite**

Run: `bun test apps/api/src`
Expected: ALL PASS.

- [ ] **Step 5: Confirm no stray references to the old tables in app code**

Run: `grep -rn "spaceMembers\|documentMembers" apps/api/src --include="*.ts" | grep -v schema.ts`
Expected: **no output** (the two tables are now only defined in `schema.ts`, written nowhere, read nowhere — ready for removal in Phase 6).

- [ ] **Step 6: Final commit (if lint/format changed anything)**

```bash
git add -A
git commit -m "chore(api): phase 1 grants foundation verification"
```

---

## Self-Review Notes

- **Spec coverage:** Implements spec §3.2 (`grants` schema), §4.1 (member-grant lookup feeds effective-role resolution; group/folder targets are schema-ready for later phases), and §7.1 row "spaceMembers/documentMembers → grants (phase 1)" + §7.2 phase 1. Visibility (`access`), folders, personal `ownerId`, and groups are explicitly **out of scope** for this plan (phases 2–5).
- **Behavior preservation:** No HTTP contract changes. The cascade behavior the old FK tables provided is reproduced by `removeGrantsForTarget` (space delete) and `removeGrantsForSubject` (member delete).
- **Type consistency:** `setMemberSpaceRole` / `setMemberDocumentRole` / `listSpaceMemberGrants` / `listDocumentMemberGrants` / `removeGrantsForSubject` / `removeGrantsForTarget` are named identically in the module (Task 3) and every call site (Tasks 5–9). `SpaceMemberRole` (`'viewer' | 'editor'`) is the shared role type throughout.
- **Transient state:** Tasks 4→7 leave the suite red on purpose (reads moved to grants before writes). This is called out in Task 4 Step 7 and re-greened by Task 9.
