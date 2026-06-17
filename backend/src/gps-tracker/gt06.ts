/**
 * Servidor TCP para el protocolo GT06 (Concox GT06E y compatibles).
 *
 * Protocolo GT06E — paquete corto:
 *   [0x78 0x78] [len:1] [protocol:1] [data:N] [serial:2] [crc:2] [0x0D 0x0A]
 *   len = proto(1) + data(N) + serial(2) + CRC(2)  — incluye los bytes de CRC
 *   CRC cubre: len_byte + proto + data + serial = buf.slice(2, len+1)
 *   Tamaño total del paquete = len + 5
 */

import net from 'net';
import { pool } from '../db/client.js';

// ─── CRC-16/IBM-SDLC (CRC-B) — algoritmo reflejado usado por GT06 ────────────
function crc16(buf: Buffer): number {
  let crc = 0xFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0x8408) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFF) & 0xFFFF;
}

// ─── Framing ──────────────────────────────────────────────────────────────────
interface Packet {
  protocol: number;
  data: Buffer;
  serial: number;
  totalLength: number;
}

function tryParsePacket(buf: Buffer): Packet | null {
  if (buf.length < 10) return null;
  if (buf[0] !== 0x78 || buf[1] !== 0x78) return null;

  const len = buf[2];
  // len = proto(1) + data(N) + serial(2) + CRC(2) — GT06E incluye CRC en len
  const totalLength = len + 5; // 2(start) + 1(len_byte) + len + 2(stop)
  if (buf.length < totalLength) return null;

  const protocol = buf[3];
  const dataLength = len - 5; // len - proto(1) - serial(2) - CRC(2)
  if (dataLength < 0) return null;

  const data = buf.slice(4, 4 + dataLength);
  const serial = buf.readUInt16BE(4 + dataLength);
  const crcReceived = buf.readUInt16BE(6 + dataLength); // = buf.readUInt16BE(len+1)

  // CRC cubre: len_byte + proto + data + serial (todo lo anterior al CRC)
  const crcCalc = crc16(buf.slice(2, len + 1));
  if (crcCalc !== crcReceived) {
    console.warn(
      `[GT06] CRC mismatch proto=0x${protocol.toString(16).padStart(2, '0')} ` +
      `calc=0x${crcCalc.toString(16)} recv=0x${crcReceived.toString(16)}`
    );
  }

  return { protocol, data, serial, totalLength };
}

function buildAck(protocol: number, serial: number): Buffer {
  // len = proto(1) + serial(2) + CRC(2) = 5 — GT06E incluye CRC en len
  const len = 5;
  const pkt = Buffer.alloc(10); // len + 5
  pkt[0] = 0x78;
  pkt[1] = 0x78;
  pkt[2] = len;
  pkt[3] = protocol;
  pkt.writeUInt16BE(serial, 4);
  pkt.writeUInt16BE(crc16(pkt.slice(2, 6)), 6); // crc sobre [len, proto, serial]
  pkt[8] = 0x0D;
  pkt[9] = 0x0A;
  return pkt;
}

// ─── Decoders ─────────────────────────────────────────────────────────────────
function decodeImei(buf: Buffer): string {
  let s = '';
  for (const byte of buf) {
    s += ((byte >> 4) & 0x0F).toString(16);
    s += (byte & 0x0F).toString(16);
  }
  // GT06E: relleno 0 al inicio → tomar los últimos 15 nibbles
  if (s.length === 16 && s[0] === '0') return s.slice(1);
  // GT06 clásico: relleno F al final → tomar los primeros 15 nibbles
  if (s.length === 16 && s[15] === 'f') return s.slice(0, 15);
  return s.slice(0, 15);
}

function bcdToDec(byte: number): number {
  return ((byte >> 4) * 10) + (byte & 0x0F);
}

interface LocationData {
  lat: number;
  lng: number;
  speedKmh: number;
  satellites: number;
  timestampMs: number;
  validFix: boolean;
}

