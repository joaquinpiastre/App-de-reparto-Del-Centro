import { API_ENABLED } from '@/constants/api';
import { CLIENTES_DEMO_SEED } from '@/constants/demoData';
import { apiRequest } from './apiClient';

export interface ClienteAdminCatalogo {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  pedido: string;
}

let clientesLocales: ClienteAdminCatalogo[] = CLIENTES_DEMO_SEED.map((c) => ({
  id: c.id,
  nombre: c.nombre,
  direccion: c.direccion,
  telefono: c.telefono,
  pedido: c.pedido,
}));

export async function listarClientesAdmin(): Promise<ClienteAdminCatalogo[]> {
  if (!API_ENABLED) {
    return clientesLocales;
  }
  const data = await apiRequest<{ clientes: ClienteAdminCatalogo[] }>('/clientes');
  return data.clientes;
}

export async function crearClienteAdmin(
  payload: Omit<ClienteAdminCatalogo, 'id'>
): Promise<ClienteAdminCatalogo> {
  if (!API_ENABLED) {
    const nuevo: ClienteAdminCatalogo = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };
    clientesLocales = [nuevo, ...clientesLocales];
    return nuevo;
  }
  const data = await apiRequest<{ cliente: ClienteAdminCatalogo }>('/clientes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.cliente;
}

export async function actualizarClienteAdmin(
  id: string,
  payload: Omit<ClienteAdminCatalogo, 'id'>
): Promise<ClienteAdminCatalogo> {
  if (!API_ENABLED) {
    clientesLocales = clientesLocales.map((c) => (c.id === id ? { ...c, ...payload } : c));
    const up = clientesLocales.find((c) => c.id === id);
    if (!up) throw new Error('Cliente no encontrado.');
    return up;
  }
  const data = await apiRequest<{ cliente: ClienteAdminCatalogo }>(`/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.cliente;
}

export async function eliminarClienteAdmin(id: string): Promise<void> {
  if (!API_ENABLED) {
    clientesLocales = clientesLocales.filter((c) => c.id !== id);
    return;
  }
  await apiRequest(`/clientes/${id}`, { method: 'DELETE' });
}
