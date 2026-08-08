import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import {
  obtenerListas,
  crearLista,
  editarLista,
  eliminarLista,
  obtenerClientesDeLista,
  guardarOrdenLista,
  agregarClienteALista,
  quitarClienteDeLista,
  asignarRepartidorALista,
  quitarAsignacionDeLista,
  DIAS_SEMANA_LABEL,
  DIAS_SEMANA_CORTO,
  type Lista,
  type ClienteLista,
} from '@/services/listas';
import { apiRequest } from '@/services/apiClient';

// ─── Paleta de colores por lista (ciclo estable por índice) ───────────────────
const PALETA = [
  { color: '#2E7D32', bg: '#e8f5e9', border: '#a5d6a7' },
  { color: '#1565C0', bg: '#e3f2fd', border: '#90caf9' },
  { color: '#E65100', bg: '#fff3e0', border: '#ffcc80' },
  { color: '#7B1FA2', bg: '#f3e5f5', border: '#ce93d8' },
  { color: '#AD1457', bg: '#fce4ec', border: '#f48fb1' },
  { color: '#00695C', bg: '#e0f2f1', border: '#80cbc4' },
  { color: '#4E342E', bg: '#efebe9', border: '#bcaaa4' },
];
function colorDeLista(idx: number) {
  return PALETA[idx % PALETA.length];
}

const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lun..dom para mostrar el picker en orden natural

function resumenDias(dias: number[]): string {
  if (dias.length === 0) return 'Sin día asignado';
  return DIAS_ORDEN.filter((d) => dias.includes(d)).map((d) => DIAS_SEMANA_CORTO[d]).join(' / ');
}

// ─── DragHandle ──────────────────────────────────────────────────────────────
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
        .onStart(() => { onStart(itemId, fromIndex); })
        .onUpdate((e) => { onMove(e.absoluteY); })
        .onEnd(() => { onEnd(); })
        .onFinalize(() => { onCancel(); }),
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

// ─── Lista arrastrable de clientes ────────────────────────────────────────────
interface ListaClientesProps {
  listaId: string;
  color: string;
  clientes: ClienteLista[];
  onReordered: (nuevaLista: ClienteLista[]) => void;
  onQuitar: (clienteId: string, nombre: string) => void;
}

