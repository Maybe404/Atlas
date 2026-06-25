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
const {
  auditLogs,
  documents,
  folders,
  grants,
  groupMembers,
  groups,
  members,
  sessions,
  shareLinks,
  spaces,
} = await import('./db/schema');
const { setMemberDocumentRole, setMemberSpaceRole } = await import('./lib/grants');

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
  test('anonymous visitors see only published docs in the directory', async () => {
    const res = await request('/spaces');
    expect(res.status).toBe(200);
    const spaces = (await res.json()) as (ApiSpace & { personal?: boolean; folders?: unknown[] })[];
    const docs = spaces.flatMap(
      (space) =>
        space.children as {
          access?: string;
          published?: boolean;
          canRead: boolean;
          canEdit?: boolean;
          locked?: boolean;
          shareToken?: string | null;
          html?: string;
          desc?: string;
          author?: string;
          authorName?: string;
          updated?: string;
          tags?: string[];
          deletedAt?: string | null;
          title?: string;
          folderId?: string;
        }[],
    );
    expect(docs.length).toBeGreaterThan(0);

    // Guests only see published docs in the directory; every card has a share token so the
    // frontend can build a /share/:token URL. The directory never ships document HTML.
    expect(docs.every((doc) => doc.published === true && doc.canRead === true)).toBe(true);
    expect(
      docs.every((doc) => typeof doc.shareToken === 'string' && doc.shareToken.length > 0),
    ).toBe(true);
    expect(docs.every((doc) => doc.html === undefined)).toBe(true);

    // No locked placeholders for guests — non-published docs are simply not listed.
    expect(docs.some((doc) => doc.locked)).toBe(false);

    // Personal spaces are filtered out of the guest directory.
    expect(spaces.some((space) => space.personal === true)).toBe(false);
    // Folders are member-only; guests see an empty tree.
    expect(spaces.every((space) => (space.folders ?? []).length === 0)).toBe(true);

    // Guest direct access to /documents/:id is rejected (token is the only way in).
    const published = docs[0]!;
    const direct = await request(`/documents/${published.shareToken ? 'd1' : 'd1'}`);
    expect(direct.status).toBe(404);
  });

  test('uploads raw HTML and infers document metadata', async () => {
    const admin = await loginAs();
    const rawHtml =
      '<!doctype html><html><head><title>Smoke Title</title></head><body><h1>Fallback</h1><script>window.__smoke = 1</script><p onclick="x()">A useful generated summary for the uploaded HTML document.</p></body></html>';
    const form = new FormData();
    form.set('file', new File([rawHtml], 'smoke.html', { type: 'text/html' }));
    form.set('spaceId', 's1');
    form.set('access', 'restricted');

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

  test('serves raw document HTML for iframe framing with sandboxing headers', async () => {
    const admin = await loginAs();

    // The full doc gives us the html to compare against.
    const detail = (await (
      await request('/documents/d1', { headers: { cookie: admin.cookie } })
    ).json()) as ApiDoc;

    const raw = await request('/documents/d1/raw', { headers: { cookie: admin.cookie } });
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toBe('text/html; charset=utf-8');
    // Sandbox the response itself so a direct top-level open can't act as the Atlas origin, while
    // still letting our own app frame it (the global DENY / frame-ancestors 'none' would not).
    expect(raw.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    const csp = raw.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('sandbox');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('allow-same-origin');
    expect(await raw.text()).toBe(detail.html);

    // Read still requires permission — guests get nothing.
    expect((await request('/documents/d1/raw')).status).toBe(404);
  });

  test('public raw HTML endpoint serves the body without bumping the view counter', async () => {
    // Grab a published doc's share token from the guest directory.
    const spaces = (await (await request('/spaces')).json()) as {
      children: { shareToken?: string | null }[];
    }[];
    const token = spaces
      .flatMap((space) => space.children)
      .map((doc) => doc.shareToken)
      .find((t): t is string => typeof t === 'string' && t.length > 0)!;
    expect(token).toBeTruthy();

    type PublicDoc = { html: string; publicLink: { accessCount: number } };
    const meta1 = (await (await request(`/documents/public/${token}`)).json()) as PublicDoc;

    const raw = await request(`/documents/public/${token}/raw`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await raw.text()).toBe(meta1.html);

    // The metadata fetch counts the visit; the raw body fetch must not double-count it.
    const meta2 = (await (await request(`/documents/public/${token}`)).json()) as PublicDoc;
    expect(meta2.publicLink.accessCount).toBe(meta1.publicLink.accessCount + 1);
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
      role: 'member',
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
        role: 'member',
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

  test('newly created members receive an isolated personal space', async () => {
    const admin = await loginAs();
    const create = await request('/members', {
      method: 'POST',
      body: JSON.stringify({
        name: '测试者',
        email: 'tester@atlas.team',
        password: 'first-password',
        role: 'member',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };

    const [space] = await db.select().from(spaces).where(eq(spaces.ownerId, id));
    expect(space?.personal).toBe(true);
    const personalId = space?.id ?? '';
    expect(await spaceGrantRows(personalId)).toContainEqual({
      spaceId: personalId,
      memberId: id,
      role: 'editor',
    });
  });

  test('personal space contents are readable by owner and admin, hidden from others', async () => {
    const owner = await loginAs('chen@atlas.team'); // u2, editor of sp_personal_u2
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 'sp_personal_u2',
        title: '私人笔记',
        access: 'restricted',
        html: '<p>secret</p>',
      }),
      headers: { 'content-type': 'application/json', ...owner.headers },
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };

    // owner can read it
    expect((await request(`/documents/${id}`, { headers: { cookie: owner.cookie } })).status).toBe(
      200,
    );
    // an unrelated non-admin member cannot
    const other = await loginAs('he@atlas.team'); // u5
    expect((await request(`/documents/${id}`, { headers: { cookie: other.cookie } })).status).toBe(
      404,
    );
    // admin can
    const admin = await loginAs('lin@atlas.team');
    expect((await request(`/documents/${id}`, { headers: { cookie: admin.cookie } })).status).toBe(
      200,
    );
  });

  test('personal spaces cannot be shared with other members', async () => {
    const admin = await loginAs();
    const batch = await request('/spaces/s4/members', {
      method: 'PUT',
      body: JSON.stringify({ updates: [{ memberId: 'u2', role: 'viewer' }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(batch.status).toBe(403);

    const single = await request('/spaces/s4/members/u2', {
      method: 'PUT',
      body: JSON.stringify({ role: 'viewer' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(single.status).toBe(403);
  });

  test('folders: create, nest, file a doc, move it, soft-delete to trash, and restore', async () => {
    const admin = await loginAs();
    const json = (r: Response) => r.json() as Promise<{ id: string }>;

    const parent = await json(
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: '手册' }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );
    const child = await json(
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: '章节', parentId: parent.id }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );

    const created = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 's1',
        folderId: child.id,
        title: '入门',
        access: 'inherit',
        html: '<p>hi</p>',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(created.status).toBe(201);
    const { id: docId } = await json(created);

    // doc reports its folder
    const docBody = (await (
      await request(`/documents/${docId}`, { headers: { cookie: admin.cookie } })
    ).json()) as { folderId: string };
    expect(docBody.folderId).toBe(child.id);

    // space payload exposes the folder tree
    const space = (await (
      await request('/spaces/s1', { headers: { cookie: admin.cookie } })
    ).json()) as { folders: { id: string; parentId: string | null }[] };
    expect(space.folders.find((f) => f.id === child.id)?.parentId).toBe(parent.id);

    // move the doc up to the parent
    expect(
      (
        await request(`/documents/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify({ folderId: parent.id }),
          headers: { 'content-type': 'application/json', ...admin.headers },
        })
      ).status,
    ).toBe(200);

    // soft-delete the parent → cascades to its (now-empty) child subfolder and the doc it holds
    const del = await request(`/folders/${parent.id}`, {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ folders: 2, docs: 1 });

    // the live folder tree drops the trashed folders, and the doc leaves the live directory
    const afterDel = (await (
      await request('/spaces/s1', { headers: { cookie: admin.cookie } })
    ).json()) as { folders: { id: string }[] };
    expect(afterDel.folders.some((f) => f.id === parent.id || f.id === child.id)).toBe(false);
    expect(
      (await request(`/documents/${docId}`, { headers: { cookie: admin.cookie } })).status,
    ).toBe(404);

    // folder trash shows the deleted root, its subfolder counted and its file grouped beneath it
    const folderTrash = (await (
      await request('/folders/trash', { headers: { cookie: admin.cookie } })
    ).json()) as { id: string; subfolderCount: number; files: { id: string }[] }[];
    const trashed = folderTrash.find((t) => t.id === parent.id);
    expect(trashed?.subfolderCount).toBe(1);
    expect(trashed?.files.map((f) => f.id)).toContain(docId);

    // the cascade doc is grouped under the folder, not duplicated in the loose doc trash
    const docTrash = (await (
      await request('/documents/trash', { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[];
    expect(docTrash.some((d) => d.id === docId)).toBe(false);

    // restore the folder → folders + doc come back; doc re-revealed in its original folder
    expect(
      (await request(`/folders/${parent.id}/restore`, { method: 'POST', headers: admin.headers }))
        .status,
    ).toBe(200);
    const afterRestore = (await (
      await request('/spaces/s1', { headers: { cookie: admin.cookie } })
    ).json()) as { folders: { id: string }[] };
    expect(afterRestore.folders.some((f) => f.id === parent.id)).toBe(true);
    expect(afterRestore.folders.some((f) => f.id === child.id)).toBe(true);
    const restoredDoc = (await (
      await request(`/documents/${docId}`, { headers: { cookie: admin.cookie } })
    ).json()) as { folderId: string; deletedAt: string | null };
    expect(restoredDoc.folderId).toBe(parent.id);
    expect(restoredDoc.deletedAt).toBeFalsy();
  });

  test('folders: subtree-cycle moves and non-editor writes are rejected', async () => {
    const admin = await loginAs();
    const json = (r: Response) => r.json() as Promise<{ id: string }>;
    const a = await json(
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: 'A' }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );
    const b = await json(
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: 'B', parentId: a.id }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );
    // moving A under its own descendant B → 400
    expect(
      (
        await request(`/folders/${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ parentId: b.id }),
          headers: { 'content-type': 'application/json', ...admin.headers },
        })
      ).status,
    ).toBe(400);

    // a space viewer (u5 on s1) cannot create folders
    const viewer = await loginAs('he@atlas.team');
    expect(
      (
        await request('/folders', {
          method: 'POST',
          body: JSON.stringify({ spaceId: 's1', name: 'X' }),
          headers: { 'content-type': 'application/json', ...viewer.headers },
        })
      ).status,
    ).toBe(403);
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
    expect(await purge.json()).toEqual({ purged: 1, folders: 0 });
    expect((await request('/documents/d3')).status).toBe(404);
  });

  test('refuses to demote the last remaining admin', async () => {
    const admin = await loginAs();
    const demote = await request('/members/u1', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'member' }),
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
      body: JSON.stringify({ spaceId: 's1', title: '待永久删除', access: 'restricted', html: '' }),
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

  test('allows member invitations on restricted documents (the way to open them up)', async () => {
    const admin = await loginAs();
    // d2 is a restricted doc; a per-document grant is exactly how a specific member gets in.
    const before = await request('/documents/d2', {
      headers: { cookie: (await loginAs('he@atlas.team')).cookie },
    });
    expect(before.status).toBe(404);

    const res = await request('/documents/d2/share', {
      method: 'PATCH',
      body: JSON.stringify({ members: [{ memberId: 'u5', role: 'viewer' }] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(res.status).toBe(200);
    const roster = await docGrantRows('d2');
    expect(roster.find((row) => row.memberId === 'u5')?.role).toBe('viewer');

    const after = await request('/documents/d2', {
      headers: { cookie: (await loginAs('he@atlas.team')).cookie },
    });
    expect(after.status).toBe(200);
  });

  test('restricted folders block space-grant inheritance for inherit docs', async () => {
    const admin = await loginAs();
    const json = (r: Response) => r.json() as Promise<{ id: string }>;

    // Give u5 viewer access to s1 so space-level inheritance would normally apply.
    await setMemberSpaceRole(db, 'u5', 's1', 'viewer');

    // Control: an inherit doc at the space root is readable through the space grant.
    const open = await json(
      await request('/documents', {
        method: 'POST',
        body: JSON.stringify({
          spaceId: 's1',
          title: '可继承文档',
          access: 'inherit',
          html: '<p>open</p>',
        }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );

    // A restricted folder with an inherit doc inside: the space grant must NOT penetrate.
    const folder = await json(
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: '机密', restricted: true }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );
    const hidden = await json(
      await request('/documents', {
        method: 'POST',
        body: JSON.stringify({
          spaceId: 's1',
          folderId: folder.id,
          title: '机密文档',
          access: 'inherit',
          html: '<p>secret</p>',
        }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      }),
    );

    const viewer = await loginAs('he@atlas.team'); // u5
    expect(
      (await request(`/documents/${open.id}`, { headers: { cookie: viewer.cookie } })).status,
    ).toBe(200);
    expect(
      (await request(`/documents/${hidden.id}`, { headers: { cookie: viewer.cookie } })).status,
    ).toBe(404);
    // Admin (and the author) still read inside the restricted folder.
    expect(
      (await request(`/documents/${hidden.id}`, { headers: { cookie: admin.cookie } })).status,
    ).toBe(200);

    // Restore u5's seeded s1 grant state so later tests are unaffected.
    await setMemberSpaceRole(db, 'u5', 's1', null);
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
        access: 'restricted',
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
    form.set('access', 'restricted');

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

  // ── Phase 5: groups + capabilities ─────────────────────────────────────────
  async function adminCreateSpaceAndDoc(admin: Awaited<ReturnType<typeof loginAs>>) {
    const spaceRes = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: '组测试空间', accent: 'slate' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: spaceId } = (await spaceRes.json()) as { id: string };
    const docRes = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({ spaceId, title: '组可见文档', access: 'inherit' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: docId } = (await docRes.json()) as { id: string };
    return { spaceId, docId };
  }

  test('group grants extend access and fold with direct grants taking the highest role', async () => {
    const admin = await loginAs();
    const { spaceId, docId } = await adminCreateSpaceAndDoc(admin);

    // u5 (he) holds no grant on the fresh space → cannot read.
    const he = await loginAs('he@atlas.team');
    expect((await request(`/documents/${docId}`, { headers: he.headers })).status).toBe(404);

    // Create a group, add u5, grant it VIEWER on the space.
    const groupRes = await request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name: '访问组', capabilities: [] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: groupId } = (await groupRes.json()) as { id: string };
    await request(`/groups/${groupId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ memberIds: ['u5'] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    await request(`/groups/${groupId}/grants`, {
      method: 'PUT',
      body: JSON.stringify({
        grants: [{ targetType: 'space', targetId: spaceId, role: 'viewer' }],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });

    // Now readable, but viewer-only (no edit).
    const asViewer = await request(`/documents/${docId}`, { headers: he.headers });
    expect(asViewer.status).toBe(200);
    expect(((await asViewer.json()) as { canEdit: boolean }).canEdit).toBe(false);

    // A direct EDITOR grant folds with the group viewer grant → editor wins.
    await setMemberSpaceRole(db, 'u5', spaceId, 'editor');
    const folded = await request(`/documents/${docId}`, { headers: he.headers });
    expect(((await folded.json()) as { canEdit: boolean }).canEdit).toBe(true);

    // Remove the direct grant; bump the GROUP grant to editor → still editor via group alone.
    await setMemberSpaceRole(db, 'u5', spaceId, null);
    await request(`/groups/${groupId}/grants`, {
      method: 'PUT',
      body: JSON.stringify({
        grants: [{ targetType: 'space', targetId: spaceId, role: 'editor' }],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const viaGroup = await request(`/documents/${docId}`, { headers: he.headers });
    expect(((await viaGroup.json()) as { canEdit: boolean }).canEdit).toBe(true);
  });

  test('createSpace capability lets a non-admin member create a space; others are forbidden', async () => {
    // u2 (chen) belongs to g1 which carries createSpace; u5 (he) has no capability.
    const chen = await loginAs('chen@atlas.team');
    const ok = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: '陈的新空间', accent: 'moss' }),
      headers: { 'content-type': 'application/json', ...chen.headers },
    });
    expect(ok.status).toBe(201);

    const he = await loginAs('he@atlas.team');
    const denied = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: '何的空间', accent: 'moss' }),
      headers: { 'content-type': 'application/json', ...he.headers },
    });
    expect(denied.status).toBe(403);
  });

  test('manageGroups capability gates the groups admin surface', async () => {
    // u6 (zhou) is in g2 which carries manageGroups; u5 (he) is not.
    const zhou = await loginAs('zhou@atlas.team');
    expect((await request('/groups', { headers: zhou.headers })).status).toBe(200);

    const he = await loginAs('he@atlas.team');
    expect((await request('/groups', { headers: he.headers })).status).toBe(403);

    // manageMembers is likewise gated: u6 holds it, u5 does not.
    expect((await request('/members', { headers: zhou.headers })).status).toBe(200);
    expect((await request('/members', { headers: he.headers })).status).toBe(403);
  });

  test('deleting a group removes its grants and memberships', async () => {
    const admin = await loginAs();
    const { spaceId } = await adminCreateSpaceAndDoc(admin);
    const groupRes = await request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name: '待删组', capabilities: ['publish'] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: groupId } = (await groupRes.json()) as { id: string };
    await request(`/groups/${groupId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ memberIds: ['u5'] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    await request(`/groups/${groupId}/grants`, {
      method: 'PUT',
      body: JSON.stringify({
        grants: [{ targetType: 'space', targetId: spaceId, role: 'viewer' }],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });

    const del = await request(`/groups/${groupId}`, { method: 'DELETE', headers: admin.headers });
    expect(del.status).toBe(200);

    const remainingMembers = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    expect(remainingMembers.length).toBe(0);
    const remainingGrants = await db
      .select()
      .from(grants)
      .where(and(eq(grants.subjectType, 'group'), eq(grants.subjectId, groupId)));
    expect(remainingGrants.length).toBe(0);
    const [gone] = await db.select().from(groups).where(eq(groups.id, groupId));
    expect(gone).toBeUndefined();
  });

  test('group grant on a space lets a non-admin member create and edit documents in it', async () => {
    const admin = await loginAs();
    // Fresh space with no per-member grant; u5 has no capability and no grant → 403.
    const spaceRes = await request('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name: '组写权限空间', accent: 'moss' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: spaceId } = (await spaceRes.json()) as { id: string };

    // Create a group with editor grant, no capabilities needed for the create.
    const groupRes = await request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name: '组编辑', capabilities: [] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    const { id: groupId } = (await groupRes.json()) as { id: string };
    await request(`/groups/${groupId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ memberIds: ['u5'] }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    await request(`/groups/${groupId}/grants`, {
      method: 'PUT',
      body: JSON.stringify({
        grants: [{ targetType: 'space', targetId: spaceId, role: 'editor' }],
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });

    // u5 (no per-member grant) can now create a doc purely through the group grant.
    const he = await loginAs('he@atlas.team');
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId,
        title: '组创建文档',
        access: 'inherit',
        html: '<p>hi</p>',
      }),
      headers: { 'content-type': 'application/json', ...he.headers },
    });
    expect(create.status).toBe(201);
    const { id: docId } = (await create.json()) as { id: string };

    // And edit it.
    const patch = await request(`/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '组编辑后的标题' }),
      headers: { 'content-type': 'application/json', ...he.headers },
    });
    expect(patch.status).toBe(200);

    // The space must also show up in u5's directory so the UI surfaces it.
    const dirRes = await request('/spaces', { headers: { cookie: he.cookie } });
    const dir = (await dirRes.json()) as { id: string; role: string | null }[];
    const entry = dir.find((s) => s.id === spaceId);
    expect(entry).toBeDefined();
    expect(entry?.role).toBe('editor');

    // And the doc they just created shows up in the directory children.
    const children = (entry as unknown as { children: { id: string }[] }).children;
    expect(children.some((c) => c.id === docId)).toBe(true);
  });

  test('publish capability is required for every share write, including the document author', async () => {
    const admin = await loginAs();
    // u5 (he) is a regular member with no capability. Have them author a doc and verify they
    // cannot manage its share despite being the author.
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 's1',
        title: '无 publish 能力作者的分享测试',
        access: 'inherit',
        html: '<p>x</p>',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const { id: docId } = (await create.json()) as { id: string };
    await db.update(documents).set({ authorId: 'u5' }).where(eq(documents.id, docId));

    const he = await loginAs('he@atlas.team');
    const heShare = await request(`/documents/${docId}/share`, {
      headers: { cookie: he.cookie },
    });
    expect(heShare.status).toBe(404);

    const hePatch = await request(`/documents/${docId}/share`, {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true }),
      headers: { 'content-type': 'application/json', ...he.headers },
    });
    expect(hePatch.status).toBe(404);

    // u2 (chen) is in g1 (createSpace, publish) → author of d4 → can manage.
    const chen = await loginAs('chen@atlas.team');
    const chenPatch = await request('/documents/d4/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true }),
      headers: { 'content-type': 'application/json', ...chen.headers },
    });
    expect(chenPatch.status).toBe(200);
  });

  test('guest cannot read a published document via /documents/:id; the share token route works', async () => {
    // Issue a fresh public token for d1 — the rotate test above invalidates the seeded one.
    const admin = await loginAs();
    const issue = await request('/documents/d1/share', {
      method: 'PATCH',
      body: JSON.stringify({ publicEnabled: true, rotateToken: true }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(issue.status).toBe(200);
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.documentId, 'd1'));
    const token = link?.token ?? '';

    // The fresh public share link is reachable.
    const publicRes = await request(`/documents/public/${token}`);
    expect(publicRes.status).toBe(200);

    // But guessing the doc id and going direct no longer works for anonymous visitors.
    const direct = await request('/documents/d1');
    expect(direct.status).toBe(404);
  });

  test('deleting a member who once deleted a folder clears the FK reference first', async () => {
    const admin = await loginAs();
    // Create a member and grant them editor on s1, so they can create + delete folders
    // (the route requires the deleter to have a writable space grant). The password is the
    // demo password so `loginAs(email)` works without a custom password.
    const create = await request('/members', {
      method: 'POST',
      body: JSON.stringify({
        name: '待删会员',
        email: 'deleter@atlas.team',
        password: 'atlas-demo-password',
        role: 'member',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const { id: memberId } = (await create.json()) as { id: string };
    await setMemberSpaceRole(db, memberId, 's1', 'editor');

    // The new member creates a folder and soft-deletes it themselves; folders.deletedBy now
    // points at the member, NOT at the admin. This is the FK scenario we need to clear.
    const member = await loginAs('deleter@atlas.team');
    const folderRes = await request('/folders', {
      method: 'POST',
      body: JSON.stringify({ spaceId: 's1', name: '由待删会员创建的文件夹' }),
      headers: { 'content-type': 'application/json', ...member.headers },
    });
    expect(folderRes.status).toBe(201);
    const { id: folderId } = (await folderRes.json()) as { id: string };
    const del = await request(`/folders/${folderId}`, {
      method: 'DELETE',
      headers: member.headers,
    });
    expect(del.status).toBe(200);

    // Confirm the folder is in trash and points at the member.
    const [trashedFolder] = await db.select().from(folders).where(eq(folders.id, folderId));
    expect(trashedFolder?.deletedAt).toBeTruthy();
    expect(trashedFolder?.deletedBy).toBe(memberId);

    // Without the application-level cleanup, the member delete would trip a FOREIGN KEY
    // constraint. With it, the route nulls the column first, then drops the member row.
    const remove = await request(`/members/${memberId}`, {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(remove.status).toBe(200);

    // The folder is still in trash, but its deletedBy is now NULL — no dangling FK.
    const [afterMemberDelete] = await db.select().from(folders).where(eq(folders.id, folderId));
    expect(afterMemberDelete?.deletedBy).toBeNull();

    // Personal space is gone with the member.
    const [orphanSpace] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.id, `sp_personal_${memberId}`));
    expect(orphanSpace).toBeUndefined();
  });

  test('cascade-trashed documents cannot be individually restored; folder restore is the only path', async () => {
    const admin = await loginAs();
    // Build a fresh folder + doc pair, delete the folder, then try restoring the doc.
    const folder = (await (
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: '级联恢复测试' }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      })
    ).json()) as { id: string };
    const doc = (await (
      await request('/documents', {
        method: 'POST',
        body: JSON.stringify({
          spaceId: 's1',
          folderId: folder.id,
          title: '级联文档',
          access: 'inherit',
          html: '<p>x</p>',
        }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      })
    ).json()) as { id: string };

    const del = await request(`/folders/${folder.id}`, {
      method: 'DELETE',
      headers: admin.headers,
    });
    expect(del.status).toBe(200);

    const [trashedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(trashedDoc?.deletedAt).toBeTruthy();
    expect(trashedDoc?.trashedUnderFolderId).toBe(folder.id);

    // Direct doc restore is refused — the doc was trashed as part of a folder.
    const badRestore = await request(`/documents/${doc.id}/restore`, {
      method: 'POST',
      headers: admin.headers,
    });
    expect(badRestore.status).toBe(409);

    // Folder restore clears trashedUnderFolderId and brings the doc back.
    const folderRestore = await request(`/folders/${folder.id}/restore`, {
      method: 'POST',
      headers: admin.headers,
    });
    expect(folderRestore.status).toBe(200);
    const [restored] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(restored?.deletedAt).toBeFalsy();
    expect(restored?.trashedUnderFolderId).toBeFalsy();
  });

  test('cannot create, move, or file a document under a trashed folder', async () => {
    const admin = await loginAs();
    const folder = (await (
      await request('/folders', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', name: '回收站目标' }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      })
    ).json()) as { id: string };
    await request(`/folders/${folder.id}`, { method: 'DELETE', headers: admin.headers });

    // Filing a new doc under it is rejected.
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 's1',
        folderId: folder.id,
        title: '不应创建',
        access: 'inherit',
        html: '<p>x</p>',
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(400);

    // Moving an existing doc into it is rejected.
    const live = (await (
      await request('/documents', {
        method: 'POST',
        body: JSON.stringify({ spaceId: 's1', title: '活文档', access: 'inherit', html: '' }),
        headers: { 'content-type': 'application/json', ...admin.headers },
      })
    ).json()) as { id: string };
    const move = await request(`/documents/${live.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId: folder.id }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(move.status).toBe(400);

    // Patching the folder itself is rejected (requireFolderEditor now refuses trashed folders).
    const rename = await request(`/folders/${folder.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: '改名尝试' }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(rename.status).toBe(404);
  });
});
