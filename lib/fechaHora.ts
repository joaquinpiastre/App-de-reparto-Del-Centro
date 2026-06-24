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

/**
 * Fecha de "hoy" en Argentina como "YYYY-MM-DD". NUNCA usar
 * new Date().toISOString().slice(0,10): eso da la fecha UTC, que después
 * de las 21:00 hora local ya es "mañana" — provoca que filtros por "hoy"
 * (asignaciones, jornadas de presencia) no encuentren nada durante la noche.
 */
export function fechaHoyArgentina(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}
