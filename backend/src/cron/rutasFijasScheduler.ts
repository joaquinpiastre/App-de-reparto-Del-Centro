/**
 * rutasFijasScheduler.ts
 *
 * Cron interno (sin dependencias externas) que a las 00:00 Argentina (UTC-3)
 * aplica automáticamente la ruta fija de cada repartidor para el nuevo día.
 *
 * Argentina no usa horario de verano (siempre UTC-3).
 * → Medianoche Argentina = 03:00 UTC.
 */

import { pool } from '../db/client.js';

// ─── Helpers de fecha/hora ────────────────────────────────────────────────────

/**
 * Devuelve la fecha actual en Argentina (UTC-3) como "YYYY-MM-DD".
 */
export function fechaHoyArgentina(): string {
  const ahora = new Date();
  // Desplazar 3 horas hacia atrás (UTC → UTC-3)
  const argTime = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  return argTime.toISOString().slice(0, 10);
}

/**
 * Milisegundos que faltan para la próxima medianoche Argentina (03:00 UTC).
 */
function msHastaMedianocheArgentina(): number {
  const ahora = Date.now();
  const ahoraDate = new Date(ahora);

  // Construir el próximo 03:00 UTC (= 00:00 Argentina)
  const proxMedianoche = new Date(Date.UTC(
    ahoraDate.getUTCFullYear(),
    ahoraDate.getUTCMonth(),
    ahoraDate.getUTCDate(),
    3, 0, 0, 0,
  ));

  // Si las 03:00 UTC de hoy ya pasaron, ir al día siguiente
  if (proxMedianoche.getTime() <= ahora) {
    proxMedianoche.setUTCDate(proxMedianoche.getUTCDate() + 1);
  }

  return proxMedianoche.getTime() - ahora;
}

// ─── Lógica de aplicación ─────────────────────────────────────────────────────

/** Devuelve la categoría que corresponde a un día de semana (0=Dom…6=Sáb), o null si no hay visitas ese día. */
function categoriaDel(diaSemana: number): 'A' | 'B' | 'C' | 'E' | null {
  if (diaSemana === 1 || diaSemana === 3) return 'A'; // Lunes, Miércoles
  if (diaSemana === 2 || diaSemana === 4) return 'B'; // Martes, Jueves
  if (diaSemana === 5) return 'C';                    // Viernes
  if (diaSemana === 6) return 'E';                    // Sábado
  return null;                                         // Domingo
}

/**
 * Aplica la ruta fija de TODOS los repartidores activos para `fecha`,
 * incluyendo únicamente los clientes cuya categoría corresponde al día de semana.
 * Categoría A → lunes y miércoles. B → martes y jueves. C → viernes.
 * Sábado y domingo no generan asignaciones automáticas.
 *
 * Es idempotente: si ya existen asignaciones para ese día y repartidor, las omite.
 *
 * @returns Resumen con totales de generados/omitidos por repartidor.
 */
export async function aplicarTodasLasRutasFijas(
  fecha: string,
): Promise<{ repartidor: string; generados: number; omitidos: number }[]> {
  const resultado: { repartidor: string; generados: number; omitidos: number }[] = [];

  // Determinar categoría para este día
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const diaSemana = new Date(anio!, mes! - 1, dia!).getDay();
  const categoria = categoriaDel(diaSemana);

  if (categoria === null) {
    console.log(`[Cron] ${fecha} es sábado o domingo — sin asignaciones automáticas.`);
    return resultado;
  }

  console.log(`[Cron] ${fecha} (día ${diaSemana}) → categoría ${categoria}`);

  // Asegurar que la tabla rutas_fijas existe (idempotente)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutas_fijas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repartidor_id TEXT NOT NULL,
      cliente_id    TEXT NOT NULL,
      orden         INTEGER NOT NULL DEFAULT 0,
      UNIQUE (repartidor_id, cliente_id)
    )
  `);

  // Repartidores activos que tienen al menos 1 cliente en su ruta fija
  const { rows: repartidores } = await pool.query<{ id: string; nombre: string }>(
    `SELECT DISTINCT r.id, r.nombre
       FROM repartidores r
       JOIN rutas_fijas rf ON rf.repartidor_id = r.id
      WHERE r.activo = true
      ORDER BY r.nombre`,
  );

  if (repartidores.length === 0) {
    console.log('[Cron] No hay repartidores con ruta fija. Nada que generar.');
    return resultado;
  }

  for (const rep of repartidores) {
    // Clientes de su ruta fija que tienen la categoría del día (en orden)
    const { rows: rutaFija } = await pool.query<{ clienteId: string; orden: number }>(
      `SELECT rf.cliente_id AS "clienteId", rf.orden
         FROM rutas_fijas rf
         JOIN clientes c ON c.id = rf.cliente_id AND c.activo = true
        WHERE rf.repartidor_id = $1
          AND $2 = ANY(c.categorias)
        ORDER BY rf.orden ASC`,
      [rep.id, categoria],
    );

    if (rutaFija.length === 0) continue;

    // Clientes ya asignados para ese día (para no duplicar)
    const { rows: yaAsignados } = await pool.query<{ cliente_id: string }>(
      `SELECT cliente_id
         FROM asignaciones
        WHERE repartidor_id = $1 AND fecha_programada = $2`,
      [rep.id, fecha],
    );
    const yaAsignadosSet = new Set(yaAsignados.map((r) => r.cliente_id));

    let generados = 0;
    let omitidos = 0;

    for (const { clienteId, orden } of rutaFija) {
      if (yaAsignadosSet.has(clienteId)) {
        omitidos++;
        continue;
      }
      const id = `asig-cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, rep.id, clienteId, orden, fecha],
      );
      generados++;
      // Pequeña pausa para evitar IDs duplicados si el loop es muy rápido
      await new Promise<void>((r) => setTimeout(r, 1));
    }

    resultado.push({ repartidor: rep.nombre, generados, omitidos });
    console.log(
      `[Cron] ${rep.nombre}: ${generados} asignación(es) generada(s), ${omitidos} ya existían — ${fecha}`,
    );
  }

  return resultado;
}

// ─── Scheduler principal ──────────────────────────────────────────────────────

/**
 * Inicia el scheduler que aplica rutas fijas a la medianoche argentina.
 * Se llama una sola vez al arrancar el servidor y se reactiva solo cada día.
 */
export function iniciarSchedulerRutasFijas(): void {
  const ms = msHastaMedianocheArgentina();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);

  console.log(
    `[Cron] Scheduler de rutas fijas iniciado. ` +
    `Próxima ejecución en ${horas}h ${minutos}min (00:00 Argentina).`,
  );

  setTimeout(() => {
    const fecha = fechaHoyArgentina();
    console.log(`[Cron] ⏰ Medianoche Argentina — aplicando rutas fijas para ${fecha}...`);

    aplicarTodasLasRutasFijas(fecha)
      .then((resumen) => {
        const totalGenerados = resumen.reduce((s, r) => s + r.generados, 0);
        const totalRep = resumen.length;
        console.log(
          `[Cron] ✅ Rutas fijas aplicadas: ${totalGenerados} asignaciones en ${totalRep} repartidor(es).`,
        );
      })
      .catch((e: unknown) => {
        console.error(
          '[Cron] ❌ Error al aplicar rutas fijas:',
          e instanceof Error ? e.message : e,
        );
      })
      .finally(() => {
        // Reagendar para la próxima medianoche
        iniciarSchedulerRutasFijas();
      });
  }, ms);
}
