/**
 * rutasFijasScheduler.ts
 *
 * Cron interno (sin dependencias externas) que a las 00:00 Argentina (UTC-3)
 * aplica automáticamente asignaciones para el nuevo día.
 *
 * Sistema nuevo: usa listas_categoria + asignacion_lista_cat (qué repartidor hace cada lista).
 * Sistema viejo: usa rutas_fijas por repartidor (fallback para los que no migraron).
 *
 * Argentina no usa horario de verano (siempre UTC-3).
 * → Medianoche Argentina = 03:00 UTC.
 */

import { pool } from '../db/client.js';
import { ensureAsignacionListaCatTable } from '../routes/asignacionListaCat.js';

// ─── Helpers de fecha/hora ────────────────────────────────────────────────────

export function fechaHoyArgentina(): string {
  const ahora = new Date();
  const argTime = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  return argTime.toISOString().slice(0, 10);
}

function msHastaMedianocheArgentina(): number {
  const ahora = Date.now();
  const ahoraDate = new Date(ahora);

  const proxMedianoche = new Date(Date.UTC(
    ahoraDate.getUTCFullYear(),
    ahoraDate.getUTCMonth(),
    ahoraDate.getUTCDate(),
    3, 0, 0, 0,
  ));

  if (proxMedianoche.getTime() <= ahora) {
    proxMedianoche.setUTCDate(proxMedianoche.getUTCDate() + 1);
  }

  return proxMedianoche.getTime() - ahora;
}

// ─── Categoría por día ────────────────────────────────────────────────────────

function categoriaDel(diaSemana: number): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (diaSemana === 1 || diaSemana === 3) return 'A'; // Lunes, Miércoles
  if (diaSemana === 2 || diaSemana === 4) return 'B'; // Martes, Jueves
  if (diaSemana === 5) return 'C';                    // Viernes
  if (diaSemana === 6) return 'E';                    // Sábado
  return null;                                         // Domingo (sin visitas)
}

// ─── Sistema nuevo: listas_categoria + asignacion_lista_cat ─────────────────

