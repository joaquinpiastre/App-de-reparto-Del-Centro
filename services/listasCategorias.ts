import { apiRequest } from './apiClient';

export type CategoriaLista = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ClienteLista {
  id: string;
  nombre: string;
  direccion: string;
  tipo: 'cliente' | 'taller';
  telefono: string;
  categorias: CategoriaLista[];
  orden: number;
}

export async function obtenerListaCategoria(categoria: CategoriaLista): Promise<ClienteLista[]> {
  const data = await apiRequest<{ categoria: string; clientes: ClienteLista[] }>(
    `/admin/listas-categoria/${categoria}`
  );
  return data.clientes;
}

export async function guardarOrdenCategoria(
  categoria: CategoriaLista,
  clienteIds: string[]
): Promise<void> {
  await apiRequest(`/admin/listas-categoria/${categoria}`, {
    method: 'PUT',
    body: JSON.stringify({ clienteIds }),
  });
}

export async function agregarClienteACategoria(
  categoria: CategoriaLista,
  clienteId: string
): Promise<void> {
  await apiRequest(`/admin/listas-categoria/${categoria}/clientes`, {
    method: 'POST',
    body: JSON.stringify({ clienteId }),
  });
}

export async function quitarClienteDeCategoria(
  categoria: CategoriaLista,
  clienteId: string
): Promise<void> {
  await apiRequest(`/admin/listas-categoria/${categoria}/clientes/${clienteId}`, {
    method: 'DELETE',
  });
}

export async function aplicarListaCategoria(
  categoria: CategoriaLista,
  repartidorId: string,
  fecha: string
): Promise<{ generados: number; omitidos: number; mensaje: string }> {
  return apiRequest(`/admin/listas-categoria/${categoria}/aplicar`, {
    method: 'POST',
    body: JSON.stringify({ repartidorId, fecha }),
  });
}
