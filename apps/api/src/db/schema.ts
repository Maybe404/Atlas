import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
  joined: text('joined').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  memberId: text('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  expiresAt: text('expires_at').notNull(),
});

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mark: text('mark').notNull(),
  accent: text('accent').notNull(),
  personal: integer('personal', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
});

export const documents = sqliteTable('documents', {
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
});

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

export const shareLinks = sqliteTable('share_links', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  showAuthor: integer('show_author', { mode: 'boolean' }).notNull().default(true),
  allowIndexing: integer('allow_indexing', { mode: 'boolean' }).notNull().default(false),
  expiresAt: text('expires_at'),
  createdBy: text('created_by')
    .notNull()
    .references(() => members.id),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
});

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