function decodeLocation(data: Buffer): LocationData | null {
  if (data.length < 18) return null;

  const year  = 2000 + bcdToDec(data[0]);
  const month = bcdToDec(data[1]);
  const day   = bcdToDec(data[2]);
  const hour  = bcdToDec(data[3]);
  const min   = bcdToDec(data[4]);
  const sec   = bcdToDec(data[5]);

  const satellites = (data[6] >> 4) & 0x0F;
  const latRaw  = data.readUInt32BE(7);
  const lngRaw  = data.readUInt32BE(11);
  const speedKmh = data[15];
  const flags   = data.readUInt16BE(16);

  const isNorth  = (flags & 0x0400) !== 0; // bit 10
  const isEast   = (flags & 0x0800) !== 0; // bit 11
  const validFix = (flags & 0x1000) !== 0; // bit 12

  let lat = latRaw / 1_800_000;
  let lng = lngRaw / 1_800_000;
  if (!isNorth) lat = -lat;
  if (!isEast)  lng = -lng;

  const timestampMs = Date.UTC(year, month - 1, day, hour, min, sec);

  return { lat, lng, speedKmh, satellites, timestampMs, validFix };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getRepartidorByImei(imei: string): Promise<{ repartidorId: string; nombre: string } | null> {
  const { rows } = await pool.query<{ repartidor_id: string; nombre: string }>(
    `select d.repartidor_id, d.nombre
     from dispositivos_gps d
     where d.imei = $1 and d.activo = true`,
    [imei]
  );
  if (!rows.length) return null;
  return { repartidorId: rows[0].repartidor_id, nombre: rows[0].nombre };
}

async function actualizarUltimoContacto(imei: string): Promise<void> {
  await pool.query(
    `update dispositivos_gps set ultimo_contacto_ms = $1 where imei = $2`,
    [Date.now(), imei]
  );
}

async function saveGpsPoint(repartidorId: string, location: LocationData): Promise<void> {
  const jornadaAbierta = await pool.query<{ id: string }>(
    `select id from jornadas where repartidor_id = $1 and estado = 'abierta' order by iniciada_en desc limit 1`,
    [repartidorId]
  );

  let jornadaId: string;
  if (jornadaAbierta.rowCount && jornadaAbierta.rowCount > 0) {
    jornadaId = jornadaAbierta.rows[0].id;
  } else {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    jornadaId = `pres-${repartidorId}-${fecha}`;
    await pool.query(
      `insert into jornadas (id, repartidor_id, iniciada_en, estado)
       values ($1, $2, now(), 'abierta')
       on conflict (id) do nothing`,
      [jornadaId, repartidorId]
    );
  }

  await pool.query(
    `insert into gps_points (jornada_id, repartidor_id, lat, lng, velocidad, precision, timestamp_ms)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [jornadaId, repartidorId, location.lat, location.lng, location.speedKmh, null, location.timestampMs]
  );
}

// ─── Packet handlers ──────────────────────────────────────────────────────────
const PROTO_LOGIN     = 0x01;
const PROTO_LOCATION  = 0x12;
const PROTO_HEARTBEAT = 0x13;
const PROTO_ALARM     = 0x16;

async function handlePacket(
  socket: net.Socket,
  packet: Packet,
  imei: string | null,
): Promise<string | null> {
  socket.write(buildAck(packet.protocol, packet.serial));

  switch (packet.protocol) {
    case PROTO_LOGIN: {
      if (packet.data.length < 8) return null;
      console.log(`[GT06] Login data(${packet.data.length}b): ${packet.data.toString('hex')}`);
      // El IMEI son siempre los últimos 8 bytes del data del login (BCD, 15 dígitos)
      const imeiBytes = packet.data.slice(packet.data.length - 8);
      const deviceImei = decodeImei(imeiBytes);
      console.log(`[GT06] Login IMEI=${deviceImei}`);
      // Actualizar último contacto al conectar, aunque no haya fix GPS aún
      void actualizarUltimoContacto(deviceImei);
      return deviceImei;
    }

    case PROTO_LOCATION:
    case PROTO_ALARM: {
      if (!imei) {
        console.warn('[GT06] Location packet antes de login — ignorando');
        return null;
      }
      // Actualizar último contacto en cada paquete de ubicación (con o sin fix)
      void actualizarUltimoContacto(imei);

      const location = decodeLocation(packet.data);
      if (!location) return null;
      if (!location.validFix) {
        console.log(`[GT06] Sin fix GPS (sats=${location.satellites}) — esperando señal satelital`);
        return null;
      }

      const repartidor = await getRepartidorByImei(imei);
      if (!repartidor) {
        console.warn(`[GT06] IMEI ${imei} no registrado en dispositivos_gps`);
        return null;
      }
      // El reloj del tracker puede no estar sincronizado (sin fix prolongado, batería de RTC, etc.)
      // Si el timestamp decodificado se aleja mucho de la hora real, usamos la hora del servidor
      // para que el punto no quede fuera del filtro de "últimas 24h" en /gps/live.
      const diffMs = Math.abs(Date.now() - location.timestampMs);
      if (diffMs > 6 * 60 * 60 * 1000) {
        console.warn(`[GT06] Timestamp GPS desviado ${Math.round(diffMs / 60000)} min (device=${new Date(location.timestampMs).toISOString()}) — uso hora del servidor`);
        location.timestampMs = Date.now();
      }
      console.log(`[GT06] GPS guardado: ${repartidor.nombre} lat=${location.lat.toFixed(5)} lng=${location.lng.toFixed(5)} ts=${new Date(location.timestampMs).toISOString()}`);
      await saveGpsPoint(repartidor.repartidorId, location);
      return null;
    }

    case PROTO_HEARTBEAT:
      if (imei) void actualizarUltimoContacto(imei);
      return null;

    default:
      return null;
  }
}

// ─── TCP Server ───────────────────────────────────────────────────────────────
export function iniciarServidorGT06(port: number): void {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let deviceImei: string | null = null;
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;

    console.log(`[GT06] Conexión entrante ${remote}`);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 10) {
        if (buffer[0] !== 0x78 || buffer[1] !== 0x78) {
          const nextStart = buffer.indexOf(0x78, 1);
          buffer = nextStart >= 0 ? buffer.slice(nextStart) : Buffer.alloc(0);
          continue;
        }

        const packet = tryParsePacket(buffer);
        if (!packet) break;

        buffer = buffer.slice(packet.totalLength);

        handlePacket(socket, packet, deviceImei)
          .then((imei) => { if (imei) deviceImei = imei; })
          .catch((err: unknown) => { console.error(`[GT06] Error procesando paquete:`, err); });
      }
    });

    socket.on('error', (err) => {
      console.error(`[GT06] Error socket ${remote}:`, err.message);
    });

    socket.on('close', () => {
      console.log(`[GT06] Desconectado ${remote} (IMEI=${deviceImei ?? 'desconocido'})`);
    });

    socket.setTimeout(5 * 60 * 1000);
    socket.on('timeout', () => { socket.destroy(); });
  });

  server.listen(port, () => {
    console.log(`[GT06] Servidor TCP escuchando en :${port}`);
  });

  server.on('error', (err) => {
    console.error(`[GT06] Error servidor TCP:`, err.message);
  });
}
