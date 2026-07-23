import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';
import { aplicarTodasLasRutasFijas, fechaHoyArgentina } from '../cron/rutasFijasScheduler.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

export const rutasFijasRouter = Router();

const putSchema = z.object({
  clienteIds: z.array(z.string().min(1)),
});

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutas_fijas (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repartidor_id TEXT NOT NULL,
      cliente_id    TEXT NOT NULL,
      orden         INTEGER NOT NULL DEFAULT 0,
      UNIQUE (repartidor_id, cliente_id)
    )
  `);
}

// GET /rutas-fijas/:repartidorId
// Devuelve la lista de clientes de la ruta fija del repartidor, con nombre y dirección.
rutasFijasRouter.get('/rutas-fijas/:repartidorId', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  const repartidorId = req.params.repartidorId;
  if (user.rol !== 'admin' && user.sub !== repartidorId) {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT rf.cliente_id AS id, rf.orden,
            c.nombre, c.direccion, c.tipo, c.pedido
       FROM rutas_fijas rf
       JOIN clientes c ON c.id = rf.cliente_id
      WHERE rf.repartidor_id = $1
      ORDER BY rf.orden ASC`,
    [repartidorId]
  );
  res.json({ ruta: rows });
});

// PUT /rutas-fijas/:repartidorId
// Reemplaza la ruta fija completa del repartidor. Solo admin.
rutasFijasRouter.put('/rutas-fijas/:repartidorId', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden editar rutas fijas.' });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const repartidorId = req.params.repartidorId;
  const { clienteIds } = parsed.data;

  await ensureTable();
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM rutas_fijas WHERE repartidor_id = $1', [repartidorId]);
    for (let i = 0; i < clienteIds.length; i++) {
      await pool.query(
        `INSERT INTO rutas_fijas (repartidor_id, cliente_id, orden)
         VALUES ($1, $2, $3)
         ON CONFLICT (repartidor_id, cliente_id) DO UPDATE SET orden = excluded.orden`,
        [repartidorId, clienteIds[i], i]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true, total: clienteIds.length });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

// POST /rutas-fijas/:repartidorId/generar?fecha=YYYY-MM-DD
// Crea las asignaciones del día desde la ruta fija (idempotente: no duplica existentes).
// Puede llamarlo el admin o el repartidor mismo.
rutasFijasRouter.post('/rutas-fijas/:repartidorId/generar', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  const repartidorId = req.params.repartidorId;
  if (user.rol !== 'admin' && user.sub !== repartidorId) {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }

  const fecha = (req.query.fecha as string | undefined) ?? fechaHoyArgentina();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'Fecha inválida. Formato: YYYY-MM-DD.' });
    return;
  }

  await ensureTable();

  // Clientes de la ruta fija
  const rutaRes = await pool.query<{ clienteId: string; orden: number }>(
    `SELECT cliente_id AS "clienteId", orden
       FROM rutas_fijas
      WHERE repartidor_id = $1
      ORDER BY orden ASC`,
    [repartidorId]
  );
  if (rutaRes.rowCount === 0) {
    res.json({ generados: 0, omitidos: 0 });
    return;
  }

  // Clientes ya asignados ese día para este repartidor
  const yaAsignadosRes = await pool.query<{ cliente_id: string }>(
    `SELECT cliente_id
       FROM asignaciones
      WHERE repartidor_id = $1 AND fecha_programada = $2`,
    [repartidorId, fecha]
  );
  const yaAsignados = new Set(yaAsignadosRes.rows.map((r) => r.cliente_id));

  let generados = 0;
  let omitidos = 0;
  for (const { clienteId, orden } of rutaRes.rows) {
    if (yaAsignados.has(clienteId)) {
      omitidos++;
      continue;
    }
    const id = `asig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, repartidorId, clienteId, orden, fecha]
    );
    generados++;
  }

  res.json({ generados, omitidos });
});

// GET /admin/planificacion
// Devuelve, para cada día de la semana (lun-vie), la lista de repartidores con sus
// clientes/talleres ordenados según la ruta fija y la categoría del día.
rutasFijasRouter.get('/admin/planificacion', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admin puede ver la planificación.' });
    return;
  }
  await ensureTable();

  // Query por categoría: devuelve todos los repartidores activos con sus clientes (en orden)
  // que tienen esa categoría. También incluye repartidores sin clientes de esa categoría (array vacío).
  async function queryCategoria(cat: string) {
    const { rows } = await pool.query(
      `SELECT r.id AS "repartidorId", r.nombre AS "repartidorNombre",
              c.id AS "clienteId", rf.orden,
              c.nombre AS "clienteNombre", c.direccion, c.tipo, c.categorias
         FROM repartidores r
         LEFT JOIN rutas_fijas rf ON rf.repartidor_id = r.id
         LEFT JOIN clientes c ON c.id = rf.cliente_id
                              AND c.activo = true
                              AND $1 = ANY(c.categorias)
        WHERE r.activo = true AND r.rol = 'repartidor'
        ORDER BY r.nombre, rf.orden ASC`,
      [cat]
    );

    const map = new Map<string, { id: string; nombre: string; clientes: unknown[] }>();
    for (const row of rows as Array<{
      repartidorId: string; repartidorNombre: string;
      clienteId: string | null; orden: number | null;
      clienteNombre: string | null; direccion: string | null;
      tipo: string | null; categorias: string[] | null;
    }>) {
      if (!map.has(row.repartidorId)) {
        map.set(row.repartidorId, { id: row.repartidorId, nombre: row.repartidorNombre, clientes: [] });
      }
      // Solo incluir si el cliente existe Y tiene la categoría (clienteId no null)
      if (row.clienteId && row.clienteNombre) {
        map.get(row.repartidorId)!.clientes.push({
          id: row.clienteId,
          nombre: row.clienteNombre,
          direccion: row.direccion,
          tipo: row.tipo,
          categorias: row.categorias ?? [],
          orden: row.orden ?? 0,
        });
      }
    }
    return Array.from(map.values());
  }

  // Query para categoría D: lista plana de todos los clientes (sin repartidor asignado por día)
  async function queryAndres() {
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.direccion, c.tipo, c.categorias
         FROM clientes c
        WHERE c.activo = true AND 'D' = ANY(c.categorias)
        ORDER BY c.nombre ASC`
    );
    return (rows as Array<{ id: string; nombre: string; direccion: string; tipo: string; categorias: string[] }>)
      .map((c) => ({ id: c.id, nombre: c.nombre, direccion: c.direccion, tipo: c.tipo, categorias: c.categorias, orden: 0 }));
  }

  const [catA, catB, catC, andres] = await Promise.all([
    queryCategoria('A'),
    queryCategoria('B'),
    queryCategoria('C'),
    queryAndres(),
  ]);

  res.json({
    lunes:     { categoria: 'A', repartidores: catA },
    martes:    { categoria: 'B', repartidores: catB },
    miercoles: { categoria: 'A', repartidores: catA },
    jueves:    { categoria: 'B', repartidores: catB },
    viernes:   { categoria: 'C', repartidores: catC },
    andres:    { categoria: 'D', clientes: andres },
  });
});

