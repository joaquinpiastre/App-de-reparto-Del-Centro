import { create } from 'zustand';
import { Alert, Platform } from 'react-native';

import { optimizarRuta } from '@/hooks/useRuta';
import { actualizarEstadoAsignacion, obtenerAsignaciones } from '@/services/asignaciones';
import { registrarCierreJornadaApi } from '@/services/entregasApi';
import { detenerGPS, iniciarGPS, iniciarGPSPresencia } from '@/services/gps';
import { cerrarTurnoPedidosCalle } from '@/services/pedidosCalle';
import type { Asignacion, Cliente, Coordenadas, EstadoEntrega, Usuario } from '@/types';

import { useHistorialStore } from './useHistorialStore';

const BASE_COORDENADAS = { lat: -34.6177, lng: -68.3301 };

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
  setUsuario: (usuario: Usuario | null) => void;
  setClientesDelDia: (clientes: Cliente[]) => void;
  setUltimaPosicion: (c: Coordenadas | null) => void;
  setFotoPendienteUri: (uri: string | null) => void;
  setEntregaTimerSegundos: (n: number) => void;
  iniciarJornada: () => Promise<void>;
  pausarJornada: () => Promise<void>;
  cerrarJornada: () => Promise<void>;
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
    set({
      jornadaActiva: true,
      gpsActivo: true,
      jornadaId,
      jornadaInicioEpoch: Date.now(),
      clientesDelDia: clientes,
      clienteActualIndex: 0,
      fotoPendienteUri: null,
      entregaTimerSegundos: 0,
    });
    if (usuario?.id) {
      await iniciarGPS(jornadaId, usuario.id, usuario.nombre).catch((err) =>
        console.warn('iniciarGPS:', err)
      );
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
    });
    // Revertir a presencia: el admin sigue viendo al repartidor aunque terminó el turno
    await detenerGPS(true).catch((err) => console.warn('detenerGPS:', err));

    // Sincronizar con backend en segundo plano
    if (payload) {
      try {
        await registrarCierreJornadaApi(payload);
        await cerrarTurnoPedidosCalle(payload.jornadaId, payload.repartidorId).catch(() => {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo enviar el cierre al backend.';
        Alert.alert('Cierre no sincronizado', `${msg}\n\nEl turno se cerró en el dispositivo.`);
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
    // Parada completa del GPS en logout
    void detenerGPS(false).catch((err) => console.warn('detenerGPS logout:', err));
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
    get().actualizarCliente(c.id, {
      estado: 'entregado',
      fotoEntregaUri: fotoPendienteUri ?? c.fotoEntregaUri,
      tiempoParadaSegundos: entregaTimerSegundos,
      notasRepartidor: opts?.notasRepartidor,
      firmaBase64: opts?.firmaBase64,
    });
    void actualizarEstadoAsignacion(c.id, 'entregado', {
      notasRepartidor: opts?.notasRepartidor,
      horaSalidaMs: Date.now(),
      jornadaId: jornadaId ?? undefined,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar la visita.';
      Alert.alert('Visita no sincronizada', msg);
    });
    set({ fotoPendienteUri: null });
    get().siguienteCliente();
  },

  reportarProblemaActual: (nota) => {
    const { clienteActualIndex, clientesDelDia, jornadaId } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    get().actualizarCliente(c.id, { estado: 'problema', notasRepartidor: nota });
    void actualizarEstadoAsignacion(c.id, 'problema', {
      notasRepartidor: nota,
      jornadaId: jornadaId ?? undefined,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : 'No se pudo reportar el problema.';
      Alert.alert('Incidencia no sincronizada', msg);
    });
    get().siguienteCliente();
  },
}));
