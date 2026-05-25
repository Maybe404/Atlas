import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { makeId } from './id';

type AuditTarget = {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
};

export async function writeAudit({
  actorId,
  action,
  targetType,
  targetId,
  details = {},
}: AuditTarget) {
  await db.insert(auditLogs).values({
    id: makeId('audit'),
    actorId: actorId ?? null,
    action,
    targetType,
    targetId,
    details,
  });
}
