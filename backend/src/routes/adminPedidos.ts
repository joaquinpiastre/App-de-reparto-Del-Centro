import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

const itemSchema = z.object({
  descripcion: z.string().min(1),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number(),
  subtotal: z.number(),
});

const pedidoAdminSchema = z.object({
  id: z.string().min(3),
  titulo: z.string().min(3),
  calles: z.array(z.string().min(2)).min(1),
  repartidorId: z.string().min(3),
  repartidorNombre: z.string().min(2),
  items: z.array(itemSchema).min(1),
  total: z.number(),
  notas: z.string().optional(),
  estado: z.enum(['pendiente', 'asignado', 'en_ruta', 'entregado', 'cancelado']).default('pendiente'),
  creadoEn: z.number().int().positive(),
  creadoPorId: z.string().optional(),
  creadoPorNombre: z.string().optional(),
});

const estadoSchema = z.object({
  estado: z.enum(['pendiente', 'asignado', 'en_ruta', 'entregado', 'cancelado']),
});

export const adminPedidosRouter = Router();

adminPedidosRouter.get('/repartidores', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `select id, nombre, rol, activo
     from repartidores
     where rol = 'repartidor' and activo = true
     order by nombre asc`
  );
  res.json({ repartidores: rows });
});

adminPedidosRouter.get('/admin-pedidos', requireAuth, async (_req, res) => {
  const user = (_req as { user?: { sub: string; rol: 'admin' | 'repartidor' } }).user;
  const esRepartidor = user?.rol === 'repartidor';
  const baseSelect = `select p.*,
      coalesce(
        json_agg(
          json_build_object(
            'descripcion', i.descripcion,
            'cantidad', i.cantidad,
            'precioUnitario', i.precio_unitario,
            'subtotal', i.subtotal
          )
        ) filter (where i.id is not null),
        '[]'::json
      ) as items
     from pedidos_admin p
     left join pedidos_admin_items i on i.pedido_id = p.id`;
  const tail = `
     group by p.id
     order by p.creado_en_ms desc`;
  const sql = esRepartidor
    ? `${baseSelect}
       where p.repartidor_id = $1 and p.estado in ('pendiente','asignado','en_ruta')
       ${tail}`
    : `${baseSelect}
       ${tail}`;
  const { rows } = esRepartidor ? await pool.query(sql, [user?.sub ?? '']) : await pool.query(sql);
  res.json({ pedidos: rows });
});

adminPedidosRouter.post('/admin-pedidos', requireAuth, async (req, res) => {
  const parsed = pedidoAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  await pool.query('begin');
  try {
    await pool.query(
      `insert into pedidos_admin
      (id, titulo, calles, repartidor_id, repartidor_nombre, total, notas, estado, creado_por_id, creado_por_nombre, creado_en_ms)
      values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (id) do update set
        titulo = excluded.titulo,
        calles = excluded.calles,
        repartidor_id = excluded.repartidor_id,
        repartidor_nombre = excluded.repartidor_nombre,
        total = excluded.total,
        notas = excluded.notas,
        estado = excluded.estado`,
      [
        p.id,
        p.titulo,
        JSON.stringify(p.calles),
        p.repartidorId,
        p.repartidorNombre,
        p.total,
        p.notas ?? null,
        p.estado,
        p.creadoPorId ?? null,
        p.creadoPorNombre ?? null,
        p.creadoEn,
      ]
    );

    await pool.query(`delete from pedidos_admin_items where pedido_id = $1`, [p.id]);
    for (const item of p.items) {
      await pool.query(
        `insert into pedidos_admin_items
        (pedido_id, descripcion, cantidad, precio_unitario, subtotal)
        values ($1,$2,$3,$4,$5)`,
        [p.id, item.descripcion, item.cantidad, item.precioUnitario, item.subtotal]
      );
    }
    await pool.query('commit');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
});

adminPedidosRouter.patch('/admin-pedidos/:id/estado', requireAuth, async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await pool.query(`update pedidos_admin set estado = $2 where id = $1`, [req.params.id, parsed.data.estado]);
  res.json({ ok: true });
});
