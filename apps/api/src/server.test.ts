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
const { documents, shareLinks } = await import('./db/schema');

afterAll(() => {
  rmSync(testDb, { force: true });
  rmSync(`${testDb}-shm`, { force: true });
  rmSync(`${testDb}-wal`, { force: true });
});

async function request(path: string, init?: RequestInit) {
  return server.fetch(new Request(`http://atlas.test${path}`, init));
}

type ApiSpace = { children: unknown[] };
type ApiDoc = { id: string; html: string; publicLink: { token: string } };
type CreatedDoc = { id: string; sanitized: { removed: number } };

describe('Atlas API', () => {
  test('lists spaces with seeded documents for the demo user', async () => {
    const res = await request('/spaces');
    expect(res.status).toBe(200);
    const spaces = (await res.json()) as ApiSpace[];
    expect(spaces).toHaveLength(4);
    expect(spaces.at(0)?.children.length).toBeGreaterThan(0);
  });

  test('uploads HTML through sanitizer', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(
        [
          '<!doctype html><html><body><h1>Smoke</h1><script>alert(1)</script><p onclick="x()">ok</p></body></html>',
        ],
        'smoke.html',
        { type: 'text/html' },
      ),
    );
    form.set('title', 'Smoke Upload');
    form.set('spaceId', 's1');
    form.set('visibility', 'private');

    const upload = await request('/documents/upload', { method: 'POST', body: form });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as CreatedDoc;
    expect(created.sanitized.removed).toBe(2);

    const doc = await request(`/documents/${created.id}`);
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as ApiDoc;
    expect(body.html).not.toContain('<script>');
    expect(body.html).not.toContain('onclick');
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

  test('enforces document read and edit permission boundaries', async () => {
    const viewerSession = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'he@atlas.team', password: 'atlas-demo-password' }),
      headers: { 'content-type': 'application/json' },
    });
    const cookies = viewerSession.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');

    const noAccess = await request('/documents/d6', { headers: { cookie: cookies } });
    expect(noAccess.status).toBe(404);

    const readable = await request('/documents/d2', { headers: { cookie: cookies } });
    expect(readable.status).toBe(200);

    const cannotEdit = await request('/documents/d2', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Viewer edit attempt' }),
      headers: { 'content-type': 'application/json', cookie: cookies },
    });
    expect(cannotEdit.status).toBe(403);
  });

  test('soft deletes and restores documents', async () => {
    const remove = await request('/documents/d2', { method: 'DELETE' });
    expect(remove.status).toBe(200);

    const missing = await request('/documents/d2');
    expect(missing.status).toBe(404);

    const trash = await request('/documents/trash');
    expect(trash.status).toBe(200);
    const items = (await trash.json()) as { id: string; purgeAfter: string }[];
    expect(items.some((item: { id: string }) => item.id === 'd2')).toBe(true);
    expect(items.find((item) => item.id === 'd2')?.purgeAfter).toBeTruthy();

    const restore = await request('/documents/d2/restore', { method: 'POST' });
    expect(restore.status).toBe(200);
    expect((await request('/documents/d2')).status).toBe(200);
  });

  test('serves enabled public share links', async () => {
    const res = await request('/documents/public/demo-d1-public-link');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as ApiDoc;
    expect(doc.id).toBe('d1');
    expect(doc.publicLink.token).toBe('demo-d1-public-link');
  });

  test('expires, revokes, rotates and records public share links', async () => {
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
      headers: { 'content-type': 'application/json' },
    });
    expect(revoke.status).toBe(200);
    expect((await request('/documents/public/demo-d1-public-link')).status).toBe(404);

    const rotate = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true, rotateToken: true }),
      headers: { 'content-type': 'application/json' },
    });
    expect(rotate.status).toBe(200);

    const share = await request('/documents/d1/share');
    const shareBody = (await share.json()) as { public: { token: string } };
    expect(shareBody.public.token).not.toBe('demo-d1-public-link');
    expect((await request(`/documents/public/${shareBody.public.token}`)).status).toBe(200);
  });

  test('purges expired trash items', async () => {
    await db
      .update(documents)
      .set({
        deletedAt: '2000-01-01T00:00:00.000Z',
        deletedBy: 'u1',
        purgeAfter: '2000-02-01T00:00:00.000Z',
      })
      .where(eq(documents.id, 'd3'));

    const purge = await request('/documents/trash/purge-expired', { method: 'POST' });
    expect(purge.status).toBe(200);
    expect(await purge.json()).toEqual({ purged: 1 });
    expect((await request('/documents/d3')).status).toBe(404);
  });
});
