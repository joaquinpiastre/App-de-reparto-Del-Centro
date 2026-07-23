import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Print from 'expo-print';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { fechaHoyArgentina, formatFechaHora, formatHora } from '@/lib/fechaHora';
import {
  crearAsignacionesBulk,
  eliminarAsignacion,
  obtenerAsignaciones,
  obtenerClientesCatalogo,
  reordenarAsignaciones,
} from '@/services/asignaciones';
import { obtenerRepartidoresDisponibles } from '@/services/adminPedidos';
import {
  obtenerRutaFija,
  guardarRutaFija,
  generarAsignacionesDesdeRutaFija,
  aplicarTodasLasRutasFijasManual,
  type ClienteRutaFija,
} from '@/services/rutasFijas';
import {
  aplicarListaCategoria,
  type CategoriaLista,
} from '@/services/listasCategorias';
import type { Asignacion, ClienteCatalogo, Usuario } from '@/types';

const hoy = () => fechaHoyArgentina();
const formatFecha = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generarHTMLHojaDelDia(
  fechaIso: string,
  porRepartidor: Array<{ repartidorNombre: string; asignaciones: Asignacion[] }>
): string {
  const secciones = porRepartidor
    .map(({ repartidorNombre, asignaciones: lista }) => {
      const filas = lista
        .map(
          (a, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(a.cliente.nombre)}</td>
          <td>${a.cliente.tipo === 'taller' ? 'Taller' : 'Cliente'}</td>
          <td>${escapeHtml(a.cliente.direccion)}</td>
          <td>${escapeHtml(a.cliente.telefono ?? '')}</td>
          <td>${escapeHtml(a.notasAdmin ?? a.cliente.pedido ?? '')}</td>
        </tr>`
        )
        .join('');
      return `
      <h2>${escapeHtml(repartidorNombre)} <span class="cant">(${lista.length})</span></h2>
      <table>
        <thead>
          <tr><th>#</th><th>Cliente / Taller</th><th>Tipo</th><th>Dirección</th><th>Teléfono</th><th>Pedido / nota</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
    })
    .join('<div class="sep"></div>');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #2a2a2a; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; color: #1b5e20; }
  .cant { color: #888; font-weight: normal; }
  .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; }
  th { background: #f0f0f0; }
  .sep { border-top: 1px dashed #ccc; margin: 14px 0; }
  footer { margin-top: 16px; font-size: 10px; color: #999; }
</style>
</head>
<body>
  <h1>Hoja de reparto del día — ${formatFecha(fechaIso)}</h1>
  <div class="sub">Impreso ${formatFechaHora(Date.now())}</div>
  ${secciones || '<p>Sin asignaciones para este día.</p>'}
  <footer>Del Centro Pinturerías</footer>
</body>
</html>`;
}

async function imprimirHojaDelDia(html: string) {
  try {
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
    } else {
      await Print.printAsync({ html });
    }
  } catch {
    Alert.alert('Error', 'No se pudo generar la hoja del día.');
  }
}

// ─── DragHandle ────────────────────────────────────────────────────────────────
interface DragHandleProps {
  itemId: string;
  fromIndex: number;
  onStart: (id: string, fromIndex: number) => void;
  onMove: (absY: number) => void;
  onEnd: () => void;
  onCancel: () => void;
}

function DragHandle({ itemId, fromIndex, onStart, onMove, onEnd, onCancel }: DragHandleProps) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onStart(() => {
          onStart(itemId, fromIndex);
        })
        .onUpdate((e) => {
          onMove(e.absoluteY);
        })
        .onEnd(() => {
          onEnd();
        })
        .onFinalize(() => {
          onCancel(); // limpia estado visual si fue cancelado (idempotente)
        }),
    [itemId, fromIndex, onStart, onMove, onEnd, onCancel]
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.dragHandle}>
        <MaterialIcons name="drag-handle" size={22} color="#c0c8d0" />
      </View>
    </GestureDetector>
  );
}

// ─── Asignaciones ──────────────────────────────────────────────────────────────
export default function Asignaciones() {
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [repSeleccionado, setRepSeleccionado] = useState<Usuario | null>(null);
  const [fecha, setFecha] = useState(hoy());
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [catalogo, setCatalogo] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aplicandoTodas, setAplicandoTodas] = useState(false);
  const [imprimiendoHoja, setImprimiendoHoja] = useState(false);

  // Ruta fija
  const [rutaFija, setRutaFija] = useState<ClienteRutaFija[]>([]);
  const [modalRutaFijaVisible, setModalRutaFijaVisible] = useState(false);
  const [seleccionadosRutaFija, setSeleccionadosRutaFija] = useState<Set<string>>(new Set());
  const [busquedaRutaFija, setBusquedaRutaFija] = useState('');
  const [guardandoRutaFija, setGuardandoRutaFija] = useState(false);
  const [generando, setGenerando] = useState(false);

  // Aplicar lista de categoría
  const [modalListaCatVisible, setModalListaCatVisible] = useState(false);
  const [aplicandoListaCat, setAplicandoListaCat] = useState(false);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const [localOrder, setLocalOrder] = useState<Asignacion[]>([]);
  const [dragging, setDragging] = useState<{ id: string; fromIndex: number } | null>(null);
  const [insertIndex, setInsertIndex] = useState(-1);

  // IDs de clientes que ya estaban asignados cuando se abrió el modal (para calcular diff al guardar)
  const clientesAsignadosRef = useRef<Set<string>>(new Set());

  // Refs estables para los gesture callbacks (evitan closures viejas)
  const localOrderRef = useRef<Asignacion[]>([]);
  const listContainerRef = useRef<View>(null);
  const listContainerY = useRef(0);
  const itemYsRef = useRef<Record<string, number>>({});
  const itemHsRef = useRef<Record<string, number>>({});
  const draggingIdRef = useRef<string | null>(null);
  const insertIndexRef = useRef(-1);
  const isDraggingRef = useRef(false);

  // Sincronizar localOrder con asignaciones (solo cuando no hay drag activo)
  useEffect(() => {
    if (!isDraggingRef.current) {
      const sorted = [...asignaciones].sort((a, b) => a.orden - b.orden);
      setLocalOrder(sorted);
      localOrderRef.current = sorted;
    }
  }, [asignaciones]);

  // ── Drag callbacks ─────────────────────────────────────────────────────────
  const onDragStart = useCallback((id: string, fromIndex: number) => {
    isDraggingRef.current = true;
    draggingIdRef.current = id;
    insertIndexRef.current = fromIndex;
    setDragging({ id, fromIndex });
    setInsertIndex(fromIndex);
    listContainerRef.current?.measure((_x, _y, _w, _h, _px, py) => {
      listContainerY.current = py;
    });
  }, []);

  const onDragMove = useCallback((absoluteY: number) => {
    const order = localOrderRef.current;
    const relY = absoluteY - listContainerY.current;
    let newIndex = order.length; // default: al final
    for (let i = 0; i < order.length; i++) {
      const y = itemYsRef.current[order[i].id] ?? 0;
      const h = itemHsRef.current[order[i].id] ?? 60;
      if (relY < y + h / 2) {
        newIndex = i;
        break;
      }
    }
    if (newIndex !== insertIndexRef.current) {
      insertIndexRef.current = newIndex;
      setInsertIndex(newIndex);
    }
  }, []);

  const onDragEnd = useCallback(() => {
    const id = draggingIdRef.current;
    const toIndex = insertIndexRef.current;
    draggingIdRef.current = null;
    isDraggingRef.current = false;
    setDragging(null);
    setInsertIndex(-1);
    if (!id) return;

    setLocalOrder((prev) => {
      const fromIdx = prev.findIndex((x) => x.id === id);
      if (fromIdx < 0) return prev;
      // Ajustar toIndex: al sacar el elemento, los índices posteriores bajan 1
      const adjustedTo = fromIdx < toIndex ? toIndex - 1 : toIndex;
      if (adjustedTo === fromIdx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(Math.min(adjustedTo, arr.length), 0, item);
      localOrderRef.current = arr;
      const ordenes = arr.map((a, i) => ({ id: a.id, orden: i }));
      void reordenarAsignaciones(ordenes);
      return arr;
    });
  }, []);

  const onDragCancel = useCallback(() => {
    // Idempotente: si ya se limpió en onDragEnd, no hace nada
    if (!isDraggingRef.current && !draggingIdRef.current) return;
    draggingIdRef.current = null;
    isDraggingRef.current = false;
    setDragging(null);
    setInsertIndex(-1);
  }, []);

  // ── Carga de datos ─────────────────────────────────────────────────────────
  const visitasPorCliente = asignaciones.reduce<Record<string, number>>((acc, a) => {
    acc[a.clienteId] = (acc[a.clienteId] ?? 0) + 1;
    return acc;
  }, {});

  const cargarRutaFija = useCallback(async () => {
    if (!repSeleccionado) return;
    try {
      const ruta = await obtenerRutaFija(repSeleccionado.id);
      setRutaFija(ruta);
    } catch {
      setRutaFija([]);
    }
  }, [repSeleccionado]);

  const abrirModalRutaFija = async () => {
    setBusquedaRutaFija('');
    if (catalogo.length === 0) {
      try {
        const lista = await obtenerClientesCatalogo();
        setCatalogo(lista);
      } catch {
        Alert.alert('Error de conexión', 'No se pudo cargar el catálogo. Verificá tu conexión.');
        return;
      }
    }
    setSeleccionadosRutaFija(new Set(rutaFija.map((c) => c.id)));
    setModalRutaFijaVisible(true);
  };

  const confirmarRutaFija = async () => {
    if (!repSeleccionado) return;
    setGuardandoRutaFija(true);
    try {
      await guardarRutaFija(repSeleccionado.id, [...seleccionadosRutaFija]);
      setModalRutaFijaVisible(false);
      await cargarRutaFija();
    } catch (e) {
      console.warn('guardarRutaFija:', e);
    } finally {
      setGuardandoRutaFija(false);
    }
  };

  const aplicarRutaFija = async () => {
    if (!repSeleccionado) return;
    if (rutaFija.length === 0) {
      Alert.alert('Ruta fija', 'Este repartidor no tiene ruta fija configurada. Editala primero.');
      return;
    }
    setGenerando(true);
    try {
      const result = await generarAsignacionesDesdeRutaFija(repSeleccionado.id, fecha);
      await cargarAsignaciones();
      if (result.generados > 0) {
        Alert.alert('Ruta aplicada', `Se generaron ${result.generados} asignación(es).${result.omitidos > 0 ? ` (${result.omitidos} ya existían)` : ''}`);
      } else {
        Alert.alert('Sin cambios', 'Todas las visitas de la ruta fija ya estaban asignadas para este día.');
      }
    } catch (e) {
      Alert.alert('Error al aplicar', e instanceof Error ? e.message : 'No se pudo aplicar la ruta.');
    } finally {
      setGenerando(false);
    }
  };

  const aplicarListaCat = async (cat: CategoriaLista) => {
    if (!repSeleccionado) return;
    setAplicandoListaCat(true);
    try {
      const result = await aplicarListaCategoria(cat, repSeleccionado.id, fecha);
      setModalListaCatVisible(false);
      await cargarAsignaciones();
      Alert.alert(
        'Lista aplicada',
        result.generados > 0
          ? `${result.generados} asignación(es) generadas desde la lista ${cat}.${result.omitidos > 0 ? ` (${result.omitidos} ya existían)` : ''}`
          : `Todas las visitas de la lista ${cat} ya estaban asignadas para este día.`
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo aplicar la lista.');
    } finally {
      setAplicandoListaCat(false);
    }
  };

  /** Aplica las rutas fijas de TODOS los repartidores para hoy (mismo efecto que el cron de medianoche). */
  const aplicarTodasHoy = async () => {
    Alert.alert(
      '¿Aplicar rutas de hoy?',
      `Esto genera las asignaciones de HOY (${fecha}) para todos los repartidores con ruta fija configurada. Las que ya existen no se duplican.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          style: 'default',
          onPress: async () => {
            setAplicandoTodas(true);
            try {
              const res = await aplicarTodasLasRutasFijasManual(fecha);
              await cargarAsignaciones();
              Alert.alert(
                '✅ Rutas aplicadas',
                res.totalGenerados === 0
                  ? 'Todas las rutas fijas ya estaban aplicadas para hoy.'
                  : `${res.totalGenerados} asignación(es) generadas para ${res.repartidores} repartidor(es).`,
              );
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron aplicar las rutas.');
            } finally {
              setAplicandoTodas(false);
            }
          },
        },
      ]
    );
  };

  /** Genera e imprime la hoja del día: todos los clientes/talleres a visitar, agrupados por repartidor. */
  const imprimirHojaDia = async () => {
    setImprimiendoHoja(true);
    try {
      const todas = await obtenerAsignaciones({ fecha });
      const ordenadas = [...todas].sort((a, b) => a.orden - b.orden);
      const porRepartidorId = new Map<string, Asignacion[]>();
      for (const a of ordenadas) {
        const lista = porRepartidorId.get(a.repartidorId) ?? [];
        lista.push(a);
        porRepartidorId.set(a.repartidorId, lista);
      }
      if (porRepartidorId.size === 0) {
        Alert.alert('Sin asignaciones', `No hay clientes asignados para el ${formatFecha(fecha)}.`);
        return;
      }
      const porRepartidor = Array.from(porRepartidorId.entries()).map(([repartidorId, lista]) => ({
        repartidorNombre: repartidores.find((r) => r.id === repartidorId)?.nombre ?? repartidorId,
        asignaciones: lista,
      }));
      const html = generarHTMLHojaDelDia(fecha, porRepartidor);
      await imprimirHojaDelDia(html);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo generar la hoja del día.');
    } finally {
      setImprimiendoHoja(false);
    }
  };

  const cargarRepartidores = useCallback(async () => {
    try {
      const lista = await obtenerRepartidoresDisponibles();
      setRepartidores(lista);
      if (lista.length > 0 && !repSeleccionado) {
        setRepSeleccionado(lista[0]);
      }
    } catch (e) {
      console.warn('cargarRepartidores:', e);
    }
  }, [repSeleccionado]);

  const cargarAsignaciones = useCallback(async () => {
    if (!repSeleccionado) return;
    setCargando(true);
    try {
      const lista = await obtenerAsignaciones({ repartidorId: repSeleccionado.id, fecha });
      setAsignaciones(lista);
    } catch (e) {
      console.warn('cargarAsignaciones:', e);
    } finally {
      setCargando(false);
    }
  }, [repSeleccionado, fecha]);

  useEffect(() => {
    void cargarRepartidores();
  }, []);

  useEffect(() => {
    void cargarAsignaciones();
    void cargarRutaFija();
  }, [cargarAsignaciones, cargarRutaFija]);

  // Polling cada 5s — pausado durante drag activo
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      if (!isDraggingRef.current) void cargarAsignaciones();
    }, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [cargarAsignaciones]);

  const abrirModal = async () => {
    setBusqueda('');
    // Cargar catálogo si todavía no se cargó
    if (catalogo.length === 0) {
      try {
        const lista = await obtenerClientesCatalogo();
        setCatalogo(lista);
      } catch (e) {
        Alert.alert('Error de conexión', 'No se pudo cargar el catálogo de clientes. Verificá tu conexión e intentá de nuevo.');
        return;
      }
    }
    // Pre-seleccionar los clientes que ya están en la ruta de hoy
    const yaAsignados = new Set(asignaciones.map((a) => a.clienteId));
    clientesAsignadosRef.current = yaAsignados;
    setSeleccionados(new Set(yaAsignados));
    setModalVisible(true);
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmarAgregado = async () => {
    if (!repSeleccionado) return;
    setGuardando(true);
    try {
      const original = clientesAsignadosRef.current;

      // Clientes nuevos: estaban seleccionados pero no asignados antes
      const aAgregar = [...seleccionados].filter((id) => !original.has(id));

      // Clientes quitados: estaban asignados pero ahora desmarcados
      const aQuitar = [...original].filter((id) => !seleccionados.has(id));

      if (aAgregar.length > 0) {
        await crearAsignacionesBulk(repSeleccionado.id, aAgregar, fecha);
      }

      // Eliminar todas las asignaciones del día para los clientes desmarcados
      if (aQuitar.length > 0) {
        const eliminar = asignaciones.filter((a) => aQuitar.includes(a.clienteId));
        await Promise.all(eliminar.map((a) => eliminarAsignacion(a.id)));
      }

      setModalVisible(false);
      await cargarAsignaciones();
    } catch (e) {
      Alert.alert('Error al guardar', e instanceof Error ? e.message : 'No se pudieron guardar los cambios. Verificá tu conexión.');
    } finally {
      setGuardando(false);
    }
  };

  const quitarAsignacion = async (id: string) => {
    try {
      await eliminarAsignacion(id);
      setAsignaciones((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.warn('eliminarAsignacion:', e);
    }
  };

  const catalogoFiltrado = catalogo.filter((c) => {
    const q = busqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.direccion.toLowerCase().includes(q) ||
      c.tipo.toLowerCase().includes(q)
    );
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Screen title="Asignaciones" subtitle={`Clientes para el ${formatFecha(fecha)}`}>
      {/* Selector de repartidor */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Repartidor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {repartidores.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.chip, repSeleccionado?.id === r.id && styles.chipActivo]}
              onPress={() => setRepSeleccionado(r)}
            >
              <Text style={[styles.chipText, repSeleccionado?.id === r.id && styles.chipTextActivo]}>
                {r.nombre}
              </Text>
            </Pressable>
          ))}
          {repartidores.length === 0 && (
            <Text style={styles.empty}>Sin repartidores cargados.</Text>
          )}
        </ScrollView>
      </View>

      {/* Card ruta fija */}
      {repSeleccionado ? (
        <View style={styles.rutaFijaCard}>
          <View style={styles.rutaFijaRow}>
            <MaterialIcons name="repeat" size={18} color={COLORS.verdeOscuro} />
            <Text style={styles.rutaFijaTitle}>
              Ruta fija: {rutaFija.length > 0 ? `${rutaFija.length} cliente(s)` : 'Sin configurar'}
            </Text>
          </View>
          {rutaFija.length > 0 ? (
            <Text style={styles.rutaFijaDetalle} numberOfLines={2}>
              {rutaFija.map((c) => c.nombre).join(' · ')}
            </Text>
          ) : null}
          <View style={styles.rutaFijaBotones}>
            <View style={styles.rutaFijaBtn}>
              <Button
                label="Editar ruta fija"
                variant="secondary"
                onPress={() => void abrirModalRutaFija()}
                iconLeft={<MaterialIcons name="edit" size={14} color={COLORS.verdeOscuro} />}
              />
            </View>
            <View style={styles.rutaFijaBtn}>
              <Button
                label={generando ? 'Aplicando…' : 'Aplicar a este día'}
                variant="primary"
                loading={generando}
                onPress={() => void aplicarRutaFija()}
                iconLeft={<MaterialIcons name="play-arrow" size={14} color="#fff" />}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* Card: aplicar lista de categoría */}
      {repSeleccionado ? (
        <Pressable
          style={styles.listaCardBtn}
          onPress={() => setModalListaCatVisible(true)}
        >
          <MaterialIcons name="list-alt" size={18} color="#1565C0" />
          <View style={{ flex: 1 }}>
            <Text style={styles.listaCardTit}>Aplicar lista de categoría</Text>
            <Text style={styles.listaCardSub}>
              Asignar la lista A, B, C o D a {repSeleccionado.nombre} para el {formatFecha(fecha)}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#1565C0" />
        </Pressable>
      ) : null}

      {/* Modal selector de categoría */}
      <Modal visible={modalListaCatVisible} transparent animationType="fade">
        <View style={styles.modalListaCatOverlay}>
          <View style={styles.modalListaCatBox}>
            <Text style={styles.modalListaCatTit}>¿Qué lista aplicar?</Text>
            <Text style={styles.modalListaCatSub}>
              Se agregarán todos los clientes de esa lista a las asignaciones de{' '}
              <Text style={{ fontFamily: 'Poppins_700Bold' }}>{repSeleccionado?.nombre}</Text>
              {' '}para el {formatFecha(fecha)}.
            </Text>
            {(['A', 'B', 'C', 'D'] as CategoriaLista[]).map((cat) => {
              const colores: Record<CategoriaLista, string> = { A: '#2E7D32', B: '#1565C0', C: '#E65100', D: '#7B1FA2' };
              const bgs: Record<CategoriaLista, string> = { A: '#e8f5e9', B: '#e3f2fd', C: '#fff3e0', D: '#f3e5f5' };
              const labels: Record<CategoriaLista, string> = { A: 'Lista A · Lun/Mié', B: 'Lista B · Mar/Jue', C: 'Lista C · Vie', D: 'Lista D · Andrés' };
              return (
                <Pressable
                  key={cat}
                  style={[styles.modalListaCatOpcion, { backgroundColor: bgs[cat], borderColor: colores[cat] }]}
                  onPress={() => void aplicarListaCat(cat)}
                  disabled={aplicandoListaCat}
                >
                  <View style={[styles.modalListaCatLetra, { backgroundColor: colores[cat] }]}>
                    <Text style={styles.modalListaCatLetraTxt}>{cat}</Text>
                  </View>
                  <Text style={[styles.modalListaCatLabel, { color: colores[cat] }]}>{labels[cat]}</Text>
                  {aplicandoListaCat && <ActivityIndicator size="small" color={colores[cat]} />}
                </Pressable>
              );
            })}
            <Pressable
              style={styles.modalListaCatCancelar}
              onPress={() => setModalListaCatVisible(false)}
              disabled={aplicandoListaCat}
            >
              <Text style={styles.modalListaCatCancelarTxt}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Botón global: aplicar rutas fijas de TODOS los repartidores para hoy */}
      <View style={styles.aplicarTodasCard}>
        <View style={styles.aplicarTodasInfo}>
          <MaterialIcons name="update" size={20} color={COLORS.verdeOscuro} />
          <View style={{ flex: 1 }}>
            <Text style={styles.aplicarTodasTit}>Aplicar rutas fijas de hoy</Text>
            <Text style={styles.aplicarTodasSub}>
              El servidor lo hace automáticamente a las 00:00. Tocá si necesitás forzarlo ahora.
            </Text>
          </View>
        </View>
        <Button
          label={aplicandoTodas ? 'Aplicando…' : '⚡ Aplicar a todos'}
          variant="primary"
          loading={aplicandoTodas}
          onPress={() => void aplicarTodasHoy()}
        />
      </View>

      <Button
        label={imprimiendoHoja ? 'GENERANDO…' : `IMPRIMIR HOJA DEL DÍA (${formatFecha(fecha)})`}
        variant="secondary"
        loading={imprimiendoHoja}
        onPress={() => void imprimirHojaDia()}
        iconLeft={<MaterialIcons name="print" size={16} color={COLORS.verdeOscuro} />}
      />

      {/* Lista de asignaciones con drag-and-drop */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            Clientes asignados ({localOrder.length})
          </Text>
          <View style={styles.sectionHeaderRight}>
            {dragging && (
              <Text style={styles.draggingHint}>Arrastrando…</Text>
            )}
            {cargando && <ActivityIndicator size="small" color={COLORS.verdePrincipal} />}
          </View>
        </View>

        {!cargando && localOrder.length === 0 && (
          <View style={styles.emptyCard}>
            <MaterialIcons name="person-add-alt" size={36} color={COLORS.grisSecundario} />
            <Text style={styles.emptyText}>
              {repSeleccionado
                ? 'No hay clientes asignados para este día.\nUsá el botón de abajo para agregar.'
                : 'Seleccioná un repartidor.'}
            </Text>
          </View>
        )}

        {/* Contenedor del drag: onLayout mide su Y absoluta */}
        <View
          ref={listContainerRef}
          onLayout={() => {
            listContainerRef.current?.measure((_x, _y, _w, _h, _px, py) => {
              listContainerY.current = py;
            });
          }}
        >
          {localOrder.map((a, idx) => {
            const entregado = a.estado === 'entregado';
            const problema = a.estado === 'problema';
            const enCamino = a.estado === 'en_camino';
            const visitasDelCliente = localOrder.filter((x) => x.clienteId === a.clienteId).length;
            const numeroVisita = localOrder.filter((x, i) => x.clienteId === a.clienteId && i <= idx).length;
            const esDragging = dragging?.id === a.id;

            return (
              <View
                key={a.id}
                onLayout={(e) => {
                  itemYsRef.current[a.id] = e.nativeEvent.layout.y;
                  itemHsRef.current[a.id] = e.nativeEvent.layout.height;
                }}
              >
                {/* Línea de inserción encima de este ítem */}
                {dragging && insertIndex === idx && (
                  <View style={styles.insertLine} />
                )}

                <View
                  style={[
                    styles.asigCard,
                    entregado && styles.asigCardEntregado,
                    problema && styles.asigCardProblema,
                    esDragging && styles.asigCardDragging,
                  ]}
                >
                  {/* Handle de drag (solo en ítems no entregados) */}
                  {!entregado && (
                    <DragHandle
                      itemId={a.id}
                      fromIndex={idx}
                      onStart={onDragStart}
                      onMove={onDragMove}
                      onEnd={onDragEnd}
                      onCancel={onDragCancel}
                    />
                  )}

                  <View style={styles.asigLeft}>
                    <View
                      style={[
                        styles.asigNumWrap,
                        entregado && styles.asigNumEntregado,
                        problema && styles.asigNumProblema,
                      ]}
                    >
                      <Text style={[styles.asigNum, (entregado || problema) && { color: '#fff' }]}>
                        {idx + 1}
                      </Text>
                    </View>
                    <View style={styles.asigInfo}>
                      <View style={styles.asigRow}>
                        <Text style={styles.asigNombre}>{a.cliente.nombre}</Text>
                        {visitasDelCliente > 1 && (
                          <View style={styles.visitaBadge}>
                            <Text style={styles.visitaBadgeText}>Visita {numeroVisita}</Text>
                          </View>
                        )}
                        <View style={[styles.tipoBadge, a.cliente.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                          <Text style={styles.tipoText}>{a.cliente.tipo}</Text>
                        </View>
                      </View>
                      <Text style={styles.asigDir}>{a.cliente.direccion}</Text>
                      <View style={styles.asigRow}>
                        <View
                          style={[
                            styles.estadoBadge,
                            entregado && styles.estadoEntregado,
                            problema && styles.estadoProblema,
                            enCamino && styles.estadoEnCamino,
                          ]}
                        >
                          <Text style={[styles.estadoText, (entregado || problema || enCamino) && { color: '#fff' }]}>
                            {a.estado === 'pendiente' ? 'Pendiente' :
                             a.estado === 'en_camino' ? 'En camino' :
                             a.estado === 'entregado' ? '✓ Entregado' : 'Problema'}
                          </Text>
                        </View>
                        {a.horaLlegadaMs ? (
                          <Text style={styles.asigHora}>
                            {formatHora(a.horaLlegadaMs, { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>
                      {a.notasAdmin ? <Text style={styles.asigNota}>{a.notasAdmin}</Text> : null}
                      {a.notasRepartidor ? <Text style={styles.asigNotaRep}>"{a.notasRepartidor}"</Text> : null}
                    </View>
                  </View>

                  {!entregado ? (
                    <Pressable style={styles.removeBtn} onPress={() => void quitarAsignacion(a.id)}>
                      <MaterialIcons name="close" size={18} color={COLORS.error} />
                    </Pressable>
                  ) : (
                    <MaterialIcons name="check-circle" size={22} color={COLORS.verdePrincipal} />
                  )}
                </View>
              </View>
            );
          })}

          {/* Línea de inserción al final de la lista */}
          {dragging && insertIndex >= localOrder.length && (
            <View style={styles.insertLine} />
          )}
        </View>
      </View>

      {repSeleccionado && (
        <Button
          label="Editar clientes del día"
          onPress={() => void abrirModal()}
          iconLeft={<MaterialIcons name="edit" size={18} color="#fff" />}
        />
      )}

      {/* Modal editor de ruta fija */}
      <Modal
        visible={modalRutaFijaVisible}
        animationType="slide"
        onRequestClose={() => setModalRutaFijaVisible(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ruta fija — {repSeleccionado?.nombre}</Text>
            <Pressable onPress={() => setModalRutaFijaVisible(false)}>
              <MaterialIcons name="close" size={24} color={COLORS.grisTexto} />
            </Pressable>
          </View>
          <Text style={styles.rutaFijaModalSub}>
            Seleccioná los clientes que este repartidor visita siempre. Se guardan de forma permanente.
          </Text>

          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={20} color={COLORS.grisSecundario} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, dirección o tipo..."
              placeholderTextColor={COLORS.grisSecundario}
              value={busquedaRutaFija}
              onChangeText={setBusquedaRutaFija}
              autoFocus
            />
          </View>

          {seleccionadosRutaFija.size > 0 && (
            <Text style={styles.selCount}>{seleccionadosRutaFija.size} en la ruta fija</Text>
          )}

          <FlatList
            data={catalogo
              .filter((c) => {
                const q = busquedaRutaFija.toLowerCase();
                return (
                  c.nombre.toLowerCase().includes(q) ||
                  c.direccion.toLowerCase().includes(q) ||
                  c.tipo.toLowerCase().includes(q)
                );
              })
              // Los ya seleccionados (en la ruta) aparecen primero
              .sort((a, b) => {
                const aEnRuta = seleccionadosRutaFija.has(a.id) ? 0 : 1;
                const bEnRuta = seleccionadosRutaFija.has(b.id) ? 0 : 1;
                return aEnRuta - bEnRuta;
              })}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            renderItem={({ item }) => {
              const estaSeleccionado = seleccionadosRutaFija.has(item.id);
              return (
                <Pressable
                  style={[styles.catalogoCard, estaSeleccionado && styles.catalogoCardSel]}
                  onPress={() => {
                    setSeleccionadosRutaFija((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                  }}
                >
                  <View style={styles.catalogoInfo}>
                    <View style={styles.asigRow}>
                      <Text style={styles.catalogoNombre}>{item.nombre}</Text>
                      <View style={[styles.tipoBadge, item.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                        <Text style={styles.tipoText}>{item.tipo}</Text>
                      </View>
                    </View>
                    <Text style={styles.catalogoDir}>{item.direccion}</Text>
                  </View>
                  <MaterialIcons
                    name={estaSeleccionado ? 'check-circle' : 'radio-button-unchecked'}
                    size={24}
                    color={estaSeleccionado ? COLORS.verdeOscuro : '#ccc'}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No se encontraron clientes.</Text>}
          />

          <View style={styles.modalFooter}>
            <Button
              label={guardandoRutaFija ? 'Guardando...' : `Guardar ruta fija (${seleccionadosRutaFija.size})`}
              onPress={() => void confirmarRutaFija()}
              loading={guardandoRutaFija}
              variant="primary"
            />
          </View>
        </View>
      </Modal>

      {/* Modal editor de clientes del día */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Clientes del día — {repSeleccionado?.nombre}
            </Text>
            <Pressable onPress={() => setModalVisible(false)}>
              <MaterialIcons name="close" size={24} color={COLORS.grisTexto} />
            </Pressable>
          </View>
          <Text style={styles.rutaFijaModalSub}>
            Los marcados estarán en la ruta de hoy. Desmarcá para quitarlos.
          </Text>

          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={20} color={COLORS.grisSecundario} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, dirección o tipo..."
              placeholderTextColor={COLORS.grisSecundario}
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
          </View>

          <Text style={styles.selCount}>{seleccionados.size} en la ruta de hoy</Text>

          <FlatList
            data={catalogoFiltrado}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            renderItem={({ item }) => {
              const visitasActuales = visitasPorCliente[item.id] ?? 0;
              const estaSeleccionado = seleccionados.has(item.id);
              return (
                <Pressable
                  style={[styles.catalogoCard, estaSeleccionado && styles.catalogoCardSel]}
                  onPress={() => toggleSeleccion(item.id)}
                >
                  <View style={styles.catalogoInfo}>
                    <View style={styles.asigRow}>
                      <Text style={styles.catalogoNombre}>{item.nombre}</Text>
                      <View style={[styles.tipoBadge, item.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                        <Text style={styles.tipoText}>{item.tipo}</Text>
                      </View>
                    </View>
                    <Text style={styles.catalogoDir}>{item.direccion}</Text>
                    {visitasActuales > 0 && (
                      <Text style={styles.yaAsignadoText}>
                        {visitasActuales === 1 ? '1 visita asignada' : `${visitasActuales} visitas asignadas`} — podés agregar otra
                      </Text>
                    )}
                  </View>
                  <MaterialIcons
                    name={estaSeleccionado ? 'check-circle' : 'radio-button-unchecked'}
                    size={24}
                    color={estaSeleccionado ? COLORS.verdeOscuro : '#ccc'}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No se encontraron clientes.</Text>}
          />

          <View style={styles.modalFooter}>
            <Button
              label={guardando ? 'Guardando...' : `Guardar ruta del día (${seleccionados.size})`}
              onPress={() => void confirmarAgregado()}
              loading={guardando}
              variant="primary"
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  draggingHint: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdePrincipal,
  },

  // Chips de repartidores
  chips: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde3e8',
    marginRight: 8,
  },
  chipActivo: { backgroundColor: COLORS.verdeOscuro, borderColor: COLORS.verdeOscuro },
  chipText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto },
  chipTextActivo: { color: '#fff' },

  // Estado vacío
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e8ecef',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
  empty: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, padding: 12 },

  // Línea de inserción (drag indicator)
  insertLine: {
    height: 3,
    backgroundColor: COLORS.verdePrincipal,
    borderRadius: 2,
    marginVertical: 3,
  },

  // Tarjeta de asignación
  asigCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 6,
    marginBottom: 6,
  },
  asigCardEntregado: { borderColor: '#52c47a', backgroundColor: '#f6fff8' },
  asigCardProblema: { borderColor: '#e06a6a', backgroundColor: '#fff6f6' },
  asigCardDragging: {
    borderColor: COLORS.verdePrincipal,
    backgroundColor: '#f0fae8',
    opacity: 0.7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  // Drag handle
  dragHandle: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  asigLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  asigNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grisClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  asigNum: { fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisTexto },
  asigInfo: { flex: 1, gap: 2 },
  asigRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  asigNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  asigDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  asigNota: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: COLORS.acentoNaranja,
    fontStyle: 'italic',
  },
  asigNotaRep: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario, fontStyle: 'italic' },
  asigHora: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario },
  removeBtn: { padding: 6 },
  asigNumEntregado: { backgroundColor: COLORS.verdePrincipal },
  asigNumProblema: { backgroundColor: COLORS.error },
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  estadoEntregado: { backgroundColor: COLORS.verdePrincipal },
  estadoProblema: { backgroundColor: COLORS.error },
  estadoEnCamino: { backgroundColor: COLORS.acentoAzul },
  estadoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: COLORS.grisTexto },
  visitaBadge: { backgroundColor: '#e8f0fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  visitaBadgeText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: '#3b5bdb' },

  // Badges
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTaller: { backgroundColor: '#e8f4fd' },
  badgeCliente: { backgroundColor: '#edf7e6' },
  tipoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.grisTexto },

  // Modal
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecef',
  },
  modalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, color: COLORS.grisTexto },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3e8',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
  },
  selCount: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.verdeOscuro,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  modalList: { flex: 1 },
  catalogoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 10,
  },
  catalogoCardSel: { borderColor: COLORS.verdeOscuro, backgroundColor: '#f0fae8' },
  catalogoInfo: { flex: 1, gap: 3 },
  catalogoNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  catalogoDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  yaAsignadoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: COLORS.grisSecundario },
  modalFooter: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8ecef' },

  // Card global "aplicar rutas de hoy"
  aplicarTodasCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#b7e0a0',
    gap: 10,
  },
  aplicarTodasInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  aplicarTodasTit: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: COLORS.verdeOscuro,
  },
  aplicarTodasSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    lineHeight: 18,
    marginTop: 2,
  },

  // Ruta fija
  rutaFijaCard: {
    backgroundColor: '#f0fae8',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#b7e0a0',
    gap: 6,
  },
  rutaFijaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rutaFijaTitle: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.verdeOscuro },
  rutaFijaDetalle: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  rutaFijaBotones: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rutaFijaBtn: { flex: 1 },
  rutaFijaModalSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
    paddingHorizontal: 16,
    paddingVertical: 8,
    lineHeight: 20,
  },

  // Card "aplicar lista de categoría"
  listaCardBtn: {
    backgroundColor: '#e3f2fd',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#90caf9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listaCardTit: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: '#1565C0' },
  listaCardSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#1e88e5', marginTop: 2, lineHeight: 18 },

  // Modal selector de categoría
  modalListaCatOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalListaCatBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  modalListaCatTit: { fontFamily: 'Poppins_700Bold', fontSize: 18, color: COLORS.grisTexto },
  modalListaCatSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario, lineHeight: 20 },
  modalListaCatOpcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  modalListaCatLetra: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalListaCatLetraTxt: { fontFamily: 'Poppins_700Bold', fontSize: 20, color: '#fff' },
  modalListaCatLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, flex: 1 },
  modalListaCatCancelar: { padding: 14, alignItems: 'center' },
  modalListaCatCancelarTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: COLORS.grisSecundario },
});
