import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';
import type { Asignacion, ClienteCatalogo, EstadoEntrega } from '@/types';

interface AsignacionesResponse {
  asignaciones: Asignacion[];
}

interface ClientesResponse {
  clientes: ClienteCatalogo[];
}

export async function obtenerAsignaciones(opts: {
  fecha?: string;
  repartidorId?: string;
}): Promise<Asignacion[]> {
  if (!API_ENABLED) return [];
  const params = new URLSearchParams();
  if (opts.fecha) params.set('fecha', opts.fecha);
  if (opts.repartidorId) params.set('repartidorId', opts.repartidorId);
  const qs = params.toString();
  const data = await apiRequest<AsignacionesResponse>(`/asignaciones${qs ? `?${qs}` : ''}`);
  return data.asignaciones;
}

export async function crearAsignacionesBulk(
  repartidorId: string,
  clienteIds: string[],
  fecha?: string,
  notasAdmin?: string
): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest('/asignaciones/bulk', {
    method: 'POST',
    body: JSON.stringify({ repartidorId, clienteIds, fecha, notasAdmin }),
  });
}

export async function eliminarAsignacion(id: string): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest(`/asignaciones/${id}`, { method: 'DELETE' });
}

export async function actualizarEstadoAsignacion(
  id: string,
  estado: EstadoEntrega,
  opts?: {
    notasRepartidor?: string;
    horaLlegadaMs?: number;
    horaSalidaMs?: number;
    jornadaId?: string;
  }
): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest(`/asignaciones/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado, ...opts }),
  });
}

export async function reordenarAsignaciones(
  ordenes: { id: string; orden: number }[]
): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest('/asignaciones/reordenar', {
    method: 'PATCH',
    body: JSON.stringify({ ordenes }),
  });
}

export async function obtenerClientesCatalogo(): Promise<ClienteCatalogo[]> {
  if (!API_ENABLED) return [];
  const data = await apiRequest<ClientesResponse>('/clientes');
  return data.clientes;
}
