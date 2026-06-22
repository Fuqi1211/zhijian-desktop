import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  importPayloadSchema,
  type AppSettings,
  type ExportPayload,
  type ImportResult,
  type Note,
  type NoteDraft,
  type NoteQuery,
  type NoteSummary,
  type NoteUpdate,
  type TagStat
} from '../../shared/contracts'
import {
  DEFAULT_SETTINGS,
  STORAGE_EXPORT_APP,
  cleanTag,
  normalizeTags,
  plainTextFromHtml,
  sanitizeNoteHtml,
  toSummary
} from '../../shared/domain'

interface NoteRow {
  id: string
  title: string
  content_html: string
  plain_text: string
  pinned: 0 | 1
  created_at: number
  updated_at: number
  deleted_at: number | null
  revision: number
}

export interface RepositoryOptions {
  dbPath: string
  now?: () => number
}

export class NoteRepository {
  private readonly sqlite: Database.Database
  readonly orm: BetterSQLite3Database
  private readonly now: () => number

  constructor(options: RepositoryOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true })
    this.sqlite = new Database(options.dbPath)
    this.orm = drizzle(this.sqlite)
    this.now = options.now ?? Date.now
    this.configure()
    this.migrate(options.dbPath)
    this.seedIfEmpty()
  }

  close(): void {
    this.sqlite.close()
  }

  list(query: NoteQuery = {}): NoteSummary[] {
    const clauses = [query.includeDeleted ? '1 = 1' : 'n.deleted_at IS NULL']
    const params: Record<string, unknown> = {}

    if (query.filter === 'pinned') clauses.push('n.pinned = 1')
    if (query.tag) {
      clauses.push('EXISTS (SELECT 1 FROM note_tags tf WHERE tf.note_id = n.id AND tf.tag = @filterTag)')
      params.filterTag = cleanTag(query.tag)
    }
    if (query.search?.trim()) {
      const search = query.search.trim().toLocaleLowerCase('zh-CN')
      clauses.push(
        '(lower(n.title) LIKE @search OR lower(n.plain_text) LIKE @search OR EXISTS (SELECT 1 FROM note_tags ts WHERE ts.note_id = n.id AND lower(ts.tag) LIKE @search))'
      )
      params.search = '%' + search + '%'
    }

    const limit = Math.min(query.limit ?? 10000, 10000)
    const rows = this.sqlite
      .prepare(
        'SELECT n.* FROM notes n WHERE ' +
          clauses.join(' AND ') +
          ' ORDER BY n.pinned DESC, n.updated_at DESC LIMIT @limit'
      )
      .all({ ...params, limit }) as NoteRow[]

    return rows.map((row) => toSummary(this.rowToNote(row)))
  }

  get(id: string): Note | null {
    const row = this.sqlite.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
    return row ? this.rowToNote(row) : null
  }

  create(draft: NoteDraft = {}): Note {
    const id = randomUUID()
    const now = this.now()
    const html = sanitizeNoteHtml(draft.contentHtml ?? '<p></p>')
    const note: Note = {
      id,
      title: (draft.title ?? '').slice(0, 160),
      contentHtml: html,
      plainText: plainTextFromHtml(html),
      tags: normalizeTags(draft.tags ?? []),
      pinned: Boolean(draft.pinned),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1
    }
    this.writeNote(note)
    return note
  }

  update(id: string, update: NoteUpdate): Note {
    const current = this.get(id)
    if (!current || current.deletedAt) throw new Error('Note not found')
    const html =
      typeof update.contentHtml === 'string'
        ? sanitizeNoteHtml(update.contentHtml)
        : current.contentHtml
    const note: Note = {
      ...current,
      title: typeof update.title === 'string' ? update.title.slice(0, 160) : current.title,
      contentHtml: html,
      plainText: plainTextFromHtml(html),
      tags: Array.isArray(update.tags) ? normalizeTags(update.tags) : current.tags,
      pinned: typeof update.pinned === 'boolean' ? update.pinned : current.pinned,
      updatedAt: this.now(),
      revision: current.revision + 1
    }
    this.writeNote(note)
    return note
  }

  setPinned(id: string, pinned: boolean): Note {
    return this.update(id, { pinned })
  }

  delete(id: string): void {
    const now = this.now()
    this.sqlite
      .prepare('UPDATE notes SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?')
      .run(now, now, id)
  }

  undoDelete(id: string): Note | null {
    const note = this.get(id)
    if (!note) return null
    this.sqlite
      .prepare('UPDATE notes SET deleted_at = NULL, updated_at = ?, revision = revision + 1 WHERE id = ?')
      .run(this.now(), id)
    return this.get(id)
  }

  tagStats(): TagStat[] {
    return this.sqlite
      .prepare(
        'SELECT t.tag as tag, count(*) as count FROM note_tags t JOIN notes n ON n.id = t.note_id WHERE n.deleted_at IS NULL GROUP BY t.tag ORDER BY count DESC, lower(t.tag) ASC'
      )
      .all() as TagStat[]
  }

  getSettings(): AppSettings {
    const rows = this.sqlite.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    const loaded = Object.fromEntries(
      rows.map((row) => {
        try {
          return [row.key, JSON.parse(row.value)]
        } catch {
          return [row.key, undefined]
        }
      })
    )
    return { ...DEFAULT_SETTINGS, ...loaded }
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const merged = { ...this.getSettings(), ...patch }
    const now = this.now()
    const write = this.sqlite.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, @updatedAt) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
    const tx = this.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(merged)) {
        if (typeof value !== 'undefined') {
          write.run({ key, value: JSON.stringify(value), updatedAt: now })
        }
      }
    })
    tx()
    return this.getSettings()
  }

  exportPayload(): ExportPayload {
    const rows = this.sqlite
      .prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC')
      .all() as NoteRow[]
    return {
      app: STORAGE_EXPORT_APP,
      version: 1,
      exportedAt: new Date(this.now()).toISOString(),
      notes: rows.map((row) => this.rowToNote(row))
    }
  }

  exportToFile(filePath: string): void {
    const tmpPath = filePath + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(this.exportPayload(), null, 2), 'utf8')
    renameSync(tmpPath, filePath)
  }

  importJson(text: string): ImportResult {
    const parsed = importPayloadSchema.parse(JSON.parse(text))
    const incoming = Array.isArray(parsed) ? parsed : parsed.notes
    const existingIds = new Set(
      (this.sqlite.prepare('SELECT id FROM notes').all() as Array<{ id: string }>).map((row) => row.id)
    )
    let imported = 0
    let skipped = 0
    let firstImportedId: string | null = null
    const seen = new Set<string>()
    const tx = this.sqlite.transaction(() => {
      for (const item of incoming) {
        const html = sanitizeNoteHtml(item.contentHtml ?? item.content ?? '')
        const tags = normalizeTags(item.tags ?? [])
        const now = this.now()
        const originalId = typeof item.id === 'string' && item.id ? item.id : randomUUID()
        const id = existingIds.has(originalId) || seen.has(originalId) ? randomUUID() : originalId
        const note: Note = {
          id,
          title: String(item.title ?? '').slice(0, 160),
          contentHtml: html,
          plainText: plainTextFromHtml(html),
          tags,
          pinned: Boolean(item.pinned),
          createdAt: Number(item.createdAt) || now,
          updatedAt: Number(item.updatedAt) || now,
          deletedAt: null,
          revision: 1
        }
        if (!note.title && !note.plainText && !note.tags.length) {
          skipped += 1
          continue
        }
        this.writeNote(note)
        seen.add(id)
        existingIds.add(id)
        imported += 1
        firstImportedId ??= id
      }
    })
    tx()
    return { imported, skipped, firstImportedId }
  }

  private configure(): void {
    this.sqlite.pragma('foreign_keys = ON')
    this.sqlite.pragma('journal_mode = WAL')
    this.sqlite.pragma('synchronous = FULL')
  }

  private migrate(dbPath: string): void {
    const currentVersion = (this.sqlite.pragma('user_version', { simple: true }) as number) ?? 0
    if (currentVersion > 0 && currentVersion < 1 && existsSync(dbPath)) {
      const backupDir = join(dirname(dbPath), 'backups')
      mkdirSync(backupDir, { recursive: true })
      copyFileSync(
        dbPath,
        join(backupDir, 'zhijian-pre-v1-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite')
      )
    }
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS notes (' +
        'id TEXT PRIMARY KEY,' +
        'title TEXT NOT NULL,' +
        'content_html TEXT NOT NULL,' +
        'plain_text TEXT NOT NULL,' +
        'pinned INTEGER NOT NULL DEFAULT 0,' +
        'created_at INTEGER NOT NULL,' +
        'updated_at INTEGER NOT NULL,' +
        'deleted_at INTEGER,' +
        'revision INTEGER NOT NULL DEFAULT 1' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_notes_active_updated ON notes(deleted_at, pinned, updated_at);' +
        'CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);' +
        'CREATE TABLE IF NOT EXISTS note_tags (' +
        'note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,' +
        'tag TEXT NOT NULL,' +
        'position INTEGER NOT NULL DEFAULT 0,' +
        'PRIMARY KEY(note_id, tag)' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);' +
        'CREATE TABLE IF NOT EXISTS settings (' +
        'key TEXT PRIMARY KEY,' +
        'value TEXT NOT NULL,' +
        'updated_at INTEGER NOT NULL' +
        ');' +
        'PRAGMA user_version = 1;'
    )
  }

  private seedIfEmpty(): void {
    const count = this.sqlite.prepare('SELECT count(*) as count FROM notes').get() as { count: number }
    if (count.count > 0) return
    const now = this.now()
    const seeds: NoteDraft[] = [
      {
        title: '欢迎来到纸间',
        contentHtml:
          '<p>这里是一块安静的写作空间。你的所有内容都会<strong>自动保存在这台电脑</strong>里，不会上传到任何地方。</p><h2>从这里开始</h2><ul><li>按 <strong>Ctrl / ⌘ + N</strong> 新建笔记</li><li>按 <strong>Ctrl / ⌘ + K</strong> 快速查找</li><li>给笔记添加标签，慢慢长出自己的知识脉络</li></ul><blockquote>好笔记不是仓库，而是思考留下的脚印。</blockquote>',
        tags: ['开始', '指南'],
        pinned: true
      },
      {
        title: '本周的三个重点',
        contentHtml:
          '<h2>少做一点，做深一点</h2><p>▸ 完成产品原型的核心流程</p><p>▸ 整理用户访谈里反复出现的问题</p><p>▸ 留出一个不被打扰的下午阅读</p>',
        tags: ['计划', '工作']
      },
      {
        title: '读书摘记：创造的秩序',
        contentHtml:
          '<p>真正的秩序不是把一切排得整整齐齐，而是让重要的东西容易被看见。</p><h2>留下的问题</h2><ol><li>哪些流程只是习惯，并没有实际价值？</li><li>如果只能保留一个功能，它会是什么？</li><li>怎样让工具退到背景里？</li></ol>',
        tags: ['阅读', '灵感']
      }
    ]
    seeds.forEach((seed, index) => {
      const note = this.create(seed)
      this.sqlite
        .prepare('UPDATE notes SET created_at = ?, updated_at = ? WHERE id = ?')
        .run(now - (index + 2) * 86_400_000, now - index * 3_600_000 - 480_000, note.id)
    })
  }

  private writeNote(note: Note): void {
    const tx = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          'INSERT INTO notes (' +
            'id, title, content_html, plain_text, pinned, created_at, updated_at, deleted_at, revision' +
            ') VALUES (' +
            '@id, @title, @contentHtml, @plainText, @pinned, @createdAt, @updatedAt, @deletedAt, @revision' +
            ') ON CONFLICT(id) DO UPDATE SET ' +
            'title = excluded.title, ' +
            'content_html = excluded.content_html, ' +
            'plain_text = excluded.plain_text, ' +
            'pinned = excluded.pinned, ' +
            'created_at = excluded.created_at, ' +
            'updated_at = excluded.updated_at, ' +
            'deleted_at = excluded.deleted_at, ' +
            'revision = excluded.revision'
        )
        .run({
          id: note.id,
          title: note.title,
          contentHtml: note.contentHtml,
          plainText: note.plainText,
          pinned: note.pinned ? 1 : 0,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          deletedAt: note.deletedAt,
          revision: note.revision
        })
      this.sqlite.prepare('DELETE FROM note_tags WHERE note_id = ?').run(note.id)
      const insertTag = this.sqlite.prepare(
        'INSERT INTO note_tags (note_id, tag, position) VALUES (?, ?, ?)'
      )
      note.tags.forEach((tag, index) => insertTag.run(note.id, tag, index))
    })
    tx()
  }

  private rowToNote(row: NoteRow): Note {
    const tags = this.sqlite
      .prepare('SELECT tag FROM note_tags WHERE note_id = ? ORDER BY position ASC, tag ASC')
      .all(row.id)
      .map((tagRow) => (tagRow as { tag: string }).tag)
    return {
      id: row.id,
      title: row.title,
      contentHtml: row.content_html,
      plainText: row.plain_text,
      tags,
      pinned: Boolean(row.pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      revision: row.revision
    }
  }
}

export function createRepository(userDataPath: string): NoteRepository {
  return new NoteRepository({ dbPath: join(userDataPath, 'zhijian.sqlite') })
}
