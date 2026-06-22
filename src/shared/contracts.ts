import { z } from 'zod'

export type Platform =
  | 'aix'
  | 'darwin'
  | 'freebsd'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type Palette = 'warm' | 'blue' | 'plum' | 'mono'
export type NoteFilter = 'all' | 'pinned'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppInfo {
  version: string
  platform: Platform
}

export interface Note {
  id: string
  title: string
  contentHtml: string
  plainText: string
  tags: string[]
  pinned: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  revision: number
}

export interface NoteSummary {
  id: string
  title: string
  excerpt: string
  tags: string[]
  pinned: boolean
  createdAt: number
  updatedAt: number
  revision: number
}

export interface NoteDraft {
  title?: string
  contentHtml?: string
  tags?: string[]
  pinned?: boolean
}

export interface NoteUpdate {
  title?: string
  contentHtml?: string
  tags?: string[]
  pinned?: boolean
}

export interface NoteQuery {
  search?: string
  filter?: NoteFilter
  tag?: string
  includeDeleted?: boolean
  limit?: number
}

export interface TagStat {
  tag: string
  count: number
}

export interface AppSettings {
  themeMode: ThemeMode
  palette: Palette
  closeToTray: boolean
  windowBounds?: {
    width: number
    height: number
    x?: number
    y?: number
    maximized?: boolean
  }
}

export interface ExportPayload {
  app: '纸间'
  version: 1
  exportedAt: string
  notes: Note[]
}

export interface ImportResult {
  imported: number
  skipped: number
  firstImportedId: string | null
}

export interface FileResult {
  canceled: boolean
  path?: string
  imported?: number
}

export interface UpdateState {
  phase: UpdatePhase
  message: string
  version?: string
  percent?: number
}

export const themeModeSchema = z.enum(['auto', 'light', 'dark'])
export const paletteSchema = z.enum(['warm', 'blue', 'plum', 'mono'])
export const noteFilterSchema = z.enum(['all', 'pinned'])

export const noteDraftSchema = z.object({
  title: z.string().max(160).optional(),
  contentHtml: z.string().optional(),
  tags: z.array(z.string()).max(12).optional(),
  pinned: z.boolean().optional()
})

export const noteUpdateSchema = noteDraftSchema.partial()

export const noteQuerySchema = z.object({
  search: z.string().max(200).optional(),
  filter: noteFilterSchema.optional(),
  tag: z.string().max(20).optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.number().int().positive().max(10000).optional()
})

export const settingsPatchSchema = z.object({
  themeMode: themeModeSchema.optional(),
  palette: paletteSchema.optional(),
  closeToTray: z.boolean().optional(),
  windowBounds: z
    .object({
      width: z.number().int().min(320).max(10000),
      height: z.number().int().min(240).max(10000),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      maximized: z.boolean().optional()
    })
    .optional()
})

export const legacyImportNoteSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  contentHtml: z.string().optional(),
  tags: z.array(z.unknown()).optional(),
  pinned: z.boolean().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional()
})

export const importPayloadSchema = z.union([
  z.array(legacyImportNoteSchema),
  z.object({ notes: z.array(legacyImportNoteSchema) })
])

export interface DesktopApi {
  getAppInfo: () => Promise<AppInfo>
  notes: {
    list: (query?: NoteQuery) => Promise<NoteSummary[]>
    get: (id: string) => Promise<Note | null>
    create: (draft?: NoteDraft) => Promise<Note>
    update: (id: string, update: NoteUpdate) => Promise<Note>
    setPinned: (id: string, pinned: boolean) => Promise<Note>
    delete: (id: string) => Promise<void>
    undoDelete: (id: string) => Promise<Note | null>
    tags: () => Promise<TagStat[]>
  }
  files: {
    importJson: () => Promise<FileResult>
    exportJson: () => Promise<FileResult>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  app: {
    show: () => Promise<void>
    hide: () => Promise<void>
    quit: () => Promise<void>
    openExternal: (url: string) => Promise<void>
    onNewNote: (callback: () => void) => () => void
    onOpenCommand: (callback: () => void) => () => void
    onImportJson: (callback: () => void) => () => void
    onExportJson: (callback: () => void) => () => void
    onShortcutError: (callback: (message: string) => void) => () => void
  }
  updater: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    install: () => Promise<void>
    onState: (callback: (state: UpdateState) => void) => () => void
  }
}
