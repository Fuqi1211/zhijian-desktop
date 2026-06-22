import sanitizeHtml from 'sanitize-html'
import type { AppSettings, Note, NoteSummary, Palette, ResolvedTheme, ThemeMode } from './contracts'

export const STORAGE_EXPORT_APP = '纸间' as const

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'auto',
  palette: 'warm',
  closeToTray: true
}

export const PALETTE_NAMES: Record<Palette, string> = {
  warm: '暖纸陶土',
  blue: '雾霭蓝',
  plum: '柔和紫灰',
  mono: '极简黑白'
}

export function cleanTag(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[<>]/g, '')
    .slice(0, 20)
}

export function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(cleanTag).filter(Boolean))].slice(0, 12)
}

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html || '<p></p>', {
    allowedTags: [
      'p',
      'div',
      'br',
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'h1',
      'h2',
      'h3',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'code',
      'pre',
      'span'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href
        const safeAttribs: Record<string, string> =
          typeof href === 'string' && /^(https?:|mailto:)/i.test(href)
            ? { href, target: '_blank', rel: 'noopener noreferrer' }
            : {}
        return {
          tagName: 'a',
          attribs: safeAttribs
        }
      }
    }
  })
}

export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function createExcerpt(note: Pick<Note, 'title' | 'plainText'>): string {
  const text = note.plainText || note.title || '空白笔记'
  return text.slice(0, 96)
}

export function toSummary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    excerpt: createExcerpt(note),
    tags: note.tags,
    pinned: note.pinned,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    revision: note.revision
  }
}

export function getTimedTheme(date = new Date()): ResolvedTheme {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
}

export function resolveTheme(mode: ThemeMode, date = new Date()): ResolvedTheme {
  return mode === 'auto' ? getTimedTheme(date) : mode
}

export function isSafeExternalUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url)
}
