import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';
import type { ClienteCatalogo } from '@/types';

export interface ClienteRutaFija extends ClienteCatalogo {
  orden: number;
}

export async function obtenerRutaFija(repartidorId: string): Promise<ClienteRutaFija[]> {
  if (!API_ENABLED) return [];
  const data = await apiRequest<{ ruta: ClienteRutaFija[] }>(`/rutas-fijas/${repartidorId}`);
  return data.ruta;
}

export async function guardarRutaFija(
  repartidorId: string,
  clienteIds: string[]
): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest(`/rutas-fijas/${repartidorId}`, {
    method: 'PUT',
    body: JSON.stringify({ clienteIds }),
  });
}

export async function generarAsignacionesDesdeRutaFija(
  repartidorId: string,
  fecha: string
): Promise<{ generados: number; omitidos: number }> {
  if (!API_ENABLED) return { generados: 0, omitidos: 0 };
  return apiRequest<{ generados: number; omitidos: number }>(
    `/rutas-fijas/${repartidorId}/generar?fecha=${fecha}`,
    { method: 'POST' }
  );
}

export interface ResumenAplicarTodas {
  ok: boolean;
  fecha: string;
  repartidores: number;
  totalGenerados: number;
  totalOmitidos: number;
  detalle: { repartidor: string; generados: number; omitidos: number }[];
}

/**
 * Aplica la ruta fija de TODOS los repartidores para la fecha indicada (o hoy si no se pasa).
 * Solo para admin.
 */
export async function aplicarTodasLasRutasFijasManual(
  fecha?: string
): Promise<ResumenAplicarTodas> {
  if (!API_ENABLED) {
    return { ok: true, fecha: fecha ?? '', repartidores: 0, totalGenerados: 0, totalOmitidos: 0, detalle: [] };
  }
  const url = fecha ? `/rutas-fijas/aplicar-todas?fecha=${fecha}` : '/rutas-fijas/aplicar-todas';
  return apiRequest<ResumenAplicarTodas>(url, { method: 'POST' });
}
