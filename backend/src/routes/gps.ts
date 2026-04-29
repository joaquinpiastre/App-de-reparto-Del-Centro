import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMobileKeyOrAuth } from '../auth.js';
import { pool } from '../db/client.js';
type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

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

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function detectStops(
  points: Array<{ lat: number; lng: number; timestamp: number; velocidad: number | null }>
): Array<{ lat: number; lng: number; inicio: number; fin: number; duracionSegundos: number }> {
  const stops: Array<{ lat: number; lng: number; inicio: number; fin: number; duracionSegundos: number }> = [];
  if (points.length < 2) return stops;
  const maxDriftMeters = 35;
  const minStopMs = 2 * 60 * 1000;
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const slow = (curr.velocidad ?? 0) <= 1.5;
    const still = dist <= maxDriftMeters || slow;
    if (!still) {
      const inicio = points[start].timestamp;
      const fin = prev.timestamp;
      if (fin - inicio >= minStopMs) {
        const slice = points.slice(start, i);
        const lat = slice.reduce((acc, p) => acc + p.lat, 0) / slice.length;
        const lng = slice.reduce((acc, p) => acc + p.lng, 0) / slice.length;
        stops.push({
          lat,
          lng,
          inicio,
          fin,
          duracionSegundos: Math.round((fin - inicio) / 1000),
        });
      }
      start = i;
    }
  }
  const lastInicio = points[start].timestamp;
  const lastFin = points[points.length - 1].timestamp;
  if (lastFin - lastInicio >= minStopMs) {
    const slice = points.slice(start);
    const lat = slice.reduce((acc, p) => acc + p.lat, 0) / slice.length;
    const lng = slice.reduce((acc, p) => acc + p.lng, 0) / slice.length;
    stops.push({
      lat,
      lng,
      inicio: lastInicio,
      fin: lastFin,
      duracionSegundos: Math.round((lastFin - lastInicio) / 1000),
    });
  }
  return stops;
}

gpsRouter.post('/gps/update', requireMobileKeyOrAuth, async (req, res) => {
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

gpsRouter.get('/gps/jornadas/:jornadaId/recorrido', requireAuth, async (req, res) => {
  const user = (req as ReqWithUser).user;
  if (user?.rol !== 'admin' && user?.rol !== 'repartidor') {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  const jornadaId = req.params.jornadaId;
  const jornada = await pool.query<{ repartidor_id: string }>(
    `select repartidor_id from jornadas where id = $1`,
    [jornadaId]
  );
  if (jornada.rowCount === 0) {
    res.status(404).json({ error: 'Jornada no encontrada.' });
    return;
  }
  const repartidorId = jornada.rows[0].repartidor_id;
  if (user?.rol === 'repartidor' && user.sub !== repartidorId) {
    res.status(403).json({ error: 'No autorizado para esta jornada.' });
    return;
  }
  const { rows } = await pool.query<{
    lat: number;
    lng: number;
    timestamp_ms: number;
    velocidad: number | null;
  }>(
    `select lat, lng, timestamp_ms, velocidad
     from gps_points
     where jornada_id = $1
     order by timestamp_ms asc`,
    [jornadaId]
  );
  const points = rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lng),
    timestamp: Number(r.timestamp_ms),
    velocidad: r.velocidad == null ? null : Number(r.velocidad),
  }));
  const stops = detectStops(points);
  res.json({ jornadaId, repartidorId, points, stops });
});
