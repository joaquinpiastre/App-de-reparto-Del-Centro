import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };
const DEMO_PIN = process.env.DEMO_PIN ?? '1234';

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
  jornadaId: z.string().min(3).optional(),
});

const editarPedidoSchema = z.object({
  titulo: z.string().min(3),
  calles: z.array(z.string().min(2)).min(1),
  items: z.array(itemSchema).min(1),
  total: z.number(),
  notas: z.string().optional(),
});

const asignacionSchema = z.object({
  repartidorId: z.string().min(3),
  repartidorNombre: z.string().min(2),
});

const crearRepartidorSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Usuario inválido.'),
  nombre: z.string().trim().min(2),
  pin: z.string().trim().regex(/^\d{4}$/, 'PIN inválido. Debe tener 4 dígitos.').optional(),
  activo: z.boolean().optional(),
});

const editarRepartidorSchema = z
  .object({
    nombre: z.string().trim().min(2).optional(),
    activo: z.boolean().optional(),
    pin: z.string().trim().regex(/^\d{4}$/, 'PIN inválido. Debe tener 4 dígitos.').optional(),
  })
  .refine((x) => x.nombre !== undefined || x.activo !== undefined || x.pin !== undefined, {
    message: 'Debés enviar al menos un campo a actualizar.',
  });

export const adminPedidosRouter = Router();

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden administrar repartidores.' });
    return false;
  }
  return true;
}

async function ensurePinColumn(): Promise<void> {
  await pool.query(`alter table repartidores add column if not exists pin text`);
  await pool.query(`update repartidores set pin = $1 where pin is null or length(trim(pin)) = 0`, [
    DEMO_PIN,
  ]);
}

async function ensurePedidosAdminJornadaColumn(): Promise<void> {
  await pool.query(`alter table pedidos_admin add column if not exists jornada_id text`);
  await pool.query(`create index if not exists idx_pedidos_admin_jornada on pedidos_admin(jornada_id)`);
}

adminPedidosRouter.get('/repartidores', requireAuth, async (req, res) => {
  await ensurePinColumn();
  const includeInactivos =
    String(req.query.includeInactivos ?? '').trim().toLowerCase() === '1' ||
    String(req.query.includeInactivos ?? '').trim().toLowerCase() === 'true';
  const whereActivo = includeInactivos ? '' : " and activo = true";
  const { rows } = await pool.query(
    `select id, nombre, rol, activo
     from repartidores
     where rol = 'repartidor'${whereActivo}
     order by activo desc, nombre asc`
  );
  res.json({ repartidores: rows });
});

adminPedidosRouter.post('/repartidores', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  await ensurePinColumn();
  const parsed = crearRepartidorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const usuario = parsed.data.usuario.toLowerCase();
  const id = usuario.startsWith('usr-') ? usuario : `usr-${usuario}`;
  const nombre = parsed.data.nombre.trim();
  const pin = parsed.data.pin?.trim() || DEMO_PIN;
  const activo = parsed.data.activo ?? true;
  await pool.query(
    `insert into repartidores (id, nombre, rol, activo, pin)
     values ($1, $2, 'repartidor', $3, $4)
     on conflict (id) do update
       set nombre = excluded.nombre,
           activo = excluded.activo,
           rol = 'repartidor',
           pin = excluded.pin`,
    [id, nombre, activo, pin]
  );
  res.json({ ok: true, repartidor: { id, nombre, rol: 'repartidor', activo } });
});

adminPedidosRouter.patch('/repartidores/:id', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  await ensurePinColumn();
  const parsed = editarRepartidorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const current = await pool.query(
    `select id, nombre, activo, pin
     from repartidores
     where id = $1 and rol = 'repartidor'`,
    [req.params.id]
  );
  if (current.rowCount === 0) {
    res.status(404).json({ error: 'Repartidor no encontrado.' });
    return;
  }
  const prev = current.rows[0] as { id: string; nombre: string; activo: boolean; pin: string | null };
  const nombre = parsed.data.nombre?.trim() ?? prev.nombre;
  const activo = parsed.data.activo ?? prev.activo;
  const pin = parsed.data.pin?.trim() ?? prev.pin ?? DEMO_PIN;
  await pool.query(
    `update repartidores
     set nombre = $2, activo = $3, pin = $4
     where id = $1 and rol = 'repartidor'`,
    [req.params.id, nombre, activo, pin]
  );
  res.json({ ok: true, repartidor: { id: req.params.id, nombre, rol: 'repartidor', activo } });
});