function ListaClientes({ listaId, color, clientes, onReordered, onQuitar }: ListaClientesProps) {
  const [localOrder, setLocalOrder] = useState<ClienteLista[]>(clientes);
  const [dragging, setDragging] = useState<{ id: string; fromIndex: number } | null>(null);
  const [insertIndex, setInsertIndex] = useState(-1);
  const [guardando, setGuardando] = useState(false);

  const localOrderRef = useRef<ClienteLista[]>(clientes);
  const containerY = useRef(0);
  const itemYsRef = useRef<Record<string, number>>({});
  const itemHsRef = useRef<Record<string, number>>({});
  const draggingIdRef = useRef<string | null>(null);
  const insertIndexRef = useRef(-1);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalOrder(clientes);
      localOrderRef.current = clientes;
    }
  }, [clientes]);

  const onDragStart = useCallback((id: string, fromIndex: number) => {
    isDraggingRef.current = true;
    draggingIdRef.current = id;
    insertIndexRef.current = fromIndex;
    setDragging({ id, fromIndex });
    setInsertIndex(fromIndex);
  }, []);

  const onDragMove = useCallback((absoluteY: number) => {
    const order = localOrderRef.current;
    const relY = absoluteY - containerY.current;
    let newIndex = order.length;
    for (let i = 0; i < order.length; i++) {
      const y = itemYsRef.current[order[i].id] ?? 0;
      const h = itemHsRef.current[order[i].id] ?? 60;
      if (relY < y + h / 2) { newIndex = i; break; }
    }
    insertIndexRef.current = newIndex;
    setInsertIndex(newIndex);
  }, []);

  const onDragEnd = useCallback(() => {
    const id = draggingIdRef.current;
    const toIndex = insertIndexRef.current;
    draggingIdRef.current = null;
    isDraggingRef.current = false;
    setDragging(null);
    setInsertIndex(-1);

    if (!id) return;
    const arr = [...localOrderRef.current];
    const fromIdx = arr.findIndex((c) => c.id === id);
    if (fromIdx === -1 || fromIdx === toIndex) return;
    const adjustedTo = toIndex > fromIdx ? toIndex - 1 : toIndex;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(Math.min(adjustedTo, arr.length), 0, item);

    const newOrder = arr.map((c, i) => ({ ...c, orden: i }));
    localOrderRef.current = newOrder;
    setLocalOrder(newOrder);
    onReordered(newOrder);

    setGuardando(true);
    guardarOrdenLista(listaId, newOrder.map((c) => c.id))
      .catch(() => Alert.alert('Error', 'No se pudo guardar el orden.'))
      .finally(() => setGuardando(false));
  }, [listaId, onReordered]);

  const onDragCancel = useCallback(() => {
    if (!isDraggingRef.current && !draggingIdRef.current) return;
    draggingIdRef.current = null;
    isDraggingRef.current = false;
    setDragging(null);
    setInsertIndex(-1);
  }, []);

  if (localOrder.length === 0) {
    return (
      <View style={styles.listaVacia}>
        <MaterialIcons name="playlist-add" size={32} color={color} style={{ opacity: 0.4 }} />
        <Text style={[styles.listaVaciaTxt, { color }]}>
          Lista vacía. Tocá "Agregar" para añadir clientes o talleres.
        </Text>
      </View>
    );
  }

  return (
    <View onLayout={(e) => { containerY.current = e.nativeEvent.layout.y; }}>
      {guardando && (
        <View style={styles.guardandoBanner}>
          <ActivityIndicator size="small" color={color} />
          <Text style={[styles.guardandoTxt, { color }]}>Guardando orden…</Text>
        </View>
      )}

      {localOrder.map((c, idx) => {
        const esDragging = dragging?.id === c.id;
        return (
          <View
            key={c.id}
            onLayout={(e) => {
              itemYsRef.current[c.id] = e.nativeEvent.layout.y;
              itemHsRef.current[c.id] = e.nativeEvent.layout.height;
            }}
          >
            {dragging && insertIndex === idx && <View style={[styles.insertLine, { backgroundColor: color }]} />}
            <View style={[styles.clienteRow, esDragging && styles.clienteRowDragging]}>
              <DragHandle
                itemId={c.id}
                fromIndex={idx}
                onStart={onDragStart}
                onMove={onDragMove}
                onEnd={onDragEnd}
                onCancel={onDragCancel}
              />
              <View style={styles.clienteOrden}>
                <Text style={[styles.clienteOrdenTxt, { color }]}>{idx + 1}</Text>
              </View>
              <View style={styles.clienteInfo}>
                <View style={styles.clienteTopRow}>
                  <Text style={styles.clienteNombre} numberOfLines={1}>{c.nombre}</Text>
                  <View style={[styles.tipoBadge, c.tipo === 'taller' ? styles.tipoBadgeTaller : styles.tipoBadgeCliente]}>
                    <Text style={styles.tipoBadgeTxt}>{c.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
                  </View>
                </View>
                <Text style={styles.clienteDir} numberOfLines={1}>{c.direccion}</Text>
              </View>
              <Pressable onPress={() => onQuitar(c.id, c.nombre)} hitSlop={8} style={styles.trashBtn}>
                <MaterialIcons name="remove-circle-outline" size={22} color="#e57373" />
              </Pressable>
            </View>
          </View>
        );
      })}
      {dragging && insertIndex >= localOrder.length && (
        <View style={[styles.insertLine, { backgroundColor: color }]} />
      )}
    </View>
  );
}

