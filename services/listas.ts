import { apiRequest } from './apiClient';

// Días de la semana: 0=domingo … 6=sábado (mismo criterio que Date#getDay()).
export const DIAS_SEMANA_LABEL: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export const DIAS_SEMANA_CORTO: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

export interface Lista {
  id: string;
  nombre: string;
  diasSemana: number[];
  activa: boolean;
  cantidadClientes: number;
  repartidor: { id: string; nombre: string } | null;
}

export interface ClienteLista {
  id: string;
  nombre: string;
  direccion: string;
  tipo: 'cliente' | 'taller';
  telefono: string;
  categorias: string[];
  orden: number;
}

export async function obtenerListas(): Promise<Lista[]> {
  const data = await apiRequest<{ listas: Lista[] }>('/admin/listas');
  return data.listas;
}

export async function crearLista(nombre: string, diasSemana: number[]): Promise<Lista> {
  return apiRequest<Lista>('/admin/listas', {
    method: 'POST',
    body: JSON.stringify({ nombre, diasSemana }),
  });
}

export async function editarLista(
  id: string,
  cambios: { nombre?: string; diasSemana?: number[]; activa?: boolean }
): Promise<void> {
  await apiRequest(`/admin/listas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(cambios),
  });
}

export async function eliminarLista(id: string): Promise<void> {
  await apiRequest(`/admin/listas/${id}`, { method: 'DELETE' });
}

export async function obtenerClientesDeLista(listaId: string): Promise<ClienteLista[]> {
  const data = await apiRequest<{ clientes: ClienteLista[] }>(`/admin/listas/${listaId}/clientes`);
  return data.clientes;
}

export async function guardarOrdenLista(listaId: string, clienteIds: string[]): Promise<void> {
  await apiRequest(`/admin/listas/${listaId}/clientes`, {
    method: 'PUT',
    body: JSON.stringify({ clienteIds }),
  });
}

export async function agregarClienteALista(listaId: string, clienteId: string): Promise<void> {
  await apiRequest(`/admin/listas/${listaId}/clientes`, {
    method: 'POST',
    body: JSON.stringify({ clienteId }),
  });
}

export async function quitarClienteDeLista(listaId: string, clienteId: string): Promise<void> {
  await apiRequest(`/admin/listas/${listaId}/clientes/${clienteId}`, { method: 'DELETE' });
}

export async function asignarRepartidorALista(listaId: string, repartidorId: string): Promise<void> {
  await apiRequest(`/admin/listas/${listaId}/asignacion`, {
    method: 'PUT',
    body: JSON.stringify({ repartidorId }),
  });
}

export async function quitarAsignacionDeLista(listaId: string): Promise<void> {
  await apiRequest(`/admin/listas/${listaId}/asignacion`, { method: 'DELETE' });
}

export async function aplicarLista(
  listaId: string,
  repartidorId: string,
  fecha: string
): Promise<{ generados: number; omitidos: number; mensaje: string }> {
  return apiRequest(`/admin/listas/${listaId}/aplicar`, {
    method: 'POST',
    body: JSON.stringify({ repartidorId, fecha }),
  });
}
