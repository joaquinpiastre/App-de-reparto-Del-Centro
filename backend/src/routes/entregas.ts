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

const cierreSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  repartidorNombre: z.string().min(2),
  completados: z.number().int().min(0),
  total: z.number().int().min(0),
  minutosEnRuta: z.number().int().min(1),
  fechaIso: z.string().optional(),
});

export const entregasRouter = Router();

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden ver reportes.' });
    return false;
  }
  return true;
}

async function ensureCierresTable(): Promise<void> {
  await pool.query(
    `create table if not exists cierres_jornada (
      id uuid primary key default gen_random_uuid(),
      jornada_id text not null,
      repartidor_id text not null references repartidores(id),
      repartidor_nombre text not null,
      completados integer not null,
      total integer not null,
      minutos_en_ruta integer not null,
      fecha_iso text,
      created_at timestamptz not null default now()
    )`
  );
}

async function ensureRepartidorYJornada(
  jornadaId: string,
  repartidorId: string,
  repartidorNombre?: string
): Promise<void> {
  const nombre = repartidorNombre?.trim() || repartidorId.replace(/^usr-/, 'Repartidor ');
  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, 'repartidor', true)
     on conflict (id) do update set nombre = excluded.nombre, activo = true`,
    [repartidorId, nombre]
  );
  await pool.query(
    `insert into jornadas (id, repartidor_id, estado)
     values ($1, $2, 'abierta')
     on conflict (id) do nothing`,
    [jornadaId, repartidorId]
  );
}

entregasRouter.post('/entregas', requireAuth, async (req, res) => {
  const parsed = entregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const e = parsed.data;
  await ensureRepartidorYJornada(e.jornadaId, e.repartidorId);
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

entregasRouter.post('/cierres-jornada', requireAuth, async (req, res) => {
  const parsed = cierreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const c = parsed.data;
  await ensureCierresTable();
  await ensureRepartidorYJornada(c.jornadaId, c.repartidorId, c.repartidorNombre);
  await pool.query(
    `insert into cierres_jornada
     (jornada_id, repartidor_id, repartidor_nombre, completados, total, minutos_en_ruta, fecha_iso)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [c.jornadaId, c.repartidorId, c.repartidorNombre, c.completados, c.total, c.minutosEnRuta, c.fechaIso ?? null]
  );
  res.json({ ok: true });
});

entregasRouter.get('/admin-reportes/historial', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  await ensureCierresTable();
  const cierreRes = await pool.query(
    `select
       cj.jornada_id as id,
       coalesce(extract(epoch from cj.created_at) * 1000, extract(epoch from now()) * 1000) as fecha_ms,
       cj.repartidor_nombre,
       cj.completados,
       cj.total,
       cj.minutos_en_ruta
     from cierres_jornada cj
     order by cj.created_at desc
     limit 100`
  );
  const sourceRows = cierreRes.rows;
  const historial = sourceRows.map((x: {
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
  await ensureCierresTable();

  const [totalesRes, cierresRes, topRes] = await Promise.all([
    pool.query(
      `select
         count(*)::int as jornadas,
         coalesce(sum(completados), 0)::int as entregas,
         greatest(coalesce(sum(total - completados), 0), 0)::int as incidencias
       from cierres_jornada`
    ),
    pool.query(
      `select
         jornada_id as id,
         extract(epoch from created_at) * 1000 as fecha_ms,
         completados,
         minutos_en_ruta
       from cierres_jornada
       order by created_at desc
       limit 6`
    ),
    pool.query(
      `select
         cj.repartidor_id as id,
         cj.repartidor_nombre as nombre,
         coalesce(sum(cj.completados), 0)::int as entregas
       from cierres_jornada cj
       group by cj.repartidor_id, cj.repartidor_nombre
       order by entregas desc, cj.repartidor_nombre asc
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
