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
  obtenerListaCategoria,
  guardarOrdenCategoria,
  agregarClienteACategoria,
  quitarClienteDeCategoria,
  type CategoriaLista,
  type ClienteLista,
} from '@/services/listasCategorias';
import { apiRequest } from '@/services/apiClient';

// ─── Constantes ──────────────────────────────────────────────────────────────
const CATS: CategoriaLista[] = ['A', 'B', 'C', 'D'];

const CAT_LABEL: Record<CategoriaLista, string> = {
  A: 'Lista A · Lun / Mié',
  B: 'Lista B · Mar / Jue',
  C: 'Lista C · Vie',
  D: 'Lista D · Andrés',
};

const CAT_COLOR: Record<CategoriaLista, string> = {
  A: '#2E7D32', B: '#1565C0', C: '#E65100', D: '#7B1FA2',
};
const CAT_BG: Record<CategoriaLista, string> = {
  A: '#e8f5e9', B: '#e3f2fd', C: '#fff3e0', D: '#f3e5f5',
};
const CAT_BORDER: Record<CategoriaLista, string> = {
  A: '#a5d6a7', B: '#90caf9', C: '#ffcc80', D: '#ce93d8',
};

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

// ─── Lista arrastrable por categoría ─────────────────────────────────────────
interface ListaCategoriaProps {
  categoria: CategoriaLista;
  clientes: ClienteLista[];
  onReordered: (nuevaLista: ClienteLista[]) => void;
  onQuitar: (clienteId: string, nombre: string) => void;
}

function ListaCategoria({ categoria, clientes, onReordered, onQuitar }: ListaCategoriaProps) {
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
    guardarOrdenCategoria(categoria, newOrder.map((c) => c.id))
      .catch(() => Alert.alert('Error', 'No se pudo guardar el orden.'))
      .finally(() => setGuardando(false));
  }, [categoria, onReordered]);

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
        <MaterialIcons name="playlist-add" size={32} color={CAT_COLOR[categoria]} style={{ opacity: 0.4 }} />
        <Text style={[styles.listaVaciaTxt, { color: CAT_COLOR[categoria] }]}>
          Lista vacía. Tocá "Agregar" para añadir clientes o talleres.
        </Text>
      </View>
    );
  }

  return (
    <View
      onLayout={(e) => { containerY.current = e.nativeEvent.layout.y; }}
    >
      {guardando && (
        <View style={styles.guardandoBanner}>
          <ActivityIndicator size="small" color={CAT_COLOR[categoria]} />
          <Text style={[styles.guardandoTxt, { color: CAT_COLOR[categoria] }]}>Guardando orden…</Text>
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
            {dragging && insertIndex === idx && <View style={[styles.insertLine, { backgroundColor: CAT_COLOR[categoria] }]} />}
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
                <Text style={[styles.clienteOrdenTxt, { color: CAT_COLOR[categoria] }]}>{idx + 1}</Text>
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
              <Pressable
                onPress={() => onQuitar(c.id, c.nombre)}
                hitSlop={8}
                style={styles.trashBtn}
              >
                <MaterialIcons name="remove-circle-outline" size={22} color="#e57373" />
              </Pressable>
            </View>
          </View>
        );
      })}
      {dragging && insertIndex >= localOrder.length && (
        <View style={[styles.insertLine, { backgroundColor: CAT_COLOR[categoria] }]} />
      )}
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
  categorias: CategoriaLista[];
}

