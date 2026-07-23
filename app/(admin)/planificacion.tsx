import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { apiRequest } from '@/services/apiClient';

type CategoriaCliente = 'A' | 'B' | 'C' | 'D';

interface ClientePlan {
  id: string;
  nombre: string;
  direccion: string;
  tipo: 'cliente' | 'taller';
  categorias: CategoriaCliente[];
  orden: number;
}

interface RepartidorPlan {
  id: string;
  nombre: string;
  clientes: ClientePlan[];
}

interface DiaPlan {
  categoria: CategoriaCliente;
  repartidores: RepartidorPlan[];
}

interface PlanificacionResponse {
  lunes: DiaPlan;
  martes: DiaPlan;
  miercoles: DiaPlan;
  jueves: DiaPlan;
  viernes: DiaPlan;
  andres: { categoria: 'D'; clientes: ClientePlan[] };
}

type TabKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'andres';

const TABS: { key: TabKey; label: string; corto: string; categoria: CategoriaCliente }[] = [
  { key: 'lunes',     label: 'Lunes',     corto: 'Lun', categoria: 'A' },
  { key: 'martes',    label: 'Martes',    corto: 'Mar', categoria: 'B' },
  { key: 'miercoles', label: 'Miércoles', corto: 'Mié', categoria: 'A' },
  { key: 'jueves',    label: 'Jueves',    corto: 'Jue', categoria: 'B' },
  { key: 'viernes',   label: 'Viernes',   corto: 'Vie', categoria: 'C' },
  { key: 'andres',    label: 'Andrés',    corto: 'And', categoria: 'D' },
];

const CAT_COLOR: Record<CategoriaCliente, string> = {
  A: '#2E7D32', B: '#1565C0', C: '#E65100', D: '#7B1FA2',
};
const CAT_BG: Record<CategoriaCliente, string> = {
  A: '#e8f5e9', B: '#e3f2fd', C: '#fff3e0', D: '#f3e5f5',
};

// ─── DragHandle ─────────────────────────────────────────────────────────────
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

// ─── RepartidorDraggableCard ─────────────────────────────────────────────────
interface RepartidorDraggableCardProps {
  rep: RepartidorPlan;
  catActiva: CategoriaCliente;
}

