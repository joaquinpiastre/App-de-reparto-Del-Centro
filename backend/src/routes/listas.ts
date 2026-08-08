import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

export const listasRouter = Router();

type ReqWithUser = { user?: { rol: string } };

// Días de semana: 0=domingo … 6=sábado (mismo criterio que Date#getDay()).
const diasSemanaSchema = z.array(z.number().int().min(0).max(6));

let _tableReadyPromise: Promise<void> | null = null;

export function ensureListasTables(): Promise<void> {
  if (!_tableReadyPromise) {
    _tableReadyPromise = _doEnsureTables().catch((err) => {
      _tableReadyPromise = null;
      throw err;
    });
  }
  return _tableReadyPromise;
}

async function _doEnsureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listas (
      id            TEXT PRIMARY KEY,
      nombre        TEXT NOT NULL,
      dias_semana   INTEGER[] NOT NULL DEFAULT '{}',
      activa        BOOLEAN NOT NULL DEFAULT true,
      creado_en_ms  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listas_clientes (
      lista_id   TEXT NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
      cliente_id TEXT NOT NULL,
      orden      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (lista_id, cliente_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listas_asignaciones (
      lista_id      TEXT PRIMARY KEY REFERENCES listas(id) ON DELETE CASCADE,
      repartidor_id TEXT NOT NULL
    )
  `);

  // Migración única: si no hay listas todavía pero existe el sistema viejo
  // (listas_categoria / asignacion_lista_cat con categorías A-E fijas), migrarlo.
  const { rows: [{ count }] } = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM listas`);
  if (parseInt(count) === 0) {
    const { rows: viejasTablas } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'listas_categoria'`
    );
    if (viejasTablas.length > 0) {
      const DIAS_POR_CAT: Record<string, number[]> = {
        A: [1, 3], B: [2, 4], C: [5], D: [], E: [6],
      };
      const NOMBRE_POR_CAT: Record<string, string> = {
        A: 'Lista A · Lun / Mié', B: 'Lista B · Mar / Jue', C: 'Lista C · Vie',
        D: 'Lista D · Andrés', E: 'Lista E · Sábado',
      };
      const { rows: cats } = await pool.query<{ categoria: string }>(
        `SELECT DISTINCT categoria FROM listas_categoria`
      );
      for (const { categoria } of cats) {
        const id = `lista-legacy-${categoria}`;
        await pool.query(
          `INSERT INTO listas (id, nombre, dias_semana) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [id, NOMBRE_POR_CAT[categoria] ?? `Lista ${categoria}`, DIAS_POR_CAT[categoria] ?? []]
        );
        await pool.query(
          `INSERT INTO listas_clientes (lista_id, cliente_id, orden)
           SELECT $1, cliente_id, orden FROM listas_categoria WHERE categoria = $2
           ON CONFLICT DO NOTHING`,
          [id, categoria]
        );
        const { rows: asigRows } = await pool.query<{ repartidor_id: string }>(
          `SELECT repartidor_id FROM asignacion_lista_cat WHERE categoria = $1`,
          [categoria]
        );
        if (asigRows.length > 0) {
          await pool.query(
            `INSERT INTO listas_asignaciones (lista_id, repartidor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, asigRows[0]!.repartidor_id]
          );
        }
      }
    }
  }
}

function nuevoId(): string {
  return `lista-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as Request & ReqWithUser).user;
  if (user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admin.' });
    return false;
  }
  return true;
}

// GET /admin/listas — todas las listas con cantidad de clientes y repartidor asignado
listasRouter.get('/admin/listas', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await ensureListasTables();

  const { rows } = await pool.query(`
    SELECT l.id, l.nombre, l.dias_semana AS "diasSemana", l.activa,
           COUNT(lc.cliente_id) AS "cantidadClientes",
           la.repartidor_id AS "repartidorId", r.nombre AS "repartidorNombre"
    FROM listas l
    LEFT JOIN listas_clientes lc ON lc.lista_id = l.id
    LEFT JOIN listas_asignaciones la ON la.lista_id = l.id
    LEFT JOIN repartidores r ON r.id = la.repartidor_id
    GROUP BY l.id, l.nombre, l.dias_semana, l.activa, la.repartidor_id, r.nombre
    ORDER BY l.creado_en_ms ASC
  `);

  res.json({
    listas: rows.map((r: any) => ({
      id: r.id,
      nombre: r.nombre,
      diasSemana: r.diasSemana,
      activa: r.activa,
      cantidadClientes: parseInt(r.cantidadClientes, 10),
      repartidor: r.repartidorId ? { id: r.repartidorId, nombre: r.repartidorNombre } : null,
    })),
  });
});

// POST /admin/listas — crear una lista nueva
listasRouter.post('/admin/listas', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({
    nombre: z.string().min(1),
    diasSemana: diasSemanaSchema.optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureListasTables();
  const id = nuevoId();
  const { nombre, diasSemana = [] } = parsed.data;
  await pool.query(
    `INSERT INTO listas (id, nombre, dias_semana) VALUES ($1, $2, $3)`,
    [id, nombre, diasSemana]
  );
  res.json({ id, nombre, diasSemana, activa: true, cantidadClientes: 0, repartidor: null });
});

// PATCH /admin/listas/:id — editar nombre / días / activa
listasRouter.patch('/admin/listas/:id', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({
    nombre: z.string().min(1).optional(),
    diasSemana: diasSemanaSchema.optional(),
    activa: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureListasTables();
  const { id } = req.params;
  const { nombre, diasSemana, activa } = parsed.data;

  if (nombre !== undefined) {
    await pool.query(`UPDATE listas SET nombre = $2 WHERE id = $1`, [id, nombre]);
  }
  if (diasSemana !== undefined) {
    await pool.query(`UPDATE listas SET dias_semana = $2 WHERE id = $1`, [id, diasSemana]);
  }
  if (activa !== undefined) {
    await pool.query(`UPDATE listas SET activa = $2 WHERE id = $1`, [id, activa]);
  }
  res.json({ ok: true });
});

// DELETE /admin/listas/:id — eliminar lista (cascade a clientes/asignación)
listasRouter.delete('/admin/listas/:id', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await ensureListasTables();
  await pool.query(`DELETE FROM listas WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// GET /admin/listas/:id/clientes — clientes de la lista, en orden
listasRouter.get('/admin/listas/:id/clientes', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await ensureListasTables();

  const { rows } = await pool.query(
    `SELECT lc.cliente_id AS id, lc.orden,
            c.nombre, c.direccion, c.tipo, c.telefono, c.categorias
     FROM listas_clientes lc
     JOIN clientes c ON c.id = lc.cliente_id AND c.activo = true
     WHERE lc.lista_id = $1
     ORDER BY lc.orden ASC`,
    [req.params.id]
  );
  res.json({ clientes: rows });
});

// PUT /admin/listas/:id/clientes — guarda el orden completo (array de clienteIds)
listasRouter.put('/admin/listas/:id/clientes', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({ clienteIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureListasTables();
  const { id } = req.params;
  const { clienteIds } = parsed.data;

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM listas_clientes WHERE lista_id = $1`, [id]);
    for (let i = 0; i < clienteIds.length; i++) {
      await pool.query(
        `INSERT INTO listas_clientes (lista_id, cliente_id, orden) VALUES ($1, $2, $3)
         ON CONFLICT (lista_id, cliente_id) DO UPDATE SET orden = excluded.orden`,
        [id, clienteIds[i], i]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true, total: clienteIds.length });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

// POST /admin/listas/:id/clientes — agregar un cliente a la lista
listasRouter.post('/admin/listas/:id/clientes', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({ clienteId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureListasTables();
  const { id } = req.params;
  const { clienteId } = parsed.data;

  const { rows: [{ max_orden }] } = await pool.query<{ max_orden: number | null }>(
    `SELECT MAX(orden) AS max_orden FROM listas_clientes WHERE lista_id = $1`,
    [id]
  );
  const orden = (max_orden ?? -1) + 1;

  await pool.query(
    `INSERT INTO listas_clientes (lista_id, cliente_id, orden) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [id, clienteId, orden]
  );
  res.json({ ok: true });
});

// DELETE /admin/listas/:id/clientes/:clienteId — quitar cliente de la lista
listasRouter.delete('/admin/listas/:id/clientes/:clienteId', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await ensureListasTables();
  await pool.query(
    `DELETE FROM listas_clientes WHERE lista_id = $1 AND cliente_id = $2`,
    [req.params.id, req.params.clienteId]
  );
  res.json({ ok: true });
});

// PUT /admin/listas/:id/asignacion — asignar repartidor a la lista (automático por día)
listasRouter.put('/admin/listas/:id/asignacion', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({ repartidorId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureListasTables();
  const { id } = req.params;
  await pool.query(
    `INSERT INTO listas_asignaciones (lista_id, repartidor_id) VALUES ($1, $2)
     ON CONFLICT (lista_id) DO UPDATE SET repartidor_id = excluded.repartidor_id`,
    [id, parsed.data.repartidorId]
  );
  res.json({ ok: true });
});

// DELETE /admin/listas/:id/asignacion — quitar asignación de repartidor
listasRouter.delete('/admin/listas/:id/asignacion', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await ensureListasTables();
  await pool.query(`DELETE FROM listas_asignaciones WHERE lista_id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// POST /admin/listas/:id/aplicar — aplica la lista manualmente a un repartidor+fecha (idempotente)
listasRouter.post('/admin/listas/:id/aplicar', requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = z.object({
    repartidorId: z.string().min(1),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido. Requiere repartidorId y fecha (YYYY-MM-DD).' }); return; }

  await ensureListasTables();
  const { id } = req.params;
  const { repartidorId, fecha } = parsed.data;

  const { rows: listaRows } = await pool.query<{ cliente_id: string; orden: number }>(
    `SELECT lc.cliente_id, lc.orden
     FROM listas_clientes lc
     JOIN clientes c ON c.id = lc.cliente_id AND c.activo = true
     WHERE lc.lista_id = $1
     ORDER BY lc.orden ASC`,
    [id]
  );

  if (listaRows.length === 0) {
    res.json({ generados: 0, omitidos: 0, mensaje: 'La lista está vacía.' });
    return;
  }

  const { rows: yaRows } = await pool.query<{ cliente_id: string }>(
    `SELECT cliente_id FROM asignaciones WHERE repartidor_id = $1 AND fecha_programada = $2`,
    [repartidorId, fecha]
  );
  const yaAsignados = new Set(yaRows.map((r) => r.cliente_id));

  let generados = 0;
  let omitidos = 0;
  for (const { cliente_id, orden } of listaRows) {
    if (yaAsignados.has(cliente_id)) { omitidos++; continue; }
    const asigId = `asig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
       VALUES ($1, $2, $3, $4, $5)`,
      [asigId, repartidorId, cliente_id, orden, fecha]
    );
    generados++;
    await new Promise<void>((r) => setTimeout(r, 1));
  }

  res.json({
    ok: true,
    generados,
    omitidos,
    mensaje: `${generados} asignación(es) generadas${omitidos > 0 ? `, ${omitidos} ya existían` : ''}.`,
  });
});