export default function Planificacion() {
  const [tabActivo, setTabActivo] = useState<CategoriaLista>('A');
  const [listas, setListas] = useState<Record<CategoriaLista, ClienteLista[]>>({
    A: [], B: [], C: [], D: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAgregar, setModalAgregar] = useState(false);
  const [todosClientes, setTodosClientes] = useState<ClienteApi[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [agregando, setAgregando] = useState(false);

  const cargarTab = useCallback(async (cat: CategoriaLista) => {
    try {
      const lista = await obtenerListaCategoria(cat);
      setListas((prev) => ({ ...prev, [cat]: lista }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    }
  }, []);

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b, c, d] = await Promise.all([
        obtenerListaCategoria('A'),
        obtenerListaCategoria('B'),
        obtenerListaCategoria('C'),
        obtenerListaCategoria('D'),
      ]);
      setListas({ A: a, B: b, C: c, D: d });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargarTodo(); }, [cargarTodo]);

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
    const listaActual = listas[tabActivo];
    if (listaActual.some((c) => c.id === clienteId)) {
      Alert.alert('Ya está en la lista', `${nombre} ya pertenece a la lista ${tabActivo}.`);
      return;
    }
    setAgregando(true);
    try {
      await agregarClienteACategoria(tabActivo, clienteId);
      setModalAgregar(false);
      await cargarTab(tabActivo);
    } catch {
      Alert.alert('Error', 'No se pudo agregar el cliente.');
    } finally {
      setAgregando(false);
    }
  };

  const confirmarQuitar = (clienteId: string, nombre: string) => {
    Alert.alert(
      `Quitar de lista ${tabActivo}`,
      `¿Quitar a ${nombre} de la lista ${tabActivo}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await quitarClienteDeCategoria(tabActivo, clienteId);
              await cargarTab(tabActivo);
            } catch {
              Alert.alert('Error', 'No se pudo quitar el cliente.');
            }
          },
        },
      ]
    );
  };

  // Clientes del catálogo que NO están ya en la lista activa
  const idsEnLista = new Set(listas[tabActivo].map((c) => c.id));
  const catalogoFiltrado = todosClientes.filter((c) => {
    if (idsEnLista.has(c.id)) return false;
    const q = busqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.direccion.toLowerCase().includes(q)
    );
  });

  const listaActual = listas[tabActivo];

  return (
    <Screen title="Planificación" subtitle="Armado de listas por categoría" scrollable>

      {/* Tabs A / B / C / D */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {CATS.map((cat) => {
          const activo = tabActivo === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setTabActivo(cat)}
              style={[
                styles.tabChip,
                activo && { borderColor: CAT_COLOR[cat], backgroundColor: CAT_BG[cat] },
              ]}
            >
              <Text style={[styles.tabChipLetra, activo && { color: CAT_COLOR[cat] }]}>
                {cat}
              </Text>
              <Text style={[styles.tabChipCant, activo && { color: CAT_COLOR[cat] }]}>
                {listas[cat].length} paradas
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Cabecera del tab activo */}
      <View style={[styles.catHeader, { backgroundColor: CAT_BG[tabActivo], borderColor: CAT_BORDER[tabActivo] }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.catHeaderTit, { color: CAT_COLOR[tabActivo] }]}>
            {CAT_LABEL[tabActivo]}
          </Text>
          <Text style={styles.catHeaderSub}>
            {listaActual.length} cliente{listaActual.length !== 1 ? 's' : ''} / taller{listaActual.length !== 1 ? 'es' : ''}
          </Text>
        </View>
        <Button
          label="Agregar"
          variant="primary"
          loading={cargandoCatalogo}
          onPress={() => void abrirAgregar()}
          iconLeft={<MaterialIcons name="add" size={16} color="#fff" />}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.verdeOscuro} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Button label="REINTENTAR" variant="secondary" onPress={() => void cargarTodo()} />
        </View>
      ) : (
        <View style={styles.listaContainer}>
          <ListaCategoria
            categoria={tabActivo}
            clientes={listaActual}
            onReordered={(nueva) => setListas((prev) => ({ ...prev, [tabActivo]: nueva }))}
            onQuitar={confirmarQuitar}
          />
        </View>
      )}

      {/* Modal para agregar cliente */}
      <Modal visible={modalAgregar} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTit, { color: CAT_COLOR[tabActivo] }]}>
              Agregar a lista {tabActivo}
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
                <MaterialIcons name="add-circle-outline" size={22} color={CAT_COLOR[tabActivo]} />
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#dde2e8',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 80,
  },
  tabChipLetra: { fontFamily: 'Poppins_700Bold', fontSize: 22, color: COLORS.grisTexto },
  tabChipCant: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: COLORS.grisSecundario, marginTop: 1 },

  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  catHeaderTit: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  catHeaderSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },

  listaContainer: { borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8ecef', overflow: 'hidden' },

  listaVacia: { padding: 32, alignItems: 'center', gap: 10 },
  listaVaciaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', opacity: 0.7 },

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
