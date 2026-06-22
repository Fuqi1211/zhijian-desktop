/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { useUiStore } from '../src/renderer/src/store'
import type { DesktopApi, Note, NoteSummary } from '../src/shared/contracts'

const mockEditor = {
  commands: {
    setContent: vi.fn()
  },
  getText: () => '正文',
  getHTML: () => '<p>正文</p>',
  getAttributes: () => ({}),
  chain: () => mockChain
}

const mockChain = {
  focus: () => mockChain,
  setParagraph: () => mockChain,
  toggleHeading: () => mockChain,
  toggleBold: () => mockChain,
  toggleItalic: () => mockChain,
  toggleStrike: () => mockChain,
  toggleUnderline: () => mockChain,
  toggleBulletList: () => mockChain,
  toggleOrderedList: () => mockChain,
  toggleBlockquote: () => mockChain,
  unsetAllMarks: () => mockChain,
  clearNodes: () => mockChain,
  unsetLink: () => mockChain,
  extendMarkRange: () => mockChain,
  setLink: () => mockChain,
  run: () => true
}

vi.mock('@tiptap/react', () => ({
  EditorContent: () => React.createElement('div', { 'data-testid': 'editor' }),
  useEditor: () => mockEditor
}))

const summary: NoteSummary = {
  id: 'note-1',
  title: '欢迎来到纸间',
  excerpt: '本地保存',
  tags: ['指南'],
  pinned: true,
  createdAt: 1,
  updatedAt: 2,
  revision: 1
}

const note: Note = {
  ...summary,
  contentHtml: '<p>本地保存</p>',
  plainText: '本地保存',
  deletedAt: null
}

function installDesktopMock(overrides: Partial<DesktopApi> = {}): DesktopApi {
  const desktop = {
    getAppInfo: vi.fn(async () => ({ version: '0.1.0', platform: 'win32' })),
    notes: {
      list: vi.fn(async () => [summary]),
      get: vi.fn(async () => note),
      create: vi.fn(async () => ({ ...note, id: 'created', title: '' })),
      update: vi.fn(async (_id: string, update) => ({ ...note, ...update })),
      setPinned: vi.fn(async () => ({ ...note, pinned: false })),
      delete: vi.fn(async () => undefined),
      undoDelete: vi.fn(async () => note),
      tags: vi.fn(async () => [{ tag: '指南', count: 1 }])
    },
    files: {
      importJson: vi.fn(async () => ({ canceled: false, imported: 1 })),
      exportJson: vi.fn(async () => ({ canceled: false, path: 'backup.json' }))
    },
    settings: {
      get: vi.fn(async () => ({ themeMode: 'auto', palette: 'warm', closeToTray: true })),
      update: vi.fn(async (patch) => ({
        themeMode: 'auto',
        palette: 'warm',
        closeToTray: true,
        ...patch
      }))
    },
    app: {
      show: vi.fn(async () => undefined),
      hide: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      openExternal: vi.fn(async () => undefined)
    },
    updater: {
      getState: vi.fn(async () => ({ phase: 'idle', message: 'ok' })),
      check: vi.fn(async () => ({ phase: 'checking', message: 'checking' })),
      install: vi.fn(async () => undefined),
      onState: vi.fn(() => () => undefined)
    },
    ...overrides
  } satisfies DesktopApi
  window.desktop = desktop
  return desktop
}

describe('App', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.dataset.theme = ''
    document.documentElement.dataset.palette = ''
    useUiStore.setState({
      selectedId: null,
      search: '',
      filter: 'all',
      activeTag: '',
      commandOpen: false
    })
    installDesktopMock()
  })

  test('renders notes from the desktop API', async () => {
    render(<App />)

    expect(await screen.findByText('欢迎来到纸间')).toBeInTheDocument()
    expect(screen.getByText('本地保存')).toBeInTheDocument()
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  test('creates a note from the sidebar action', async () => {
    const desktop = installDesktopMock()
    render(<App />)

    await screen.findByText('欢迎来到纸间')
    fireEvent.click(screen.getAllByText('＋ 新建笔记')[0]!)

    await waitFor(() => expect(desktop.notes.create).toHaveBeenCalled())
  })

  test('persists theme selection', async () => {
    const desktop = installDesktopMock()
    render(<App />)

    const themeSelect = await screen.findByLabelText('主题模式')
    fireEvent.change(themeSelect, { target: { value: 'dark' } })

    await waitFor(() => expect(desktop.settings.update).toHaveBeenCalledWith({ themeMode: 'dark' }))
  })
})
