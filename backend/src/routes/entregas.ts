import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';
type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

const entregaSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  clienteId: z.string().min(1),
  estado: z.enum(['pendiente', 'en_camino', 'entregado', 'problema']),
  horaLlegada: z.number().optional(),
  horaEntrega: z.number().optional(),
  tiempoParadaSegundos: z.number().int().optional(),
  fotoUrl: z.string().optional(),
  firmaUrl: z.string().optional(),
  firmaBase64: z.string().optional(),
  notasRepartidor: z.string().optional(),
});

export const entregasRouter = Router();

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden ver reportes.' });
    return false;
  }
  return true;
}

entregasRouter.post('/entregas', requireAuth, async (req, res) => {
  const parsed = entregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const e = parsed.data;
  const firmaUrl = e.firmaUrl ?? (e.firmaBase64 ? `data:image/png;base64,${e.firmaBase64}` : null);

  await pool.query(
    `insert into entregas
    (jornada_id, repartidor_id, cliente_id, estado, hora_llegada_ms, hora_entrega_ms, tiempo_parada_segundos, foto_url, firma_url, notas_repartidor)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.jornadaId,
      e.repartidorId,
      e.clienteId,
      e.estado,
      e.horaLlegada ?? null,
      e.horaEntrega ?? null,
      e.tiempoParadaSegundos ?? null,
      e.fotoUrl ?? null,
      firmaUrl,
      e.notasRepartidor ?? null,
    ]
  );
  res.json({ ok: true });
});

entregasRouter.get('/admin-reportes/historial', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  const { rows } = await pool.query(
    `select
       e.jornada_id as id,
       max(coalesce(e.hora_entrega_ms, extract(epoch from e.created_at) * 1000)) as fecha_ms,
       max(r.nombre) as repartidor_nombre,
       count(*) filter (where e.estado = 'entregado')::int as completados,
       count(*)::int as total,
       greatest(
         1,
         round(
           (
             max(coalesce(e.hora_entrega_ms, extract(epoch from e.created_at) * 1000))
             - min(coalesce(e.hora_llegada_ms, e.hora_entrega_ms, extract(epoch from e.created_at) * 1000))
           ) / 60000.0
         )::int
       ) as minutos_en_ruta
     from entregas e
     join repartidores r on r.id = e.repartidor_id
     group by e.jornada_id
     order by fecha_ms desc
     limit 100`
  );
  const historial = rows.map((x: {
    id: string;
    fecha_ms: number;
    repartidor_nombre: string;
    completados: number;
    total: number;
    minutos_en_ruta: number;
  }) => ({
    id: x.id,
    fechaIso: new Date(Number(x.fecha_ms || Date.now())).toISOString(),
    repartidorNombre: x.repartidor_nombre,
    completados: Number(x.completados ?? 0),
    total: Number(x.total ?? 0),
    minutosEnRuta: Number(x.minutos_en_ruta ?? 1),
  }));
  res.json({ historial });
});

entregasRouter.get('/admin-reportes/stats', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;

  const [totalesRes, cierresRes, topRes] = await Promise.all([
    pool.query(
      `select
         count(distinct jornada_id)::int as jornadas,
         count(*) filter (where estado = 'entregado')::int as entregas,
         count(*) filter (where estado = 'problema')::int as incidencias
       from entregas`
    ),
    pool.query(
      `with cierres as (
         select
           e.jornada_id as id,
           max(coalesce(e.hora_entrega_ms, extract(epoch from e.created_at) * 1000)) as fecha_ms,
           count(*) filter (where e.estado = 'entregado')::int as completados,
           greatest(
             1,
             round(
               (
                 max(coalesce(e.hora_entrega_ms, extract(epoch from e.created_at) * 1000))
                 - min(coalesce(e.hora_llegada_ms, e.hora_entrega_ms, extract(epoch from e.created_at) * 1000))
               ) / 60000.0
             )::int
           ) as minutos_en_ruta
         from entregas e
         group by e.jornada_id
         order by fecha_ms desc
         limit 6
       )
       select * from cierres
       order by fecha_ms asc`
    ),
    pool.query(
      `select
         r.id,
         r.nombre,
         count(*) filter (where e.estado = 'entregado')::int as entregas
       from entregas e
       join repartidores r on r.id = e.repartidor_id
       group by r.id, r.nombre
       order by entregas desc, r.nombre asc
       limit 5`
    ),
  ]);

  const t = totalesRes.rows[0] as { jornadas: number; entregas: number; incidencias: number } | undefined;
  const cierres = cierresRes.rows as Array<{
    id: string;
    fecha_ms: number;
    completados: number;
    minutos_en_ruta: number;
  }>;
  const promedioMinutos =
    cierres.length > 0
      ? Math.round(cierres.reduce((acc, c) => acc + Number(c.minutos_en_ruta || 0), 0) / cierres.length)
      : 0;

  res.json({
    resumen: {
      jornadas: Number(t?.jornadas ?? 0),
      entregas: Number(t?.entregas ?? 0),
      incidencias: Number(t?.incidencias ?? 0),
      promedioMinutosRuta: promedioMinutos,
    },
    series: {
      labels: cierres.map((_c, i) => String(i + 1)),
      entregas: cierres.map((c) => Number(c.completados ?? 0)),
      minutos: cierres.map((c) => Number(c.minutos_en_ruta ?? 0)),
    },
    topRepartidores: (topRes.rows as Array<{ id: string; nombre: string; entregas: number }>).map((x) => ({
      id: x.id,
      nombre: x.nombre,
      entregas: Number(x.entregas ?? 0),
    })),
  });
});
