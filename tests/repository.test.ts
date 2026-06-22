import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { NoteRepository } from '../src/main/db/repository'
import { getTimedTheme, resolveTheme, sanitizeNoteHtml } from '../src/shared/domain'

const cleanupDirs: string[] = []

function createTestRepository(): { repo: NoteRepository; dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'zhijian-repo-'))
  cleanupDirs.push(dir)
  const dbPath = join(dir, 'notes.sqlite')
  let tick = 1_800_000_000_000
  const repo = new NoteRepository({ dbPath, now: () => (tick += 1000) })
  return { repo, dir, dbPath }
}

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('NoteRepository', () => {
  test('seeds first-run notes and exposes tag stats', () => {
    const { repo } = createTestRepository()

    const notes = repo.list()
    expect(notes).toHaveLength(3)
    expect(notes[0]?.pinned).toBe(true)
    expect(repo.tagStats().map((item) => item.tag)).toContain('指南')
    repo.close()
  })

  test('creates, updates, searches, pins, deletes, and restores notes', () => {
    const { repo } = createTestRepository()

    const created = repo.create({
      title: '项目记录',
      contentHtml: '<p>Hello 桌面端</p><script>alert(1)</script>',
      tags: ['项目', '项目', '计划']
    })

    expect(created.contentHtml).not.toContain('script')
    expect(repo.list({ search: 'hello' }).map((note) => note.id)).toContain(created.id)
    expect(repo.list({ tag: '计划' }).map((note) => note.id)).toContain(created.id)

    const updated = repo.update(created.id, {
      title: '项目记录 v2',
      contentHtml: '<h2>新的正文</h2>',
      tags: ['桌面', '<坏标签>']
    })

    expect(updated.title).toBe('项目记录 v2')
    expect(updated.tags).toEqual(['桌面', '坏标签'])

    repo.setPinned(created.id, true)
    expect(repo.list()[0]?.id).toBe(created.id)

    repo.delete(created.id)
    expect(repo.list().some((note) => note.id === created.id)).toBe(false)
    expect(repo.undoDelete(created.id)?.id).toBe(created.id)
    expect(repo.list().some((note) => note.id === created.id)).toBe(true)
    repo.close()
  })

  test('imports legacy JSON safely and regenerates duplicate ids', () => {
    const { repo } = createTestRepository()

    const result = repo.importJson(
      JSON.stringify({
        notes: [
          {
            id: 'fixed-id',
            title: '导入',
            content: '<p>安全</p><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>',
            tags: ['阅读', '阅读', '<脚本>']
          },
          {
            id: 'fixed-id',
            title: '重复 ID',
            content: '<p>仍然导入</p>'
          }
        ]
      })
    )

    expect(result.imported).toBe(2)
    const note = repo.get('fixed-id')
    expect(note?.contentHtml).not.toContain('javascript:')
    expect(note?.contentHtml).toContain('https://example.com')
    expect(note?.tags).toEqual(['阅读', '脚本'])
    expect(repo.list({ search: '重复 ID' })).toHaveLength(1)
    repo.close()
  })

  test('persists settings across repository instances', () => {
    const { repo, dbPath } = createTestRepository()
    repo.updateSettings({ themeMode: 'dark', palette: 'plum', closeToTray: true })
    repo.close()

    const reopened = new NoteRepository({ dbPath })
    expect(reopened.getSettings()).toMatchObject({
      themeMode: 'dark',
      palette: 'plum',
      closeToTray: true
    })
    reopened.close()
  })
})

describe('domain helpers', () => {
  test('sanitizes note html and keeps only safe links', () => {
    const html = sanitizeNoteHtml(
      '<p onclick="bad()">Hi</p><script>alert(1)</script><a href="mailto:test@example.com">mail</a><a href="ftp://bad">ftp</a>'
    )
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('script')
    expect(html).toContain('mailto:test@example.com')
    expect(html).not.toContain('ftp://bad')
  })

  test('resolves automatic theme at 06:00 and 18:00', () => {
    const at = (hour: number, minute: number) => new Date(2026, 0, 1, hour, minute)
    expect(getTimedTheme(at(5, 59))).toBe('dark')
    expect(getTimedTheme(at(6, 0))).toBe('light')
    expect(getTimedTheme(at(17, 59))).toBe('light')
    expect(getTimedTheme(at(18, 0))).toBe('dark')
    expect(resolveTheme('light', at(23, 0))).toBe('light')
  })
})
