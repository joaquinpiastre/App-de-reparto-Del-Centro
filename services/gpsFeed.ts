import type { TelefonoUbicacion } from '@/types';

/**
 * En móvil no usamos este feed de admin.
 * Se deja stub para mantener imports multiplataforma.
 */
export function suscribirTelefonosGps(
  onData: (telefonos: TelefonoUbicacion[], meta?: { advertencia?: string; baseUsada?: string }) => void,
  _onError?: (message: string) => void
): () => void {
  onData([]);
  return () => {};
}
