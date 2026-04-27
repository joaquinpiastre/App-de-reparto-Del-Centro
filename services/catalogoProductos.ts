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
  const normalizados = productos
    .map((p) => ({
      codigo: String(p.codigo ?? '').trim(),
      descripcion: String(p.descripcion ?? '').trim(),
      precioUnitario: Number(p.precioUnitario),
    }))
    .filter((p) => p.codigo && p.descripcion && Number.isFinite(p.precioUnitario) && p.precioUnitario > 0);
  if (normalizados.length === 0) {
    throw new Error('El Excel no tiene filas válidas con código, descripción y precio > 0.');
  }
  await apiRequest('/catalogo-productos/reemplazar', {
    method: 'POST',
    body: JSON.stringify({ productos: normalizados, nombreArchivo }),
  });
}
