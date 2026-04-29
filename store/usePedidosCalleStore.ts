import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PedidoCalle } from '@/types';

interface PedidosCalleState {
  pedidos: PedidoCalle[];
  ultimaNotificacionPedidoId: string | null;
  agregarPedido: (p: PedidoCalle) => void;
  marcarEstado: (id: string, estado: PedidoCalle['estado']) => void;
  reemplazarPedidosDesdeRemoto: (list: PedidoCalle[]) => void;
  setUltimaNotificacionPedidoId: (id: string | null) => void;
}

export const usePedidosCalleStore = create<PedidosCalleState>()(
  persist(
    (set) => ({
      pedidos: [],
      ultimaNotificacionPedidoId: null,
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
      setUltimaNotificacionPedidoId: (id) => set({ ultimaNotificacionPedidoId: id }),
    }),
    {
      name: 'delcentro-pedidos-calle-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        pedidos: state.pedidos,
        ultimaNotificacionPedidoId: state.ultimaNotificacionPedidoId,
      }),
    }
  )
);
