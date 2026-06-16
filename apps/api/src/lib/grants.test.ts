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
