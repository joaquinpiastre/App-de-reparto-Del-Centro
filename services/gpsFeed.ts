import { API_ENABLED } from '@/constants/api';
import type { TelefonoUbicacion } from '@/types';
import { apiRequest } from './apiClient';

interface GpsLiveResponse {
  telefonos: TelefonoUbicacion[];
}

export function suscribirTelefonosGps(
  onData: (telefonos: TelefonoUbicacion[], meta?: { advertencia?: string; baseUsada?: string }) => void,
  onError?: (message: string) => void
): () => void {
  if (!API_ENABLED) {
    onData([], { advertencia: 'API no configurada. Definí EXPO_PUBLIC_API_URL en .env.' });
    return () => {};
  }

  let activo = true;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    try {
      const data = await apiRequest<GpsLiveResponse>('/gps/live');
      if (!activo) return;
      onData(data.telefonos, {});
    } catch (e) {
      if (!activo) return;
      const msg = e instanceof Error ? e.message : 'Error leyendo GPS en tiempo real.';
      onError?.(msg);
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, 3000);

  return () => {
    activo = false;
    if (timer) clearInterval(timer);
  };
}
