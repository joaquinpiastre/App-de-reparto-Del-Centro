import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';

interface EntregaPayload {
  jornadaId: string;
  repartidorId: string;
  clienteId: string;
  estado: 'entregado' | 'problema' | 'en_camino' | 'pendiente';
  horaEntrega?: number;
  tiempoParadaSegundos?: number;
  fotoUrl?: string;
  firmaBase64?: string;
  notasRepartidor?: string;
}

export async function registrarEntregaApi(payload: EntregaPayload): Promise<void> {
  if (!API_ENABLED) return;
  await apiRequest('/entregas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
