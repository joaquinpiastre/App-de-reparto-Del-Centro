import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';

export type TipoCatalogoCliente = 'cliente' | 'taller';
export type CategoriaCliente = 'A' | 'B' | 'C';

export interface ClienteAdminCatalogo {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  pedido: string;
  tipo: TipoCatalogoCliente;
  categorias: CategoriaCliente[];
}

function normalizarClienteApi(raw: {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  pedido: string;
  tipo?: string | null;
  categorias?: string[] | null;
}): ClienteAdminCatalogo {
  const tipo: TipoCatalogoCliente = raw.tipo === 'taller' ? 'taller' : 'cliente';
  const categorias = (raw.categorias ?? []).filter((c): c is CategoriaCliente =>
    c === 'A' || c === 'B' || c === 'C'
  );
  return {
    id: raw.id,
    nombre: raw.nombre,
    direccion: raw.direccion,
    telefono: raw.telefono,
    pedido: raw.pedido,
    tipo,
    categorias,
  };
}

let clientesLocales: ClienteAdminCatalogo[] = [];

export async function listarClientesAdmin(): Promise<ClienteAdminCatalogo[]> {
  if (!API_ENABLED) {
    return clientesLocales;
  }
  const data = await apiRequest<{ clientes: ClienteAdminCatalogo[] }>('/clientes');
  return data.clientes.map((c) => normalizarClienteApi(c));
}

export async function crearClienteAdmin(
  payload: Omit<ClienteAdminCatalogo, 'id'>
): Promise<ClienteAdminCatalogo> {
  if (!API_ENABLED) {
    const nuevo: ClienteAdminCatalogo = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
      tipo: payload.tipo ?? 'cliente',
      categorias: payload.categorias ?? [],
    };
    clientesLocales = [nuevo, ...clientesLocales];
    return nuevo;
  }
  const data = await apiRequest<{ cliente: ClienteAdminCatalogo }>('/clientes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizarClienteApi(data.cliente);
}

export async function actualizarClienteAdmin(
  id: string,
  payload: Omit<ClienteAdminCatalogo, 'id'>
): Promise<ClienteAdminCatalogo> {
  if (!API_ENABLED) {
    clientesLocales = clientesLocales.map((c) =>
      c.id === id ? { ...c, ...payload, tipo: payload.tipo ?? c.tipo, categorias: payload.categorias ?? c.categorias } : c
    );
    const up = clientesLocales.find((c) => c.id === id);
    if (!up) throw new Error('Cliente no encontrado.');
    return up;
  }
  const data = await apiRequest<{ cliente: ClienteAdminCatalogo }>(`/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return normalizarClienteApi(data.cliente);
}

export async function eliminarClienteAdmin(id: string): Promise<void> {
  if (!API_ENABLED) {
    clientesLocales = clientesLocales.filter((c) => c.id !== id);
    return;
  }
  await apiRequest(`/clientes/${id}`, { method: 'DELETE' });
}
