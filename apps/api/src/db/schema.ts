import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
  joined: text('joined').notNull(),
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
  updated: text('updated').notNull().default(sql`(current_timestamp)`),
});

// Per-member, per-space role. Absence of a row means "no access".
export const spaceMembers = sqliteTable('space_members', {
  spaceId: text('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  memberId: text('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['viewer', 'editor'] }).notNull(),
});
