import { create } from 'zustand';
import type { BookProcessItem, BookResult, ProcessStatus } from '../types/book';

interface ScannerState {
  items: BookProcessItem[];
  addItem: (item: BookProcessItem) => void;
  updateItem: (id: string, updates: Partial<BookProcessItem>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  updateItemStatus: (id: string, status: ProcessStatus, result?: BookResult, errorMessage?: string) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  updateItem: (id, updates) => set((state) => ({
    items: state.items.map((item) => item.id === id ? { ...item, ...updates } : item)
  })),
  removeItem: (id) => {
    set((state) => {
      // revoke object url to avoid memory leaks
      const item = state.items.find(i => i.id === id);
      if (item && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return { items: state.items.filter((i) => i.id !== id) };
    });
  },
  clearItems: () => {
    set((state) => {
      state.items.forEach(item => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return { items: [] };
    });
  },
  updateItemStatus: (id, status, result, errorMessage) => set((state) => ({
    items: state.items.map((item) => 
      item.id === id 
        ? { ...item, status, result: result || item.result, errorMessage: errorMessage !== undefined ? errorMessage : item.errorMessage } 
        : item
    )
  })),
}));
