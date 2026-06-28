import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Alert, Platform } from 'react-native';

import { optimizarRuta } from '@/hooks/useRuta';
import { actualizarEstadoAsignacion, obtenerAsignaciones } from '@/services/asignaciones';
import { registrarCierreJornadaApi } from '@/services/entregasApi';
import { detenerGPS, iniciarGPS, iniciarGPSPresencia } from '@/services/gps';
import { cerrarTurnoPedidosCalle } from '@/services/pedidosCalle';
import { API_ENABLED } from '@/constants/api';
import type { Asignacion, Cliente, Coordenadas, EstadoEntrega, Usuario } from '@/types';

import { useHistorialStore } from './useHistorialStore';

const BASE_COORDENADAS = { lat: -34.6177, lng: -68.3301 };

// ─── Cola de sincronización offline ──────────────────────────────────────────
// Cuando no hay red al confirmar una visita, se encola para reintentar después.
const SYNC_KEY = 'visitas_pendientes_sync';
const ROUTE_ORDER_KEY = 'jornada_client_order';
// Respaldo local de clientesDelDia: permite restaurar la jornada tras un
// reinicio/recarga de la pestaña aunque en ese momento no haya conexión
// para volver a pedir las asignaciones al backend (típico manejando, con
// señal intermitente).
const CLIENTES_CACHE_KEY = 'jornada_clientes_cache';

async function cachearClientesDelDia(clientes: Cliente[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLIENTES_CACHE_KEY, JSON.stringify(clientes));
  } catch {
    // No crítico
  }
}
interface PendienteSync {
  asigId: string;
  estado: EstadoEntrega;
  horaSalidaMs?: number;
  jornadaId?: string;
  notasRepartidor?: string;
}

async function encolarSincronizacion(entry: PendienteSync): Promise<void> {
  try {
    const str = await AsyncStorage.getItem(SYNC_KEY);
    const lista: PendienteSync[] = str ? (JSON.parse(str) as PendienteSync[]) : [];
    // Reemplazar si ya hay una entrada para el mismo asigId (evita duplicados)
    const filtrada = lista.filter((p) => p.asigId !== entry.asigId);
    filtrada.push(entry);
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(filtrada));
  } catch {
    // No crítico — la visita ya está guardada localmente
  }
}

export async function reintentarSincronizaciones(): Promise<void> {
  if (!API_ENABLED) return;
  try {
    const str = await AsyncStorage.getItem(SYNC_KEY);
    if (!str) return;
    const lista = JSON.parse(str) as PendienteSync[];
    if (!lista.length) return;
    const sinConexion: PendienteSync[] = [];
    for (const p of lista) {
      try {
        await actualizarEstadoAsignacion(p.asigId, p.estado, {
          horaSalidaMs: p.horaSalidaMs,
          jornadaId: p.jornadaId,
          notasRepartidor: p.notasRepartidor,
        });
      } catch {
        sinConexion.push(p); // Aún sin red, guardar para el próximo intento
      }
    }
    if (sinConexion.length === 0) {
      await AsyncStorage.removeItem(SYNC_KEY);
    } else {
      await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(sinConexion));
    }
  } catch {
    // Silencioso
  }
}

function hashToOffset(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ((hash % 1000) - 500) / 100000;
}

function asignacionToCliente(a: Asignacion, index: number): Cliente {
  return {
    id: a.id, // se usa el ID de la asignación para actualizar el estado
    nombre: a.cliente.nombre,
    direccion: a.cliente.direccion,
    telefono: a.cliente.telefono,
    pedido: a.notasAdmin ?? a.cliente.pedido ?? (a.cliente.tipo === 'taller' ? 'Taller' : 'Cliente'),
    coordenadas: {
      lat: BASE_COORDENADAS.lat + hashToOffset(`${a.clienteId}-lat`),
      lng: BASE_COORDENADAS.lng + hashToOffset(`${a.clienteId}-lng`),
    },
    estado:
      a.estado === 'entregado'
        ? 'entregado'
        : a.estado === 'problema'
          ? 'problema'
          : 'pendiente',
    orden: index + 1,
    estimadoMin: 10,
  };
}

