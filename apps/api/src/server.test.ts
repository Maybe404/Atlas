import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';

const testDb = join(import.meta.dir, '../data/test-atlas.sqlite');
process.env.DATABASE_URL = testDb;

rmSync(testDb, { force: true });
rmSync(`${testDb}-shm`, { force: true });
rmSync(`${testDb}-wal`, { force: true });
await import('./db/migrate');
await import('./db/seed');

const { default: server } = await import('./server');
const { db } = await import('./db/client');
const { auditLogs, documents, grants, members, sessions, shareLinks, spaces } =
  await import('./db/schema');
const { setMemberDocumentRole } = await import('./lib/grants');

afterAll(() => {
  rmSync(testDb, { force: true });
  rmSync(`${testDb}-shm`, { force: true });
  rmSync(`${testDb}-wal`, { force: true });
});

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

async function request(path: string, init?: RequestInit) {
  return server.fetch(new Request(`http://atlas.test${path}`, init));
}

type ApiSpace = { children: unknown[] };
type ApiDoc = {
  id: string;
  title: string;
  desc: string;
  html: string;
  format?: string;
  publicLink: { token: string };
};
type CreatedDoc = { id: string; stored: { size: number } };

async function loginAs(email = 'lin@atlas.team') {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'atlas-demo-password' }),
    headers: { 'content-type': 'application/json' },
  });
  const body = (await login.json()) as { csrfToken: string };
  const cookies = login.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ');
  return {
    csrfToken: body.csrfToken,
    cookie: cookies,
    headers: { cookie: cookies, 'x-atlas-csrf': body.csrfToken },
  };
}

