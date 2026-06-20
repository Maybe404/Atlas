import {
  type Capability,
  CreateGroupSchema,
  type GroupGrant,
  SetGroupGrantsSchema,
  SetGroupMembersSchema,
  UpdateGroupSchema,
} from '@atlas/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { folders, grants, groupMembers, groups, members, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { removeGrantsForSubject, setGrant } from '../lib/grants';
import { badRequest, notFound } from '../lib/http-error';
import { makeId } from '../lib/id';
import { getMemberCapabilities, requireCapability } from '../lib/permissions';

type GroupRow = typeof groups.$inferSelect;

async function requireGroupById(id: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) throw notFound('Group not found.');
  return group;
}

async function membersByGroupId(groupIds: string[]) {
  const map = new Map<string, string[]>();
  if (groupIds.length === 0) return map;
  const rows = await db
    .select({ groupId: groupMembers.groupId, memberId: groupMembers.memberId })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groupIds));
  for (const row of rows) {
    const list = map.get(row.groupId) ?? [];
    list.push(row.memberId);
    map.set(row.groupId, list);
  }
  return map;
}

async function grantsByGroupId(groupIds: string[]) {
  const map = new Map<string, GroupGrant[]>();
  if (groupIds.length === 0) return map;
  const rows = await db
    .select({
      groupId: grants.subjectId,
      targetType: grants.targetType,
      targetId: grants.targetId,
      role: grants.role,
    })
    .from(grants)
    .where(eq(grants.subjectType, 'group'));
  for (const row of rows) {
    if (!groupIds.includes(row.groupId)) continue;
    if (row.targetType !== 'space' && row.targetType !== 'folder') continue;
    const list = map.get(row.groupId) ?? [];
    list.push({ targetType: row.targetType, targetId: row.targetId, role: row.role });
    map.set(row.groupId, list);
  }
  return map;
}

function toGroup(row: GroupRow, memberIds: string[] = [], grantList: GroupGrant[] = []) {
  return {
    id: row.id,
    name: row.name,
    capabilities: row.capabilities as Capability[],
    memberIds,
    grants: grantList,
  };
}

async function requireManageGroups(user: ReturnType<typeof requireUser>) {
  const caps = await getMemberCapabilities(user);
  requireCapability(caps, 'manageGroups');
}

export const groupsRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const rows = await db.select().from(groups);
    const ids = rows.map((row) => row.id);
    const memberMap = await membersByGroupId(ids);
    const grantMap = await grantsByGroupId(ids);
    return c.json(
      rows.map((row) => toGroup(row, memberMap.get(row.id) ?? [], grantMap.get(row.id) ?? [])),
    );
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const body = CreateGroupSchema.parse(await c.req.json());
    const id = makeId('g');
    await db.insert(groups).values({ id, name: body.name, capabilities: body.capabilities });
    await writeAudit({
      actorId: user.id,
      action: 'group.create',
      targetType: 'group',
      targetId: id,
      details: { name: body.name, capabilities: body.capabilities },
    });
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    if (!group) throw notFound();
    return c.json(toGroup(group), 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const id = c.req.param('id');
    await requireGroupById(id);
    const body = UpdateGroupSchema.parse(await c.req.json());
    const patch: Partial<typeof groups.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.capabilities !== undefined) patch.capabilities = body.capabilities;
    if (Object.keys(patch).length === 0) throw badRequest('No fields to update.');
    await db.update(groups).set(patch).where(eq(groups.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'group.update',
      targetType: 'group',
      targetId: id,
      details: body,
    });
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    if (!group) throw notFound();
    const memberMap = await membersByGroupId([id]);
    const grantMap = await grantsByGroupId([id]);
    return c.json(toGroup(group, memberMap.get(id) ?? [], grantMap.get(id) ?? []));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const id = c.req.param('id');
    await requireGroupById(id);
    await removeGrantsForSubject(db, id); // grants reference the group by subjectId
    await db.delete(groups).where(eq(groups.id, id)); // cascades group_members via FK
    await writeAudit({
      actorId: user.id,
      action: 'group.delete',
      targetType: 'group',
      targetId: id,
    });
    return c.json({ ok: true });
  })
  .put('/:id/members', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const id = c.req.param('id');
    await requireGroupById(id);
    const body = SetGroupMembersSchema.parse(await c.req.json());
    const wanted = [...new Set(body.memberIds)];
    if (wanted.length > 0) {
      const existing = await db
        .select({ id: members.id })
        .from(members)
        .where(inArray(members.id, wanted));
      const existingIds = new Set(existing.map((m) => m.id));
      const missing = wanted.find((memberId) => !existingIds.has(memberId));
      if (missing) throw notFound('Member not found.');
    }
    await db.transaction(async (tx) => {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      for (const memberId of wanted) {
        await tx.insert(groupMembers).values({ groupId: id, memberId });
      }
    });
    await writeAudit({
      actorId: user.id,
      action: 'group.members_set',
      targetType: 'group',
      targetId: id,
      details: { memberIds: wanted },
    });
    return c.json({ ok: true, count: wanted.length });
  })
  .put('/:id/grants', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageGroups(user);
    const id = c.req.param('id');
    await requireGroupById(id);
    const body = SetGroupGrantsSchema.parse(await c.req.json());
    const deduped = [
      ...new Map(body.grants.map((g) => [`${g.targetType}:${g.targetId}`, g])).values(),
    ];

    // Validate every target exists in the right table.
    const spaceIds = deduped.filter((g) => g.targetType === 'space').map((g) => g.targetId);
    const folderIds = deduped.filter((g) => g.targetType === 'folder').map((g) => g.targetId);
    if (spaceIds.length > 0) {
      const found = await db
        .select({ id: spaces.id })
        .from(spaces)
        .where(inArray(spaces.id, spaceIds));
      if (found.length !== new Set(spaceIds).size) throw notFound('Space not found.');
    }
    if (folderIds.length > 0) {
      const found = await db
        .select({ id: folders.id })
        .from(folders)
        .where(inArray(folders.id, folderIds));
      if (found.length !== new Set(folderIds).size) throw notFound('Folder not found.');
    }

    await db.transaction(async (tx) => {
      // Replace the group's space/folder grants wholesale.
      await tx.delete(grants).where(and(eq(grants.subjectType, 'group'), eq(grants.subjectId, id)));
      for (const grant of deduped) {
        await setGrant(tx, {
          subjectType: 'group',
          subjectId: id,
          targetType: grant.targetType,
          targetId: grant.targetId,
          role: grant.role,
        });
      }
    });
    await writeAudit({
      actorId: user.id,
      action: 'group.grants_set',
      targetType: 'group',
      targetId: id,
      details: { grants: deduped },
    });
    return c.json({ ok: true, count: deduped.length });
  });
