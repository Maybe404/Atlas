import { ATLAS_DATA } from '@atlas/shared/fixtures';
import { db } from './client';
import { documents, members, spaces } from './schema';

await db.delete(documents);
await db.delete(spaces);
await db.delete(members);

await db.insert(members).values(ATLAS_DATA.members);

for (const sp of ATLAS_DATA.tree) {
  await db.insert(spaces).values({
    id: sp.id,
    name: sp.name,
    mark: sp.mark,
    accent: sp.accent as string,
    personal: !!sp.personal,
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
      updated: doc.updated,
    });
  }
}

console.log(`seeded ${ATLAS_DATA.members.length} members, ${ATLAS_DATA.tree.length} spaces`);
