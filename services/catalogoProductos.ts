import { API_ENABLED } from '@/constants/api';
import type { ProductoLista } from '@/types';
import { apiRequest } from './apiClient';

export interface CatalogoProductos {
  nombreArchivo: string | null;
  updatedAt: string | null;
  productos: ProductoLista[];
}

export async function obtenerCatalogoProductos(): Promise<CatalogoProductos | null> {
  if (!API_ENABLED) return null;
  const data = await apiRequest<{ catalogo: CatalogoProductos }>('/catalogo-productos');
  return data.catalogo;
}

export async function reemplazarCatalogoProductos(
  productos: ProductoLista[],
  nombreArchivo?: string
): Promise<void> {
  if (!API_ENABLED) {
    throw new Error('API no configurada para actualizar el catálogo central.');
  }
  await apiRequest('/catalogo-productos/reemplazar', {
    method: 'POST',
    body: JSON.stringify({ productos, nombreArchivo }),
  });
}
