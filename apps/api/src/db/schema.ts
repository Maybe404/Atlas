import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  // Global role collapsed to admin/member in Phase 5; capabilities now ride on groups.
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  joined: text('joined').notNull(),
});

// Permission groups (Phase 5). Carry global capability switches (B) and, via `grants` rows with
// subjectType='group', resource authorizations on spaces/folders (A).
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

// Many-to-many: which members belong to which group.
export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.memberId] }),
    memberIdIdx: index('group_members_member_id_idx').on(table.memberId),
  }),
);

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
  // Owner of a personal space (null for shared spaces). Personal spaces are isolated to
  // their owner + admins; sharing is per-document / public-link only.
  ownerId: text('owner_id').references(() => members.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    // Nesting pointer (logical self-reference, validated in the route). No DB FK: space delete
    // cascades every folder via space_id; folder delete is a soft cascade (see deletedAt below).
    parentId: text('parent_id'),
    name: text('name').notNull(),
    // Restricted folders are stored now but only ENFORCED in Phase 4 (inherit/restricted chain).
    restricted: integer('restricted', { mode: 'boolean' }).notNull().default(false),
    order: integer('order').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    // Soft delete to trash (mirrors documents). Deleting a folder soft-deletes its whole subtree
    // and the docs within, without touching folderId — so restore re-reveals files in place.
    deletedAt: text('deleted_at'),
    // The application-level member-delete route clears this column before dropping the member
    // row. We deliberately do NOT add `ON DELETE SET NULL` here: rebuilding the table to attach
    // a different FK clause is risky (it can cascade into documents.folder_id under a future
    // migration runner that enables PRAGMA foreign_keys), and the application code already
    // owns the cleanup. Leaving the FK as `NO ACTION` keeps the table structure unchanged and
    // makes any missed cleanup surface as an immediate, loud 500 — which is the right failure
    // mode for a real FK violation.
    deletedBy: text('deleted_by').references(() => members.id),
    purgeAfter: text('purge_after'),
    // The trash-root folder this row was cascade-deleted under. NULL ⇒ this folder is itself the
    // root the user deleted (the only kind shown as a top-level trash entry).
    trashedUnderFolderId: text('trashed_under_folder_id'),
  },
  (table) => ({
    spaceIdIdx: index('folders_space_id_idx').on(table.spaceId),
    parentIdIdx: index('folders_parent_id_idx').on(table.parentId),
    deletedAtIdx: index('folders_deleted_at_idx').on(table.deletedAt),
    trashedUnderIdx: index('folders_trashed_under_idx').on(table.trashedUnderFolderId),
  }),
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    // Folder the doc lives in (null = space root). Folder soft-delete keeps folderId intact (the
    // doc is soft-deleted alongside), so restore re-reveals the doc in its original folder.
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    authorId: text('author_id')
      .notNull()
      .references(() => members.id),
    title: text('title').notNull(),
    desc: text('desc').notNull().default(''),
    html: text('html').notNull().default(''),
    // Site-internal access. `inherit` follows the folder/space chain; `restricted` is author +
    // admin + explicit grant only. Public exposure is orthogonal (share_links), not an access mode.
    access: text('access', { enum: ['inherit', 'restricted'] })
      .notNull()
      .default('inherit'),
    format: text('format', { enum: ['html', 'markdown'] })
      .notNull()
      .default('html'),
    dot: text('dot').notNull().default('slate'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    updated: text('updated').notNull().default(sql`(current_timestamp)`),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by').references(() => members.id),
    purgeAfter: text('purge_after'),
    // Set when this doc entered trash as part of a folder deletion (= the trash-root folder id);
    // NULL ⇒ the doc was trashed on its own. Lets the trash group cascade docs under their folder.
    trashedUnderFolderId: text('trashed_under_folder_id'),
  },
  (table) => ({
    spaceIdIdx: index('documents_space_id_idx').on(table.spaceId),
    authorIdIdx: index('documents_author_id_idx').on(table.authorId),
    accessIdx: index('documents_access_idx').on(table.access),
    deletedAtIdx: index('documents_deleted_at_idx').on(table.deletedAt),
    deletedPurgeAfterIdx: index('documents_deleted_purge_after_idx').on(
      table.deletedAt,
      table.purgeAfter,
    ),
    spaceDeletedIdx: index('documents_space_deleted_idx').on(table.spaceId, table.deletedAt),
    accessDeletedIdx: index('documents_access_deleted_idx').on(table.access, table.deletedAt),
    authorDeletedIdx: index('documents_author_deleted_idx').on(table.authorId, table.deletedAt),
  }),
);

// Unified authorization edges. Replaced the former space_members + document_members
// tables (dropped in migration 0012); subjectType 'member'|'group' × targetType
// 'space'|'folder'|'document' covers every access edge.
export const grants = sqliteTable(
  'grants',
  {
    subjectType: text('subject_type', { enum: ['group', 'member'] }).notNull(),
    subjectId: text('subject_id').notNull(),
    targetType: text('target_type', { enum: ['space', 'folder', 'document'] }).notNull(),
    targetId: text('target_id').notNull(),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.subjectType, table.subjectId, table.targetType, table.targetId],
    }),
    subjectIdx: index('grants_subject_idx').on(table.subjectType, table.subjectId),
    targetIdx: index('grants_target_idx').on(table.targetType, table.targetId),
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

// Persistent login-failure counter shared across processes. Replaces the in-memory Map so a
// multi-replica deployment (or a process restart) doesn't reset the rate-limit window. Rows
// self-expire on read via `resetAt`; no background sweep is required.
export const loginFailures = sqliteTable('login_failures', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: text('reset_at').notNull(),
});
