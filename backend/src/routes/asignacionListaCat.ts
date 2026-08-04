import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

export const asignacionListaCatRouter = Router();

type ReqWithUser = { user?: { rol: string } };

const CATS = ['A', 'B', 'C', 'D', 'E'] as const;

export async function ensureAsignacionListaCatTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asignacion_lista_cat (
      categoria     TEXT PRIMARY KEY CHECK (categoria IN ('A','B','C','D','E')),
      repartidor_id TEXT NOT NULL
    )
  `);
}

// GET /admin/asignacion-lista-cat  — devuelve todas las asignaciones categoria→repartidor
asignacionListaCatRouter.get('/admin/asignacion-lista-cat', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  await ensureAsignacionListaCatTable();
  const { rows } = await pool.query(
    `SELECT a.categoria, a.repartidor_id AS "repartidorId", r.nombre AS "repartidorNombre"
     FROM asignacion_lista_cat a
     LEFT JOIN repartidores r ON r.id = a.repartidor_id`
  );
  res.json({ asignaciones: rows });
});

// PUT /admin/asignacion-lista-cat/:categoria  — asignar repartidor a una categoría
asignacionListaCatRouter.put('/admin/asignacion-lista-cat/:categoria', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  if (!(CATS as readonly string[]).includes(cat)) {
    res.status(400).json({ error: 'Categoría inválida.' }); return;
  }

  const parsed = z.object({ repartidorId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Payload inválido.' }); return; }

  await ensureAsignacionListaCatTable();
  await pool.query(
    `INSERT INTO asignacion_lista_cat (categoria, repartidor_id)
     VALUES ($1, $2)
     ON CONFLICT (categoria) DO UPDATE SET repartidor_id = excluded.repartidor_id`,
    [cat, parsed.data.repartidorId]
  );
  res.json({ ok: true });
});

// DELETE /admin/asignacion-lista-cat/:categoria  — quitar asignación de una categoría
asignacionListaCatRouter.delete('/admin/asignacion-lista-cat/:categoria', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'Solo admin.' }); return; }

  const cat = String(req.params.categoria).toUpperCase();
  await ensureAsignacionListaCatTable();
  await pool.query(`DELETE FROM asignacion_lista_cat WHERE categoria = $1`, [cat]);
  res.json({ ok: true });
});
