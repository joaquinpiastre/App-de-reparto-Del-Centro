import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { actualizarEstadoPedidoCalle, eliminarPedidoCalle, obtenerTodosLosPedidosCalle } from '@/services/pedidosCalle';
import { formatFechaHora } from '@/lib/fechaHora';
import type { EstadoPedidoCalle, PedidoCalle } from '@/types';

const ESTADOS: { label: string; value: EstadoPedidoCalle | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Pendiente', value: 'pendiente' },
  { label: 'Visto', value: 'visto' },
  { label: 'Nota', value: 'nota' },
  { label: 'Armado', value: 'armado' },
  { label: 'Retirado', value: 'retirado' },
  { label: 'Cancelado', value: 'cancelado' },
];

const ESTADOS_EDITABLES = ESTADOS.filter(
  (e): e is { label: string; value: EstadoPedidoCalle } => e.value !== 'todos'
);

function avisar(mensaje: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(mensaje);
  } else {
    Alert.alert('Error', mensaje);
  }
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#f59e0b',
  visto: '#3b82f6',
  nota: '#f97316',
  armado: '#8b5cf6',
  retirado: '#22c55e',
  cancelado: '#ef4444',
};

function fmtFecha(ms: number) {
  try {
    return formatFechaHora(Number(ms), {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function PedidosHistorial() {
  const [todos, setTodos] = useState<PedidoCalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedidoCalle | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const cambiarEstado = async (pedido: PedidoCalle, estado: EstadoPedidoCalle) => {
    if (estado === pedido.estado || cambiandoId) return;
    try {
      setCambiandoId(pedido.id);
      await actualizarEstadoPedidoCalle(pedido.id, estado);
      setTodos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, estado } : p)));
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    } finally {
      setCambiandoId(null);
    }
  };

  const eliminarPedido = (pedido: PedidoCalle) => {
    const confirmar = async () => {
      try {
        setEliminandoId(pedido.id);
        await eliminarPedidoCalle(pedido.id);
        setTodos((prev) => prev.filter((p) => p.id !== pedido.id));
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'No se pudo eliminar el pedido.');
      } finally {
        setEliminandoId(null);
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`¿Eliminar el pedido de ${pedido.calleMostrada}? Esta acción no se puede deshacer.`)) {
        void confirmar();
      }
      return;
    }
    Alert.alert(
      'Eliminar pedido',
      `¿Eliminar el pedido de ${pedido.calleMostrada}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void confirmar() },
      ]
    );
  };

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await obtenerTodosLosPedidosCalle();
      setTodos(data.sort((a, b) => b.creadoEn - a.creadoEn));
    } catch {
      setTodos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const pedidosFiltrados = useMemo(() => {
    let lista = todos;
    if (filtroEstado !== 'todos') {
      lista = lista.filter((p) => p.estado === filtroEstado);
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (p) =>
          p.repartidorNombre.toLowerCase().includes(q) ||
          p.calleMostrada.toLowerCase().includes(q) ||
          p.items.some((it) => it.descripcion.toLowerCase().includes(q))
      );
    }
    return lista;
  }, [todos, filtroEstado, busqueda]);

  const totalFiltrado = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total ?? 0), 0);

  return (
    <Screen title="Historial de Pedidos" subtitle="Todos los pedidos levantados en calle" scrollable>
      {/* Buscador */}
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={18} color={COLORS.grisSecundario} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por repartidor, calle o producto…"
          placeholderTextColor={COLORS.grisSecundario}
          value={busqueda}
          onChangeText={setBusqueda}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filtro de estado */}
      <View style={styles.filtroRow}>
        {ESTADOS.map((e) => (
          <View
            key={e.value}
            style={[
              styles.filtroBtn,
              filtroEstado === e.value && {
                backgroundColor: e.value === 'todos' ? COLORS.verdeOscuro : ESTADO_COLOR[e.value] ?? COLORS.verdeOscuro,
              },
            ]}
          >
            <Text
              style={[styles.filtroBtnTxt, filtroEstado === e.value && styles.filtroBtnTxtActivo]}
              onPress={() => setFiltroEstado(e.value)}
            >
              {e.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Resumen */}
      <View style={styles.resumenRow}>
        <Text style={styles.resumenTxt}>
          {pedidosFiltrados.length} pedido(s) · Total: ${totalFiltrado.toFixed(2)}
        </Text>
        <Button
          label={loading ? 'Actualizando…' : 'Actualizar'}
          variant="secondary"
          loading={loading}
          onPress={() => void cargar()}
        />
      </View>

      {/* Lista */}
      {pedidosFiltrados.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="receipt-long" size={36} color={COLORS.grisSecundario} />
          <Text style={styles.emptyTxt}>
            {loading ? 'Cargando pedidos…' : 'Sin pedidos para mostrar.'}
          </Text>
        </View>
      ) : (
        pedidosFiltrados.map((p) => (
          <View key={p.id} style={styles.card}>
            {/* Cabecera: repartidor + estado */}
            <View style={styles.cardHeader}>
              <View style={styles.repTag}>
                <MaterialIcons name="person" size={13} color={COLORS.verdeOscuro} />
                <Text style={styles.repTagTxt}>{p.repartidorNombre}</Text>
              </View>
              <View style={styles.cardHeaderRight}>
                <View style={[styles.estadoTag, { backgroundColor: `${ESTADO_COLOR[p.estado] ?? '#888'}22` }]}>
                  <Text style={[styles.estadoTxt, { color: ESTADO_COLOR[p.estado] ?? '#888' }]}>
                    {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                  </Text>
                </View>
                <MaterialIcons
                  name="delete-outline"
                  size={20}
                  color={eliminandoId === p.id ? '#ccc' : '#e57373'}
                  onPress={() => { if (eliminandoId !== p.id) eliminarPedido(p); }}
                  hitSlop={8}
                />
              </View>
            </View>

            {/* Fecha y calle */}
            <Text style={styles.fecha}>{fmtFecha(p.creadoEn)}</Text>
            <Text style={styles.calle}>{p.calleMostrada}</Text>
            {p.clienteNombre ? (
              <View style={styles.clienteTag}>
                <Text style={styles.clienteTagTxt}>Cliente: {p.clienteNombre}</Text>
              </View>
            ) : null}

            {/* Ítems */}
            {p.items.length > 0 ? (
              <View style={styles.itemsBox}>
                {p.items.map((it, idx) => (
                  <View key={`${p.id}-${idx}`} style={styles.itemFila}>
                    <View style={styles.itemDescRow}>
                      {it.codigo ? (
                        <View style={styles.codigoBadge}>
                          <Text style={styles.codigoBadgeTxt}>{it.codigo}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.itemDesc} numberOfLines={2}>
                        {it.cantidad} × {it.descripcion}
                      </Text>
                    </View>
                    <Text style={styles.itemPrecio}>${Number(it.subtotal ?? 0).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Total y notas */}
            <View style={styles.totalRow}>
              <Text style={styles.totalTxt}>Total: ${Number(p.total ?? 0).toFixed(2)}</Text>
            </View>
            {p.notas?.trim() ? (
              <Text style={styles.notas}>📝 {p.notas}</Text>
            ) : null}

            {/* Cambiar estado */}
            <View style={styles.cambiarEstadoBox}>
              <Text style={styles.cambiarEstadoLabel}>Cambiar estado:</Text>
              <View style={styles.cambiarEstadoRow}>
                {ESTADOS_EDITABLES.map((e) => {
                  const activo = p.estado === e.value;
                  const color = ESTADO_COLOR[e.value] ?? COLORS.verdeOscuro;
                  return (
                    <View
                      key={e.value}
                      style={[
                        styles.estadoOpcion,
                        activo && { backgroundColor: color, borderColor: color },
                      ]}
                    >
                      <Text
                        style={[styles.estadoOpcionTxt, activo && styles.estadoOpcionTxtActivo]}
                        onPress={() => void cambiarEstado(p, e.value)}
                      >
                        {cambiandoId === p.id && !activo ? '…' : e.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e6ea',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
  },
  filtroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filtroBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#eff2f5',
  },
  filtroBtnTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.grisTexto,
  },
  filtroBtnTxtActivo: {
    color: '#fff',
  },
  resumenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resumenTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisSecundario,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  emptyTxt: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisSecundario,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  repTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  repTagTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdeOscuro,
  },
  estadoTag: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoTxt: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  fecha: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisTexto,
  },
  calle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
    color: COLORS.grisTexto,
  },
  clienteTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  clienteTagTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: '#1565c0',
  },
  itemsBox: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    gap: 4,
  },
  itemFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemDescRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
  },
  codigoBadge: {
    backgroundColor: '#22c55e',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  codigoBadgeTxt: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    color: '#fff',
  },
  itemDesc: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisTexto,
    flex: 1,
    lineHeight: 18,
  },
  itemPrecio: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisTexto,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 6,
    alignItems: 'flex-end',
  },
  totalTxt: {
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 16,
    color: COLORS.verdeOscuro,
  },
  notas: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
    fontStyle: 'italic',
  },
  cambiarEstadoBox: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    gap: 6,
  },
  cambiarEstadoLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.grisSecundario,
  },
  cambiarEstadoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  estadoOpcion: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dcdcdc',
  },
  estadoOpcionTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.grisTexto,
  },
  estadoOpcionTxtActivo: {
    color: '#fff',
  },
});