// ─── Selector de días de la semana ────────────────────────────────────────────
function SelectorDias({ seleccionados, onChange, color }: { seleccionados: number[]; onChange: (dias: number[]) => void; color: string }) {
  return (
    <View style={styles.diasRow}>
      {DIAS_ORDEN.map((d) => {
        const activo = seleccionados.includes(d);
        return (
          <Pressable
            key={d}
            style={[styles.diaChip, activo && { backgroundColor: color, borderColor: color }]}
            onPress={() => {
              const next = activo ? seleccionados.filter((x) => x !== d) : [...seleccionados, d];
              onChange(next);
            }}
          >
            <Text style={[styles.diaChipTxt, activo && { color: '#fff' }]}>{DIAS_SEMANA_CORTO[d]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
interface ClienteApi {
  id: string;
  nombre: string;
  direccion: string;
  tipo: 'cliente' | 'taller';
  telefono: string;
  categorias: string[];
}

export default function Planificacion() {
  const [listas, setListas] = useState<Lista[]>([]);
  const [listaActivaId, setListaActivaId] = useState<string | null>(null);
  const [clientesLista, setClientesLista] = useState<ClienteLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalAgregar, setModalAgregar] = useState(false);
  const [todosClientes, setTodosClientes] = useState<ClienteApi[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [agregando, setAgregando] = useState(false);

  const [repartidoresDisp, setRepartidoresDisp] = useState<{ id: string; nombre: string }[]>([]);
  const [modalRepVisible, setModalRepVisible] = useState(false);
  const [guardandoRep, setGuardandoRep] = useState(false);

  // Crear / editar lista
  const [modalListaVisible, setModalListaVisible] = useState(false);
  const [editandoListaId, setEditandoListaId] = useState<string | null>(null);
  const [nombreForm, setNombreForm] = useState('');
  const [diasForm, setDiasForm] = useState<number[]>([]);
  const [guardandoLista, setGuardandoLista] = useState(false);

  const listaActiva = listas.find((l) => l.id === listaActivaId) ?? null;
  const idxActiva = listas.findIndex((l) => l.id === listaActivaId);
  const paletaActiva = colorDeLista(idxActiva < 0 ? 0 : idxActiva);

  const cargarListas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await obtenerListas();
      setListas(data);
      setListaActivaId((prev) => prev ?? data[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarClientesDeListaActiva = useCallback(async () => {
    if (!listaActivaId) { setClientesLista([]); return; }
    setCargandoClientes(true);
    try {
      const data = await obtenerClientesDeLista(listaActivaId);
      setClientesLista(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setCargandoClientes(false);
    }
  }, [listaActivaId]);

  useEffect(() => { void cargarListas(); }, [cargarListas]);
  useEffect(() => { void cargarClientesDeListaActiva(); }, [cargarClientesDeListaActiva]);

  const abrirAgregar = async () => {
    setBusqueda('');
    if (todosClientes.length === 0) {
      setCargandoCatalogo(true);
      try {
        const data = await apiRequest<{ clientes: ClienteApi[] }>('/clientes');
        setTodosClientes(data.clientes);
      } catch {
        Alert.alert('Error', 'No se pudo cargar el catálogo.');
        setCargandoCatalogo(false);
        return;
      }
      setCargandoCatalogo(false);
    }
    setModalAgregar(true);
  };

  const confirmarAgregar = async (clienteId: string, nombre: string) => {
    if (!listaActivaId) return;
    if (clientesLista.some((c) => c.id === clienteId)) {
      Alert.alert('Ya está en la lista', `${nombre} ya pertenece a esta lista.`);
      return;
    }
    setAgregando(true);
    try {
      await agregarClienteALista(listaActivaId, clienteId);
      setModalAgregar(false);
      await cargarClientesDeListaActiva();
      setListas((prev) => prev.map((l) => l.id === listaActivaId ? { ...l, cantidadClientes: l.cantidadClientes + 1 } : l));
    } catch {
      Alert.alert('Error', 'No se pudo agregar el cliente.');
    } finally {
      setAgregando(false);
    }
  };

  const confirmarQuitar = (clienteId: string, nombre: string) => {
    if (!listaActivaId) return;
    Alert.alert(
      'Quitar de la lista',
      `¿Quitar a ${nombre} de "${listaActiva?.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await quitarClienteDeLista(listaActivaId, clienteId);
              await cargarClientesDeListaActiva();
              setListas((prev) => prev.map((l) => l.id === listaActivaId ? { ...l, cantidadClientes: Math.max(0, l.cantidadClientes - 1) } : l));
            } catch {
              Alert.alert('Error', 'No se pudo quitar el cliente.');
            }
          },
        },
      ]
    );
  };

  const abrirSelectorRepartidor = async () => {
    if (repartidoresDisp.length === 0) {
      try {
        const data = await apiRequest<{ repartidores: { id: string; nombre: string }[] }>('/repartidores');
        setRepartidoresDisp(data.repartidores);
      } catch {
        Alert.alert('Error', 'No se pudo cargar los repartidores.');
        return;
      }
    }
    setModalRepVisible(true);
  };

  const seleccionarRepartidor = async (rep: { id: string; nombre: string } | null) => {
    if (!listaActivaId) return;
    setModalRepVisible(false);
    setGuardandoRep(true);
    try {
      if (rep) {
        await asignarRepartidorALista(listaActivaId, rep.id);
      } else {
        await quitarAsignacionDeLista(listaActivaId);
      }
      setListas((prev) => prev.map((l) => l.id === listaActivaId ? { ...l, repartidor: rep } : l));
    } catch {
      Alert.alert('Error', 'No se pudo guardar la asignación.');
    } finally {
      setGuardandoRep(false);
    }
  };

  // ── Crear / editar lista ──
  const abrirCrearLista = () => {
    setEditandoListaId(null);
    setNombreForm('');
    setDiasForm([]);
    setModalListaVisible(true);
  };

  const abrirEditarLista = () => {
    if (!listaActiva) return;
    setEditandoListaId(listaActiva.id);
    setNombreForm(listaActiva.nombre);
    setDiasForm(listaActiva.diasSemana);
    setModalListaVisible(true);
  };

  const guardarLista = async () => {
    if (!nombreForm.trim()) {
      Alert.alert('Falta el nombre', 'Ponele un nombre a la lista.');
      return;
    }
    setGuardandoLista(true);
    try {
      if (editandoListaId) {
        await editarLista(editandoListaId, { nombre: nombreForm.trim(), diasSemana: diasForm });
        setListas((prev) => prev.map((l) => l.id === editandoListaId ? { ...l, nombre: nombreForm.trim(), diasSemana: diasForm } : l));
      } else {
        const nueva = await crearLista(nombreForm.trim(), diasForm);
        setListas((prev) => [...prev, nueva]);
        setListaActivaId(nueva.id);
      }
      setModalListaVisible(false);
    } catch {
      Alert.alert('Error', 'No se pudo guardar la lista.');
    } finally {
      setGuardandoLista(false);
    }
  };

  const confirmarEliminarLista = () => {
    if (!listaActiva) return;
    Alert.alert(
      'Eliminar lista',
      `¿Eliminar "${listaActiva.nombre}"? Se perderá el orden de clientes y la asignación al repartidor. Esto no borra a los clientes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarLista(listaActiva.id);
              setListas((prev) => {
                const restantes = prev.filter((l) => l.id !== listaActiva.id);
                setListaActivaId(restantes[0]?.id ?? null);
                return restantes;
              });
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la lista.');
            }
          },
        },
      ]
    );
  };

  const idsEnLista = new Set(clientesLista.map((c) => c.id));
  const catalogoFiltrado = todosClientes.filter((c) => {
    if (idsEnLista.has(c.id)) return false;
    const q = busqueda.toLowerCase();
    return c.nombre.toLowerCase().includes(q) || c.direccion.toLowerCase().includes(q);
  });

  return (
    <Screen title="Planificación" subtitle="Listas de reparto y su asignación automática" scrollable>

      {/* Tabs de listas */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {listas.map((l, idx) => {
          const activo = listaActivaId === l.id;
          const pal = colorDeLista(idx);
          return (
            <Pressable
              key={l.id}
              onPress={() => setListaActivaId(l.id)}
              style={[styles.tabChip, activo && { borderColor: pal.color, backgroundColor: pal.bg }]}
            >
              <Text style={[styles.tabChipNombre, activo && { color: pal.color }]} numberOfLines={1}>
                {l.nombre}
              </Text>
              <Text style={[styles.tabChipCant, activo && { color: pal.color }]}>
                {l.cantidadClientes} paradas
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={abrirCrearLista} style={styles.tabChipNueva}>
          <MaterialIcons name="add" size={20} color={COLORS.verdeOscuro} />
          <Text style={styles.tabChipNuevaTxt}>Nueva lista</Text>
        </Pressable>
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={COLORS.verdeOscuro} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Button label="REINTENTAR" variant="secondary" onPress={() => void cargarListas()} />
        </View>
      ) : !listaActiva ? (
        <View style={styles.listaVacia}>
          <MaterialIcons name="playlist-add" size={32} color={COLORS.grisSecundario} style={{ opacity: 0.4 }} />
          <Text style={styles.listaVaciaTxt}>Todavía no hay listas. Creá la primera con "Nueva lista".</Text>
        </View>
      ) : (
        <>
          {/* Cabecera de la lista activa */}
          <View style={[styles.catHeader, { backgroundColor: paletaActiva.bg, borderColor: paletaActiva.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.catHeaderTit, { color: paletaActiva.color }]}>{listaActiva.nombre}</Text>
              <Text style={styles.catHeaderSub}>
                {resumenDias(listaActiva.diasSemana)} · {clientesLista.length} cliente{clientesLista.length !== 1 ? 's' : ''} / taller{clientesLista.length !== 1 ? 'es' : ''}
              </Text>
            </View>
            <Pressable onPress={abrirEditarLista} hitSlop={8} style={styles.iconBtn}>
              <MaterialIcons name="edit" size={20} color={paletaActiva.color} />
            </Pressable>
            <Pressable onPress={confirmarEliminarLista} hitSlop={8} style={styles.iconBtn}>
              <MaterialIcons name="delete-outline" size={20} color="#e57373" />
            </Pressable>
            <Button
              label="Agregar"
              variant="primary"
              loading={cargandoCatalogo}
              onPress={() => void abrirAgregar()}
              iconLeft={<MaterialIcons name="add" size={16} color="#fff" />}
            />
          </View>

          {/* Repartidor asignado automáticamente a esta lista */}
          <Pressable
            style={[styles.repRow, { borderColor: paletaActiva.border }]}
            onPress={() => void abrirSelectorRepartidor()}
            disabled={guardandoRep}
          >
            <MaterialIcons name="person" size={20} color={paletaActiva.color} />
            <View style={{ flex: 1 }}>
              <Text style={styles.repLabel}>Repartidor asignado automáticamente</Text>
              <Text style={[styles.repValor, { color: paletaActiva.color }]}>
                {guardandoRep ? 'Guardando…' : listaActiva.repartidor?.nombre ?? 'Sin asignar — tocar para configurar'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={paletaActiva.color} />
          </Pressable>

          {cargandoClientes ? (
            <ActivityIndicator color={COLORS.verdeOscuro} style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.listaContainer}>
              <ListaClientes
                listaId={listaActiva.id}
                color={paletaActiva.color}
                clientes={clientesLista}
                onReordered={setClientesLista}
                onQuitar={confirmarQuitar}
              />
            </View>
          )}
        </>
      )}

      {/* Modal para seleccionar repartidor */}
      <Modal visible={modalRepVisible} animationType="fade" transparent>
        <View style={styles.repModalOverlay}>
          <View style={styles.repModalBox}>
            <Text style={[styles.repModalTit, { color: paletaActiva.color }]}>
              {listaActiva?.nombre} — ¿quién la hace?
            </Text>
            {repartidoresDisp.map((rep) => (
              <Pressable
                key={rep.id}
                style={[
                  styles.repModalItem,
                  listaActiva?.repartidor?.id === rep.id && { backgroundColor: paletaActiva.bg, borderColor: paletaActiva.color },
                ]}
                onPress={() => void seleccionarRepartidor(rep)}
              >
                <MaterialIcons name="person" size={18} color={paletaActiva.color} />
                <Text style={styles.repModalItemTxt}>{rep.nombre}</Text>
                {listaActiva?.repartidor?.id === rep.id && (
                  <MaterialIcons name="check-circle" size={18} color={paletaActiva.color} />
                )}
              </Pressable>
            ))}
            {listaActiva?.repartidor && (
              <Pressable style={[styles.repModalItem, { borderColor: '#e57373' }]} onPress={() => void seleccionarRepartidor(null)}>
                <MaterialIcons name="person-off" size={18} color="#e57373" />
                <Text style={[styles.repModalItemTxt, { color: '#e57373' }]}>Sin asignar</Text>
              </Pressable>
            )}
            <Pressable style={styles.repModalCancelar} onPress={() => setModalRepVisible(false)}>
              <Text style={styles.repModalCancelarTxt}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal crear/editar lista */}
      <Modal visible={modalListaVisible} animationType="fade" transparent>
        <View style={styles.repModalOverlay}>
          <View style={styles.repModalBox}>
            <Text style={styles.repModalTit}>{editandoListaId ? 'Editar lista' : 'Nueva lista'}</Text>
            <Text style={styles.formLabel}>Nombre</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ej: Zona Norte, Andrés, Talleres VIP…"
              value={nombreForm}
              onChangeText={setNombreForm}
              autoFocus
            />
            <Text style={styles.formLabel}>¿Qué día se hace?</Text>
            <SelectorDias seleccionados={diasForm} onChange={setDiasForm} color={COLORS.verdeOscuro} />
            <Text style={styles.formHint}>
              Podés elegir más de un día (ej: Lunes y Miércoles). Sin días marcados, la lista no se asigna sola — solo se aplica a mano.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancelar" variant="secondary" onPress={() => setModalListaVisible(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={guardandoLista ? 'Guardando…' : 'Guardar'} variant="primary" loading={guardandoLista} onPress={() => void guardarLista()} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para agregar cliente */}
      <Modal visible={modalAgregar} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTit, { color: paletaActiva.color }]}>
              Agregar a "{listaActiva?.nombre}"
            </Text>
            <Pressable onPress={() => setModalAgregar(false)} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={COLORS.grisTexto} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color={COLORS.grisSecundario} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar cliente o taller…"
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
            {busqueda.length > 0 && (
              <Pressable onPress={() => setBusqueda('')}>
                <MaterialIcons name="clear" size={18} color={COLORS.grisSecundario} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={catalogoFiltrado}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            ListEmptyComponent={
              <Text style={styles.emptyTxt}>
                {busqueda ? 'Sin resultados.' : 'Todos los clientes ya están en esta lista.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.catalogoItem}
                onPress={() => void confirmarAgregar(item.id, item.nombre)}
                disabled={agregando}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.catalogoNombre} numberOfLines={1}>{item.nombre}</Text>
                  <Text style={styles.catalogoDir} numberOfLines={1}>{item.direccion}</Text>
                </View>
                <View style={[styles.tipoBadge, item.tipo === 'taller' ? styles.tipoBadgeTaller : styles.tipoBadgeCliente]}>
                  <Text style={styles.tipoBadgeTxt}>{item.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
                </View>
                <MaterialIcons name="add-circle-outline" size={22} color={paletaActiva.color} />
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </Screen>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabScroll: { marginBottom: 12 },
  tabContent: { gap: 10, paddingVertical: 4 },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#dde2e8',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 100,
    maxWidth: 160,
  },
  tabChipNombre: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: COLORS.grisTexto },
  tabChipCant: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: COLORS.grisSecundario, marginTop: 1 },
  tabChipNueva: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#b7e0a0',
    borderStyle: 'dashed',
    backgroundColor: '#f6fff8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 100,
  },
  tabChipNuevaTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.verdeOscuro },

  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  catHeaderTit: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  catHeaderSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },
  iconBtn: { padding: 6 },

  listaContainer: { borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8ecef', overflow: 'hidden' },

  listaVacia: { padding: 32, alignItems: 'center', gap: 10 },
  listaVaciaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', opacity: 0.7, color: COLORS.grisSecundario },

  guardandoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, paddingHorizontal: 14 },
  guardandoTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12 },

  dragHandle: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  insertLine: { height: 2, borderRadius: 1, marginVertical: 2, marginHorizontal: 12 },

  clienteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingRight: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  clienteRowDragging: { opacity: 0.35 },
  clienteOrden: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f4f6f8', alignItems: 'center', justifyContent: 'center' },
  clienteOrdenTxt: { fontFamily: 'Poppins_700Bold', fontSize: 12 },
  clienteInfo: { flex: 1 },
  clienteTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clienteNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  clienteDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },
  trashBtn: { padding: 4 },

  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tipoBadgeCliente: { backgroundColor: '#e8f4ea' },
  tipoBadgeTaller: { backgroundColor: '#e3f2fd' },
  tipoBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.grisTexto },

  repRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    padding: 14, marginBottom: 12,
  },
  repLabel: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#888', marginBottom: 2 },
  repValor: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },

  repModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  repModalBox: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10 },
  repModalTit: { fontFamily: 'Poppins_700Bold', fontSize: 16, marginBottom: 4, color: COLORS.grisTexto },
  repModalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e5ea',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  repModalItemTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#333', flex: 1 },
  repModalCancelar: { marginTop: 4, alignItems: 'center', padding: 12 },
  repModalCancelarTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#888' },

  formLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto, marginTop: 4 },
  formInput: {
    borderWidth: 1, borderColor: '#dde3e8', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Poppins_400Regular', fontSize: 14, color: COLORS.grisTexto,
  },
  formHint: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario, lineHeight: 16 },
  diasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  diaChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#dde3e8', backgroundColor: '#fff',
  },
  diaChipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisTexto },

  errorBox: { backgroundColor: '#fff3f3', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e06a6a', gap: 8 },
  errorTxt: { fontFamily: 'Poppins_400Regular', color: '#c0392b' },

  modal: { flex: 1, backgroundColor: '#f8f9fb' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  modalTit: { fontFamily: 'Poppins_700Bold', fontSize: 18 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e5ea', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, color: COLORS.grisTexto, height: 36 },
  emptyTxt: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, textAlign: 'center', marginTop: 32 },
  catalogoItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e8ecef' },
  catalogoNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto },
  catalogoDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },
});
