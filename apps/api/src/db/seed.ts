import { createPersonalSpace } from '../lib/personal-space';
import { db } from './client';
import { documents, grants, members, sessions, shareLinks, spaces } from './schema';
import { ATLAS_DATA } from './seed-data';

const DEMO_PASSWORD_HASH = '$2b$04$RhYUNqiT505iO9sAwUaXGO/9c55aKJYZtRSazB2H0mHtPbH.m5eF.';

await db.delete(sessions);
await db.delete(grants);
await db.delete(shareLinks);
await db.delete(documents);
await db.delete(spaces);
await db.delete(members);

await db.insert(members).values(
  ATLAS_DATA.members.map((member) => ({
    ...member,
    passwordHash: DEMO_PASSWORD_HASH,
    role: member.role as 'admin' | 'editor' | 'viewer',
  })),
);

const now = new Date().toISOString();
const sampleHtml = (doc: { id: string; title: string; desc?: string }) => {
  const rich = ATLAS_DATA.docContent[doc.id as keyof typeof ATLAS_DATA.docContent];
  if (rich) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${rich.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans SC", sans-serif; max-width: 760px; margin: 64px auto; padding: 0 28px; color: #1d1d1f; line-height: 1.72; }
    h1 { font-size: 34px; margin: 0 0 10px; letter-spacing: -0.02em; }
    .lede { color: #515154; font-size: 17px; margin-bottom: 28px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0 40px; }
    .meta div { border-top: 1px solid #e5e5ea; padding-top: 10px; font-size: 13px; color: #6e6e73; }
    h2 { margin-top: 42px; font-size: 21px; }
    h3 { margin-top: 28px; font-size: 16px; }
    code { background: #f2f2f7; padding: 2px 5px; border-radius: 5px; }
    .callout { border-left: 3px solid #cc785c; padding: 10px 14px; background: #fff7f2; }
    .placeholder { height: 110px; border: 1px dashed #c7c7cc; display: grid; place-items: center; color: #8e8e93; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${rich.title}</h1>
  <p class="lede">${rich.lede}</p>
  <div class="meta">${rich.meta.map((m) => `<div><strong>${m.label}</strong><br>${m.value}</div>`).join('')}</div>
  ${rich.sections.map((section) => `<section id="${section.id}"><h2>${section.num} · ${section.title}</h2>${section.body}</section>`).join('\n')}
</body>
</html>`;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${doc.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans SC", sans-serif; max-width: 720px; margin: 64px auto; padding: 0 28px; color: #1d1d1f; line-height: 1.7; }
    h1 { font-size: 30px; margin: 0 0 12px; letter-spacing: -0.02em; }
    p { color: #515154; font-size: 16px; }
  </style>
</head>
<body>
  <h1>${doc.title}</h1>
  <p>${doc.desc ?? '这是一篇由 Atlas seed 生成的示例 HTML 文档。'}</p>
</body>
</html>`;
};

for (const sp of ATLAS_DATA.tree) {
  await db.insert(spaces).values({
    id: sp.id,
    name: sp.name,
    mark: sp.mark,
    accent: sp.accent as string,
    personal: !!sp.personal,
    ownerId: sp.personal ? (sp.children[0]?.author ?? null) : null,
  });
  for (const doc of sp.children) {
    await db.insert(documents).values({
      id: doc.id,
      spaceId: sp.id,
      authorId: doc.author,
      title: doc.title,
      desc: doc.desc ?? '',
      visibility: doc.visibility,
      dot: doc.dot as string,
      tags: doc.tags ?? [],
      format: doc.format ?? 'html',
      html: doc.format === 'markdown' ? (doc.content ?? '') : sampleHtml(doc),
      updated: doc.updated,
    });
  }
}

const permissions: { memberId: string; spaceId: string; role: 'viewer' | 'editor' }[] = [];
for (const [memberIndex, member] of ATLAS_DATA.members.entries()) {
  for (const [spaceIndex, space] of ATLAS_DATA.tree.entries()) {
    if (member.id === 'u1' || member.role === 'admin') {
      permissions.push({ memberId: member.id, spaceId: space.id, role: 'editor' });
      continue;
    }
    const hit = (memberIndex + spaceIndex) % 3;
    if (hit === 0) permissions.push({ memberId: member.id, spaceId: space.id, role: 'editor' });
    if (hit === 1) permissions.push({ memberId: member.id, spaceId: space.id, role: 'viewer' });
  }
}

await db.insert(grants).values(
  permissions.map((p) => ({
    subjectType: 'member' as const,
    subjectId: p.memberId,
    targetType: 'space' as const,
    targetId: p.spaceId,
    role: p.role,
  })),
);

await db.insert(grants).values([
  {
    subjectType: 'member',
    subjectId: 'u2',
    targetType: 'document',
    targetId: 'd1',
    role: 'editor',
  },
  {
    subjectType: 'member',
    subjectId: 'u3',
    targetType: 'document',
    targetId: 'd1',
    role: 'viewer',
  },
]);

// Every member owns exactly one private space. Members who already own a personal space
// in the fixture tree (e.g. u1 → s4) are skipped; the rest get a generated one.
const personalOwners = new Set(
  ATLAS_DATA.tree.filter((sp) => sp.personal).map((sp) => sp.children[0]?.author),
);
for (const member of ATLAS_DATA.members) {
  if (personalOwners.has(member.id)) continue;
  await createPersonalSpace(db, { id: member.id, name: member.name });
}

await db.insert(shareLinks).values({
  id: 'link_d1',
  documentId: 'd1',
  token: 'demo-d1-public-link',
  enabled: true,
  showAuthor: true,
  allowIndexing: false,
  createdBy: 'u1',
  createdAt: now,
  updatedAt: now,
});

console.log(
  `seeded ${ATLAS_DATA.members.length} members, ${ATLAS_DATA.tree.length} spaces, ${permissions.length} permissions`,
);
