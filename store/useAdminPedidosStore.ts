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
    (set) => ({
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
        const map = new Map(list.map((p) => [p.id, p]));
        set({ pedidos: Array.from(map.values()).sort((a, b) => b.creadoEn - a.creadoEn) });
      },
    }),
    {
      name: 'delcentro-admin-pedidos-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ pedidos: state.pedidos }),
    }
  )
);