describe('Atlas API', () => {
  test('anonymous visitors see lightweight directory entries without document HTML', async () => {
    const res = await request('/spaces');
    expect(res.status).toBe(200);
    const spaces = (await res.json()) as ApiSpace[];
    const docs = spaces.flatMap(
      (space) =>
        space.children as {
          visibility?: string;
          canRead: boolean;
          canEdit?: boolean;
          locked?: boolean;
          html?: string;
          desc?: string;
          author?: string;
          authorName?: string;
          updated?: string;
          tags?: string[];
          deletedAt?: string | null;
        }[],
    );
    expect(docs.length).toBeGreaterThan(0);

    const publicDocs = docs.filter((doc) => doc.visibility === 'public');
    const lockedDocs = docs.filter((doc) => doc.locked);
    expect(publicDocs.length).toBeGreaterThan(0);
    expect(lockedDocs.length).toBeGreaterThan(0);
    expect(publicDocs.every((doc) => doc.canRead === true && doc.html === undefined)).toBe(true);

    for (const doc of lockedDocs) {
      expect(doc.locked).toBe(true);
      expect(doc.canRead).toBe(false);
      expect(doc.canEdit).toBe(false);
      expect(doc.html).toBeUndefined();
      expect(doc.desc).toBeUndefined();
      expect(doc.author).toBeUndefined();
      expect(doc.authorName).toBeUndefined();
      expect(doc.updated).toBeUndefined();
      expect(doc.visibility).toBeUndefined();
      expect(doc.tags).toBeUndefined();
      expect(doc.deletedAt).toBeUndefined();
    }
  });

  test('uploads raw HTML and infers document metadata', async () => {
    const admin = await loginAs();
    const rawHtml =
      '<!doctype html><html><head><title>Smoke Title</title></head><body><h1>Fallback</h1><script>window.__smoke = 1</script><p onclick="x()">A useful generated summary for the uploaded HTML document.</p></body></html>';
    const form = new FormData();
    form.set('file', new File([rawHtml], 'smoke.html', { type: 'text/html' }));
    form.set('spaceId', 's1');
    form.set('visibility', 'private');

    const upload = await request('/documents/upload', {
      method: 'POST',
      body: form,
      headers: admin.headers,
    });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as CreatedDoc;
    expect(created.stored.size).toBeGreaterThan(0);

    const doc = await request(`/documents/${created.id}`, { headers: { cookie: admin.cookie } });
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as ApiDoc & { canRead: boolean; canEdit: boolean };
    expect(body.title).toBe('Smoke Title');
    expect(body.desc).toBe('A useful generated summary for the uploaded HTML document.');
    expect(body.html).toBe(rawHtml);
    expect(body.canRead).toBe(true);
    expect(body.canEdit).toBe(true);
  });

  test('returns the same login error for unknown, passwordless and incorrect accounts', async () => {
    const genericLoginError = {
      code: 'unauthorized',
      message: 'Email or password is incorrect.',
    };

    const noMember = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@atlas.team', password: 'not-the-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(noMember.status).toBe(401);
    expect(await noMember.json()).toEqual(genericLoginError);

    await db.insert(members).values({
      id: 'u-passwordless',
      name: '无密码账号',
      initials: '无密',
      email: 'passwordless@atlas.team',
      passwordHash: null,
      role: 'viewer',
      joined: '2026-05',
    });

    const noPasswordAccount = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'passwordless@atlas.team', password: 'not-the-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(noPasswordAccount.status).toBe(401);
    expect(await noPasswordAccount.json()).toEqual(genericLoginError);

    const missingPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(missingPassword.status).toBe(401);
    expect(await missingPassword.json()).toEqual(genericLoginError);

    const wrongPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team', password: 'not-the-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(wrongPassword.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(genericLoginError);

    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team', password: 'atlas-demo-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { csrfToken: string };
    expect(body.csrfToken.length).toBeGreaterThan(20);
    const cookie = login.headers.get('set-cookie') || '';
    expect(cookie).toContain('atlas_session=');
  });

  test('rate limits repeated login failures by client and email', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'limited@atlas.team', password: 'not-the-password' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(res.status).toBe(401);
    }

    const limited = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'limited@atlas.team', password: 'not-the-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      code: 'too_many_requests',
      message: 'Too many login attempts. Please try again later.',
    });
  });

  test('marks auth cookies secure by default in production runtime', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const login = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'lin@atlas.team', password: 'atlas-demo-password' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(login.status).toBe(200);
      expect(login.headers.getSetCookie().join('\n')).toContain('Secure');
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test('requires csrf token for cookie session writes', async () => {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team', password: 'atlas-demo-password' }),
      headers: { 'content-type': 'application/json' },
    });
    const loginBody = (await login.json()) as { csrfToken: string };
    const cookies = login.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');

    const noCsrf = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'No CSRF', accent: 'accent' }),
      headers: { 'content-type': 'application/json', cookie: cookies },
    });
    expect(noCsrf.status).toBe(403);

    const withCsrf = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'CSRF OK', accent: 'accent' }),
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-atlas-csrf': loginBody.csrfToken,
      },
    });
    expect(withCsrf.status).toBe(201);
  });

  test('creates members, updates their password, and deletes them', async () => {
    const admin = await loginAs();
    const email = 'new.member@atlas.team';
    const create = await request('/members', {
      method: 'POST',
      body: JSON.stringify({
        name: '新成员',
        email,
        password: 'first-password',
        role: 'viewer',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; email: string; initials: string };
    expect(created.email).toBe(email);
    expect(created.initials).toBe('新成');

    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'first-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(login.status).toBe(200);

    const updatePassword = await request(`/members/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: 'second-password' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(updatePassword.status).toBe(200);

    const oldPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'first-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'second-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(newPassword.status).toBe(200);

    const remove = await request(`/members/${created.id}`, {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(remove.status).toBe(200);
    const [deleted] = await db.select().from(members).where(eq(members.id, created.id));
    expect(deleted).toBeUndefined();
  });

  test('lists only members assigned to a space', async () => {
    const admin = await loginAs();

    const res = await request('/spaces/s1/members', { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const roster = (await res.json()) as { id: string; spaceRole: string }[];
    expect(roster.length).toBeGreaterThan(0);
    expect(
      roster.every((member) => member.spaceRole === 'viewer' || member.spaceRole === 'editor'),
    ).toBe(true);
    expect(roster.map((member) => member.id)).not.toContain('u3');
  });

  test('batch updates space member roles atomically', async () => {
    const admin = await loginAs();

    const update = await request('/spaces/s1/members', {
      method: 'PUT',
      body: JSON.stringify({
        updates: [
          { memberId: 'u2', role: 'viewer' },
          { memberId: 'u3', role: 'editor' },
          { memberId: 'u2', role: 'editor' },
        ],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ ok: true, updated: 2 });

    const rows = await spaceGrantRows('s1');
    expect(rows.find((row) => row.memberId === 'u2')?.role).toBe('editor');
    expect(rows.find((row) => row.memberId === 'u3')?.role).toBe('editor');

    const clear = await request('/spaces/s1/members', {
      method: 'PUT',
      body: JSON.stringify({ updates: [{ memberId: 'u3', role: null }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(clear.status).toBe(200);
    const afterClear = await spaceGrantRows('s1');
    expect(afterClear.find((row) => row.memberId === 'u3')).toBeUndefined();

    const beforeInvalid = afterClear.filter(
      (row) => row.memberId === 'u2' || row.memberId === 'u4',
    );
    const invalid = await request('/spaces/s1/members', {
      method: 'PUT',
      body: JSON.stringify({
        updates: [
          { memberId: 'u2', role: 'viewer' },
          { memberId: 'not-a-member', role: 'editor' },
        ],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(invalid.status).toBe(404);
    const afterInvalid = await spaceGrantRows('s1');
    expect(afterInvalid.filter((row) => row.memberId === 'u2' || row.memberId === 'u4')).toEqual(
      beforeInvalid,
    );

    const missingSpace = await request('/spaces/not-a-space/members', {
      method: 'PUT',
      body: JSON.stringify({ updates: [{ memberId: 'u2', role: 'viewer' }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(missingSpace.status).toBe(404);

    const missingSpaceClear = await request('/spaces/not-a-space/members', {
      method: 'PUT',
      body: JSON.stringify({ updates: [{ memberId: 'u2', role: null }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(missingSpaceClear.status).toBe(404);
  });

  test('single space member updates validate space and member before writing', async () => {
    const admin = await loginAs();
    const before = await spaceGrantRows('s1');

    const missingMember = await request('/spaces/s1/members/not-a-member', {
      method: 'PUT',
      body: JSON.stringify({ role: 'viewer' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(missingMember.status).toBe(404);
    expect(await spaceGrantRows('s1')).toEqual(before);

    const missingSpace = await request('/spaces/not-a-space/members/u2', {
      method: 'PUT',
      body: JSON.stringify({ role: null }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(missingSpace.status).toBe(404);
  });

  test('enforces document read and edit permission boundaries', async () => {
    const viewer = await loginAs('he@atlas.team');

    const noAccess = await request('/documents/d6', { headers: { cookie: viewer.cookie } });
    expect(noAccess.status).toBe(404);

    const readable = await request('/documents/d3', { headers: { cookie: viewer.cookie } });
    expect(readable.status).toBe(200);
    const readableBody = (await readable.json()) as ApiDoc & { canRead: boolean; canEdit: boolean };
    expect(readableBody.canRead).toBe(true);
    expect(readableBody.canEdit).toBe(false);

    const cannotEdit = await request('/documents/d3', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Viewer edit attempt' }),
      headers: { 'content-type': 'application/json', ...viewer.headers },
    });
    expect(cannotEdit.status).toBe(403);

    const privateDoc = await request('/documents/d2', { headers: { cookie: viewer.cookie } });
    expect(privateDoc.status).toBe(404);
  });

  test('lists lightweight readable documents with server permission flags', async () => {
    const viewer = await loginAs('he@atlas.team');

    const res = await request('/documents', { headers: { cookie: viewer.cookie } });
    expect(res.status).toBe(200);
    const docs = (await res.json()) as (ApiDoc & { canRead: boolean; canEdit: boolean })[];
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((doc) => doc.canRead === true)).toBe(true);
    expect(docs.every((doc) => typeof doc.canEdit === 'boolean')).toBe(true);
    expect(docs.every((doc) => doc.html === undefined)).toBe(true);
  });

  test('document invitations grant single-document access without space access', async () => {
    const viewer = await loginAs('he@atlas.team');

    expect((await request('/documents/d6', { headers: { cookie: viewer.cookie } })).status).toBe(
      404,
    );

    await setMemberDocumentRole(db, 'u5', 'd6', 'viewer');

    const readable = await request('/documents/d6', { headers: { cookie: viewer.cookie } });
    expect(readable.status).toBe(200);
    const readableBody = (await readable.json()) as ApiDoc & { canRead: boolean; canEdit: boolean };
    expect(readableBody.id).toBe('d6');
    expect(readableBody.canRead).toBe(true);
    expect(readableBody.canEdit).toBe(false);

    const spacesRes = await request('/spaces', { headers: { cookie: viewer.cookie } });
    expect(spacesRes.status).toBe(200);
    const spaces = (await spacesRes.json()) as {
      id: string;
      role: string | null;
      children: { id: string }[];
    }[];
    const productSpace = spaces.find((space) => space.id === 's2');
    expect(productSpace?.role).toBeNull();
    expect(productSpace?.children.map((doc) => doc.id)).toContain('d6');
  });

  test('document member endpoint validates members before writing', async () => {
    const admin = await loginAs();
    const before = await docGrantRows('d1');
    const auditsBefore = await db.select().from(auditLogs).where(eq(auditLogs.targetId, 'd1'));

    const invalid = await request('/documents/d1/members/not-a-member', {
      method: 'PUT',
      body: JSON.stringify({ role: 'viewer' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(invalid.status).toBe(404);
    expect(await docGrantRows('d1')).toEqual(before);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.targetId, 'd1'))).toEqual(
      auditsBefore,
    );
  });
  test('soft deletes and restores documents', async () => {
    const admin = await loginAs();
    const remove = await request('/documents/d2', { method: 'DELETE', headers: admin.headers });
    expect(remove.status).toBe(200);

    const missing = await request('/documents/d2');
    expect(missing.status).toBe(404);

    const trash = await request('/documents/trash', { headers: { cookie: admin.cookie } });
    expect(trash.status).toBe(200);
    const items = (await trash.json()) as { id: string; purgeAfter: string }[];
    expect(items.some((item: { id: string }) => item.id === 'd2')).toBe(true);
    expect(items.find((item) => item.id === 'd2')?.purgeAfter).toBeTruthy();

    const restore = await request('/documents/d2/restore', {
      method: 'POST',
      headers: admin.headers,
    });
    expect(restore.status).toBe(200);
    expect((await request('/documents/d2', { headers: { cookie: admin.cookie } })).status).toBe(
      200,
    );
  });

  test('serves enabled public share links', async () => {
    const res = await request('/documents/public/demo-d1-public-link');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as ApiDoc;
    expect(doc.id).toBe('d1');
    expect(doc.publicLink.token).toBe('demo-d1-public-link');
  });

  test('expires, revokes, rotates and records public share links', async () => {
    const admin = await loginAs();
    await db
      .update(shareLinks)
      .set({ expiresAt: '2000-01-01T00:00:00.000Z' })
      .where(eq(shareLinks.token, 'demo-d1-public-link'));
    expect((await request('/documents/public/demo-d1-public-link')).status).toBe(404);

    await db
      .update(shareLinks)
      .set({ expiresAt: null, enabled: true, revokedAt: null, accessCount: 0 })
      .where(eq(shareLinks.token, 'demo-d1-public-link'));
    expect((await request('/documents/public/demo-d1-public-link')).status).toBe(200);
    const [tracked] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, 'demo-d1-public-link'));
    expect(tracked?.accessCount).toBe(1);
    expect(tracked?.lastAccessedAt).toBeTruthy();

    const revoke = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: false }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(revoke.status).toBe(200);
    expect((await request('/documents/public/demo-d1-public-link')).status).toBe(404);

    const rotate = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true, rotateToken: true }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(rotate.status).toBe(200);

    const share = await request('/documents/d1/share', { headers: { cookie: admin.cookie } });
    const shareBody = (await share.json()) as { public: { token: string; url: string } };
    expect(shareBody.public.token).not.toBe('demo-d1-public-link');
    expect(shareBody.public.url).toBe(`/share/${shareBody.public.token}`);
    expect((await request(`/documents/public/${shareBody.public.token}`)).status).toBe(200);
  });

  test('share updates validate dates and members atomically', async () => {
    const admin = await loginAs();
    const shareBeforeRotate = await request('/documents/d1/share', {
      headers: { cookie: admin.cookie },
    });
    expect(shareBeforeRotate.status).toBe(200);
    const shareBeforeRotateBody = (await shareBeforeRotate.json()) as {
      public: { enabled: boolean; token: string | null; expiresAt: string | null };
    };

    const rotateOnly = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ rotateToken: true }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(rotateOnly.status).toBe(200);

    const shareAfterRotate = await request('/documents/d1/share', {
      headers: { cookie: admin.cookie },
    });
    const shareAfterRotateBody = (await shareAfterRotate.json()) as {
      public: { enabled: boolean; token: string | null; expiresAt: string | null };
    };
    expect(shareAfterRotateBody.public.token).toBeTruthy();
    expect(shareAfterRotateBody.public.token).not.toBe(shareBeforeRotateBody.public.token);
    expect(shareAfterRotateBody.public.enabled).toBe(shareBeforeRotateBody.public.enabled);

    const invalidDate = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ expiresAt: 'not-a-date' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(invalidDate.status).toBe(400);
    expect((await invalidDate.json()) as { code: string }).toMatchObject({
      code: 'validation_error',
    });

    const [publicBeforeInvalidMember] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.documentId, 'd1'));
    const membersBeforeInvalid = await docGrantRows('d1');
    const auditsBeforeInvalid = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, 'd1'));

    const invalidMember = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({
        publicEnabled: false,
        members: [
          { memberId: 'u3', role: 'viewer' },
          { memberId: 'not-a-member', role: 'editor' },
        ],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(invalidMember.status).toBe(404);
    const [publicAfterInvalidMember] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.documentId, 'd1'));
    const membersAfterInvalid = await docGrantRows('d1');
    const auditsAfterInvalid = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, 'd1'));
    expect(publicAfterInvalidMember).toEqual(publicBeforeInvalidMember);
    expect(membersAfterInvalid).toEqual(membersBeforeInvalid);
    expect(auditsAfterInvalid).toEqual(auditsBeforeInvalid);

    const duplicateMembers = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({
        members: [
          { memberId: 'u3', role: 'viewer' },
          { memberId: 'u3', role: 'editor' },
        ],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(duplicateMembers.status).toBe(200);
    const afterDuplicateMembers = await docGrantRows('d1');
    expect(afterDuplicateMembers.find((row) => row.memberId === 'u3')?.role).toBe('editor');
  });

  test('only admins and document authors can manage share settings', async () => {
    const viewer = await loginAs('he@atlas.team');
    const readonlyShare = await request('/documents/d3/share', {
      headers: { cookie: viewer.cookie },
    });
    const readonlyMissingShare = await request('/documents/not-a-doc/share', {
      headers: { cookie: viewer.cookie },
    });
    expect(readonlyShare.status).toBe(404);
    expect(readonlyMissingShare.status).toBe(404);
    expect(await readonlyShare.json()).toEqual(await readonlyMissingShare.json());

    const cannotPatch = await request('/documents/d3/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true }),
      headers: { 'content-type': 'application/json', ...viewer.headers },
    });
    expect(cannotPatch.status).toBe(404);

    const guestShare = await request('/documents/d3/share');
    const guestMissingShare = await request('/documents/not-a-doc/share');
    expect(guestShare.status).toBe(404);
    expect(guestMissingShare.status).toBe(404);
    expect(await guestShare.json()).toEqual(await guestMissingShare.json());

    const admin = await loginAs();
    const adminShare = await request('/documents/d1/share', {
      headers: { cookie: admin.cookie },
    });
    expect(adminShare.status).toBe(200);
    const adminBody = (await adminShare.json()) as {
      canManage: boolean;
      public: { token: string | null; url: string | null };
      availableMembers?: unknown[];
    };
    expect(adminBody.canManage).toBe(true);
    expect(adminBody.public.token).toBeTruthy();
    expect(adminBody.public.url).toBe(`/share/${adminBody.public.token}`);
    expect(adminBody.availableMembers).toBeUndefined();

    const author = await loginAs('chen@atlas.team');
    const authorShare = await request('/documents/d4/share', {
      headers: { cookie: author.cookie },
    });
    expect(authorShare.status).toBe(200);
    const authorBody = (await authorShare.json()) as {
      canManage: boolean;
      availableMembers?: unknown[];
    };
    expect(authorBody.canManage).toBe(true);
    expect(authorBody.availableMembers).toBeUndefined();

    const suggestions = await request('/documents/d4/share/members?q=he&limit=3', {
      headers: { cookie: author.cookie },
    });
    expect(suggestions.status).toBe(200);
    const suggestionBody = (await suggestions.json()) as { id: string; email: string }[];
    expect(suggestionBody.length).toBeGreaterThan(0);
    expect(suggestionBody.length).toBeLessThanOrEqual(3);
    expect(suggestionBody.some((member) => member.email === 'he@atlas.team')).toBe(true);
    expect(suggestionBody.map((member) => member.id)).not.toContain('u2');

    const readonlySearch = await request('/documents/d3/share/members?q=lin', {
      headers: { cookie: viewer.cookie },
    });
    expect(readonlySearch.status).toBe(404);

    const authorPatch = await request('/documents/d4/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true }),
      headers: { 'content-type': 'application/json', ...author.headers },
    });
    expect(authorPatch.status).toBe(200);
  });

  test('purges expired trash items', async () => {
    const admin = await loginAs();
    await db
      .update(documents)
      .set({
        deletedAt: '2000-01-01T00:00:00.000Z',
        deletedBy: 'u1',
        purgeAfter: '2000-02-01T00:00:00.000Z',
      })
      .where(eq(documents.id, 'd3'));

    const purge = await request('/documents/trash/purge-expired', {
      method: 'POST',
      headers: admin.headers,
    });
    expect(purge.status).toBe(200);
    expect(await purge.json()).toEqual({ purged: 1 });
    expect((await request('/documents/d3')).status).toBe(404);
  });

  test('refuses to demote the last remaining admin', async () => {
    const admin = await loginAs();
    const demote = await request('/members/u1', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'viewer' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(demote.status).toBe(409);
    expect((await demote.json()) as { code: string }).toMatchObject({ code: 'conflict' });
    const [stillAdmin] = await db.select().from(members).where(eq(members.id, 'u1'));
    expect(stillAdmin?.role).toBe('admin');
  });

  test('rejects empty PATCH bodies with 400 instead of 500', async () => {
    const admin = await loginAs();
    const headers = { 'content-type': 'application/json', ...admin.headers };

    const member = await request('/members/u2', { method: 'PATCH', body: '{}', headers });
    expect(member.status).toBe(400);
    const space = await request('/spaces/s1', { method: 'PATCH', body: '{}', headers });
    expect(space.status).toBe(400);
    const doc = await request('/documents/d1', { method: 'PATCH', body: '{}', headers });
    expect(doc.status).toBe(400);
  });

  test('maps malformed JSON bodies to 400', async () => {
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    });
    expect(badLogin.status).toBe(400);
    expect((await badLogin.json()) as { code: string }).toMatchObject({ code: 'bad_request' });

    const admin = await loginAs();
    const badSpace = await request('/spaces', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(badSpace.status).toBe(400);
  });

  test('trims whitespace-only names and titles to a validation error', async () => {
    const admin = await loginAs();
    const headers = { 'content-type': 'application/json', ...admin.headers };

    const member = await request('/members/u2', {
      method: 'PATCH',
      body: JSON.stringify({ name: '   ' }),
      headers,
    });
    expect(member.status).toBe(400);
    const space = await request('/spaces/s1', {
      method: 'PATCH',
      body: JSON.stringify({ name: '   ' }),
      headers,
    });
    expect(space.status).toBe(400);
    const doc = await request('/documents/d1', {
      method: 'PATCH',
      body: JSON.stringify({ title: '   ' }),
      headers,
    });
    expect(doc.status).toBe(400);
  });

  test('only admins can update space metadata', async () => {
    const editor = await loginAs('su@atlas.team');
    const res = await request('/spaces/s1', {
      method: 'PATCH',
      body: JSON.stringify({ name: '空间编辑改名尝试' }),
      headers: { 'content-type': 'application/json', ...editor.headers },
    });
    expect(res.status).toBe(403);
    const [space] = await db.select().from(spaces).where(eq(spaces.id, 's1'));
    expect(space?.name).not.toBe('空间编辑改名尝试');
  });

  test('refuses to delete a space that still holds live documents', async () => {
    const admin = await loginAs();
    const blocked = await request('/spaces/s1', { method: 'DELETE', headers: admin.headers });
    expect(blocked.status).toBe(409);
    const [stillThere] = await db.select().from(spaces).where(eq(spaces.id, 's1'));
    expect(stillThere?.id).toBe('s1');

    const create = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: '空空间', accent: 'accent' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    const removed = await request(`/spaces/${id}`, { method: 'DELETE', headers: admin.headers });
    expect(removed.status).toBe(200);
  });

  test('permanent delete only removes documents that are already in trash', async () => {
    const admin = await loginAs();

    const missing = await request('/documents/not-a-doc/permanent', {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(missing.status).toBe(404);

    const live = await request('/documents/d1/permanent', {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(live.status).toBe(404);
    const [stillLive] = await db.select().from(documents).where(eq(documents.id, 'd1'));
    expect(stillLive?.id).toBe('d1');

    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({ spaceId: 's1', title: '待永久删除', visibility: 'private', html: '' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    await request(`/documents/${id}`, { method: 'DELETE', headers: admin.headers });
    const purged = await request(`/documents/${id}/permanent`, {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(purged.status).toBe(200);
    const [gone] = await db.select().from(documents).where(eq(documents.id, id));
    expect(gone).toBeUndefined();
  });

  test('rejects member invitations on private documents', async () => {
    const admin = await loginAs();
    const res = await request('/documents/d2/share', {
      method: 'PATCH',
      body: JSON.stringify({ members: [{ memberId: 'u5', role: 'viewer' }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(res.status).toBe(400);
    const roster = await docGrantRows('d2');
    expect(roster.find((row) => row.memberId === 'u5')).toBeUndefined();
  });

  test('bearer-token writes do not require a CSRF header', async () => {
    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team', password: 'atlas-demo-password' }),
      headers: { 'content-type': 'application/json' },
    });
    const sessionCookie = login.headers
      .getSetCookie()
      .map((item) => item.split(';')[0] ?? '')
      .find((cookie) => cookie.startsWith('atlas_session='));
    const sessionId = sessionCookie?.slice('atlas_session='.length);
    expect(sessionId).toBeTruthy();

    const created = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bearer 空间', accent: 'accent' }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionId}` },
    });
    expect(created.status).toBe(201);
  });

  test('purges expired sessions', async () => {
    const admin = await loginAs();
    await db.insert(sessions).values({
      id: 'session_expired_test',
      memberId: 'u1',
      csrfToken: 'csrf_expired_test',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    const purge = await request('/auth/sessions/purge-expired', {
      method: 'POST',
      headers: admin.headers,
    });
    expect(purge.status).toBe(200);
    expect(await purge.json()).toEqual({ purged: 1 });

    const [expired] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, 'session_expired_test'));
    expect(expired).toBeUndefined();
  });

  test('creates a markdown document and infers metadata by markdown rules', async () => {
    const admin = await loginAs();
    const md = '# Markdown 标题\n\n这是 markdown 摘要段落。\n\n- 列表项';
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 's1',
        title: '',
        visibility: 'private',
        format: 'markdown',
        html: md,
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };

    const res = await request(`/documents/${created.id}`, { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as ApiDoc & { format: string };
    expect(body.format).toBe('markdown');
    expect(body.title).toBe('Markdown 标题');
    expect(body.desc).toBe('这是 markdown 摘要段落。');
    expect(body.html).toBe(md);
  });

  test('uploads a .md file and stores it as markdown', async () => {
    const admin = await loginAs();
    const md = '# 上传的 MD\n\n上传摘要。';
    const form = new FormData();
    form.set('file', new File([md], 'guide.md', { type: 'text/markdown' }));
    form.set('spaceId', 's1');
    form.set('visibility', 'private');

    const upload = await request('/documents/upload', {
      method: 'POST',
      body: form,
      headers: admin.headers,
    });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as { id: string };

    const res = await request(`/documents/${created.id}`, { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as ApiDoc & { format: string };
    expect(body.format).toBe('markdown');
    expect(body.title).toBe('上传的 MD');
    expect(body.html).toBe(md);
  });
});
