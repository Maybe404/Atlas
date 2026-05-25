import { z } from 'zod';

// ── Domain ─────────────────────────────────────────────────────────────────
export const RoleSchema = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const VisibilitySchema = z.enum(['public', 'invite', 'private']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const AccentSchema = z.enum(['accent', 'moss', 'slate', 'plum', 'ink', 'rose']);
export type Accent = z.infer<typeof AccentSchema>;

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  role: RoleSchema,
  email: z.string().email(),
  joined: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  spaceId: z.string().optional(),
  spaceName: z.string().optional(),
  spaceAccent: z.string().optional(),
  title: z.string(),
  desc: z.string().default(''),
  author: z.string(),
  authorName: z.string().optional(),
  updated: z.string(),
  visibility: VisibilitySchema,
  dot: AccentSchema.or(z.string()),
  tags: z.array(z.string()).default([]),
  html: z.string().optional(),
  skillVersion: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  mark: z.string(),
  accent: AccentSchema.or(z.string()),
  count: z.number().int().nonnegative(),
  personal: z.boolean().optional(),
  children: z.array(DocumentSchema),
});
export type Space = z.infer<typeof SpaceSchema>;

// Per-member, per-space role; null means "no access".
export const SpaceMemberRoleSchema = z.enum(['viewer', 'editor']);
export type SpaceMemberRole = z.infer<typeof SpaceMemberRoleSchema>;

export const SpaceRoleSchema = SpaceMemberRoleSchema.nullable();
export type SpaceRole = z.infer<typeof SpaceRoleSchema>;

// ── API request/response shapes ────────────────────────────────────────────
export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(64),
  accent: AccentSchema,
  personal: z.boolean().optional(),
});

export const UpdateSpaceSchema = CreateSpaceSchema.partial();

export const CreateDocumentSchema = z.object({
  spaceId: z.string(),
  title: z.string().min(1).max(200),
  desc: z.string().default(''),
  visibility: VisibilitySchema,
  html: z.string().default(''),
  dot: AccentSchema.or(z.string()).default('slate'),
  tags: z.array(z.string()).default([]),
  skillVersion: z.string().optional(),
});

export const UpdateDocumentSchema = CreateDocumentSchema.partial();

export const LoginSchema = z.object({
  email: z.string().email(),
});

export const UpdateMemberSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: RoleSchema.optional(),
});

export const SetSpaceMemberRoleSchema = z.object({
  memberId: z.string(),
  role: SpaceRoleSchema,
});

export const SetDocumentMemberRoleSchema = z.object({
  memberId: z.string(),
  role: SpaceRoleSchema,
});

export const UpdateDocumentShareSchema = z.object({
  publicEnabled: z.boolean().optional(),
  showAuthor: z.boolean().optional(),
  allowIndexing: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  members: z.array(SetDocumentMemberRoleSchema).optional(),
});

export const CreateSkillVersionSchema = z.object({
  version: z.string().min(1).max(32),
  note: z.string().min(1).max(240),
});
