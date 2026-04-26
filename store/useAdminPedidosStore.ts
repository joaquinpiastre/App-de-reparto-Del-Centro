import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { EstadoPedidoAdmin, PedidoAdmin } from '@/types';

interface AdminPedidosState {
  pedidos: PedidoAdmin[];
  agregarPedido: (p: PedidoAdmin) => void;
  marcarEstado: (id: string, estado: EstadoPedidoAdmin) => void;
  reemplazarPedidosDesdeRemoto: (list: PedidoAdmin[]) => void;
}

export const useAdminPedidosStore = create<AdminPedidosState>()(
  persist(
    (set, get) => ({
      pedidos: [],
      agregarPedido: (p) =>
        set((s) => ({
          pedidos: [p, ...s.pedidos.filter((x) => x.id !== p.id)],
        })),
      marcarEstado: (id, estado) =>
        set((s) => ({
          pedidos: s.pedidos.map((x) => (x.id === id ? { ...x, estado } : x)),
        })),
      reemplazarPedidosDesdeRemoto: (list) => {
        const prev = get().pedidos;
        const map = new Map(prev.map((x) => [x.id, x]));
        list.forEach((p) => map.set(p.id, p));
        set({ pedidos: Array.from(map.values()).sort((a, b) => b.creadoEn - a.creadoEn) });
      },
    }),
    {
      name: 'delcentro-admin-pedidos',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ pedidos: state.pedidos }),
    }
  )
);
