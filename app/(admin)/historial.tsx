import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

type VistaActiva = 'recorrido' | 'lugares' | 'pedidos';

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

  // Cache de datos por jornadaId
  const recorridoCache = useRef<Record<string, RecorridoJornadaResponse>>({});
  const pedidosCache   = useRef<Record<string, PedidoJornadaHistorial[]>>({});
  const entregasCache  = useRef<Record<string, EntregaJornadaHistorial[]>>({});

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerHistorialAdmin();
      setCierres(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const toggleVista = async (jornadaId: string, vista: VistaActiva) => {
    // Toggle: mismo id + misma vista → cerrar
    if (expandido?.id === jornadaId && expandido?.vista === vista) {
      setExpandido(null);
      return;
    }
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
                    <Text style={styles.inlineTitle}>
                      {entregas?.length ?? 0} lugar(es) visitado(s)
                    </Text>
                    {!entregas || entregas.length === 0 ? (
                      <Text style={styles.row}>Sin visitas registradas para este turno.</Text>
                    ) : (
                      entregas.map((e, idx) => {
                        const minutos = calcMinutos(e.horaLlegada, e.horaSalida);
                        return (
                          <View
                            key={e.id}
                            style={[
                              styles.lugarCard,
                              e.estado === 'problema' && styles.lugarCardProblema,
                              e.estado === 'entregado' && styles.lugarCardOk,
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
                                { backgroundColor: e.estado === 'entregado' ? '#e8f5e9' : e.estado === 'problema' ? '#fff3e0' : '#f0f0f0' }
                              ]}>
                                <Text style={[
                                  styles.estadoBadgeTxt,
                                  { color: e.estado === 'entregado' ? '#2e7d52' : e.estado === 'problema' ? '#e65100' : '#666' }
                                ]}>
                                  {e.estado === 'entregado' ? '✓ Entregado' : e.estado === 'problema' ? '⚠ Problema' : e.estado}
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
                      })
                    )}
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
});
