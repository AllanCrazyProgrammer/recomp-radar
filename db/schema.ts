import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const targets = sqliteTable('targets', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), key: text('key').notNull(), kind: text('kind').notNull(),
  label: text('label').notNull(), priority: integer('priority').notNull().default(0), repos: text('repos').notNull().default('[]'),
  createdAt: text('created_at').notNull(), lastSync: text('last_sync'), error: text('error'),
}, t => [uniqueIndex('target_user_key').on(t.userId,t.key)]);
export const events = sqliteTable('events', {
  id: text('id').primaryKey(), repo: text('repo').notNull(), kind: text('kind').notNull(), title: text('title').notNull(),
  body: text('body').notNull(), url: text('url').notNull(), date: text('date').notNull(), sourceUpdated: text('source_updated'),
  revision: text('revision').notNull(), status: text('status').notNull(), assets: integer('assets').notNull().default(0),
  firstSeen: text('first_seen').notNull(), detectedAt: text('detected_at').notNull(), releaseTag: text('release_tag'),
}, t => [
  index('events_repo_detected_date').on(t.repo,t.detectedAt,t.date),
  index('events_repo_kind_date').on(t.repo,t.kind,t.date),
]);
export const reads = sqliteTable('reads', {
  userId: text('user_id').notNull(), eventId: text('event_id').notNull(), revision: text('revision').notNull(), readAt: text('read_at').notNull(),
}, t=>[primaryKey({columns:[t.userId,t.eventId]})]);
export const cache = sqliteTable('cache', {
  path: text('path').primaryKey(), json: text('json').notNull(), etag: text('etag'), checkedAt: integer('checked_at').notNull(),
});
export const settings = sqliteTable('settings', { key:text('key').primaryKey(), value:text('value').notNull() });
export const installations = sqliteTable('installations', {
  userId: text('user_id').notNull(), repo: text('repo').notNull(), releaseId: text('release_id'),
  tag: text('tag').notNull(), title: text('title').notNull(), publishedAt: text('published_at'),
  prerelease: integer('prerelease'), markedAt: text('marked_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.repo]})]);
export const gameCovers = sqliteTable('game_covers', {
  userId: text('user_id').notNull(), repo: text('repo').notNull(), objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(), bytes: integer('bytes').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.repo]})]);
