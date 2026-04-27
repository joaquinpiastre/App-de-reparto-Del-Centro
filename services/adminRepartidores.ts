import { apiRequest } from './apiClient';
import type { Usuario } from '@/types';

interface RepartidoresResponse {
  repartidores: Usuario[];
}

export async function listarRepartidoresAdmin(includeInactivos = true): Promise<Usuario[]> {
  const suffix = includeInactivos ? '?includeInactivos=1' : '';
  const data = await apiRequest<RepartidoresResponse>(`/repartidores${suffix}`);
  return data.repartidores;
}

export async function crearRepartidorAdmin(usuario: string, nombre: string): Promise<Usuario> {
  const data = await apiRequest<{ repartidor: Usuario }>('/repartidores', {
    method: 'POST',
    body: JSON.stringify({ usuario, nombre }),
  });
  return data.repartidor;
}

export async function actualizarRepartidorAdmin(
  id: string,
  payload: { nombre?: string; activo?: boolean }
): Promise<Usuario> {
  const data = await apiRequest<{ repartidor: Usuario }>(`/repartidores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.repartidor;
}
