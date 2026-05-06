import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

export const asignacionesRouter = Router();

const hoy = () => new Date().toISOString().slice(0, 10);

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asignaciones (
      id                TEXT PRIMARY KEY,
      repartidor_id     TEXT NOT NULL,
      cliente_id        TEXT NOT NULL,
      jornada_id        TEXT,
      orden             INTEGER NOT NULL DEFAULT 0,
      estado            TEXT NOT NULL DEFAULT 'pendiente',
      notas_admin       TEXT,
      notas_repartidor  TEXT,
      hora_llegada_ms   BIGINT,
      hora_salida_ms    BIGINT,
      fecha_programada  DATE NOT NULL DEFAULT CURRENT_DATE,
      creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Permite múltiples visitas al mismo cliente en el mismo día
  await pool.query(`
    ALTER TABLE asignaciones
    DROP CONSTRAINT IF EXISTS asignaciones_repartidor_id_cliente_id_fecha_programada_key
  `);
}

const bulkSchema = z.object({
  repartidorId: z.string().min(1),
  clienteIds: z.array(z.string().min(1)).min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notasAdmin: z.string().optional(),
});

const estadoSchema = z.object({
  estado: z.enum(['pendiente', 'en_camino', 'entregado', 'problema']),
  notasRepartidor: z.string().optional(),
  horaLlegadaMs: z.number().int().optional(),
  horaSalidaMs: z.number().int().optional(),
  jornadaId: z.string().optional(),
});

// GET /asignaciones?fecha=YYYY-MM-DD[&repartidorId=xxx]
// Admin: puede ver todas o filtrar por repartidorId.
// Repartidor: solo ve las propias del día.
asignacionesRouter.get('/asignaciones', requireAuth, async (req, res) => {
  await ensureTable();
  const user = (req as unknown as ReqWithUser).user!;
  const fecha = (req.query.fecha as string | undefined) ?? hoy();
  const qRepId = req.query.repartidorId as string | undefined;
  const repartidorId = user.rol === 'repartidor' ? user.sub : qRepId;

  const params: unknown[] = [fecha];
  let where = 'WHERE a.fecha_programada = $1';
  if (repartidorId) {
    params.push(repartidorId);
    where += ` AND a.repartidor_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.repartidor_id, a.cliente_id, a.jornada_id,
            a.orden, a.estado, a.notas_admin, a.notas_repartidor,
            a.hora_llegada_ms, a.hora_salida_ms,
            a.fecha_programada::text,
            c.nombre    AS cliente_nombre,
            c.direccion AS cliente_direccion,
            c.telefono  AS cliente_telefono,
            c.tipo      AS cliente_tipo,
            c.pedido    AS cliente_pedido
       FROM asignaciones a
       JOIN clientes c ON c.id = a.cliente_id
      ${where}
      ORDER BY a.repartidor_id, a.orden ASC, a.creado_en ASC`,
    params
  );

  const asignaciones = rows.map((r) => ({
    id: r.id,
    repartidorId: r.repartidor_id,
    clienteId: r.cliente_id,
    jornadaId: r.jornada_id ?? undefined,
    orden: Number(r.orden),
    estado: r.estado,
    notasAdmin: r.notas_admin ?? undefined,
    notasRepartidor: r.notas_repartidor ?? undefined,
    horaLlegadaMs: r.hora_llegada_ms != null ? Number(r.hora_llegada_ms) : undefined,
    horaSalidaMs: r.hora_salida_ms != null ? Number(r.hora_salida_ms) : undefined,
    fechaProgramada: r.fecha_programada,
    cliente: {
      id: r.cliente_id,
      nombre: r.cliente_nombre,
      direccion: r.cliente_direccion,
      telefono: r.cliente_telefono,
      tipo: r.cliente_tipo as 'cliente' | 'taller',
      pedido: r.cliente_pedido ?? undefined,
    },
  }));

  res.json({ asignaciones });
});

// POST /asignaciones/bulk — admin: asigna varios clientes a un repartidor
asignacionesRouter.post('/asignaciones/bulk', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admin puede crear asignaciones.' });
    return;
  }
  await ensureTable();

  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }

  const { repartidorId, clienteIds, notasAdmin } = parsed.data;
  const fecha = parsed.data.fecha ?? hoy();

  let insertados = 0;
  for (let i = 0; i < clienteIds.length; i++) {
    const id = `asig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const result = await pool.query(
      `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada, notas_admin)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, repartidorId, clienteIds[i], i, fecha, notasAdmin ?? null]
    );
    insertados += result.rowCount ?? 0;
  }

  res.json({ ok: true, insertados });
});

// DELETE /asignaciones/:id — admin: elimina una asignación
asignacionesRouter.delete('/asignaciones/:id', requireAuth, async (req, res) => {
  const user = (req as unknown as ReqWithUser).user!;
  if (user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admin puede eliminar asignaciones.' });
    return;
  }
  await ensureTable();
  await pool.query('DELETE FROM asignaciones WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// PATCH /asignaciones/:id/estado — repartidor: actualiza estado de la visita
asignacionesRouter.patch('/asignaciones/:id/estado', requireAuth, async (req, res) => {
  await ensureTable();
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  await pool.query(
    `UPDATE asignaciones
        SET estado           = $1,
            notas_repartidor = COALESCE($2, notas_repartidor),
            hora_llegada_ms  = COALESCE($3, hora_llegada_ms),
            hora_salida_ms   = COALESCE($4, hora_salida_ms),
            jornada_id       = COALESCE($5, jornada_id)
      WHERE id = $6`,
    [
      p.estado,
      p.notasRepartidor ?? null,
      p.horaLlegadaMs ?? null,
      p.horaSalidaMs ?? null,
      p.jornadaId ?? null,
      req.params.id,
    ]
  );
  res.json({ ok: true });
});
