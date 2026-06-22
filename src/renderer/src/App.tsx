import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppSettings,
  Note,
  NoteSummary,
  NoteUpdate,
  Palette,
  SaveStatus,
  TagStat,
  UpdateState,
  ThemeMode
} from '../../shared/contracts'
import { useUiStore } from './store'

const RECOMMENDED_TAGS = ['工作', '学习', '生活', '灵感', '计划', '阅读', '待办', '项目']
const PALETTE_NAMES: Record<Palette, string> = {
  warm: '暖纸陶土',
  blue: '雾霭蓝',
  plum: '柔和紫灰',
  mono: '极简黑白'
}

function cleanTag(value: string): string {
  return value.trim().replace(/^#+/, '').replace(/[<>]/g, '').slice(0, 20)
}

function getTimedTheme(date = new Date()): 'light' | 'dark' {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'auto' ? getTimedTheme() : mode
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return String(minutes) + ' 分钟前'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return String(hours) + ' 小时前'
  const days = Math.floor(hours / 24)
  if (days < 7) return String(days) + ' 天前'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp)
}

function applySettings(settings: AppSettings): void {
  document.documentElement.dataset.theme = resolveTheme(settings.themeMode)
  document.documentElement.dataset.palette = settings.palette
}

export function App(): React.JSX.Element {
  const {
    selectedId,
    search,
    filter,
    activeTag,
    commandOpen,
    setSelectedId,
    setSearch,
    setFilter,
    setActiveTag,
    setCommandOpen
  } = useUiStore()

  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [currentNote, setCurrentNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle', message: '尚未检查更新' })
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandResults, setCommandResults] = useState<NoteSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const pendingPatchRef = useRef<NoteUpdate>({})
  const saveTimerRef = useRef<number | null>(null)
  const applyingRemoteRef = useRef(false)

  const loadTags = useCallback(async () => {
    setTagStats(await window.desktop.notes.tags())
  }, [])

  const loadNotes = useCallback(async () => {
    const list = await window.desktop.notes.list({
      search,
      filter,
      tag: activeTag || undefined
    })
    setNotes(list)
    if (!selectedId || !list.some((note) => note.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null)
    }
  }, [activeTag, filter, search, selectedId, setSelectedId])

  const loadCurrentNote = useCallback(async () => {
    if (!selectedId) {
      setCurrentNote(null)
      setTitle('')
      return
    }
    const note = await window.desktop.notes.get(selectedId)
    setCurrentNote(note)
    setTitle(note?.title ?? '')
  }, [selectedId])

  const flushSave = useCallback(async () => {
    if (!currentNote) return
    const patch = pendingPatchRef.current
    if (!Object.keys(patch).length) return
    pendingPatchRef.current = {}
    setSaveStatus('saving')
    try {
      const saved = await window.desktop.notes.update(currentNote.id, patch)
      setCurrentNote(saved)
      setTitle(saved.title)
      setSaveStatus('saved')
      await Promise.all([loadNotes(), loadTags()])
    } catch (err) {
      setSaveStatus('error')
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [currentNote, loadNotes, loadTags])

  const scheduleSave = useCallback(
    (patch: NoteUpdate) => {
      if (!currentNote) return
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
      setSaveStatus('saving')
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => void flushSave(), 350)
    },
    [currentNote, flushSave]
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
      })
    ],
    content: '<p></p>',
    editorProps: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false
        view.dispatch(view.state.tr.insertText(text))
        return true
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (applyingRemoteRef.current) return
      scheduleSave({ contentHtml: activeEditor.getHTML() })
    }
  })

  useEffect(() => {
    void Promise.all([
      window.desktop.settings.get().then((loaded) => {
        setSettings(loaded)
        applySettings(loaded)
      }),
      window.desktop.updater.getState().then(setUpdateState),
      loadNotes(),
      loadTags()
    ]).catch((err) => setError(err instanceof Error ? err.message : '初始化失败'))
  }, [loadNotes, loadTags])

  useEffect(() => {
    void loadNotes().catch((err) => setError(err instanceof Error ? err.message : '读取列表失败'))
  }, [loadNotes])

  useEffect(() => {
    void loadCurrentNote().catch((err) => setError(err instanceof Error ? err.message : '读取笔记失败'))
  }, [loadCurrentNote])

  useEffect(() => {
    if (!editor) return
    applyingRemoteRef.current = true
    editor.commands.setContent(currentNote?.contentHtml || '<p></p>', { emitUpdate: false })
    applyingRemoteRef.current = false
  }, [currentNote?.id, currentNote?.contentHtml, editor])

  useEffect(() => {
    if (!settings) return
    applySettings(settings)
    const timer = window.setInterval(() => applySettings(settings), 60000)
    return () => window.clearInterval(timer)
  }, [settings])

  useEffect(() => {
    if (!commandOpen) return
    void window.desktop.notes
      .list({ search: commandQuery, limit: 8 })
      .then(setCommandResults)
      .catch((err) => setError(err instanceof Error ? err.message : '快速查找失败'))
  }, [commandOpen, commandQuery])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void createNote()
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void flushSave()
      }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('beforeunload', () => void flushSave())
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  async function createNote(): Promise<void> {
    const note = await window.desktop.notes.create({ title: '', contentHtml: '<p></p>' })
    setSelectedId(note.id)
    setCurrentNote(note)
    setTitle('')
    await Promise.all([loadNotes(), loadTags()])
  }

  async function deleteCurrent(): Promise<void> {
    if (!currentNote) return
    await window.desktop.notes.delete(currentNote.id)
    setToast({ message: '笔记已删除', undoId: currentNote.id })
    setSelectedId(null)
    setCurrentNote(null)
    await Promise.all([loadNotes(), loadTags()])
  }

  async function undoDelete(id: string): Promise<void> {
    const restored = await window.desktop.notes.undoDelete(id)
    if (restored) {
      setSelectedId(restored.id)
      setToast({ message: '已撤销删除' })
    }
    await Promise.all([loadNotes(), loadTags()])
  }

  async function togglePin(): Promise<void> {
    if (!currentNote) return
    const saved = await window.desktop.notes.setPinned(currentNote.id, !currentNote.pinned)
    setCurrentNote(saved)
    await loadNotes()
  }

  async function changeThemeMode(themeMode: ThemeMode): Promise<void> {
    if (!settings) return
    const saved = await window.desktop.settings.update({ themeMode })
    setSettings(saved)
    applySettings(saved)
  }

  async function changePalette(palette: Palette): Promise<void> {
    if (!settings) return
    const saved = await window.desktop.settings.update({ palette })
    setSettings(saved)
    applySettings(saved)
  }

  async function importNotes(): Promise<void> {
    const result = await window.desktop.files.importJson()
    if (!result.canceled) {
      setToast({ message: '已导入 ' + String(result.imported ?? 0) + ' 篇笔记' })
      await Promise.all([loadNotes(), loadTags()])
    }
  }

  async function exportNotes(): Promise<void> {
    const result = await window.desktop.files.exportJson()
    if (!result.canceled) setToast({ message: '备份已导出' })
  }

  async function checkUpdates(): Promise<void> {
    setUpdateState(await window.desktop.updater.check())
  }

  useEffect(() => {
    const offNewNote = window.desktop.app.onNewNote(() => void createNote())
    const offOpenCommand = window.desktop.app.onOpenCommand(() => setCommandOpen(true))
    const offImport = window.desktop.app.onImportJson(() => void importNotes())
    const offExport = window.desktop.app.onExportJson(() => void exportNotes())
    const offShortcutError = window.desktop.app.onShortcutError((message) => setError(message))
    const offUpdate = window.desktop.updater.onState(setUpdateState)
    return () => {
      offNewNote()
      offOpenCommand()
      offImport()
      offExport()
      offShortcutError()
      offUpdate()
    }
  }, [])

  function addTag(value: string): void {
    const tag = cleanTag(value)
    if (!tag || !currentNote || currentNote.tags.includes(tag) || currentNote.tags.length >= 12) return
    const tags = [...currentNote.tags, tag]
    setCurrentNote({ ...currentNote, tags })
    setTagInput('')
    scheduleSave({ tags })
  }

  function removeTag(tag: string): void {
    if (!currentNote) return
    const tags = currentNote.tags.filter((item) => item !== tag)
    setCurrentNote({ ...currentNote, tags })
    scheduleSave({ tags })
  }

  function addLink(): void {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('输入链接地址（https://…）', previous ?? '')
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run()
      scheduleSave({ contentHtml: editor.getHTML() })
      return
    }
    const normalized = /^(https?:|mailto:)/i.test(url) ? url : 'https://' + url
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    scheduleSave({ contentHtml: editor.getHTML() })
  }

  const suggestions = useMemo(() => {
    const current = new Set(currentNote?.tags ?? [])
    const stats = tagStats
      .map((item) => ({ tag: item.tag, source: String(item.count) + ' 次' }))
      .filter((item) => !current.has(item.tag))
    const statNames = new Set(stats.map((item) => item.tag))
    const recommended = RECOMMENDED_TAGS.filter((tag) => !current.has(tag) && !statNames.has(tag)).map(
      (tag) => ({ tag, source: '推荐' })
    )
    const merged = [...stats, ...recommended]
    const query = tagInput.trim().toLocaleLowerCase('zh-CN')
    if (!query) return merged.slice(0, 6)
    const filtered = merged.filter((item) => item.tag.toLocaleLowerCase('zh-CN').includes(query))
    const cleaned = cleanTag(tagInput)
    if (cleaned && !current.has(cleaned) && !filtered.some((item) => item.tag === cleaned)) {
      filtered.unshift({ tag: cleaned, source: '新建' })
    }
    return filtered.slice(0, 6)
  }, [currentNote?.tags, tagInput, tagStats])

  const editorText = editor?.getText() ?? stripHtml(currentNote?.contentHtml ?? '')
  const charCount = editorText.length
  const readTime = Math.max(1, Math.ceil(charCount / 450))

  return (
    <main className="app">
      <aside className="sidebar" aria-label="笔记导航">
        <header className="brand-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>
              <span className="brand-name">纸间</span>
              <span className="brand-sub">私人笔记</span>
            </span>
          </div>
          <button className="icon-button" onClick={() => setCommandOpen(true)} title="快速查找（Ctrl/⌘ K）">
            ⌕
          </button>
        </header>

        <div className="search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="搜索标题、正文或标签…"
          />
          <span className="shortcut">⌘K</span>
        </div>

        <nav className="filter-row" aria-label="笔记筛选">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部 <span>{notes.length}</span>
          </button>
          <button className={filter === 'pinned' ? 'active' : ''} onClick={() => setFilter('pinned')}>
            置顶
          </button>
        </nav>

        <div className="tag-strip" aria-label="标签筛选">
          {tagStats.map((item) => (
            <button
              key={item.tag}
              className={activeTag === item.tag ? 'active' : ''}
              onClick={() => setActiveTag(activeTag === item.tag ? '' : item.tag)}
            >
              #{item.tag} · {item.count}
            </button>
          ))}
        </div>

        <div className="list-label">
          <span>{activeTag ? '#' + activeTag : '最近编辑'}</span>
          <span>{notes.length} 篇</span>
        </div>

        <div className="notes-list" role="listbox" aria-label="笔记列表">
          {notes.map((note) => (
            <button
              key={note.id}
              className={'note-card ' + (note.id === selectedId ? 'active' : '')}
              onClick={() => setSelectedId(note.id)}
              role="option"
              aria-selected={note.id === selectedId}
            >
              <span className="note-card-top">
                <strong>{note.title || '无标题笔记'}</strong>
                {note.pinned ? <span className="pin-badge">置顶</span> : null}
              </span>
              <span className="excerpt">{note.excerpt}</span>
              <span className="note-card-bottom">
                <span>{relativeTime(note.updatedAt)}</span>
                <span>{note.tags.map((tag) => '#' + tag).join(' ')}</span>
              </span>
            </button>
          ))}
          {!notes.length ? <div className="list-empty">没有找到笔记</div> : null}
        </div>

        <footer className="sidebar-footer">
          <select
            aria-label="主题模式"
            value={settings?.themeMode ?? 'auto'}
            onChange={(event) => void changeThemeMode(event.target.value as ThemeMode)}
          >
            <option value="auto">随时间</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
          <select
            aria-label="界面配色"
            value={settings?.palette ?? 'warm'}
            onChange={(event) => void changePalette(event.target.value as Palette)}
          >
            {Object.entries(PALETTE_NAMES).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="icon-button" onClick={() => void importNotes()} title="导入 JSON">
            ⇣
          </button>
          <button className="icon-button" onClick={() => void exportNotes()} title="导出备份">
            ⇡
          </button>
          <button className="icon-button" onClick={() => void checkUpdates()} title={updateState.message}>
            ↻
          </button>
          <span className="update-status">{updateState.phase === 'downloaded' ? '可安装更新' : updateState.message}</span>
          <button className="new-note" onClick={() => void createNote()}>
            ＋ 新建笔记
          </button>
        </footer>
      </aside>

      <section className="editor-shell" aria-label="笔记编辑器">
        {currentNote ? (
          <>
            <header className="editor-topbar">
              <div className={'save-state ' + saveStatus}>
                <span className="save-dot" />
                {saveStatus === 'saving' ? '正在保存…' : saveStatus === 'error' ? '保存失败' : '已保存在此设备'}
              </div>
              <div className="topbar-actions">
                <button className={'icon-button ' + (currentNote.pinned ? 'active' : '')} onClick={() => void togglePin()}>
                  {currentNote.pinned ? '已置顶' : '置顶'}
                </button>
                <button className="icon-button danger" onClick={() => void deleteCurrent()}>
                  删除
                </button>
              </div>
            </header>

            <div className="editor-scroll">
              <article className="note-document">
                <div className="document-kicker">个人笔记</div>
                <input
                  className="title-input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    scheduleSave({ title: event.target.value })
                  }}
                  placeholder="无标题笔记"
                  maxLength={160}
                />
                <div className="note-meta-row">
                  <span>{relativeTime(currentNote.updatedAt)}编辑</span>
                  <span className="meta-divider">·</span>
                  <div className="note-tags">
                    {currentNote.tags.map((tag) => (
                      <span className="editor-tag" key={tag}>
                        #{tag}
                        <button onClick={() => removeTag(tag)} aria-label={'移除标签 ' + tag}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="tag-input-wrap">
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault()
                          addTag(tagInput || suggestions[0]?.tag || '')
                        }
                      }}
                      placeholder="+ 添加标签"
                    />
                    {tagInput || suggestions.length ? (
                      <div className="tag-suggestions">
                        {suggestions.map((item) => (
                          <button key={item.tag} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(item.tag)}>
                            <span>#{item.tag}</span>
                            <small>{item.source}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="format-toolbar" role="toolbar" aria-label="文本格式">
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().setParagraph().run()}>
                    正文
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                    H2
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}>
                    <b>B</b>
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                    <i>I</i>
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleStrike().run()}>
                    <s>S</s>
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                    U
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                    • 列表
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                    1.
                  </button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                    “ ”
                  </button>
                  <button onClick={addLink}>链接</button>
                  <button onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>
                    清除
                  </button>
                </div>

                <EditorContent editor={editor} />
              </article>
            </div>
            <footer className="editor-footer">
              <span>{charCount} 字</span>
              <span>约 {readTime} 分钟</span>
            </footer>
          </>
        ) : (
          <div className="empty-editor">
            <div>
              <div className="empty-page" aria-hidden="true" />
              <h2>留一点空白给新想法</h2>
              <p>新建一篇笔记，或者从左侧选择一篇继续写。</p>
              <button className="new-note" onClick={() => void createNote()}>
                新建第一篇笔记
              </button>
            </div>
          </div>
        )}
      </section>

      {commandOpen ? (
        <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}>
          <section className="command-panel" onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="输入笔记标题、正文或标签…"
            />
            <div className="command-hint">快速跳转 · 按 ESC 关闭</div>
            <div className="command-results">
              {commandResults.map((note) => (
                <button
                  key={note.id}
                  onClick={() => {
                    setSelectedId(note.id)
                    setCommandOpen(false)
                  }}
                >
                  <span className="command-bullet" />
                  <span>
                    <strong>{note.title || '无标题笔记'}</strong>
                    <small>{note.tags.map((tag) => '#' + tag).join(' ') || relativeTime(note.updatedAt)}</small>
                  </span>
                </button>
              ))}
              {!commandResults.length ? <div className="list-empty">没有找到笔记</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.undoId ? <button onClick={() => void undoDelete(toast.undoId!)}>撤销</button> : null}
          <button onClick={() => setToast(null)}>×</button>
        </div>
      ) : null}
      {error ? (
        <div className="toast error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
    </main>
  )
}
