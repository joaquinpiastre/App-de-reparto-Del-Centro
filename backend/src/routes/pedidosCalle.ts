import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

const itemSchema = z.object({
  codigo: z.string().optional(),
  descripcion: z.string().min(1),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number(),
  subtotal: z.number(),
});

const pedidoSchema = z.object({
  id: z.string().min(3),
  calleNormalizada: z.string().min(1),
  calleMostrada: z.string().min(1),
  repartidorId: z.string().min(3),
  repartidorNombre: z.string().min(2),
  items: z.array(itemSchema).min(1),
  total: z.number(),
  notas: z.string().optional(),
  clientesMismaCalle: z.array(z.object({ nombre: z.string(), direccion: z.string() })).default([]),
  estado: z.enum(['pendiente', 'visto', 'armado', 'retirado', 'cancelado']).default('pendiente'),
  creadoEn: z.number().int().positive(),
});

const estadoSchema = z.object({
  estado: z.enum(['pendiente', 'visto', 'armado', 'retirado', 'cancelado']),
});

const cerrarTurnoSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
});

export const pedidosCalleRouter = Router();

async function ensureJornadaIdColumn(): Promise<void> {
  await pool.query(
    `alter table pedidos_calle add column if not exists jornada_id text`
  );
}

pedidosCalleRouter.get('/pedidos-calle', requireAuth, async (_req, res) => {
  await ensureJornadaIdColumn();
  const { rows } = await pool.query(
    `select p.*,
      coalesce(
        json_agg(
          json_build_object(
            'codigo', i.codigo,
            'descripcion', i.descripcion,
            'cantidad', i.cantidad,
            'precioUnitario', i.precio_unitario,
            'subtotal', i.subtotal
          )
        ) filter (where i.id is not null),
        '[]'::json
      ) as items
     from pedidos_calle p
     left join pedido_calle_items i on i.pedido_id = p.id
     where p.jornada_id is null
     group by p.id
     order by p.creado_en_ms desc`
  );
  res.json({ pedidos: rows });
});

pedidosCalleRouter.post('/pedidos-calle', requireAuth, async (req, res) => {
  await ensureJornadaIdColumn();
  const parsed = pedidoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  await pool.query('begin');
  try {
    await pool.query(
      `insert into pedidos_calle
      (id, calle_normalizada, calle_mostrada, repartidor_id, repartidor_nombre, total, notas, clientes_misma_calle, estado, creado_en_ms)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
      on conflict (id) do update set
        calle_normalizada = excluded.calle_normalizada,
        calle_mostrada = excluded.calle_mostrada,
        repartidor_id = excluded.repartidor_id,
        repartidor_nombre = excluded.repartidor_nombre,
        total = excluded.total,
        notas = excluded.notas,
        clientes_misma_calle = excluded.clientes_misma_calle,
        estado = excluded.estado`,
      [
        p.id,
        p.calleNormalizada,
        p.calleMostrada,
        p.repartidorId,
        p.repartidorNombre,
        p.total,
        p.notas ?? null,
        JSON.stringify(p.clientesMismaCalle),
        p.estado,
        p.creadoEn,
      ]
    );

    await pool.query(`delete from pedido_calle_items where pedido_id = $1`, [p.id]);
    for (const item of p.items) {
      await pool.query(
        `insert into pedido_calle_items
        (pedido_id, codigo, descripcion, cantidad, precio_unitario, subtotal)
        values ($1,$2,$3,$4,$5,$6)`,
        [p.id, item.codigo ?? null, item.descripcion, item.cantidad, item.precioUnitario, item.subtotal]
      );
    }
    await pool.query('commit');
    res.json({ ok: true });
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
});

// Asocia todos los pedidos abiertos del repartidor a la jornada al cerrar el turno.
// A partir de ahí dejan de aparecer en la sección activa y quedan en el historial.
pedidosCalleRouter.post('/pedidos-calle/cerrar-turno', requireAuth, async (req, res) => {
  await ensureJornadaIdColumn();
  const parsed = cerrarTurnoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const { jornadaId, repartidorId } = parsed.data;
  await pool.query(
    `update pedidos_calle
     set jornada_id = $1
     where repartidor_id = $2
       and jornada_id is null`,
    [jornadaId, repartidorId]
  );
  res.json({ ok: true });
});

pedidosCalleRouter.patch('/pedidos-calle/:id/estado', requireAuth, async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await pool.query(`update pedidos_calle set estado = $2 where id = $1`, [req.params.id, parsed.data.estado]);
  res.json({ ok: true });
});
