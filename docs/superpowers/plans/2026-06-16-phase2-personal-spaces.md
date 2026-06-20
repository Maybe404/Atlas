# Phase 2: Personal Spaces (brief plan)

**Goal:** Every member owns one private space, isolated by default; only owner + admin see it; sharing is per-document / public-link only (decision P). Whole-space grants to others are forbidden.

**Key insight:** Isolation already falls out of the grants model (non-owners hold no grant). Phase 2 adds ownership + auto-provisioning + the "can't share the whole personal space" guard.

## Steps

1. **schema** (`db/schema.ts`): add `spaces.ownerId text` → `members.id`, `onDelete: 'set null'`. Nullable (non-personal spaces have null).
2. **migration 0007** (`db:generate` then append backfill SQL):
   - set `owner_id` on existing personal spaces (infer: a member holding an editor grant on it);
   - create a personal space (`sp_personal_<memberId>`, accent `plum`, `personal=1`, `owner_id`) for every member lacking one, plus the owner editor grant. (No-op on fresh DB where members is empty at migrate time — seed covers dev/test.)
3. **seed** (`db/seed.ts`): set `ownerId` on personal tree spaces (infer from first child author); after seeding, ensure every member owns a personal space (create `sp_personal_<id>` + owner editor grant for those without one).
4. **permissions** (`lib/permissions.ts`): add `isPersonalSpaceOwner(user, space)` and allow owner read/edit of docs in their personal space (parallels the author short-circuit). Export a `requirePersonalSpaceShareable`-style guard helper `isPersonalSpace(spaceId)`.
5. **members route** (`routes/members.ts` POST): after creating a member, create their personal space + owner editor grant (reuse a shared `createPersonalSpace` helper in `lib/personal-space.ts`).
6. **spaces routes** (`routes/spaces.ts`): reject member-grant changes (`PUT /:id/members`, `PUT /:id/members/:memberId`) when the target space is `personal` → `forbidden('Personal spaces cannot be shared with other members.')`. Owner's own grant is exempt (it already exists; the route only adds *other* members).
7. **member delete**: `ownerId` FK `set null` + existing `removeGrantsForSubject` already cover cleanup; personal space becomes an admin-visible orphan (acceptable).
8. **tests** (`server.test.ts`): owner reads/edits own personal-space doc; non-owner gets 404; admin sees it; per-doc grant to a non-owner still grants single-doc access; granting another member on a personal space → 403; new member auto-gets a personal space.
9. **verify**: typecheck + lint + clean migrate/seed + full suite.
