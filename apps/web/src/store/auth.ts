import { create } from "zustand";
type AuthState = {
  user: any | null; tenant: any | null; isAuthenticated: boolean; isLoading: boolean;
  setUser: (u: any) => void; setTenant: (t: any) => void; logout: () => void;
};
export const useAuthStore = create<AuthState>((set) => ({
  user: null, tenant: null, isAuthenticated: false, isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setTenant: (tenant) => set({ tenant }),
  logout: () => { localStorage.removeItem("access_token"); localStorage.removeItem("refresh_token"); set({ user: null, tenant: null, isAuthenticated: false }); },
}));
