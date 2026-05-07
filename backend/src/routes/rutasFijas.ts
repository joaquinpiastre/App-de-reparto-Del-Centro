import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

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
    `SELECT rf.cliente_id AS "clienteId", rf.orden,
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

  const fecha = (req.query.fecha as string | undefined) ?? new Date().toISOString().slice(0, 10);
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
