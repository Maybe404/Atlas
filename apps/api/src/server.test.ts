import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const testDb = join(import.meta.dir, '../data/test-atlas.sqlite');
process.env.DATABASE_URL = testDb;

rmSync(testDb, { force: true });
rmSync(`${testDb}-shm`, { force: true });
rmSync(`${testDb}-wal`, { force: true });
await import('./db/migrate');
await import('./db/seed');

const { default: server } = await import('./server');

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
        ['<!doctype html><html><body><h1>Smoke</h1><script>alert(1)</script><p onclick="x()">ok</p></body></html>'],
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

  test('soft deletes and restores documents', async () => {
    const remove = await request('/documents/d2', { method: 'DELETE' });
    expect(remove.status).toBe(200);

    const missing = await request('/documents/d2');
    expect(missing.status).toBe(404);

    const trash = await request('/documents/trash');
    expect(trash.status).toBe(200);
    const items = (await trash.json()) as { id: string }[];
    expect(items.some((item: { id: string }) => item.id === 'd2')).toBe(true);

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
});
