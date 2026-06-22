import { create } from 'zustand'
import type { NoteFilter } from '../../shared/contracts'

interface UiState {
  selectedId: string | null
  search: string
  filter: NoteFilter
  activeTag: string
  commandOpen: boolean
  setSelectedId: (id: string | null) => void
  setSearch: (search: string) => void
  setFilter: (filter: NoteFilter) => void
  setActiveTag: (tag: string) => void
  setCommandOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedId: null,
  search: '',
  filter: 'all',
  activeTag: '',
  commandOpen: false,
  setSelectedId: (selectedId) => set({ selectedId }),
  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setActiveTag: (activeTag) => set({ activeTag }),
  setCommandOpen: (commandOpen) => set({ commandOpen })
}))
