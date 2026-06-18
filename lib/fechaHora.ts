// La operación es exclusivamente en San Rafael, Mendoza, Argentina (UTC-3,
// sin horario de verano). Formatear siempre con este huso fijo evita que
// los horarios se vean mal cuando el dispositivo que mira la pantalla
// (PC de escritorio, otro navegador, etc.) tiene una zona horaria distinta
// configurada — los timestamps guardados son siempre UTC (epoch ms).
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function formatHora(ms: number | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleTimeString('es-AR', { timeZone: TIME_ZONE, ...opts });
}

export function formatFecha(ms: number | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleDateString('es-AR', { timeZone: TIME_ZONE, ...opts });
}

export function formatFechaHora(ms: number | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString('es-AR', { timeZone: TIME_ZONE, ...opts });
}
