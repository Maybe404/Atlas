import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
  joined: text('joined').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => ({
    memberIdIdx: index('sessions_member_id_idx').on(table.memberId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  }),
);

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mark: text('mark').notNull(),
  accent: text('accent').notNull(),
  personal: integer('personal', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => members.id),
    title: text('title').notNull(),
    desc: text('desc').notNull().default(''),
    html: text('html').notNull().default(''),
    visibility: text('visibility', { enum: ['public', 'invite', 'private'] }).notNull(),
    dot: text('dot').notNull().default('slate'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    skillVersion: text('skill_version').notNull().default('1.2.4'),
    updated: text('updated').notNull().default(sql`(current_timestamp)`),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by').references(() => members.id),
    purgeAfter: text('purge_after'),
  },
  (table) => ({
    spaceIdIdx: index('documents_space_id_idx').on(table.spaceId),
    authorIdIdx: index('documents_author_id_idx').on(table.authorId),
    visibilityIdx: index('documents_visibility_idx').on(table.visibility),
    deletedAtIdx: index('documents_deleted_at_idx').on(table.deletedAt),
    spaceDeletedIdx: index('documents_space_deleted_idx').on(table.spaceId, table.deletedAt),
    visibilityDeletedIdx: index('documents_visibility_deleted_idx').on(
      table.visibility,
      table.deletedAt,
    ),
    authorDeletedIdx: index('documents_author_deleted_idx').on(table.authorId, table.deletedAt),
  }),
);

// Per-member, per-space role. Absence of a row means "no access".
export const spaceMembers = sqliteTable(
  'space_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.spaceId, table.memberId] }),
  }),
);

export const documentMembers = sqliteTable(
  'document_members',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.memberId] }),
  }),
);

export const shareLinks = sqliteTable(
  'share_links',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    showAuthor: integer('show_author', { mode: 'boolean' }).notNull().default(true),
    allowIndexing: integer('allow_indexing', { mode: 'boolean' }).notNull().default(false),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').notNull().default(0),
    createdBy: text('created_by')
      .notNull()
      .references(() => members.id),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    documentIdIdx: index('share_links_document_id_idx').on(table.documentId),
  }),
);

export const skillVersions = sqliteTable('skill_versions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('sanitize-html'),
  version: text('version').notNull().unique(),
  note: text('note').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by')
    .notNull()
    .references(() => members.id),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => members.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: text('details', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    actorIdIdx: index('audit_logs_actor_id_idx').on(table.actorId),
    targetIdIdx: index('audit_logs_target_id_idx').on(table.targetId),
  }),
);
