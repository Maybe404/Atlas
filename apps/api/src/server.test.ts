import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

const testDb = join(import.meta.dir, '../data/test-atlas.sqlite');
process.env.DATABASE_URL = testDb;

rmSync(testDb, { force: true });
rmSync(`${testDb}-shm`, { force: true });
rmSync(`${testDb}-wal`, { force: true });
await import('./db/migrate');
await import('./db/seed');

const { default: server } = await import('./server');
const { db } = await import('./db/client');
const { documentMembers, documents, members, shareLinks } = await import('./db/schema');

afterAll(() => {
  rmSync(testDb, { force: true });
  rmSync(`${testDb}-shm`, { force: true });
  rmSync(`${testDb}-wal`, { force: true });
});

async function request(path: string, init?: RequestInit) {
  return server.fetch(new Request(`http://atlas.test${path}`, init));
}

type ApiSpace = { children: unknown[] };
type ApiDoc = {
  id: string;
  title: string;
  desc: string;
  html: string;
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
  test('anonymous visitors see directory entries but only public document HTML', async () => {
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
    expect(publicDocs.every((doc) => doc.canRead && doc.html)).toBe(true);

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
    const body = (await doc.json()) as ApiDoc;
    expect(body.title).toBe('Smoke Title');
    expect(body.desc).toBe('A useful generated summary for the uploaded HTML document.');
    expect(body.html).toBe(rawHtml);
  });

  test('rejects password logins without the correct password and issues csrf token on success', async () => {
    const missingPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(missingPassword.status).toBe(401);

    const wrongPassword = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@atlas.team', password: 'not-the-password' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(wrongPassword.status).toBe(401);

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

  test('enforces document read and edit permission boundaries', async () => {
    const viewer = await loginAs('he@atlas.team');

    const noAccess = await request('/documents/d6', { headers: { cookie: viewer.cookie } });
    expect(noAccess.status).toBe(404);

    const readable = await request('/documents/d3', { headers: { cookie: viewer.cookie } });
    expect(readable.status).toBe(200);

    const cannotEdit = await request('/documents/d3', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Viewer edit attempt' }),
      headers: { 'content-type': 'application/json', ...viewer.headers },
    });
    expect(cannotEdit.status).toBe(403);

    const privateDoc = await request('/documents/d2', { headers: { cookie: viewer.cookie } });
    expect(privateDoc.status).toBe(404);
  });

  test('document invitations grant single-document access without space access', async () => {
    const viewer = await loginAs('he@atlas.team');

    expect((await request('/documents/d6', { headers: { cookie: viewer.cookie } })).status).toBe(
      404,
    );

    await db.insert(documentMembers).values({ documentId: 'd6', memberId: 'u5', role: 'viewer' });

    const readable = await request('/documents/d6', { headers: { cookie: viewer.cookie } });
    expect(readable.status).toBe(200);
    const readableBody = (await readable.json()) as ApiDoc & { canEdit: boolean };
    expect(readableBody.id).toBe('d6');
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
    const shareBody = (await share.json()) as { public: { token: string } };
    expect(shareBody.public.token).not.toBe('demo-d1-public-link');
    expect((await request(`/documents/public/${shareBody.public.token}`)).status).toBe(200);
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
      public: { token: string | null };
    };
    expect(adminBody.canManage).toBe(true);
    expect(adminBody.public.token).toBeTruthy();

    const author = await loginAs('chen@atlas.team');
    const authorShare = await request('/documents/d4/share', {
      headers: { cookie: author.cookie },
    });
    expect(authorShare.status).toBe(200);
    const authorBody = (await authorShare.json()) as {
      canManage: boolean;
      availableMembers: unknown[];
    };
    expect(authorBody.canManage).toBe(true);
    expect(authorBody.availableMembers.length).toBeGreaterThan(0);

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
});