// PATCH /rutas-fijas/:repartidorId/reordenar-subset
// Reordena un subconjunto de clientes en rutas_fijas preservando la posición relativa del resto.
// Body: { clienteIds: string[] } — el subconjunto en el nuevo orden deseado.
rutasFijasRouter.patch('/rutas-fijas/:repartidorId/reordenar-subset', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden reordenar rutas.' });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const repartidorId = req.params.repartidorId;
  const newSubsetOrder = parsed.data.clienteIds;

  await ensureTable();

  // Orden completo actual
  const { rows: fullRows } = await pool.query<{ cliente_id: string }>(
    `SELECT cliente_id FROM rutas_fijas WHERE repartidor_id = $1 ORDER BY orden ASC`,
    [repartidorId]
  );
  const fullOrder = fullRows.map((r) => r.cliente_id);
  const subsetSet = new Set(newSubsetOrder);

  // Posiciones (índices) que actualmente ocupan los ítems del subconjunto
  const subsetPositions = fullOrder
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => subsetSet.has(id))
    .map(({ idx }) => idx);

  // Colocar el subconjunto en su nuevo orden en esas mismas posiciones
  const newFullOrder = [...fullOrder];
  for (let i = 0; i < subsetPositions.length && i < newSubsetOrder.length; i++) {
    newFullOrder[subsetPositions[i]] = newSubsetOrder[i];
  }

  await pool.query('BEGIN');
  try {
    for (let i = 0; i < newFullOrder.length; i++) {
      await pool.query(
        `UPDATE rutas_fijas SET orden = $3 WHERE repartidor_id = $1 AND cliente_id = $2`,
        [repartidorId, newFullOrder[i], i]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true, total: newFullOrder.length });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

// POST /rutas-fijas/aplicar-todas?fecha=YYYY-MM-DD
// Admin: aplica la ruta fija de TODOS los repartidores activos para la fecha indicada
// (o para hoy Argentina si no se indica fecha). Idempotente.
rutasFijasRouter.post('/rutas-fijas/aplicar-todas', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admin puede aplicar todas las rutas fijas.' });
    return;
  }

  const fecha = (req.query.fecha as string | undefined) ?? fechaHoyArgentina();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'Fecha inválida. Formato: YYYY-MM-DD.' });
    return;
  }

  const resumen = await aplicarTodasLasRutasFijas(fecha);
  const totalGenerados = resumen.reduce((s, r) => s + r.generados, 0);
  const totalOmitidos = resumen.reduce((s, r) => s + r.omitidos, 0);

  res.json({
    ok: true,
    fecha,
    repartidores: resumen.length,
    totalGenerados,
    totalOmitidos,
    detalle: resumen,
  });
});
