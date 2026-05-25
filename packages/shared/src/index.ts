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
  title: z.string(),
  desc: z.string().default(''),
  author: z.string(),
  updated: z.string(),
  visibility: VisibilitySchema,
  dot: AccentSchema.or(z.string()),
  tags: z.array(z.string()).default([]),
  html: z.string().optional(),
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
export const SpaceRoleSchema = z.enum(['viewer', 'editor']).nullable();
export type SpaceRole = z.infer<typeof SpaceRoleSchema>;

// ── API request/response shapes ────────────────────────────────────────────
export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(64),
  accent: AccentSchema,
});

export const UpdateSpaceSchema = CreateSpaceSchema.partial();

export const CreateDocumentSchema = z.object({
  spaceId: z.string(),
  title: z.string().min(1).max(200),
  desc: z.string().default(''),
  visibility: VisibilitySchema,
  html: z.string().default(''),
});

export const UpdateDocumentSchema = CreateDocumentSchema.partial();
