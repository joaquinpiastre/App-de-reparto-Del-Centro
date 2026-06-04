import AsyncStorage from '@react-native-async-storage/async-storage';
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
    set({ clienteActualIndex: index, viajeIniciadoEpoch: epoch });
    void AsyncStorage.setItem('viaje_epoch', String(epoch));
    void AsyncStorage.setItem('viaje_index', String(index));
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
    ]);
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
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index', 'jornada_activa_id', 'jornada_inicio_epoch']);
    // Revertir a presencia: el admin sigue viendo al repartidor aunque terminó el turno
    await detenerGPS(true).catch((err) => console.warn('detenerGPS:', err));

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
    void AsyncStorage.multiRemove(['jornada_activa_id', 'jornada_inicio_epoch']).catch(() => {});
    // Parada completa del GPS en logout
    void detenerGPS(false).catch((err) => console.warn('detenerGPS logout:', err));
  },

  restaurarJornada: async () => {
    const { usuario } = get();
    if (!usuario) return;
    const [[, jornadaActivaId], [, jornadaEpochStr]] = await AsyncStorage.multiGet([
      'jornada_activa_id',
      'jornada_inicio_epoch',
    ]);
    if (!jornadaActivaId || !jornadaEpochStr) return;
    try {
      // Recargar solo los clientes que aún no fueron visitados
      const clientes = await cargarClientesDesdeAsignaciones(usuario);
      const optimizados = clientes.length > 0 ? optimizarRuta(clientes) : [];
      // Limpiar datos de viaje porque el índice ya no aplica a la nueva lista
      await AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index']);
      set({
        jornadaActiva: true,
        gpsActivo: true,
        jornadaId: jornadaActivaId,
        jornadaInicioEpoch: Number(jornadaEpochStr),
        clientesDelDia: optimizados,
        clienteActualIndex: 0,
        viajeIniciadoEpoch: null,
      });
    } catch {
      // Sin conexión — el repartidor verá el botón INICIAR TURNO normalmente.
      // No limpiar las claves de AsyncStorage para reintentar en el próximo arranque.
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
    set({ fotoPendienteUri: null, viajeIniciadoEpoch: null });
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index']);
    get().siguienteCliente();
  },

  reportarProblemaActual: (nota) => {
    const { clienteActualIndex, clientesDelDia, jornadaId } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    set({ viajeIniciadoEpoch: null });
    void AsyncStorage.multiRemove(['viaje_epoch', 'viaje_index']);
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
