import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

export const listasCategoriasRouter = Router();

type ReqWithUser = { user?: { rol: string } };

const CATS = ['A', 'B', 'C', 'D'] as const;
type Cat = (typeof CATS)[number];

const isValidCat = (c: string): c is Cat => (CATS as readonly string[]).includes(c);

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listas_categoria (
      categoria  TEXT    NOT NULL CHECK (categoria IN ('A','B','C','D')),
      cliente_id TEXT    NOT NULL,
      orden      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (categoria, cliente_id)
    )
  `);
  // Poblar desde categorias[] existentes en clientes (solo si la tabla está vacía)
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM listas_categoria`
  );
  if (parseInt(count) === 0) {
    await pool.query(`
      INSERT INTO listas_categoria (categoria, cliente_id, orden)
      SELECT cat, c.id,
             (row_number() OVER (PARTITION BY cat ORDER BY c.nombre) - 1)::int
      FROM clientes c, unnest(c.categorias) AS cat
      WHERE c.activo = true
      ON CONFLICT DO NOTHING
    `);
  }
}

// GET /admin/listas-categoria/:categoria
listasCategoriasRouter.get('/admin/listas-categoria/:categoria', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  if (!isValidCat(cat)) { res.status(400).json({ error: 'Categoría inválida. Use A, B, C o D.' }); return; }

  await ensureTable();
  const { rows } = await pool.query(
    `SELECT lc.cliente_id AS id, lc.orden,
            c.nombre, c.direccion, c.tipo, c.telefono, c.categorias
     FROM listas_categoria lc
     JOIN clientes c ON c.id = lc.cliente_id AND c.activo = true
     WHERE lc.categoria = $1
     ORDER BY lc.orden ASC`,
    [cat]
  );
  res.json({ categoria: cat, clientes: rows });
});

// PUT /admin/listas-categoria/:categoria  — guarda el orden completo (array de clienteIds)
listasCategoriasRouter.put('/admin/listas-categoria/:categoria', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  if (!isValidCat(cat)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }

  const parsed = z.object({ clienteIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureTable();
  const { clienteIds } = parsed.data;

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM listas_categoria WHERE categoria = $1`, [cat]);
    for (let i = 0; i < clienteIds.length; i++) {
      await pool.query(
        `INSERT INTO listas_categoria (categoria, cliente_id, orden) VALUES ($1, $2, $3)
         ON CONFLICT (categoria, cliente_id) DO UPDATE SET orden = excluded.orden`,
        [cat, clienteIds[i], i]
      );
    }
    await pool.query('COMMIT');
    res.json({ ok: true, total: clienteIds.length });
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
});

// POST /admin/listas-categoria/:categoria/clientes  — agregar un cliente a la lista
listasCategoriasRouter.post('/admin/listas-categoria/:categoria/clientes', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  if (!isValidCat(cat)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }

  const parsed = z.object({ clienteId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureTable();
  const { clienteId } = parsed.data;

  const { rows: [{ max_orden }] } = await pool.query<{ max_orden: number | null }>(
    `SELECT MAX(orden) AS max_orden FROM listas_categoria WHERE categoria = $1`,
    [cat]
  );
  const orden = (max_orden ?? -1) + 1;

  await pool.query(
    `INSERT INTO listas_categoria (categoria, cliente_id, orden) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [cat, clienteId, orden]
  );
  // Sync: agregar categoría al array del cliente
  await pool.query(
    `UPDATE clientes SET categorias = array_append(categorias, $2)
     WHERE id = $1 AND NOT ($2 = ANY(categorias))`,
    [clienteId, cat]
  );

  res.json({ ok: true });
});

// DELETE /admin/listas-categoria/:categoria/clientes/:clienteId  — quitar cliente de la lista
listasCategoriasRouter.delete(
  '/admin/listas-categoria/:categoria/clientes/:clienteId',
  requireAuth,
  async (req, res) => {
    const user = (req as typeof req & ReqWithUser).user;
    if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

    const cat = String(req.params.categoria).toUpperCase();
    if (!isValidCat(cat)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }

    await ensureTable();
    const { clienteId } = req.params;

    await pool.query(
      `DELETE FROM listas_categoria WHERE categoria = $1 AND cliente_id = $2`,
      [cat, clienteId]
    );
    // Sync: quitar categoría del array del cliente
    await pool.query(
      `UPDATE clientes SET categorias = array_remove(categorias, $2) WHERE id = $1`,
      [clienteId, cat]
    );

    res.json({ ok: true });
  }
);

// POST /admin/listas-categoria/:categoria/aplicar
// Crea asignaciones para un repartidor a partir de la lista de la categoría (idempotente).
listasCategoriasRouter.post('/admin/listas-categoria/:categoria/aplicar', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  if (!isValidCat(cat)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }

  const parsed = z.object({
    repartidorId: z.string().min(1),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido. Requiere repartidorId y fecha (YYYY-MM-DD).' }); return; }

  await ensureTable();
  const { repartidorId, fecha } = parsed.data;

  // Obtener clientes de la lista en orden
  const { rows: listaRows } = await pool.query<{ cliente_id: string; orden: number }>(
    `SELECT lc.cliente_id, lc.orden
     FROM listas_categoria lc
     JOIN clientes c ON c.id = lc.cliente_id AND c.activo = true
     WHERE lc.categoria = $1
     ORDER BY lc.orden ASC`,
    [cat]
  );

  if (listaRows.length === 0) {
    res.json({ generados: 0, omitidos: 0, mensaje: `La lista ${cat} está vacía.` });
    return;
  }

  // Clientes ya asignados ese día para este repartidor
  const { rows: yaRows } = await pool.query<{ cliente_id: string }>(
    `SELECT cliente_id FROM asignaciones WHERE repartidor_id = $1 AND fecha_programada = $2`,
    [repartidorId, fecha]
  );
  const yaAsignados = new Set(yaRows.map((r) => r.cliente_id));

  let generados = 0;
  let omitidos = 0;
  for (const { cliente_id, orden } of listaRows) {
    if (yaAsignados.has(cliente_id)) { omitidos++; continue; }
    const id = `asig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO asignaciones (id, repartidor_id, cliente_id, orden, fecha_programada)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, repartidorId, cliente_id, orden, fecha]
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
