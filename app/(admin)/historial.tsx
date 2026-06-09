import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { MapaRecorridoHistorial } from '@/components/mapa/MapaRecorridoHistorial';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import {
  obtenerHistorialAdmin,
  obtenerEntregasJornadaAdmin,
  obtenerPedidosJornadaAdmin,
  obtenerRecorridoJornadaAdmin,
  type EntregaJornadaHistorial,
  type PedidoJornadaHistorial,
  type RecorridoJornadaResponse,
} from '@/services/adminReportes';
import { obtenerTodosLosPedidosCalle } from '@/services/pedidosCalle';
import type { PedidoCalle, EstadoPedidoCalle } from '@/types';
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

type VistaActiva = 'recorrido' | 'lugares' | 'pedidos';
type FiltroLugares = 'todos' | 'entregado' | 'en_camino' | 'problema';

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#f59e0b', visto: '#3b82f6', armado: '#8b5cf6',
  retirado: '#22c55e', cancelado: '#ef4444',
};

const FILTROS: { label: string; value: EstadoPedidoCalle | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Pendiente', value: 'pendiente' },
  { label: 'Visto', value: 'visto' },
  { label: 'Armado', value: 'armado' },
  { label: 'Retirado', value: 'retirado' },
  { label: 'Cancelado', value: 'cancelado' },
];

function fmtHora(ms?: number | null) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function calcMinutos(llegada?: number | null, salida?: number | null): number | null {
  if (!llegada || !salida) return null;
  return Math.max(0, Math.round((Number(salida) - Number(llegada)) / 60000));
}