function RepartidorDraggableCard({ rep, catActiva }: RepartidorDraggableCardProps) {
  const [localOrder, setLocalOrder] = useState<ClientePlan[]>(() =>
    [...rep.clientes].sort((a, b) => a.orden - b.orden)
  );
  const [dragging, setDragging] = useState<{ id: string; fromIndex: number } | null>(null);
  const [insertIndex, setInsertIndex] = useState(-1);
  const [guardando, setGuardando] = useState(false);

  const localOrderRef = useRef<ClientePlan[]>(localOrder);
  const containerY = useRef(0);
  const itemYsRef = useRef<Record<string, number>>({});
  const itemHsRef = useRef<Record<string, number>>({});
  const draggingIdRef = useRef<string | null>(null);
  const insertIndexRef = useRef(-1);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      const sorted = [...rep.clientes].sort((a, b) => a.orden - b.orden);
      setLocalOrder(sorted);
      localOrderRef.current = sorted;
    }
  }, [rep.clientes]);

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

    const clienteIds = newOrder.map((c) => c.id);
    setGuardando(true);
    apiRequest(`/rutas-fijas/${rep.id}/reordenar-subset`, {
      method: 'PATCH',
      body: JSON.stringify({ clienteIds }),
    })
      .catch(() => Alert.alert('Error', 'No se pudo guardar el orden.'))
      .finally(() => setGuardando(false));
  }, [rep.id]);

  const onDragCancel = useCallback(() => {
    if (!isDraggingRef.current && !draggingIdRef.current) return;
    draggingIdRef.current = null;
    isDraggingRef.current = false;
    setDragging(null);
    setInsertIndex(-1);
  }, []);

  return (
    <View style={styles.repCard}>
      <View style={styles.repHeader}>
        <Text style={styles.repNombre}>{rep.nombre}</Text>
        <View style={styles.repHeaderRight}>
          {guardando && <ActivityIndicator size="small" color={COLORS.verdePrincipal} />}
          <View style={styles.repBadge}>
            <Text style={styles.repBadgeTxt}>{localOrder.length} paradas</Text>
          </View>
        </View>
      </View>

      {localOrder.length === 0 ? (
        <Text style={styles.sinClientes}>Sin paradas asignadas este día.</Text>
      ) : (
        <View
          onLayout={(e) => { containerY.current = e.nativeEvent.layout.y; }}
        >
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
                {dragging && insertIndex === idx && <View style={styles.insertLine} />}
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
                    <Text style={styles.clienteOrdenTxt}>{idx + 1}</Text>
                  </View>
                  <View style={styles.clienteInfo}>
                    <View style={styles.clienteTopRow}>
                      <Text style={styles.clienteNombre} numberOfLines={1}>{c.nombre}</Text>
                      <View style={[styles.tipoBadge, c.tipo === 'taller' ? styles.tipoBadgeTaller : styles.tipoBadgeCliente]}>
                        <Text style={styles.tipoBadgeTxt}>{c.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
                      </View>
                    </View>
                    <Text style={styles.clienteDir} numberOfLines={1}>{c.direccion}</Text>
                    {c.categorias.filter((cat) => cat !== catActiva).length > 0 && (
                      <Text style={styles.clienteCats}>
                        También:{' '}
                        {c.categorias.filter((cat) => cat !== catActiva).map((cat) => (
                          <Text key={cat} style={{ color: CAT_COLOR[cat] }}> {cat} </Text>
                        ))}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
          {dragging && insertIndex >= localOrder.length && <View style={styles.insertLine} />}
        </View>
      )}
    </View>
  );
}

// ─── Pantalla principal ──────────────────────────────────────────────────────
export default function Planificacion() {
  const [data, setData] = useState<PlanificacionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabActivo, setTabActivo] = useState<TabKey>('lunes');
  const [cargandoSeed, setCargandoSeed] = useState(false);

  const cargar = () => {
    setLoading(true);
    setError(null);
    apiRequest<PlanificacionResponse>('/admin/planificacion')
      .then((resp) => setData(resp))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const cargarDatosExcel = () => {
    Alert.alert(
      'Cargar datos del Excel',
      '¿Cargar todos los talleres del Excel de rutas? Los que ya existen se omiten.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cargar',
          onPress: () => {
            setCargandoSeed(true);
            apiRequest<{ ok: boolean; insertados: number; omitidos: number; mensaje: string }>(
              '/admin/seed/rutas',
              { method: 'POST' }
            )
              .then((r) => { Alert.alert('Listo', r.mensaje); cargar(); })
              .catch((e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar.'))
              .finally(() => setCargandoSeed(false));
          },
        },
      ]
    );
  };

  const tab = TABS.find((t) => t.key === tabActivo)!;
  const cat = tab.categoria;

  let totalParadas = 0;
  let repartidores: RepartidorPlan[] = [];
  let clientesAndres: ClientePlan[] = [];
  const esAndres = tabActivo === 'andres';

  if (data) {
    if (!esAndres) {
      const diaPlan = data[tabActivo as Exclude<TabKey, 'andres'>] as DiaPlan;
      repartidores = diaPlan?.repartidores ?? [];
      totalParadas = repartidores.reduce((s, r) => s + r.clientes.length, 0);
    } else {
      clientesAndres = data.andres?.clientes ?? [];
      totalParadas = clientesAndres.length;
    }
  }

  return (
    <Screen title="Planificación semanal" subtitle="Rutas por día" scrollable>

      <Button
        label={cargandoSeed ? 'CARGANDO DATOS…' : 'CARGAR DATOS DEL EXCEL'}
        variant="secondary"
        loading={cargandoSeed}
        onPress={cargarDatosExcel}
      />

      {/* Tabs de días */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}>
        {TABS.map((t) => {
          const activo = tabActivo === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTabActivo(t.key)}
              style={[styles.tabChip, activo && { borderColor: CAT_COLOR[t.categoria], backgroundColor: CAT_BG[t.categoria] }]}
            >
              <Text style={[styles.tabChipTxt, activo && { color: CAT_COLOR[t.categoria] }]}>
                {t.corto}
              </Text>
              <Text style={[styles.tabChipCat, activo && { color: CAT_COLOR[t.categoria] }]}>
                Cat. {t.categoria}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={COLORS.verdeOscuro} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Button label="REINTENTAR" variant="secondary" onPress={cargar} />
        </View>
      ) : (
        <>
          {/* Cabecera */}
          <View style={[styles.diaHeader, { backgroundColor: CAT_BG[cat] }]}>
            <Text style={[styles.diaHeaderTitulo, { color: CAT_COLOR[cat] }]}>
              {tab.label} — Categoría {cat}
            </Text>
            <Text style={styles.diaHeaderSub}>
              {totalParadas} parada{totalParadas !== 1 ? 's' : ''} en total
            </Text>
          </View>

          {/* Tab Andrés — lista plana sin drag (sin repartidor_id) */}
          {esAndres ? (
            <View style={styles.repCard}>
              <View style={styles.repHeader}>
                <Text style={[styles.repNombre, { color: CAT_COLOR['D'] }]}>Recorrido Andrés</Text>
                <View style={[styles.repBadge, { backgroundColor: CAT_BG['D'] }]}>
                  <Text style={[styles.repBadgeTxt, { color: CAT_COLOR['D'] }]}>{clientesAndres.length} paradas</Text>
                </View>
              </View>
              {clientesAndres.length === 0 ? (
                <Text style={styles.sinClientes}>Sin talleres asignados a la categoría D.</Text>
              ) : (
                clientesAndres.map((c, idx) => (
                  <View key={c.id} style={styles.clienteRow}>
                    <View style={styles.clienteOrden}>
                      <Text style={styles.clienteOrdenTxt}>{idx + 1}</Text>
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
                  </View>
                ))
              )}
            </View>
          ) : (
            repartidores.map((rep) => (
              <RepartidorDraggableCard key={rep.id} rep={rep} catActiva={cat} />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabScroll: { marginBottom: 12 },
  tabContent: { gap: 8, paddingVertical: 4 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#c8d4cc',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 58,
  },
  tabChipTxt: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  tabChipCat: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: COLORS.grisSecundario, marginTop: 1 },
  errorBox: { backgroundColor: '#fff3f3', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e06a6a', gap: 8 },
  errorTxt: { fontFamily: 'Poppins_400Regular', color: '#c0392b' },
  diaHeader: { borderRadius: 12, padding: 14, marginBottom: 12 },
  diaHeaderTitulo: { fontFamily: 'Poppins_700Bold', fontSize: 17, color: COLORS.grisTexto },
  diaHeaderSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario, marginTop: 2 },
  repCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e8ecef' },
  repHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  repHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  repNombre: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: COLORS.grisTexto, flex: 1 },
  repBadge: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  repBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisSecundario },
  sinClientes: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, fontSize: 13 },
  dragHandle: { padding: 6, justifyContent: 'center', alignItems: 'center' },
  insertLine: { height: 2, backgroundColor: COLORS.verdePrincipal, borderRadius: 1, marginVertical: 2 },
  clienteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  clienteRowDragging: { opacity: 0.4 },
  clienteOrden: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f0f4f0', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  clienteOrdenTxt: { fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisSecundario },
  clienteInfo: { flex: 1 },
  clienteTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clienteNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  clienteDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },
  clienteCats: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario, marginTop: 2 },
  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tipoBadgeCliente: { backgroundColor: '#e8f4ea' },
  tipoBadgeTaller: { backgroundColor: '#e3f2fd' },
  tipoBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.grisTexto },
});
