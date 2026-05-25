import type { members } from '../db/schema';

type MemberRow = typeof members.$inferSelect;

export function toPublicMember(member: MemberRow) {
  const { passwordHash: _passwordHash, ...publicMember } = member;
  return publicMember;
}