export default function Historial() {
  const [cierres, setCierres] = useState<CierreJornadaResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuál card está expandida y qué vista muestra
  const [expandido, setExpandido] = useState<{ id: string; vista: VistaActiva } | null>(null);
  const [loadingInline, setLoadingInline] = useState(false);

  // Filtro de estado para "Lugares recorridos"
  const [filtroLugares, setFiltroLugares] = useState<FiltroLugares>('todos');

  // Cache de datos por jornadaId
  const recorridoCache = useRef<Record<string, RecorridoJornadaResponse>>({});
  const pedidosCache   = useRef<Record<string, PedidoJornadaHistorial[]>>({});
  const entregasCache  = useRef<Record<string, EntregaJornadaHistorial[]>>({});

  // Historial de pedidos de calle
  const [todosPedidos, setTodosPedidos] = useState<PedidoCalle[]>([]);
  const [loadingPedidosCalle, setLoadingPedidosCalle] = useState(false);
  const [filtroPedidos, setFiltroPedidos] = useState<EstadoPedidoCalle | 'todos'>('todos');
  const [busquedaPedidos, setBusquedaPedidos] = useState('');

  const pedidosFiltrados = useMemo(() => {
    let lista = todosPedidos;
    if (filtroPedidos !== 'todos') lista = lista.filter((p) => p.estado === filtroPedidos);
    const q = busquedaPedidos.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (p) =>
          p.repartidorNombre.toLowerCase().includes(q) ||
          p.calleMostrada.toLowerCase().includes(q) ||
          p.items.some((it) => it.descripcion.toLowerCase().includes(q))
      );
    }
    return lista;
  }, [todosPedidos, filtroPedidos, busquedaPedidos]);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, pedidos] = await Promise.all([
        obtenerHistorialAdmin(),
        obtenerTodosLosPedidosCalle().catch(() => [] as PedidoCalle[]),
      ]);
      setCierres(data);
      setTodosPedidos(pedidos.sort((a, b) => b.creadoEn - a.creadoEn));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  const actualizarPedidos = async () => {
    try {
      setLoadingPedidosCalle(true);
      const pedidos = await obtenerTodosLosPedidosCalle();
      setTodosPedidos(pedidos.sort((a, b) => b.creadoEn - a.creadoEn));
    } catch { /* silencioso */ } finally {
      setLoadingPedidosCalle(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const toggleVista = async (jornadaId: string, vista: VistaActiva) => {
    // Toggle: mismo id + misma vista → cerrar
    if (expandido?.id === jornadaId && expandido?.vista === vista) {
      setExpandido(null);
      return;
    }
    // Al cambiar de jornada o sección, resetear filtro
    if (expandido?.id !== jornadaId) setFiltroLugares('todos');
    setExpandido({ id: jornadaId, vista });

    // Cargar datos si no están cacheados
    if (vista === 'recorrido' && !recorridoCache.current[jornadaId]) {
      try {
        setLoadingInline(true);
        const data = await obtenerRecorridoJornadaAdmin(jornadaId);
        if (data) recorridoCache.current[jornadaId] = data;
      } catch { /* sin datos GPS */ } finally { setLoadingInline(false); }
    }
    if (vista === 'pedidos' && !pedidosCache.current[jornadaId]) {
      try {
        setLoadingInline(true);
        const data = await obtenerPedidosJornadaAdmin(jornadaId);
        pedidosCache.current[jornadaId] = data;
      } catch { pedidosCache.current[jornadaId] = []; } finally { setLoadingInline(false); }
    }
    if (vista === 'lugares' && !entregasCache.current[jornadaId]) {
      try {
        setLoadingInline(true);
        const data = await obtenerEntregasJornadaAdmin(jornadaId);
        entregasCache.current[jornadaId] = data;
      } catch { entregasCache.current[jornadaId] = []; } finally { setLoadingInline(false); }
    }
  };

  return (
    <Screen title="Historial de rutas" subtitle="Recorridos y pedidos por jornada" scrollable>
      <View style={styles.topRow}>
        <Button
          label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
          variant="secondary"
          loading={loading}
          onPress={() => void cargar()}
        />
      </View>

      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.row}>{error}</Text>
        </View>
      ) : null}

      {cierres.length === 0 && !loading ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sin cierres aún</Text>
          <Text style={styles.row}>Los cierres aparecen cuando los repartidores terminan su turno.</Text>
        </View>
      ) : null}

      {cierres.map((c) => {
        const abierto = expandido?.id === c.id;
        const vistaActiva = abierto ? expandido.vista : null;
        const cargandoEsta = loadingInline && abierto;

        const recorrido = recorridoCache.current[c.id];
        const pedidos   = pedidosCache.current[c.id];
        const entregas  = entregasCache.current[c.id];

        return (
          <View key={c.id} style={styles.card}>
            {/* Cabecera */}
            <Text style={styles.title}>
              {new Date(c.fechaIso).toLocaleString('es-AR', {
                weekday: 'short', day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            <View style={styles.repRow}>
              <View style={styles.repTag}>
                <MaterialIcons name="person" size={13} color={COLORS.verdeOscuro} />
                <Text style={styles.repTagTxt}>{c.repartidorNombre}</Text>
              </View>
              <Text style={styles.statsText}>
                {c.completados}/{c.total} entregas · {c.minutosEnRuta} min
              </Text>
            </View>

            {/* Botones de acción */}
            <View style={styles.actionRow}>
              <Button
                label="Ver recorrido"
                variant={vistaActiva === 'recorrido' ? 'primary' : 'secondary'}
                onPress={() => void toggleVista(c.id, 'recorrido')}
              />
              <Button
                label="Lugares recorridos"
                variant={vistaActiva === 'lugares' ? 'primary' : 'secondary'}
                onPress={() => void toggleVista(c.id, 'lugares')}
              />
              <Button
                label="Ver pedidos"
                variant={vistaActiva === 'pedidos' ? 'primary' : 'secondary'}
                onPress={() => void toggleVista(c.id, 'pedidos')}
              />
            </View>

            {/* ── Contenido inline expandido ── */}
            {abierto && (
              <View style={styles.inlineBox}>
                {cargandoEsta ? (
                  <Text style={styles.cargandoTxt}>Cargando…</Text>
                ) : vistaActiva === 'recorrido' ? (
                  <>
                    <MapaRecorridoHistorial
                      points={recorrido?.points ?? []}
                      stops={recorrido?.stops ?? []}
                      visitStops={recorrido?.visitStops ?? []}
                    />
                    <Text style={styles.row}>
                      Puntos GPS: {recorrido?.points.length ?? 0} · Paradas: {recorrido?.stops.length ?? 0}
                    </Text>
                    {(recorrido?.stops ?? []).map((s, i) => (
                      <Text key={`${s.inicio}-${i}`} style={styles.row}>
                        • Parada {i + 1}: {new Date(s.inicio).toLocaleTimeString('es-AR')} →{' '}
                        {new Date(s.fin).toLocaleTimeString('es-AR')} ({Math.round(s.duracionSegundos / 60)} min)
                      </Text>
                    ))}
                  </>
                ) : vistaActiva === 'lugares' ? (
                  <>
                    {/* Chips de filtro por estado */}
                    {entregas && entregas.length > 0 && (() => {
                      const conteos = {
                        todos: entregas.length,
                        entregado: entregas.filter(e => e.estado === 'entregado').length,
                        en_camino: entregas.filter(e => e.estado === 'en_camino').length,
                        problema: entregas.filter(e => e.estado === 'problema').length,
                      };
                      const FILTROS_LUGARES: { key: FiltroLugares; label: string; color: string }[] = ([
                        { key: 'todos' as FiltroLugares, label: `Todos (${conteos.todos})`, color: COLORS.grisSecundario },
                        { key: 'entregado' as FiltroLugares, label: `✓ Entregado (${conteos.entregado})`, color: '#2e7d52' },
                        { key: 'en_camino' as FiltroLugares, label: `En camino (${conteos.en_camino})`, color: '#1565c0' },
                        { key: 'problema' as FiltroLugares, label: `⚠ Problema (${conteos.problema})`, color: '#e65100' },
                      ] as { key: FiltroLugares; label: string; color: string }[]).filter(f => f.key === 'todos' || conteos[f.key] > 0);
                      return (
                        <View style={styles.filtroRow}>
                          {FILTROS_LUGARES.map(f => {
                            const activo = filtroLugares === f.key;
                            return (
                              <Pressable
                                key={f.key}
                                style={[styles.filtroBtn, activo && { backgroundColor: f.color }]}
                                onPress={() => setFiltroLugares(f.key)}
                              >
                                <Text style={[styles.filtroBtnTxt, activo && styles.filtroBtnActivo]}>
                                  {f.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })()}

                    {/* Lista filtrada */}
                    {!entregas || entregas.length === 0 ? (
                      <Text style={styles.row}>Sin visitas registradas para este turno.</Text>
                    ) : (() => {
                      const lista = filtroLugares === 'todos'
                        ? entregas
                        : entregas.filter(e => e.estado === filtroLugares);
                      if (lista.length === 0) {
                        return <Text style={styles.row}>Sin visitas con ese estado.</Text>;
                      }
                      return lista.map((e, idx) => {
                        const minutos = calcMinutos(e.horaLlegada, e.horaSalida);
                        return (
                          <View
                            key={e.id}
                            style={[
                              styles.lugarCard,
                              e.estado === 'problema' && styles.lugarCardProblema,
                              e.estado === 'entregado' && styles.lugarCardOk,
                              e.estado === 'en_camino' && styles.lugarCardEnCamino,
                            ]}
                          >
                            <View style={styles.lugarHeader}>
                              <Text style={styles.lugarNum}>{idx + 1}</Text>
                              <View style={styles.lugarInfo}>
                                <Text style={styles.lugarNombre}>{e.clienteNombre}</Text>
                                <Text style={styles.lugarDir}>{e.clienteDireccion}</Text>
                              </View>
                              <View style={[
                                styles.estadoBadge,
                                {
                                  backgroundColor:
                                    e.estado === 'entregado' ? '#e8f5e9'
                                    : e.estado === 'problema' ? '#fff3e0'
                                    : e.estado === 'en_camino' ? '#e3f2fd'
                                    : '#f0f0f0'
                                }
                              ]}>
                                <Text style={[
                                  styles.estadoBadgeTxt,
                                  {
                                    color:
                                      e.estado === 'entregado' ? '#2e7d52'
                                      : e.estado === 'problema' ? '#e65100'
                                      : e.estado === 'en_camino' ? '#1565c0'
                                      : '#666'
                                  }
                                ]}>
                                  {e.estado === 'entregado' ? '✓ Entregado'
                                    : e.estado === 'problema' ? '⚠ Problema'
                                    : e.estado === 'en_camino' ? 'En camino'
                                    : e.estado}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.lugarTiempo}>
                              <MaterialIcons name="schedule" size={13} color={COLORS.grisSecundario} />
                              <Text style={styles.lugarTiempoTxt}>
                                {e.horaLlegada ? `Llegada: ${fmtHora(e.horaLlegada)}` : 'Sin hora de llegada'}
                                {e.horaSalida ? ` · Salida: ${fmtHora(e.horaSalida)}` : ''}
                                {minutos != null ? ` · ${minutos} min en el lugar` : ''}
                              </Text>
                            </View>
                            {e.notasRepartidor ? (
                              <Text style={styles.lugarNota}>📝 {e.notasRepartidor}</Text>
                            ) : null}
                          </View>
                        );
                      });
                    })()}
                  </>
                ) : vistaActiva === 'pedidos' ? (
                  <>
                    <Text style={styles.inlineTitle}>
                      {pedidos?.length ?? 0} pedido(s) de calle en este turno
                    </Text>
                    {!pedidos || pedidos.length === 0 ? (
                      <Text style={styles.row}>Sin pedidos de calle registrados para este turno.</Text>
                    ) : (
                      pedidos.map((p) => (
                        <View key={p.id} style={styles.pedidoCard}>
                          {p.clienteNombre ? (
                            <View style={styles.pcClienteTag}>
                              <Text style={styles.pcClienteTagTxt}>{p.clienteNombre}</Text>
                            </View>
                          ) : null}
                          <View style={styles.pedidoHeader}>
                            <Text style={styles.pedidoTitulo}>{p.titulo}</Text>
                            <View style={[styles.estadoBadge, { backgroundColor: p.estado === 'retirado' ? '#e8f5e9' : p.estado === 'cancelado' ? '#fce4e4' : '#fff9e6' }]}>
                              <Text style={[styles.estadoBadgeTxt, { color: p.estado === 'retirado' ? '#2e7d52' : p.estado === 'cancelado' ? '#c0392b' : '#b45309' }]}>
                                {p.estado}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.pedidoFecha}>
                            {p.creadoEn
                              ? new Date(Number(p.creadoEn)).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </Text>
                          {(p.items ?? []).map((it, idx) => (
                            <Text key={`${p.id}-${idx}`} style={styles.itemRow}>
                              · {Number(it.cantidad ?? 0)} × {it.descripcion} — ${Number(it.subtotal ?? 0).toFixed(2)}
                            </Text>
                          ))}
                          <Text style={styles.pedidoTotal}>Total: ${Number(p.total ?? 0).toFixed(2)}</Text>
                          {p.notas?.trim() ? <Text style={styles.pedidoNota}>📝 {p.notas}</Text> : null}
                        </View>
                      ))
                    )}
                  </>
                ) : null}
              </View>
            )}
          </View>
        );
      })}

      {/* ── Historial de Pedidos en Calle ── */}
      <View style={[styles.card, styles.seccionPedidos]}>
        <View style={styles.seccionHeader}>
          <View style={styles.seccionTitRow}>
            <MaterialIcons name="receipt-long" size={20} color={COLORS.verdeOscuro} />
            <Text style={styles.seccionTit}>Historial de Pedidos en Calle</Text>
          </View>
          <Button
            label={loadingPedidosCalle ? 'Actualizando…' : 'Actualizar'}
            variant="secondary"
            loading={loadingPedidosCalle}
            onPress={() => void actualizarPedidos()}
          />
        </View>

        {/* Buscador */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={16} color={COLORS.grisSecundario} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por repartidor, calle o producto…"
            placeholderTextColor={COLORS.grisSecundario}
            value={busquedaPedidos}
            onChangeText={setBusquedaPedidos}
          />
        </View>

        {/* Filtros */}
        <View style={styles.filtroRow}>
          {FILTROS.map((f) => (
            <View
              key={f.value}
              style={[
                styles.filtroBtn,
                filtroPedidos === f.value && {
                  backgroundColor: f.value === 'todos' ? COLORS.verdeOscuro : (ESTADO_COLOR[f.value] ?? COLORS.verdeOscuro),
                },
              ]}
            >
              <Text
                style={[styles.filtroBtnTxt, filtroPedidos === f.value && styles.filtroBtnActivo]}
                onPress={() => setFiltroPedidos(f.value)}
              >
                {f.label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.resumenTxt}>
          {pedidosFiltrados.length} pedido(s) · Total: ${pedidosFiltrados.reduce((acc, p) => acc + Number(p.total ?? 0), 0).toFixed(2)}
        </Text>

        {pedidosFiltrados.length === 0 ? (
          <Text style={styles.row}>{loading ? 'Cargando…' : 'Sin pedidos para mostrar.'}</Text>
        ) : (
          pedidosFiltrados.map((p) => (
            <View key={p.id} style={styles.pedidoCalleCard}>
              {/* Cabecera: repartidor + estado */}
              <View style={styles.pedidoCalleHeader}>
                <View style={styles.repTag}>
                  <MaterialIcons name="person" size={12} color={COLORS.verdeOscuro} />
                  <Text style={styles.repTagTxt}>{p.repartidorNombre}</Text>
                </View>
                <View style={[styles.estadoBadge, { backgroundColor: `${ESTADO_COLOR[p.estado] ?? '#888'}22` }]}>
                  <Text style={[styles.estadoBadgeTxt, { color: ESTADO_COLOR[p.estado] ?? '#888' }]}>
                    {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                  </Text>
                </View>
              </View>
              {/* Fecha + calle */}
              <Text style={styles.pedidoFecha}>
                {new Date(Number(p.creadoEn)).toLocaleString('es-AR', {
                  weekday: 'short', day: '2-digit', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
              <Text style={styles.pedidoTitulo}>{p.calleMostrada}</Text>
              {p.clienteNombre ? (
                <View style={styles.pcClienteTag}>
                  <Text style={styles.pcClienteTagTxt}>Cliente: {p.clienteNombre}</Text>
                </View>
              ) : null}
              {/* Ítems */}
              {p.items.length > 0 ? (
                <View style={styles.pcItemsBox}>
                  {p.items.map((it, idx) => (
                    <View key={`${p.id}-${idx}`} style={styles.pcItemFila}>
                      <Text style={styles.pcItemDesc} numberOfLines={2}>
                        {it.cantidad} × {it.descripcion}
                      </Text>
                      <Text style={styles.pcItemPrecio}>${Number(it.subtotal ?? 0).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.pcPedidoTotal}>Total: ${Number(p.total ?? 0).toFixed(2)}</Text>
              {p.notas?.trim() ? <Text style={styles.pcPedidoNota}>📝 {p.notas}</Text> : null}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'flex-start' },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 8,
  },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4, color: COLORS.grisTexto },

  repRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  repTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e8f5e9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  repTagTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.verdeOscuro },
  statsText: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  // Inline expandido
  inlineBox: {
    borderTopWidth: 1,
    borderTopColor: '#edf0f2',
    marginTop: 4,
    paddingTop: 12,
    gap: 8,
  },
  inlineTitle: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  cargandoTxt: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },

  // Lugar card
  lugarCard: {
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 5,
  },
  lugarCardOk: { borderColor: '#c8e6c9', backgroundColor: '#f1f8f2' },
  lugarCardProblema: { borderColor: '#ffe0b2', backgroundColor: '#fff8f2' },
  lugarCardEnCamino: { borderColor: '#bbdefb', backgroundColor: '#f0f7ff' },
  lugarHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lugarNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.grisClaro,
    textAlign: 'center', lineHeight: 24,
    fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisTexto,
  },
  lugarInfo: { flex: 1 },
  lugarNombre: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: COLORS.grisTexto },
  lugarDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, lineHeight: 16 },
  lugarTiempo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lugarTiempoTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, flex: 1 },
  lugarNota: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#b45309', fontStyle: 'italic' },

  estadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  estadoBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },

  // Pedido card
  pedidoCard: {
    borderRadius: 12, padding: 10, marginTop: 6,
    backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e8ecef',
    gap: 4,
  },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  pedidoTitulo: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: COLORS.grisTexto, flex: 1 },
  pedidoFecha: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  itemRow: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisTexto, lineHeight: 18 },
  pedidoTotal: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: COLORS.verdeOscuro, marginTop: 2 },
  pedidoNota: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#b45309', fontStyle: 'italic' },

  pcClienteTag: {
    alignSelf: 'flex-start', backgroundColor: '#e3f2fd',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  pcClienteTagTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#1565c0' },

  // Sección historial de pedidos
  seccionPedidos: { gap: 10 },
  seccionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  seccionTitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seccionTit: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: COLORS.grisTexto },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f5f7fa', borderRadius: 10, borderWidth: 1,
    borderColor: '#e0e6ea', paddingHorizontal: 10, paddingVertical: 7,
  },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisTexto },
  filtroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filtroBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#eff2f5' },
  filtroBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisTexto },
  filtroBtnActivo: { color: '#fff' },
  resumenTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisSecundario },

  pedidoCalleCard: {
    borderRadius: 12, padding: 10, backgroundColor: '#f8f9fa',
    borderWidth: 1, borderColor: '#e8ecef', gap: 5,
  },
  pedidoCalleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  pcItemsBox: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6, gap: 3 },
  pcItemFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  pcItemDesc: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisTexto, flex: 1, lineHeight: 17 },
  pcItemPrecio: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisTexto },
  pcPedidoTotal: { fontFamily: 'Poppins_700Bold', fontSize: 13, color: COLORS.verdeOscuro },
  pcPedidoNota: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#b45309', fontStyle: 'italic' },
});
