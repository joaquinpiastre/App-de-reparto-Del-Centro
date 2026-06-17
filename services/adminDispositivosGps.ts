import { apiRequest } from './apiClient';

export interface DispositivoGps {
  imei: string;
  repartidor_id: string;
  nombre: string;
  activo: boolean;
  ultimo_contacto_ms: number | null;
}

export async function listarDispositivosGps(): Promise<DispositivoGps[]> {
  const data = await apiRequest<{ dispositivos: DispositivoGps[] }>('/admin/dispositivos-gps');
  return data.dispositivos;
}

export async function registrarDispositivoGps(
  imei: string,
  repartidorId: string,
  nombre: string,
): Promise<void> {
  await apiRequest<{ ok: boolean }>('/admin/dispositivos-gps', {
    method: 'POST',
    body: JSON.stringify({ imei, repartidorId, nombre }),
  });
}

export async function desactivarDispositivoGps(imei: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/admin/dispositivos-gps/${imei}`, {
    method: 'DELETE',
  });
}
