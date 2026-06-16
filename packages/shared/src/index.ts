import { z } from 'zod';

export { extractHtmlMetadata } from './html-metadata';
export { extractMarkdownMetadata } from './markdown-metadata';

// ── Domain ─────────────────────────────────────────────────────────────────
export const RoleSchema = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const VisibilitySchema = z.enum(['public', 'invite', 'private']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const FormatSchema = z.enum(['html', 'markdown']);
export type Format = z.infer<typeof FormatSchema>;

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
  folderId: z.string().nullable().optional(),
  title: z.string(),
  desc: z.string().default(''),
  author: z.string(),
  authorName: z.string().optional(),
  updated: z.string(),
  visibility: VisibilitySchema,
  format: FormatSchema.default('html'),
  dot: AccentSchema.or(z.string()),
  tags: z.array(z.string()).default([]),
  html: z.string().optional(),
  canRead: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  locked: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const LockedDirectoryDocumentSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  folderId: z.string().nullable().optional(),
  title: z.string(),
  locked: z.literal(true),
  canRead: z.literal(false),
  canEdit: z.literal(false),
});
export type LockedDirectoryDocument = z.infer<typeof LockedDirectoryDocumentSchema>;

export const DirectoryDocumentSchema = z.union([DocumentSchema, LockedDirectoryDocumentSchema]);
export type DirectoryDocument = z.infer<typeof DirectoryDocumentSchema>;

export const FolderSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  restricted: z.boolean(),
  order: z.number().int(),
});
export type Folder = z.infer<typeof FolderSchema>;

// Per-member, per-space role; null means "no access".
export const SpaceMemberRoleSchema = z.enum(['viewer', 'editor']);
export type SpaceMemberRole = z.infer<typeof SpaceMemberRoleSchema>;

export const SpaceRoleSchema = SpaceMemberRoleSchema.nullable();
export type SpaceRole = z.infer<typeof SpaceRoleSchema>;

export const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  mark: z.string(),
  accent: AccentSchema.or(z.string()),
  count: z.number().int().nonnegative(),
  personal: z.boolean().optional(),
  role: SpaceRoleSchema.optional(),
  folders: z.array(FolderSchema).default([]),
  children: z.array(DirectoryDocumentSchema),
});
export type Space = z.infer<typeof SpaceSchema>;

// ── API request/response shapes ────────────────────────────────────────────
export const CreateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(64),
  accent: AccentSchema,
  personal: z.boolean().optional(),
});

export const UpdateSpaceSchema = CreateSpaceSchema.partial();

export const CreateDocumentSchema = z.object({
  spaceId: z.string(),
  folderId: z.string().nullable().optional(),
  title: z.string().trim().max(200).default(''),
  desc: z.string().default(''),
  visibility: VisibilitySchema,
  format: FormatSchema.default('html'),
  html: z.string().default(''),
  dot: AccentSchema.or(z.string()).default('slate'),
  tags: z.array(z.string()).default([]),
});

export const UpdateDocumentSchema = z.object({
  spaceId: z.string().optional(),
  folderId: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  desc: z.string().optional(),
  visibility: VisibilitySchema.optional(),
  format: FormatSchema.optional(),
  html: z.string().optional(),
  dot: AccentSchema.or(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128).optional(),
});

export const CreateMemberSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: RoleSchema.default('viewer'),
});

export const UpdateMemberSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: RoleSchema.optional(),
  password: z.string().min(8).max(128).optional(),
});

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const CreateFolderSchema = z.object({
  spaceId: z.string(),
  name: z.string().trim().min(1).max(80),
  parentId: z.string().nullable().optional(),
  restricted: z.boolean().optional(),
});

export const UpdateFolderSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  restricted: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const SetSpaceMemberRoleSchema = z.object({
  memberId: z.string(),
  role: SpaceRoleSchema,
});

export const BatchSetSpaceMemberRolesSchema = z.object({
  updates: z.array(SetSpaceMemberRoleSchema).min(1),
});

export const SetDocumentMemberRoleSchema = z.object({
  memberId: z.string(),
  role: SpaceRoleSchema,
});

export const UpdateDocumentShareSchema = z.object({
  publicEnabled: z.boolean().optional(),
  showAuthor: z.boolean().optional(),
  allowIndexing: z.boolean().optional(),
  expiresAt: IsoDateTimeSchema.nullable().optional(),
  rotateToken: z.boolean().optional(),
  members: z.array(SetDocumentMemberRoleSchema).optional(),
});
