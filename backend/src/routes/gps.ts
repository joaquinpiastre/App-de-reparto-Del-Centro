import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMobileKey } from '../auth.js';
import { pool } from '../db/client.js';

const gpsUpdateSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  nombre: z.string().min(2).optional(),
  lat: z.number(),
  lng: z.number(),
  velocidad: z.number().optional(),
  precision: z.number().optional(),
  timestamp: z.number().int().positive(),
});

export const gpsRouter = Router();

gpsRouter.post('/gps/update', requireMobileKey, async (req, res) => {
  const parsed = gpsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  const nombre = p.nombre ?? p.repartidorId.replace(/^usr-/, 'Repartidor ');

  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, 'repartidor', true)
     on conflict (id) do update set nombre = excluded.nombre, activo = true`,
    [p.repartidorId, nombre]
  );

  await pool.query(
    `insert into jornadas (id, repartidor_id, iniciada_en, estado)
     values ($1, $2, to_timestamp($3 / 1000.0), 'abierta')
     on conflict (id) do update set repartidor_id = excluded.repartidor_id`,
    [p.jornadaId, p.repartidorId, p.timestamp]
  );

  await pool.query(
    `insert into gps_points
    (jornada_id, repartidor_id, lat, lng, velocidad, precision, timestamp_ms)
    values ($1, $2, $3, $4, $5, $6, $7)`,
    [p.jornadaId, p.repartidorId, p.lat, p.lng, p.velocidad ?? null, p.precision ?? null, p.timestamp]
  );

  res.json({ ok: true });
});

gpsRouter.get('/gps/live', requireAuth, async (_req, res) => {
  const { rows } = await pool.query<{
    id: string;
    nombre: string;
    lat: number;
    lng: number;
    precision: number | null;
    actualizadoEn: number;
  }>(
    `select distinct on (gp.repartidor_id)
       gp.repartidor_id as id,
       r.nombre,
       gp.lat,
       gp.lng,
       gp.precision,
       gp.timestamp_ms as "actualizadoEn"
     from gps_points gp
     join repartidores r on r.id = gp.repartidor_id
     where gp.timestamp_ms > extract(epoch from now() - interval '10 hours') * 1000
     order by gp.repartidor_id, gp.timestamp_ms desc`
  );

  const telefonos = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    posicion: { lat: Number(r.lat), lng: Number(r.lng) },
    actualizadoEn: Number(r.actualizadoEn),
    precision: r.precision == null ? undefined : Number(r.precision),
  }));
  res.json({ telefonos });
});