async function cargarClientesDesdeAsignaciones(usuario: Usuario | null): Promise<Cliente[]> {
  if (!usuario?.id) return [];
  const asignaciones = await obtenerAsignaciones({ repartidorId: usuario.id });
  const activas = asignaciones
    .filter((a) => a.estado === 'pendiente' || a.estado === 'en_camino')
    .sort((a, b) => a.orden - b.orden);
  return activas.map(asignacionToCliente);
}

interface AppStore {
  usuario: Usuario | null;
  jornadaId: string | null;
  jornadaActiva: boolean;
  jornadaInicioEpoch: number | null;
  clientesDelDia: Cliente[];
  clienteActualIndex: number;
  gpsActivo: boolean;
  ultimaPosicion: Coordenadas | null;
  cargando: boolean;
  fotoPendienteUri: string | null;
  entregaTimerSegundos: number;
  // Epoch en ms cuando el repartidor presionó "VISITAR" — para medir tiempo de viaje
  viajeIniciadoEpoch: number | null;
  setUsuario: (usuario: Usuario | null) => void;
  setClientesDelDia: (clientes: Cliente[]) => void;
  setUltimaPosicion: (c: Coordenadas | null) => void;
  setFotoPendienteUri: (uri: string | null) => void;
  setEntregaTimerSegundos: (n: number) => void;
  iniciarViajeACliente: (index: number) => void;
  iniciarJornada: () => Promise<void>;
  pausarJornada: () => Promise<void>;
  cerrarJornada: () => Promise<void>;
  restaurarJornada: () => Promise<void>;
  resetSesion: () => void;
  siguienteCliente: () => void;
  irAlPrimerPendiente: () => void;
  actualizarCliente: (id: string, patch: Partial<Cliente>) => void;
  marcarClienteEstado: (id: string, estado: EstadoEntrega) => void;
  completarVisitaActual: (opts?: { notasRepartidor?: string; firmaBase64?: string }) => void;
  reportarProblemaActual: (nota?: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  usuario: null,
  jornadaId: null,
  jornadaActiva: false,
  jornadaInicioEpoch: null,
  clientesDelDia: [],
  clienteActualIndex: 0,
  gpsActivo: false,
  ultimaPosicion: null,
  cargando: false,
  fotoPendienteUri: null,
  entregaTimerSegundos: 0,
  viajeIniciadoEpoch: null,

  setUsuario: (usuario) => {
    set({ usuario });
    if (Platform.OS !== 'web' && usuario?.rol === 'repartidor') {
      void iniciarGPSPresencia(usuario.id, usuario.nombre).catch(() => {});
    }
  },
  setClientesDelDia: (clientes) => set({ clientesDelDia: clientes }),
  setUltimaPosicion: (c) => set({ ultimaPosicion: c }),
  setFotoPendienteUri: (uri) => set({ fotoPendienteUri: uri }),
  setEntregaTimerSegundos: (n) => set({ entregaTimerSegundos: n }),
  iniciarViajeACliente: (index) => {
    const epoch = Date.now();
    const { clientesDelDia, jornadaId } = get();
    const cliente = clientesDelDia[index];
    // Atomic update: mark new client as en_camino, clear any previous en_camino (bug: multiple simultaneous)
    set((s) => ({
      clienteActualIndex: index,
      viajeIniciadoEpoch: epoch,
      clientesDelDia: s.clientesDelDia.map((c, idx) => {
        if (idx === index) return { ...c, estado: 'en_camino' as const };
        if (c.estado === 'en_camino') return { ...c, estado: 'pendiente' as const };
        return c;
      }),
    }));
    if (cliente) {
      // Registrar hora_llegada en el backend aquí (no en useFocusEffect) para evitar
      // que el efecto se re-dispare cuando siguienteCliente() cambia clienteActualIndex
      void actualizarEstadoAsignacion(cliente.id, 'en_camino', {
        horaLlegadaMs: epoch,
        jornadaId: jornadaId ?? undefined,
      }).catch(() => {});
    }
    // viaje_asig_id identifica qué cliente estaba siendo visitado — más preciso que el índice
    void AsyncStorage.multiSet([
      ['viaje_epoch', String(epoch)],
      ['viaje_index', String(index)],
      ['viaje_asig_id', cliente?.id ?? ''],
    ]);
    void cachearClientesDelDia(get().clientesDelDia);
  },

  iniciarJornada: async () => {
    const { usuario } = get();
    if (!usuario?.id) {
      Alert.alert('Turno', 'No hay usuario logueado.');
      return;
    }
    const jornadaId = `jor-${Date.now()}`;
    let clientes: Cliente[] = [];
    try {
      const clientesAsignados = await cargarClientesDesdeAsignaciones(usuario);
      if (clientesAsignados.length > 0) {
        clientes = optimizarRuta(clientesAsignados);
      }
    } catch (err) {
      Alert.alert(
        'Error de conexión',
        'No se pudo conectar al servidor. Verificá tu conexión e intentá de nuevo.'
      );
      return;
    }
    if (clientes.length === 0) {
      Alert.alert(
        'Sin clientes asignados',
        'El administrador no aplicó tu ruta para hoy. Pedile que lo haga desde la pantalla de Asignaciones.'
      );
      return;
    }
    const jornadaInicioEpoch = Date.now();
    set({
      jornadaActiva: true,
      gpsActivo: true,
      jornadaId,
      jornadaInicioEpoch,
      clientesDelDia: clientes,
      clienteActualIndex: 0,
      fotoPendienteUri: null,
      entregaTimerSegundos: 0,
    });
    // Persistir para recuperar el turno si el OS mata la app con la pantalla apagada
    void AsyncStorage.multiSet([
      ['jornada_activa_id', jornadaId],
      ['jornada_inicio_epoch', String(jornadaInicioEpoch)],
      [ROUTE_ORDER_KEY, JSON.stringify(clientes.map((c) => c.id))],
    ]);
    void cachearClientesDelDia(clientes);
    if (usuario?.id) {
      await iniciarGPS(jornadaId, usuario.id, usuario.nombre).catch((err) => {
        const msg = err instanceof Error ? err.message : 'No se pudo iniciar el GPS.';
        Alert.alert(
          'GPS no disponible',
          `${msg}\n\nEl recorrido no se va a registrar. Para habilitarlo, andá a Ajustes del teléfono → Permisos → Ubicación → Siempre.`
        );
      });
    }
  },

  pausarJornada: async () => {
    set({ gpsActivo: false });
    // Revertir a presencia en lugar de detener completamente: el admin sigue viendo la posición
    await detenerGPS(true).catch((err) => console.warn('detenerGPS:', err));
  },

  cerrarJornada: async () => {
    const { usuario, clientesDelDia, jornadaInicioEpoch, jornadaActiva, jornadaId } = get();

    // Calcular stats antes de resetear el estado
    let payload: Parameters<typeof registrarCierreJornadaApi>[0] | null = null;
    if (jornadaActiva && jornadaInicioEpoch && jornadaId && usuario?.id) {
      const completados = clientesDelDia.filter((c) => c.estado === 'entregado').length;
      const minutos = Math.max(1, Math.round((Date.now() - jornadaInicioEpoch) / 60000));
      const fechaIso = new Date().toISOString();
      useHistorialStore.getState().registrarCierre({
        fechaIso,
        repartidorNombre: usuario.nombre,
        completados,
        total: clientesDelDia.length,
        minutosEnRuta: minutos,
      });
      payload = {
        jornadaId,
        repartidorId: usuario.id,
        repartidorNombre: usuario.nombre,
        completados,
        total: clientesDelDia.length,
        minutosEnRuta: minutos,
        fechaIso,
      };
    }

    // Resetear estado inmediatamente para buena UX (pantalla vuelve a inicio rápido)
    set({
      jornadaActiva: false,
      gpsActivo: false,
      jornadaId: null,
      jornadaInicioEpoch: null,
      clienteActualIndex: 0,
      clientesDelDia: [],
      fotoPendienteUri: null,
      entregaTimerSegundos: 0,
      viajeIniciadoEpoch: null,
    });
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index', 'viaje_asig_id', 'jornada_activa_id', 'jornada_inicio_epoch', ROUTE_ORDER_KEY, CLIENTES_CACHE_KEY]);
    // Revertir a presencia: el admin sigue viendo al repartidor aunque terminó el turno
    await detenerGPS(true).catch((err) => console.warn('detenerGPS:', err));

    // Reintentar sincronizaciones que quedaron pendientes sin red durante el turno
    await reintentarSincronizaciones().catch(() => {});

    // Sincronizar con backend — cada llamada en su propio try-catch para que un fallo
    // en una no impida que las demás se ejecuten
    if (payload) {
      try {
        await registrarCierreJornadaApi(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo enviar el cierre al backend.';
        Alert.alert('Cierre no sincronizado', `${msg}\n\nEl turno se cerró en el dispositivo.`);
      }
      // Siempre asociar los pedidos de calle a la jornada, aunque el cierre haya fallado
      try {
        await cerrarTurnoPedidosCalle(payload.jornadaId, payload.repartidorId);
      } catch {
        // Silencioso — los pedidos se pueden reasociar manualmente si es necesario
      }
    }
  },

  resetSesion: () => {
    set({
      usuario: null,
      jornadaId: null,
      jornadaActiva: false,
      jornadaInicioEpoch: null,
      clientesDelDia: [],
      clienteActualIndex: 0,
      gpsActivo: false,
      ultimaPosicion: null,
      cargando: false,
      fotoPendienteUri: null,
      entregaTimerSegundos: 0,
    });
    void AsyncStorage.multiRemove(['jornada_activa_id', 'jornada_inicio_epoch', 'viaje_epoch', 'viaje_index', 'viaje_asig_id', ROUTE_ORDER_KEY, CLIENTES_CACHE_KEY]).catch(() => {});
    // Parada completa del GPS en logout
    void detenerGPS(false).catch((err) => console.warn('detenerGPS logout:', err));
  },

  restaurarJornada: async () => {
    const { usuario } = get();
    if (!usuario) return;
    const [[, jornadaActivaId], [, jornadaEpochStr], [, viajeEpochStr], [, viajeAsigId], [, routeOrderStr]] =
      await AsyncStorage.multiGet([
        'jornada_activa_id',
        'jornada_inicio_epoch',
        'viaje_epoch',
        'viaje_asig_id',
        ROUTE_ORDER_KEY,
      ]);
    if (!jornadaActivaId || !jornadaEpochStr) return;

    // Leer la cola offline para aplicar estados locales aunque aún no se haya reintentado
    let queuedEstados: Record<string, EstadoEntrega> = {};
    try {
      const queueStr = await AsyncStorage.getItem(SYNC_KEY);
      if (queueStr) {
        const lista = JSON.parse(queueStr) as PendienteSync[];
        for (const p of lista) queuedEstados[p.asigId] = p.estado;
      }
    } catch {
      // Silencioso
    }

    // Intentar sincronizar visitas que quedaron pendientes sin red
    void reintentarSincronizaciones();
    try {
      const asignaciones = await obtenerAsignaciones({ repartidorId: usuario.id });
      const todasOrdenadas = [...asignaciones].sort((a, b) => a.orden - b.orden);
      const activas = todasOrdenadas.filter((a) => a.estado === 'pendiente' || a.estado === 'en_camino');

      if (activas.length === 0 && Object.keys(queuedEstados).length === 0) {
        // Jornada ya finalizada (sin pendientes) pero nunca se llamó a cerrarJornada()
        // explícitamente (TERMINAR TURNO) — sin esto, el cierre se perdía para siempre
        // y el día no aparecía en el historial del admin. Registramos el cierre con los
        // datos que tengamos disponibles antes de limpiar, como red de seguridad.
        try {
          const cacheStr = await AsyncStorage.getItem(CLIENTES_CACHE_KEY);
          const clientesCache = cacheStr ? (JSON.parse(cacheStr) as Cliente[]) : [];
          if (clientesCache.length > 0) {
            const completados = clientesCache.filter((c) => c.estado === 'entregado').length;
            const minutos = Math.max(1, Math.round((Date.now() - Number(jornadaEpochStr)) / 60000));
            const fechaIso = new Date().toISOString();
            useHistorialStore.getState().registrarCierre({
              fechaIso,
              repartidorNombre: usuario.nombre,
              completados,
              total: clientesCache.length,
              minutosEnRuta: minutos,
            });
            await registrarCierreJornadaApi({
              jornadaId: jornadaActivaId,
              repartidorId: usuario.id,
              repartidorNombre: usuario.nombre,
              completados,
              total: clientesCache.length,
              minutosEnRuta: minutos,
              fechaIso,
            }).catch(() => {});
            await cerrarTurnoPedidosCalle(jornadaActivaId, usuario.id).catch(() => {});
          }
        } catch {
          // No bloquear la limpieza si esto falla
        }
        await AsyncStorage.multiRemove(['jornada_activa_id', 'jornada_inicio_epoch', 'viaje_epoch', 'viaje_index', 'viaje_asig_id', ROUTE_ORDER_KEY, CLIENTES_CACHE_KEY]);
        return;
      }

      // Incluir también las visitas ya completadas o con problema: si solo se
      // restauran las pendientes, una visita marcada justo antes de que la app
      // se reinicie (crash, Android matando el proceso, etc.) desaparece de la
      // lista del repartidor —aunque el backend ya la tenga como "entregado" y
      // el admin la vea—, dando la falsa impresión de que no se registró.
      // Preservar también el estado en_camino: el rep estaba yendo a ese cliente cuando murió la app.
      // Aplicar overrides de la cola offline: visitas que se marcaron sin red todavía no están en el backend.
      const clientesBase = todasOrdenadas.map((a, idx) => {
        const c = asignacionToCliente(a, idx);
        const override = queuedEstados[a.id];
        if (override) return { ...c, estado: override };
        if (a.estado === 'en_camino') return { ...c, estado: 'en_camino' as const };
        return c;
      });

      // Usar el orden guardado al inicio de la jornada en lugar de volver a ejecutar
      // optimizarRuta (que produce un orden diferente al incluir clientes ya completados)
      let clientes: Cliente[];
      if (routeOrderStr) {
        const savedOrder = JSON.parse(routeOrderStr) as string[];
        const byId = new Map(clientesBase.map((c) => [c.id, c]));
        const ordered = savedOrder.map((id) => byId.get(id)).filter((c): c is Cliente => c !== undefined);
        const inOrder = new Set(savedOrder);
        const extra = clientesBase.filter((c) => !inOrder.has(c.id));
        clientes = [...ordered, ...extra];
      } else {
        clientes = clientesBase; // fallback: orden del servidor
      }

      // Restaurar índice: priorizar viaje_asig_id (exacto), luego en_camino, luego primer pendiente
      let clienteActualIndex: number;
      if (viajeAsigId) {
        const byAsigId = clientes.findIndex((c) => c.id === viajeAsigId);
        clienteActualIndex =
          byAsigId >= 0
            ? byAsigId
            : Math.max(clientes.findIndex((c) => c.estado === 'pendiente' || c.estado === 'en_camino'), 0);
      } else {
        const enCaminoIdx = clientes.findIndex((c) => c.estado === 'en_camino');
        const primerPendienteIdx = clientes.findIndex((c) => c.estado === 'pendiente');
        clienteActualIndex = enCaminoIdx >= 0 ? enCaminoIdx : Math.max(primerPendienteIdx, 0);
      }

      let viajeIniciadoEpoch: number | null = null;
      const clienteActual = clientes[clienteActualIndex];
      if (viajeAsigId || clienteActual?.estado === 'en_camino') {
        const targetId = viajeAsigId ?? clienteActual?.id;
        const asigEnCamino = activas.find((a) => a.id === targetId);
        // Preferir el epoch guardado (momento exacto en que salió); fallback: hora_llegada del backend
        viajeIniciadoEpoch = viajeEpochStr
          ? Number(viajeEpochStr)
          : (asigEnCamino?.horaLlegadaMs ?? null);
      }

      await AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index', 'viaje_asig_id']);
      set({
        jornadaActiva: true,
        gpsActivo: true,
        jornadaId: jornadaActivaId,
        jornadaInicioEpoch: Number(jornadaEpochStr),
        clientesDelDia: clientes,
        clienteActualIndex,
        viajeIniciadoEpoch,
      });
      void cachearClientesDelDia(clientes);
    } catch {
      // Sin conexión justo en el momento de restaurar (típico: recarga de la
      // pestaña en medio de la ruta, con señal intermitente). En vez de
      // rendirse y mostrar "Turno no iniciado", usamos el último snapshot
      // local de clientesDelDia para no perder la jornada en curso.
      try {
        const cacheStr = await AsyncStorage.getItem(CLIENTES_CACHE_KEY);
        if (!cacheStr) return;
        const clientesCache = JSON.parse(cacheStr) as Cliente[];
        if (!clientesCache.length) return;
        const clientes = clientesCache.map((c) => {
          const override = queuedEstados[c.id];
          return override ? { ...c, estado: override } : c;
        });

        let clienteActualIndex: number;
        if (viajeAsigId) {
          const byAsigId = clientes.findIndex((c) => c.id === viajeAsigId);
          clienteActualIndex =
            byAsigId >= 0
              ? byAsigId
              : Math.max(clientes.findIndex((c) => c.estado === 'pendiente' || c.estado === 'en_camino'), 0);
        } else {
          const enCaminoIdx = clientes.findIndex((c) => c.estado === 'en_camino');
          const primerPendienteIdx = clientes.findIndex((c) => c.estado === 'pendiente');
          clienteActualIndex = enCaminoIdx >= 0 ? enCaminoIdx : Math.max(primerPendienteIdx, 0);
        }

        let viajeIniciadoEpoch: number | null = null;
        const clienteActual = clientes[clienteActualIndex];
        if (viajeAsigId || clienteActual?.estado === 'en_camino') {
          viajeIniciadoEpoch = viajeEpochStr ? Number(viajeEpochStr) : null;
        }

        set({
          jornadaActiva: true,
          gpsActivo: true,
          jornadaId: jornadaActivaId,
          jornadaInicioEpoch: Number(jornadaEpochStr),
          clientesDelDia: clientes,
          clienteActualIndex,
          viajeIniciadoEpoch,
        });
      } catch {
        // Sin cache tampoco — el rep verá el botón INICIAR TURNO normalmente.
        // No limpiar las claves para reintentar en el próximo arranque.
      }
    }
  },

  siguienteCliente: () => {
    const { clienteActualIndex, clientesDelDia } = get();
    const next = Math.min(clienteActualIndex + 1, Math.max(clientesDelDia.length - 1, 0));
    set({ clienteActualIndex: next });
  },

  irAlPrimerPendiente: () => {
    const { clientesDelDia } = get();
    const idx = clientesDelDia.findIndex(
      (c) => c.estado === 'pendiente' || c.estado === 'en_camino'
    );
    if (idx >= 0) set({ clienteActualIndex: idx });
  },

  actualizarCliente: (id, patch) => {
    set((s) => ({
      clientesDelDia: s.clientesDelDia.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    void cachearClientesDelDia(get().clientesDelDia);
  },

  marcarClienteEstado: (id, estado) => {
    get().actualizarCliente(id, { estado });
  },

  // id del cliente === id de la asignación (ver asignacionToCliente)
  completarVisitaActual: (opts) => {
    const {
      clienteActualIndex,
      clientesDelDia,
      fotoPendienteUri,
      entregaTimerSegundos,
      jornadaId,
    } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    const horaSalidaMs = Date.now();
    get().actualizarCliente(c.id, {
      estado: 'entregado',
      fotoEntregaUri: fotoPendienteUri ?? c.fotoEntregaUri,
      tiempoParadaSegundos: entregaTimerSegundos,
      notasRepartidor: opts?.notasRepartidor,
      firmaBase64: opts?.firmaBase64,
    });
    void actualizarEstadoAsignacion(c.id, 'entregado', {
      notasRepartidor: opts?.notasRepartidor,
      horaSalidaMs,
      jornadaId: jornadaId ?? undefined,
    }).catch(async () => {
      // Sin red: encolar silenciosamente para reintentar cuando haya conexión
      await encolarSincronizacion({
        asigId: c.id,
        estado: 'entregado',
        horaSalidaMs,
        jornadaId: jornadaId ?? undefined,
        notasRepartidor: opts?.notasRepartidor,
      });
    });
    set({ fotoPendienteUri: null, viajeIniciadoEpoch: null });
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index', 'viaje_asig_id']);
    get().siguienteCliente();
  },

  reportarProblemaActual: (nota) => {
    const { clienteActualIndex, clientesDelDia, jornadaId } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    set({ viajeIniciadoEpoch: null });
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index', 'viaje_asig_id']);
    get().actualizarCliente(c.id, { estado: 'problema', notasRepartidor: nota });
    void actualizarEstadoAsignacion(c.id, 'problema', {
      notasRepartidor: nota,
      jornadaId: jornadaId ?? undefined,
    }).catch(async () => {
      await encolarSincronizacion({
        asigId: c.id,
        estado: 'problema',
        jornadaId: jornadaId ?? undefined,
        notasRepartidor: nota,
      });
    });
    get().siguienteCliente();
  },
}));
