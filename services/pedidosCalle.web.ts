/**
 * Versión web: sincroniza con API Railway cuando está configurada.
 * Fallback local para demo/offline.
 */
import { API_ENABLED } from '@/constants/api';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { EstadoPedidoCalle, PedidoCalle } from '@/types';
import { apiRequest } from './apiClient';

export async function publicarPedidoCalle(
  payload: Omit<PedidoCalle, 'id' | 'creadoEn'>
): Promise<PedidoCalle> {
  const creadoEn = Date.now();
  const pedido: PedidoCalle = {
    ...payload,
    creadoEn,
    id: `web-local-${creadoEn}-${Math.random().toString(36).slice(2, 7)}`,
  };
  if (API_ENABLED) {
    await apiRequest('/pedidos-calle', {
      method: 'POST',
      body: JSON.stringify(pedido),
    });
  }
  usePedidosCalleStore.getState().agregarPedido(pedido);
  return pedido;
}

export async function actualizarEstadoPedidoCalle(id: string, estado: EstadoPedidoCalle): Promise<void> {
  usePedidosCalleStore.getState().marcarEstado(id, estado);
  if (!API_ENABLED) return;
  await apiRequest(`/pedidos-calle/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  });
}

export function suscribirPedidosCalle(onChange: (list: PedidoCalle[]) => void): () => void {
  if (API_ENABLED) {
    const load = async () => {
      try {
        const data = await apiRequest<{ pedidos: PedidoCalle[] }>('/pedidos-calle');
        usePedidosCalleStore.getState().reemplazarPedidosDesdeRemoto(data.pedidos);
        onChange(data.pedidos);
      } catch {
        // Evita spam en consola web cuando hay fallas temporales de red.
      }
    };
    void load();
    const interval = setInterval(() => {
      void load();
    }, 10000);
    return () => clearInterval(interval);
  }
  onChange(usePedidosCalleStore.getState().pedidos);
  return usePedidosCalleStore.subscribe((s) => onChange(s.pedidos));
}
