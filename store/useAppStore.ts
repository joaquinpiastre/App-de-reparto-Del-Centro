import { create } from 'zustand';
import { Alert } from 'react-native';

import { optimizarRuta } from '@/hooks/useRuta';
import { obtenerPedidosAdmin } from '@/services/adminPedidos';
import { registrarCierreJornadaApi, registrarEntregaApi } from '@/services/entregasApi';
import { detenerGPS, iniciarGPS } from '@/services/gps';
import type { Cliente, Coordenadas, EstadoEntrega, PedidoAdmin, Usuario } from '@/types';

import { useHistorialStore } from './useHistorialStore';

const BASE_COORDENADAS = { lat: -34.6177, lng: -68.3301 };

function hashToOffset(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ((hash % 1000) - 500) / 100000;
}

function pedidoToCliente(p: PedidoAdmin, index: number): Cliente {
  const direccion = p.calles.join(', ').trim() || 'Dirección no informada';
  const primerItem = p.items[0];
  return {
    id: p.id,
    nombre: p.titulo || `Pedido ${index + 1}`,
    direccion,
    telefono: '-',
    pedido: primerItem
      ? `${primerItem.cantidad} x ${primerItem.descripcion}`
      : `Pedido #${index + 1}`,
    coordenadas: {
      lat: BASE_COORDENADAS.lat + hashToOffset(`${p.id}-lat`),
      lng: BASE_COORDENADAS.lng + hashToOffset(`${p.id}-lng`),
    },
    estado: p.estado === 'entregado' ? 'entregado' : p.estado === 'cancelado' ? 'problema' : 'pendiente',
    orden: index + 1,
    estimadoMin: 10,
  };
}

async function cargarClientesDesdePedidosAdmin(usuario: Usuario | null): Promise<Cliente[]> {
  if (!usuario?.id) return [];
  const pedidos = await obtenerPedidosAdmin();
  const activos = pedidos
    .filter(
      (p) =>
        p.repartidorId === usuario.id &&
        (p.estado === 'pendiente' || p.estado === 'asignado' || p.estado === 'en_ruta')
    )
    .sort((a, b) => a.creadoEn - b.creadoEn);
  return activos.map(pedidoToCliente);
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
  completarEntregaActual: (opts: { firmaBase64: string; tiempoParadaSegundos?: number }) => void;
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
  setUsuario: (usuario) => set({ usuario }),
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
      const clientesAdmin = await cargarClientesDesdePedidosAdmin(usuario);
      if (clientesAdmin.length > 0) {
        clientes = optimizarRuta(clientesAdmin);
      }
    } catch (err) {
      console.warn('cargarClientesDesdePedidosAdmin:', err);
    }
    if (clientes.length === 0) {
      Alert.alert('Sin rutas asignadas', 'No tenés pedidos activos asignados por el administrador.');
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
    await detenerGPS().catch((err) => console.warn('detenerGPS:', err));
  },
  cerrarJornada: async () => {
    const { usuario, clientesDelDia, jornadaInicioEpoch, jornadaActiva, jornadaId } = get();
    if (jornadaActiva && jornadaInicioEpoch) {
      const completados = clientesDelDia.filter((c) => c.estado === 'entregado').length;
      const minutos = Math.max(1, Math.round((Date.now() - jornadaInicioEpoch) / 60000));
      const fechaIso = new Date().toISOString();
      useHistorialStore.getState().registrarCierre({
        fechaIso,
        repartidorNombre: usuario?.nombre ?? 'Repartidor',
        completados,
        total: clientesDelDia.length,
        minutosEnRuta: minutos,
      });
      if (jornadaId && usuario?.id) {
        void registrarCierreJornadaApi({
          jornadaId,
          repartidorId: usuario.id,
          repartidorNombre: usuario.nombre,
          completados,
          total: clientesDelDia.length,
          minutosEnRuta: minutos,
          fechaIso,
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : 'No se pudo enviar el cierre al backend.';
          Alert.alert('Cierre no sincronizado', msg);
        });
      }
    }
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
    await detenerGPS().catch((err) => console.warn('detenerGPS:', err));
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
  },
  siguienteCliente: () => {
    const { clienteActualIndex, clientesDelDia } = get();
    const next = Math.min(clienteActualIndex + 1, Math.max(clientesDelDia.length - 1, 0));
    set({ clienteActualIndex: next });
  },
  irAlPrimerPendiente: () => {
    const { clientesDelDia } = get();
    const idx = clientesDelDia.findIndex((c) => c.estado === 'pendiente' || c.estado === 'en_camino');
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
  completarEntregaActual: ({ firmaBase64, tiempoParadaSegundos }) => {
    const {
      clienteActualIndex,
      clientesDelDia,
      fotoPendienteUri,
      entregaTimerSegundos,
      jornadaId,
      usuario,
    } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    const tiempo = tiempoParadaSegundos ?? entregaTimerSegundos;
    get().actualizarCliente(c.id, {
      estado: 'entregado',
      firmaBase64,
      fotoEntregaUri: fotoPendienteUri ?? c.fotoEntregaUri,
      tiempoParadaSegundos: tiempo,
    });
    if (jornadaId && usuario?.id) {
      void registrarEntregaApi({
        jornadaId,
        repartidorId: usuario.id,
        clienteId: c.id,
        estado: 'entregado',
        horaEntrega: Date.now(),
        tiempoParadaSegundos: tiempo,
        firmaBase64,
        fotoUrl: fotoPendienteUri ?? undefined,
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : 'No se pudo enviar la entrega al backend.';
        Alert.alert('Entrega no sincronizada', msg);
      });
    }
    set({ fotoPendienteUri: null });
    get().siguienteCliente();
  },
  reportarProblemaActual: (nota) => {
    const { clienteActualIndex, clientesDelDia, jornadaId, usuario } = get();
    const c = clientesDelDia[clienteActualIndex];
    if (!c) return;
    get().actualizarCliente(c.id, {
      estado: 'problema',
      notasRepartidor: nota,
    });
    if (jornadaId && usuario?.id) {
      void registrarEntregaApi({
        jornadaId,
        repartidorId: usuario.id,
        clienteId: c.id,
        estado: 'problema',
        horaEntrega: Date.now(),
        notasRepartidor: nota,
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : 'No se pudo enviar la incidencia al backend.';
        Alert.alert('Incidencia no sincronizada', msg);
      });
    }
    get().siguienteCliente();
  },
}));
