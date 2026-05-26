import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapaRecorridoHistorial } from '@/components/mapa/MapaRecorridoHistorial';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import {
  obtenerHistorialAdmin,
  obtenerEntregasJornadaAdmin,
  obtenerPedidosJornadaAdmin,
  type EntregaJornadaHistorial,
  obtenerRecorridoJornadaAdmin,
  type PedidoJornadaHistorial,
  type RecorridoJornadaResponse,
} from '@/services/adminReportes';
import { obtenerTodosLosPedidosCalle } from '@/services/pedidosCalle';
import type { PedidoCalle } from '@/types';
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

export default function Historial() {
  const [cierres, setCierres] = useState<CierreJornadaResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<CierreJornadaResumen | null>(null);
  const [recorrido, setRecorrido] = useState<RecorridoJornadaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRecorrido, setLoadingRecorrido] = useState(false);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  const [pedidosJornada, setPedidosJornada] = useState<PedidoJornadaHistorial[]>([]);
  const [entregasJornada, setEntregasJornada] = useState<EntregaJornadaHistorial[]>([]);
  const [pedidosCalleFinalizados, setPedidosCalleFinalizados] = useState<PedidoCalle[]>([]);
  const [loadingPedidosCalle, setLoadingPedidosCalle] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const cargarPedidosCalle = async () => {
    try {
      setLoadingPedidosCalle(true);
      const data = await obtenerTodosLosPedidosCalle();
      setPedidosCalleFinalizados(data.sort((a, b) => b.creadoEn - a.creadoEn));
    } catch {
      setPedidosCalleFinalizados([]);
    } finally {
      setLoadingPedidosCalle(false);
    }
  };

  useEffect(() => {
    void cargar();
    void cargarPedidosCalle();
  }, []);

  useEffect(() => {
    if (!seleccionado) return;
    void (async () => {
      try {
        setLoadingRecorrido(true);
        const data = await obtenerRecorridoJornadaAdmin(seleccionado.id);
        setRecorrido(data);
      } catch {
        setRecorrido(null);
      } finally {
        setLoadingRecorrido(false);
      }
    })();
  }, [seleccionado?.id]);

  const verPedidos = async (jornadaId: string) => {
    try {
      setLoadingPedidos(true);
      const pedidos = await obtenerPedidosJornadaAdmin(jornadaId);
      setPedidosJornada(pedidos);
    } catch {
      setPedidosJornada([]);
    } finally {
      setLoadingPedidos(false);
    }
  };

  const verEntregas = async (jornadaId: string) => {
    try {
      setLoadingEntregas(true);
      const entregas = await obtenerEntregasJornadaAdmin(jornadaId);
      setEntregasJornada(entregas);
    } catch {
      setEntregasJornada([]);
    } finally {
      setLoadingEntregas(false);
    }
  };

  return (
    <Screen title="Historial de rutas" subtitle="Cierres de jornada registrados en backend" scrollable>
      <View style={styles.topRow}>
        <Button
          label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
          variant="secondary"
          loading={loading}
          onPress={() => { void cargar(); void cargarPedidosCalle(); }}
        />
      </View>
      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.row}>{error}</Text>
        </View>
      ) : null}
      {seleccionado ? (
        <View style={styles.card}>
          <Text style={styles.title}>Recorrido de jornada</Text>
          <Text style={styles.row}>
            {seleccionado.repartidorNombre} · {new Date(seleccionado.fechaIso).toLocaleString('es-AR')}
          </Text>
          {loadingRecorrido ? (
            <Text style={styles.row}>Cargando trazado GPS…</Text>
          ) : (
            <>
              <MapaRecorridoHistorial points={recorrido?.points ?? []} stops={recorrido?.stops ?? []} />
              <Text style={styles.row}>
                Puntos: {recorrido?.points.length ?? 0} · Paradas +2 min: {recorrido?.stops.length ?? 0}
              </Text>
              {(recorrido?.stops.length ?? 0) > 0
                ? (recorrido?.stops ?? []).map((s, i) => (
                    <Text key={`${s.inicio}-${i}`} style={styles.row}>
                      • Parada {i + 1}: {new Date(s.inicio).toLocaleTimeString('es-AR')} -{' '}
                      {new Date(s.fin).toLocaleTimeString('es-AR')} ({Math.round(s.duracionSegundos / 60)} min)
                    </Text>
                  ))
                : null}
            </>
          )}
        </View>
      ) : null}
      {cierres.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sin cierres aún</Text>
          <Text style={styles.row}>Los cierres aparecen cuando hay entregas registradas.</Text>
        </View>
      ) : (
        cierres.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>
              {new Date(c.fechaIso).toLocaleString('es-AR')} · {c.repartidorNombre}
            </Text>
            <Text style={styles.row}>
              {c.completados}/{c.total} entregas · {c.minutosEnRuta} min en ruta
            </Text>
            <View style={styles.actionRow}>
              <View style={styles.actionBtn}>
                <Button label="Ver recorrido" variant="secondary" onPress={() => setSeleccionado(c)} />
              </View>
              <View style={styles.actionBtn}>
                <Button
                  label={loadingPedidos && seleccionado?.id === c.id ? 'Cargando pedidos…' : 'Ver pedidos'}
                  variant="secondary"
                  loading={loadingPedidos && seleccionado?.id === c.id}
                  onPress={() => void verPedidos(c.id)}
                />
              </View>
              <View style={styles.actionBtn}>
                <Button
                  label={loadingEntregas && seleccionado?.id === c.id ? 'Cargando entregas…' : 'Ver entregas'}
                  variant="secondary"
                  loading={loadingEntregas && seleccionado?.id === c.id}
                  onPress={() => void verEntregas(c.id)}
                />
              </View>
            </View>
          </View>
        ))
      )}
      {pedidosJornada.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pedidos en calle del turno</Text>
          <Text style={styles.row}>{pedidosJornada.length} pedido(s) levantado(s) en la calle</Text>
          {pedidosJornada.map((p) => (
            <View key={p.id} style={styles.subCard}>
              {p.clienteNombre ? (
                <View style={styles.pcClienteTag}>
                  <Text style={styles.pcClienteTagText}>{p.clienteNombre}</Text>
                </View>
              ) : null}
              <Text style={styles.title}>{p.titulo}</Text>
              <Text style={styles.row}>
                {p.creadoEn ? new Date(Number(p.creadoEn)).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                {' · '}
                <Text style={p.estado === 'retirado' ? styles.estadoOk : p.estado === 'cancelado' ? styles.estadoMal : styles.estadoNeutro}>
                  {p.estado}
                </Text>
                {' · Total $'}{Number(p.total ?? 0).toFixed(2)}
              </Text>
              {p.items?.map((it, idx) => (
                <Text key={`${p.id}-${idx}`} style={styles.row}>
                  · {Number(it.cantidad ?? 0)} × {it.descripcion} — ${Number(it.subtotal ?? 0).toFixed(2)}
                </Text>
              ))}
              {p.notas?.trim() ? <Text style={styles.row}>Nota: {p.notas}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pedidos levantados en calle</Text>
        <Text style={styles.row}>Todos los pedidos que los repartidores levantaron en la calle.</Text>
        {loadingPedidosCalle ? (
          <Text style={styles.row}>Cargando…</Text>
        ) : pedidosCalleFinalizados.length === 0 ? (
          <Text style={styles.row}>Sin pedidos de calle registrados aún.</Text>
        ) : (
          pedidosCalleFinalizados.map((p) => {
            const esRetirado = p.estado === 'retirado';
            const esCancelado = p.estado === 'cancelado';
            const esPendiente = !esRetirado && !esCancelado;
            return (
              <View key={p.id} style={[styles.subCard, esCancelado && styles.subCardCancelado]}>
                <View style={styles.pcRepartidorTag}>
                  <Text style={styles.pcRepartidorTagText}>{p.repartidorNombre}</Text>
                </View>
                <Text style={styles.title}>{p.calleMostrada}</Text>
                <Text style={styles.row}>
                  {new Date(p.creadoEn).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  <Text style={esRetirado ? styles.estadoOk : esCancelado ? styles.estadoMal : styles.estadoNeutro}>
                    {esRetirado ? 'Retirado' : esCancelado ? 'Cancelado' : esPendiente ? p.estado : p.estado}
                  </Text>
                  {' · Total $'}{Number(p.total ?? 0).toFixed(2)}
                </Text>
                {p.items.map((it, idx) => (
                  <Text key={`${p.id}-${idx}`} style={styles.row}>
                    · {it.cantidad} x {it.descripcion} · ${Number(it.subtotal ?? 0).toFixed(2)}
                  </Text>
                ))}
                {p.notas ? <Text style={styles.row}>Nota: {p.notas}</Text> : null}
              </View>
            );
          })
        )}
      </View>

      {entregasJornada.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Visitas del turno</Text>
          <Text style={styles.row}>{entregasJornada.length} visita(s) registrada(s)</Text>
          {entregasJornada.map((e, idx) => (
            <View key={e.id} style={[styles.subCard, e.estado === 'problema' && styles.subCardProblema]}>
              <Text style={styles.title}>
                {idx + 1}. {e.clienteNombre}
              </Text>
              <Text style={styles.row}>{e.clienteDireccion}</Text>
              <Text style={styles.row}>
                <Text style={e.estado === 'entregado' ? styles.estadoOk : e.estado === 'problema' ? styles.estadoMal : styles.estadoNeutro}>
                  {e.estado === 'entregado' ? 'Entregado' : e.estado === 'problema' ? 'Con problema' : e.estado}
                </Text>
                {e.horaLlegada ? ` · Llegada: ${new Date(Number(e.horaLlegada)).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                {e.horaSalida ? ` · Salida: ${new Date(Number(e.horaSalida)).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
              {e.notasRepartidor ? <Text style={styles.row}>Nota: {e.notasRepartidor}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  topRow: { alignItems: 'flex-start' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionBtn: { minWidth: 150, flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 },
  subCard: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 10, marginTop: 8 },
  subCardCancelado: { backgroundColor: '#fff5f5' },
  subCardProblema: { backgroundColor: '#fff8f0' },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },
  sectionTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16, marginBottom: 6 },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
  pcRepartidorTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  pcRepartidorTagText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#2e7d52' },
  pcClienteTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  pcClienteTagText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#1565c0' },
  estadoOk: { fontFamily: 'Poppins_600SemiBold', color: '#2e7d52' },
  estadoMal: { fontFamily: 'Poppins_600SemiBold', color: '#c0392b' },
  estadoNeutro: { fontFamily: 'Poppins_600SemiBold', color: '#b45309' },
});
