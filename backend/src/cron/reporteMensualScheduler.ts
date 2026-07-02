/**
 * reporteMensualScheduler.ts
 *
 * El día 1 de cada mes a las 00:00 Argentina (03:00 UTC) guarda automáticamente
 * el snapshot de estadísticas del mes que acaba de terminar.
 *
 * Argentina siempre UTC-3 (sin horario de verano).
 */

import { guardarReporteMensualCron } from '../routes/entregas.js';

/**
 * Milisegundos hasta el próximo 1° del mes a las 00:00 Argentina (03:00 UTC).
 * Devuelve también el año y mes (1-12) del mes que estará terminando.
 */
function msHastaProximoPrimerDeMes(): { ms: number; anioMesAnterior: { anio: number; mes: number } } {
  const ahora = new Date();

  // Próximo día 1 del mes a las 03:00 UTC
  let proxPrimerDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1, 3, 0, 0, 0));

  // Si ya pasó (o es exactamente ahora), avanzar un mes más
  if (proxPrimerDia.getTime() <= ahora.getTime()) {
    proxPrimerDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 2, 1, 3, 0, 0, 0));
  }

  // El mes que termina es el mes anterior al 1° del mes al que llegamos
  const mesAnterior = new Date(proxPrimerDia.getTime() - 1);
  const anioMesAnterior = {
    anio: mesAnterior.getUTCFullYear(),
    mes: mesAnterior.getUTCMonth() + 1,
  };

  return { ms: proxPrimerDia.getTime() - ahora.getTime(), anioMesAnterior };
}

export function iniciarSchedulerReporteMensual(): void {
  const { ms, anioMesAnterior } = msHastaProximoPrimerDeMes();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);

  console.log(
    `[Cron] Scheduler de reporte mensual iniciado. ` +
    `Próxima ejecución en ${horas}h ${minutos}min (1° del mes a las 00:00 Argentina).`,
  );

  setTimeout(() => {
    const { anio, mes } = anioMesAnterior;
    console.log(`[Cron] ⏰ Fin de mes — guardando reporte automático de ${mes}/${anio}...`);

    guardarReporteMensualCron(anio, mes)
      .then(() => {
        console.log(`[Cron] ✅ Reporte mensual ${mes}/${anio} guardado automáticamente.`);
      })
      .catch((e: unknown) => {
        console.error('[Cron] ❌ Error al guardar reporte mensual:', e instanceof Error ? e.message : e);
      })
      .finally(() => {
        iniciarSchedulerReporteMensual();
      });
  }, ms);
}
