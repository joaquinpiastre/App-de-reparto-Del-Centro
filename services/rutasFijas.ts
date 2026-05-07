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
