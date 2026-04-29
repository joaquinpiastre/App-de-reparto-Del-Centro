import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';

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
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

function normalizeMediaUri(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('data:image/') && raw.includes(';base64,')) {
    const dupMarker = raw.indexOf('data:image/', 20);
    return dupMarker > 0 ? raw.slice(dupMarker) : raw;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file://')) {
    return raw;
  }
  return null;
}

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
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerHistorialAdmin();
      setCierres(data);
      if (data.length > 0 && !seleccionado) {
        setSeleccionado(data[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
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
    <Screen title="Historial de rutas" subtitle="Cierres de jornada registrados en backend">
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
        <FlatList
          data={cierres}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item: c }) => (
            <View style={styles.card}>
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
          )}
        />
      )}
      {pedidosJornada.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Pedidos del turno seleccionado</Text>
          {pedidosJornada.map((p) => (
            <View key={p.id} style={styles.subCard}>
              <Text style={styles.title}>{p.titulo}</Text>
              <Text style={styles.row}>ID pedido: {p.id}</Text>
              <Text style={styles.row}>
                Estado: {p.estado} · Total: ${Number(p.total ?? 0).toFixed(2)}
              </Text>
              <Text style={styles.row}>
                Repartidor: {p.repartidorNombre || '-'} ({p.repartidorId || '-'})
              </Text>
              <Text style={styles.row}>
                Creado: {p.creadoEn ? new Date(Number(p.creadoEn)).toLocaleString('es-AR') : '-'}
              </Text>
              <Text style={styles.row}>
                Creado por: {p.creadoPorNombre || '-'} ({p.creadoPorId || '-'})
              </Text>
              <Text style={styles.row}>
                Calles:{' '}
                {Array.isArray(p.calles) ? p.calles.join(', ') : String(p.calles ?? '').trim() || '-'}
              </Text>
              <Text style={styles.row}>Notas: {p.notas?.trim() || 'Sin notas'}</Text>
              <Text style={styles.row}>Items:</Text>
              {p.items?.map((it, idx) => (
                <Text key={`${p.id}-${idx}`} style={styles.row}>
                  · {Number(it.cantidad ?? 0)} x {it.descripcion} · Unit ${Number(it.precioUnitario ?? 0).toFixed(2)} · Subtotal ${Number(it.subtotal ?? 0).toFixed(2)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {entregasJornada.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Entregas completas del turno seleccionado</Text>
          {entregasJornada.map((e) => (
            <View key={e.id} style={styles.subCard}>
              {(() => {
                const fotoUri = normalizeMediaUri(e.fotoUrl);
                const firmaUri = normalizeMediaUri(e.firmaUrl);
                return (
                  <>
              <Text style={styles.title}>
                Cliente {e.clienteId} · {e.estado}
              </Text>
              <Text style={styles.row}>
                Hora:{' '}
                {e.timestampMs ? new Date(Number(e.timestampMs)).toLocaleString('es-AR') : 'Sin horario'}
              </Text>
              {typeof e.tiempoParadaSegundos === 'number' ? (
                <Text style={styles.row}>Tiempo parada: {Math.max(0, Math.round(e.tiempoParadaSegundos / 60))} min</Text>
              ) : null}
              {e.notasRepartidor ? <Text style={styles.row}>Nota: {e.notasRepartidor}</Text> : null}
              {fotoUri ? (
                <View style={styles.mediaBlock}>
                  <Text style={styles.row}>Foto de entrega</Text>
                  <Image source={{ uri: fotoUri }} style={styles.media} resizeMode="cover" />
                </View>
              ) : (
                <Text style={styles.row}>Foto no disponible para esta entrega.</Text>
              )}
              {firmaUri ? (
                <View style={styles.mediaBlock}>
                  <Text style={styles.row}>Firma cliente</Text>
                  <Image source={{ uri: firmaUri }} style={styles.media} resizeMode="contain" />
                </View>
              ) : (
                <Text style={styles.row}>Firma no disponible para esta entrega.</Text>
              )}
                  </>
                );
              })()}
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
  mediaBlock: { marginTop: 8 },
  media: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#eef2f5' },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
});