adminPedidosRouter.delete('/repartidores/:id', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  const id = req.params.id;
  await pool.query('begin');
  try {
    await pool.query(`delete from entregas where repartidor_id = $1`, [id]);
    await pool.query(`delete from pedidos_calle where repartidor_id = $1`, [id]);
    await pool.query(`delete from pedidos_admin where repartidor_id = $1`, [id]);
    await pool.query(`delete from cierres_jornada where repartidor_id = $1`, [id]).catch(() => {});
    await pool.query(`delete from gps_points where repartidor_id = $1`, [id]);
    await pool.query(`delete from jornadas where repartidor_id = $1`, [id]);
    const del = await pool.query(`delete from repartidores where id = $1 and rol = 'repartidor'`, [id]);
    if (del.rowCount === 0) {
      await pool.query('rollback');
      res.status(404).json({ error: 'Repartidor no encontrado.' });
      return;
    }
    await pool.query('commit');
    res.json({ ok: true, eliminado: true });
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
});

adminPedidosRouter.get('/admin-pedidos', requireAuth, async (_req, res) => {
  await ensurePedidosAdminJornadaColumn();
  const user = (_req as ReqWithUser).user;
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
  await ensurePedidosAdminJornadaColumn();
  const parsed = pedidoAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  await pool.query('begin');
  try {
    await pool.query(
      `insert into repartidores (id, nombre, rol, activo)
       values ($1, $2, 'repartidor', true)
       on conflict (id) do update set nombre = excluded.nombre, activo = true`,
      [p.repartidorId, p.repartidorNombre]
    );

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
  await ensurePedidosAdminJornadaColumn();
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const jornadaId =
    parsed.data.estado === 'entregado' || parsed.data.estado === 'cancelado'
      ? parsed.data.jornadaId ?? null
      : null;
  await pool.query(
    `update pedidos_admin
     set estado = $2,
         jornada_id = case
           when $3::text is not null then $3::text
           when $2 in ('entregado','cancelado') then jornada_id
           else null
         end
     where id = $1`,
    [req.params.id, parsed.data.estado, jornadaId]
  );
  res.json({ ok: true });
});

adminPedidosRouter.patch('/admin-pedidos/:id/asignar', requireAuth, async (req, res) => {
  const parsed = asignacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const { repartidorId, repartidorNombre } = parsed.data;
  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, 'repartidor', true)
     on conflict (id) do update set nombre = excluded.nombre, activo = true`,
    [repartidorId, repartidorNombre]
  );
  await pool.query(
    `update pedidos_admin
     set repartidor_id = $2, repartidor_nombre = $3, estado = 'asignado'
     where id = $1`,
    [req.params.id, repartidorId, repartidorNombre]
  );
  res.json({ ok: true });
});

adminPedidosRouter.patch('/admin-pedidos/:id', requireAuth, async (req, res) => {
  const parsed = editarPedidoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  await pool.query('begin');
  try {
    const up = await pool.query(
      `update pedidos_admin
       set titulo = $2, calles = $3::jsonb, total = $4, notas = $5
       where id = $1 and estado = 'pendiente'`,
      [req.params.id, p.titulo, JSON.stringify(p.calles), p.total, p.notas ?? null]
    );
    if (up.rowCount === 0) {
      await pool.query('rollback');
      res.status(409).json({ error: 'Solo se pueden editar pedidos pendientes.' });
      return;
    }
    await pool.query(`delete from pedidos_admin_items where pedido_id = $1`, [req.params.id]);
    for (const item of p.items) {
      await pool.query(
        `insert into pedidos_admin_items
        (pedido_id, descripcion, cantidad, precio_unitario, subtotal)
        values ($1,$2,$3,$4,$5)`,
        [req.params.id, item.descripcion, item.cantidad, item.precioUnitario, item.subtotal]
      );
    }
    await pool.query('commit');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
});

adminPedidosRouter.delete('/admin-pedidos/:id', requireAuth, async (req, res) => {
  const del = await pool.query(`delete from pedidos_admin where id = $1`, [req.params.id]);
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
