import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const notesTable = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    contentHtml: text('content_html').notNull(),
    plainText: text('plain_text').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    revision: integer('revision').notNull().default(1)
  },
  (table) => [
    index('idx_notes_active_updated').on(table.deletedAt, table.pinned, table.updatedAt),
    index('idx_notes_title').on(table.title)
  ]
)

export const noteTagsTable = sqliteTable(
  'note_tags',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notesTable.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    position: integer('position').notNull().default(0)
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tag] }),
    index('idx_note_tags_tag').on(table.tag)
  ]
)

export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})
