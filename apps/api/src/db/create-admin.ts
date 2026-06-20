import { eq } from 'drizzle-orm';
import { nowIso } from '../lib/dates';
import { makeId } from '../lib/id';
import { createPersonalSpace } from '../lib/personal-space';
import { db } from './client';
import { members } from './schema';

// One-off production bootstrap: create (or reset) the first workspace admin.
// Credentials come from env with sensible defaults; override them in real deployments.
const email = (process.env.ATLAS_ADMIN_EMAIL ?? 'maybe@atlas.team').trim().toLowerCase();
const password = process.env.ATLAS_ADMIN_PASSWORD ?? 'Maybe0047!';
const name = process.env.ATLAS_ADMIN_NAME ?? 'Maybe';

if (password.length < 8) {
  throw new Error('ATLAS_ADMIN_PASSWORD must be at least 8 characters.');
}

const passwordHash = await Bun.password.hash(password);
const initials = (name.replace(/\s+/g, '').slice(0, 2) || 'AD').toUpperCase();

const [existing] = await db.select().from(members).where(eq(members.email, email));

if (existing) {
  await db.update(members).set({ passwordHash, role: 'admin' }).where(eq(members.id, existing.id));
  console.log(`updated existing member ${email} → admin with a fresh password`);
} else {
  const id = makeId('u');
  await db.insert(members).values({
    id,
    name,
    initials,
    email,
    passwordHash,
    role: 'admin',
    joined: nowIso(),
  });
  await createPersonalSpace(db, { id, name });
  console.log(`created admin ${email} (id ${id}) + personal space`);
}
