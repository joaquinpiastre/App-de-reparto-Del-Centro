import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import type { EstadoPedidoAdmin, PedidoAdmin, Usuario } from '@/types';

interface ApiListResponse {
  pedidos: Array<
    Omit<PedidoAdmin, 'calles' | 'total' | 'creadoEn' | 'repartidorId' | 'repartidorNombre'> & {
      repartidor_id?: string;
      repartidor_nombre?: string;
      creado_por_id?: string;
      creado_por_nombre?: string;
      calles: string[] | string;
      total: number | string;
      creado_en_ms?: number;
      creadoEn?: number;
    }
  >;
}

function normalizePedido(p: ApiListResponse['pedidos'][number]): PedidoAdmin {
  const calles = Array.isArray(p.calles)
    ? p.calles.map(String)
    : String(p.calles ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
  return {
    ...p,
    repartidorId: String((p.repartidorId ?? p.repartidor_id ?? '') || ''),
    repartidorNombre: String((p.repartidorNombre ?? p.repartidor_nombre ?? '') || ''),
    calles,
    total: Number(p.total ?? 0),
    creadoEn: Number(p.creadoEn ?? p.creado_en_ms ?? Date.now()),
    creadoPorId: p.creadoPorId ?? p.creado_por_id ?? undefined,
    creadoPorNombre: p.creadoPorNombre ?? p.creado_por_nombre ?? undefined,
  };
}

export async function crearPedidoAdmin(payload: Omit<PedidoAdmin, 'id' | 'creadoEn'>): Promise<PedidoAdmin> {
  const pedido: PedidoAdmin = {
    ...payload,
    id: `adm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    creadoEn: Date.now(),
  };
  if (API_ENABLED) {
    await apiRequest('/admin-pedidos', {
      method: 'POST',
      body: JSON.stringify(pedido),
    });
  }
  useAdminPedidosStore.getState().agregarPedido(pedido);
  return pedido;
}

export async function actualizarEstadoPedidoAdmin(
  id: string,
  estado: EstadoPedidoAdmin
): Promise<void> {
  useAdminPedidosStore.getState().marcarEstado(id, estado);
  if (!API_ENABLED) return;
  await apiRequest(`/admin-pedidos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  });
}

export async function asignarPedidoAdmin(
  id: string,
  repartidorId: string,
  repartidorNombre: string
): Promise<void> {
  useAdminPedidosStore.getState().reemplazarPedidosDesdeRemoto(
    useAdminPedidosStore
      .getState()
      .pedidos.map((p) =>
        p.id === id ? { ...p, repartidorId, repartidorNombre, estado: 'asignado' as EstadoPedidoAdmin } : p
      )
  );
  if (!API_ENABLED) return;
  await apiRequest(`/admin-pedidos/${id}/asignar`, {
    method: 'PATCH',
    body: JSON.stringify({ repartidorId, repartidorNombre }),
  });
}

export async function editarPedidoAdmin(
  id: string,
  payload: Pick<PedidoAdmin, 'titulo' | 'calles' | 'items' | 'total' | 'notas'>
): Promise<void> {
  useAdminPedidosStore.getState().reemplazarPedidosDesdeRemoto(
    useAdminPedidosStore.getState().pedidos.map((p) => (p.id === id ? { ...p, ...payload } : p))
  );
  if (!API_ENABLED) return;
  await apiRequest(`/admin-pedidos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function eliminarPedidoAdmin(id: string): Promise<void> {
  useAdminPedidosStore
    .getState()
    .reemplazarPedidosDesdeRemoto(useAdminPedidosStore.getState().pedidos.filter((p) => p.id !== id));
  if (!API_ENABLED) return;
  await apiRequest(`/admin-pedidos/${id}`, { method: 'DELETE' });
}

export async function obtenerRepartidoresDisponibles(): Promise<Usuario[]> {
  if (!API_ENABLED) {
    return [];
  }
  const data = await apiRequest<{ repartidores: Usuario[] }>('/repartidores');
  return data.repartidores;
}

export function suscribirAdminPedidos(onChange: (list: PedidoAdmin[]) => void): () => void {
  if (API_ENABLED) {
    const load = async () => {
      try {
        const data = await apiRequest<ApiListResponse>('/admin-pedidos');
        const list = data.pedidos.map(normalizePedido);
        useAdminPedidosStore.getState().reemplazarPedidosDesdeRemoto(list);
        onChange(list);
      } catch {
        // Silencioso: evita ruido continuo en consola ante cortes de conectividad.
      }
    };
    void load();
    const interval = setInterval(() => {
      void load();
    }, 10000);
    return () => clearInterval(interval);
  }
  onChange(useAdminPedidosStore.getState().pedidos);
  return useAdminPedidosStore.subscribe((s) => onChange(s.pedidos));
}
