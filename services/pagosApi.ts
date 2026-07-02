import { apiRequest } from './apiClient';

export type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

export interface PagoRegistrado {
  id: string;
  clienteNombre: string;
  repartidorNombre: string;
  monto: number;
  metodo: MetodoPago;
  creadoEn: string;
}

export interface PagoLista {
  id: string;
  clienteId: string;
  clienteNombre: string;
  repartidorId: string;
  repartidorNombre: string;
  monto: number;
  metodo: MetodoPago;
  numeroCheque: string | null;
  banco: string | null;
  observaciones: string | null;
  creadoEn: string;
}

export interface CobrosStat {
  nombre: string;
  total: number;
}

export interface CobrosStatsResponse {
  porCliente: CobrosStat[];
  porRepartidor: CobrosStat[];
  totalGeneral: number;
}

export async function obtenerCobrosStats(): Promise<CobrosStatsResponse> {
  return apiRequest('/admin/pagos/stats');
}

export async function registrarPagoApi(payload: {
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodo: MetodoPago;
  numeroCheque?: string;
  banco?: string;
  observaciones?: string;
}): Promise<PagoRegistrado> {
  const data = await apiRequest<{ pago: PagoRegistrado }>('/pagos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.pago;
}

export async function listarPagosAdmin(filtros?: {
  repartidorId?: string;
  desde?: string;
  hasta?: string;
  metodo?: string;
}): Promise<{ pagos: PagoLista[]; total: number }> {
  const params = new URLSearchParams();
  if (filtros?.repartidorId) params.set('repartidorId', filtros.repartidorId);
  if (filtros?.desde) params.set('desde', filtros.desde);
  if (filtros?.hasta) params.set('hasta', filtros.hasta);
  if (filtros?.metodo) params.set('metodo', filtros.metodo);
  const qs = params.toString();
  return apiRequest(`/admin/pagos${qs ? `?${qs}` : ''}`);
}
