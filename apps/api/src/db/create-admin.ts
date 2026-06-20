import { eq } from 'drizzle-orm';
import { nowIso } from '../lib/dates';
import { envString } from '../lib/env';
import { makeId } from '../lib/id';
import { createPersonalSpace } from '../lib/personal-space';
import { db } from './client';
import { members } from './schema';

// One-off production bootstrap: create (or reset) the first workspace admin.
// The email and display name are not secrets, so they keep convenient defaults; the PASSWORD is a
// secret and is never hardcoded — it must be supplied via env, e.g.:
//   ATLAS_ADMIN_PASSWORD='Maybe0047!' bun run --filter @atlas/api db:create-admin
const email = envString('ATLAS_ADMIN_EMAIL', 'maybe@atlas.team').trim().toLowerCase();
const name = envString('ATLAS_ADMIN_NAME', 'Maybe');
const password = process.env.ATLAS_ADMIN_PASSWORD ?? '';

if (password.length < 8) {
  throw new Error(
    'ATLAS_ADMIN_PASSWORD must be set (min 8 chars). Example:\n' +
      "  ATLAS_ADMIN_PASSWORD='Maybe0047!' bun run --filter @atlas/api db:create-admin",
  );
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
