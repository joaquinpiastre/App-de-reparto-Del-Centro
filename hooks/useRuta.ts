import type { Cliente, PedidoAdmin } from '@/types';

export function optimizarRuta(clientes: Cliente[]) {
  return [...clientes].sort((a, b) => a.orden - b.orden);
}

/**
 * Paradas en el mismo orden que la jornada (`clientesDelDia`), usando las calles
 * cargadas en cada pedido (una entrada por calle). Así coincide con lo que asignó el admin.
 */
export function paradasParaMapsDesdeJornada(clientesDelDia: Cliente[], pedidos: PedidoAdmin[]): string[] {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const paradas: string[] = [];
  for (const c of clientesDelDia) {
    const p = porId.get(c.id);
    if (p?.calles?.length) {
      for (const calle of p.calles) {
        const s = calle.trim();
        if (s) paradas.push(s);
      }
    } else {
      const s = c.direccion.trim();
      if (s) paradas.push(s);
    }
  }
  return paradas;
}

/**
 * URL de Google Maps: mismo conjunto de direcciones que la jornada; Google reordena
 * los waypoints intermedios con optimize:true (la última parada queda como destino fijo por limitación del deep link).
 */
export function urlGoogleMapsRutaOptimizada(
  paradas: string[],
  opts?: { origen?: { lat: number; lng: number } | null }
): string | null {
  const p = paradas.map((x) => x.trim()).filter(Boolean);
  if (p.length === 0) return null;

  const originParam = opts?.origen
    ? `&origin=${encodeURIComponent(`${opts.origen.lat},${opts.origen.lng}`)}`
    : '';

  if (p.length === 1) {
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(p[0])}&travelmode=driving`;
  }

  if (p.length === 2) {
    const wp = encodeURIComponent(p[0]);
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(p[1])}&travelmode=driving&waypoints=${wp}`;
  }

  const destination = p[p.length - 1];
  const waypoints = p.slice(0, p.length - 1);
  const wpParam = encodeURIComponent(`optimize:true|${waypoints.join('|')}`);
  return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(destination)}&travelmode=driving&waypoints=${wpParam}`;
}
