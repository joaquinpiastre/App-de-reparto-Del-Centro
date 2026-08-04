import { apiRequest } from './apiClient';

export type CategoriaLista = 'A' | 'B' | 'C' | 'D' | 'E';

export interface AsignacionListaCat {
  categoria: CategoriaLista;
  repartidorId: string;
  repartidorNombre: string;
}

export async function obtenerAsignacionesListaCat(): Promise<AsignacionListaCat[]> {
  const res = await apiRequest<{ asignaciones: AsignacionListaCat[] }>('/admin/asignacion-lista-cat');
  return res.asignaciones;
}

export async function guardarAsignacionListaCat(
  categoria: CategoriaLista,
  repartidorId: string,
): Promise<void> {
  await apiRequest(`/admin/asignacion-lista-cat/${categoria}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repartidorId }),
  });
}

export async function quitarAsignacionListaCat(categoria: CategoriaLista): Promise<void> {
  await apiRequest(`/admin/asignacion-lista-cat/${categoria}`, { method: 'DELETE' });
}
