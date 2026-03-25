import { create } from "zustand";

/** Reserved for client-only UI state (filters, panels). TanStack Query owns server data. */
type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