async function aplicarNuevoSistema(
  fecha: string,
  categoria: string,
): Promise<{ repartidor: string; generados: number; omitidos: number }[]> {
  const resultado: { repartidor: string; generados: number; omitidos: number }[] = [];

  await ensureAsignacionListaCatTable();

  // Buscar qué repartidor está asignado a esta categoría
  const { rows: asignaciones } = await pool.query<{
    repartidorId: string;
    repartidorNombre: string;
  }>(
    `SELECT a.repartidor_id AS "repartidorId", r.nombre AS "repartidorNombre"
     FROM asignacion_lista_cat a
     JOIN repartidores r ON r.id = a.repartidor_id AND r.activo = true
     WHERE a.categoria = $1`,
    [categoria],
  );

  if (asignaciones.length === 0) return resultado;

  // Clientes de la lista en orden
  const { rows: listaRows } = await pool.query<{ cliente_id: string; orden: number }>(
    `SELECT lc.cliente_id, lc.orden
     FROM listas_categoria lc
     JOIN clientes c ON c.id = lc.cliente_id AND c.activo = true
     WHERE lc.categoria = $1
     ORDER BY lc.orden ASC`,
    [categoria],
  );

  if (listaRows.length === 0) {
    console.log(`[Cron] Lista ${categoria} vacía — sin asignaciones del nuevo sistema.`);
    return resultado;
  }

  for (const { repartidorId, repartidorNombre } of asignaciones) {
    const { rows: yaRows } = await pool.query<{ cliente_id: string }>(
      `SELECT cliente_id FROM asignaciones WHERE repartidor_id = $1 AND fecha_programada = $2`,
      [repartidorId, fecha],
    );
    const yaAsignadosSet = new Set(yaRows.map((r) => r.cliente_id));

    let generados = 0;
    let omitidos = 0;

    for (const { cliente_id, orden } of listaRows) {
      if (yaAsignadosSet.has(cliente_id)) { omitidos++; continue; }
      const id = `asig-cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, repartidorId, cliente_id, orden, fecha],
      );
      generados++;
      await new Promise<void>((r) => setTimeout(r, 1));
    }

    resultado.push({ repartidor: repartidorNombre, generados, omitidos });
    console.log(
      `[Cron][LISTA] ${repartidorNombre} (${categoria}): ${generados} asignación(es), ${omitidos} ya existían — ${fecha}`,
    );
  }

  return resultado;
}

// ─── Sistema viejo: rutas_fijas por repartidor ───────────────────────────────

async function aplicarSistemaViejo(
  fecha: string,
  categoria: string,
  excluirRepartidores: Set<string>,
): Promise<{ repartidor: string; generados: number; omitidos: number }[]> {
  const resultado: { repartidor: string; generados: number; omitidos: number }[] = [];

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutas_fijas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repartidor_id TEXT NOT NULL,
      cliente_id    TEXT NOT NULL,
      orden         INTEGER NOT NULL DEFAULT 0,
      UNIQUE (repartidor_id, cliente_id)
    )
  `);

  const { rows: repartidores } = await pool.query<{ id: string; nombre: string }>(
    `SELECT DISTINCT r.id, r.nombre
       FROM repartidores r
       JOIN rutas_fijas rf ON rf.repartidor_id = r.id
      WHERE r.activo = true
      ORDER BY r.nombre`,
  );

  for (const rep of repartidores) {
    if (excluirRepartidores.has(rep.id)) continue;

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

    const { rows: yaRows } = await pool.query<{ cliente_id: string }>(
      `SELECT cliente_id FROM asignaciones WHERE repartidor_id = $1 AND fecha_programada = $2`,
      [rep.id, fecha],
    );
    const yaAsignadosSet = new Set(yaRows.map((r) => r.cliente_id));

    let generados = 0;
    let omitidos = 0;

    for (const { clienteId, orden } of rutaFija) {
      if (yaAsignadosSet.has(clienteId)) { omitidos++; continue; }
      const id = `asig-cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, rep.id, clienteId, orden, fecha],
      );
      generados++;
      await new Promise<void>((r) => setTimeout(r, 1));
    }

    resultado.push({ repartidor: rep.nombre, generados, omitidos });
    console.log(
      `[Cron][FIJA] ${rep.nombre}: ${generados} asignación(es), ${omitidos} ya existían — ${fecha}`,
    );
  }

  return resultado;
}

// ─── Función principal exportada ──────────────────────────────────────────────

export async function aplicarTodasLasRutasFijas(
  fecha: string,
): Promise<{ repartidor: string; generados: number; omitidos: number }[]> {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const diaSemana = new Date(anio!, mes! - 1, dia!).getDay();
  const categoria = categoriaDel(diaSemana);

  if (categoria === null) {
    console.log(`[Cron] ${fecha} es domingo — sin asignaciones automáticas.`);
    return [];
  }

  console.log(`[Cron] ${fecha} (día ${diaSemana}) → categoría ${categoria}`);

  // 1. Nuevo sistema: listas_categoria + asignacion_lista_cat
  const resultadoNuevo = await aplicarNuevoSistema(fecha, categoria);

  // 2. Viejo sistema para repartidores no cubiertos por el nuevo
  const yaAsignadosIds = new Set(
    resultadoNuevo.map((r) => r.repartidor), // usamos nombres, no IDs — necesitamos los IDs
  );

  // Obtener IDs de los repartidores que ya fueron asignados por el nuevo sistema
  const { rows: repIdsNuevo } = resultadoNuevo.length > 0
    ? await pool.query<{ id: string }>(
        `SELECT a.repartidor_id AS id
         FROM asignacion_lista_cat a
         JOIN repartidores r ON r.id = a.repartidor_id AND r.activo = true
         WHERE a.categoria = $1`,
        [categoria],
      )
    : { rows: [] };
  const excluirIds = new Set(repIdsNuevo.map((r) => r.id));

  const resultadoViejo = await aplicarSistemaViejo(fecha, categoria, excluirIds);

  return [...resultadoNuevo, ...resultadoViejo];
}

// ─── Scheduler principal ──────────────────────────────────────────────────────

export function iniciarSchedulerRutasFijas(): void {
  const ms = msHastaMedianocheArgentina();
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);

  console.log(
    `[Cron] Scheduler iniciado. ` +
    `Próxima ejecución en ${horas}h ${minutos}min (00:00 Argentina).`,
  );

  setTimeout(() => {
    const fecha = fechaHoyArgentina();
    console.log(`[Cron] ⏰ Medianoche Argentina — aplicando asignaciones para ${fecha}...`);

    aplicarTodasLasRutasFijas(fecha)
      .then((resumen) => {
        const total = resumen.reduce((s, r) => s + r.generados, 0);
        console.log(`[Cron] ✅ Asignaciones aplicadas: ${total} en ${resumen.length} repartidor(es).`);
      })
      .catch((e: unknown) => {
        console.error('[Cron] ❌ Error al aplicar asignaciones:', e instanceof Error ? e.message : e);
      })
      .finally(() => {
        iniciarSchedulerRutasFijas();
      });
  }, ms);
}
