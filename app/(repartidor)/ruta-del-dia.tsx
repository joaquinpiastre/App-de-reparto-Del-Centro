import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Alert, FlatList, Linking, StyleSheet, Text, View } from 'react-native';

import { RutaTrazada } from '@/components/mapa/RutaTrazada';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { paradasParaMapsDesdeJornada, urlGoogleMapsRutaOptimizada } from '@/hooks/useRuta';
import { actualizarEstadoPedidoAdmin, suscribirAdminPedidos } from '@/services/adminPedidos';
import { useAppStore } from '@/store/useAppStore';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import type { Cliente } from '@/types';

function abrirNavegacion(c: Cliente) {
  const dest = c.direccion?.trim();
  if (dest) {
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
    );
    return;
  }
  const { lat, lng } = c.coordenadas;
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
}

function abrirRutaOptimizadaGoogleMaps(paradas: string[], origen?: { lat: number; lng: number } | null) {
  const url = urlGoogleMapsRutaOptimizada(paradas, { origen: origen ?? undefined });
  if (url) void Linking.openURL(url);
}

export default function RutaDelDia() {
  const { clientesDelDia, clienteActualIndex, jornadaActiva, ultimaPosicion, usuario, cerrarJornada, jornadaId } =
    useAppStore();
  const pedidosAdmin = useAdminPedidosStore((s) => s.pedidos);
  const cierreNotificadoRef = useRef(false);

  useEffect(() => suscribirAdminPedidos(() => {}), []);

  useEffect(() => {
    if (!jornadaActiva || clientesDelDia.length === 0) {
      cierreNotificadoRef.current = false;
      return;
    }
    const pendientes = clientesDelDia.filter(
      (c) => c.estado === 'pendiente' || c.estado === 'en_camino'
    ).length;
    if (pendientes > 0 || cierreNotificadoRef.current) return;
    cierreNotificadoRef.current = true;
    Alert.alert(
      'Recorrido finalizado',
      'Se completó el recorrido. Se cerrará la jornada y se enviará al panel de admin.',
      [
        {
          text: 'OK',
          onPress: () => {
            void (async () => {
              const pedidosParaCerrar = pedidosAdmin.filter(
                (p) =>
                  p.repartidorId === usuario?.id &&
                  (p.estado === 'pendiente' || p.estado === 'asignado' || p.estado === 'en_ruta')
              );
              if (pedidosParaCerrar.length > 0) {
                await Promise.allSettled(
                  pedidosParaCerrar.map((p) =>
                    actualizarEstadoPedidoAdmin(p.id, 'entregado', { jornadaId: jornadaId ?? undefined })
                  )
                );
              }
              await cerrarJornada();
              router.replace('/(repartidor)/resumen');
            })();
          },
        },
      ]
    );
  }, [jornadaActiva, clientesDelDia, cerrarJornada, pedidosAdmin, usuario?.id]);

  /** Misma secuencia que la lista de la jornada + calles del pedido (no un Set mezclado de otros filtros). */
  const paradasOptimizadas = useMemo<string[]>(() => {
    return paradasParaMapsDesdeJornada(clientesDelDia, pedidosAdmin);
  }, [clientesDelDia, pedidosAdmin]);

  if (!jornadaActiva || clientesDelDia.length === 0) {
    return (
      <Screen title="Mis entregas de hoy" subtitle="Ruta optimizada">
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>Iniciá el turno en Inicio para cargar clientes y el mapa.</Text>
          <Button label="Ir a inicio" onPress={() => router.replace('/(repartidor)')} />
        </View>
      </Screen>
    );
  }

  const actual = clientesDelDia[clienteActualIndex];

  return (
    <Screen title="Mis entregas de hoy" subtitle="Ruta optimizada">
      <RutaTrazada clientes={clientesDelDia} destacarClienteId={actual?.id} />
      {paradasOptimizadas.length > 0 ? (
        <View style={styles.pedidoBox}>
          <Text style={styles.pedidoTitle}>Paradas del recorrido: {paradasOptimizadas.length}</Text>
          <Text style={styles.detalle}>Paradas totales (una ruta optimizada en Google Maps):</Text>
          {paradasOptimizadas.map((c, i) => (
            <Text key={`parada-${c}-${i}`} style={styles.paradaItem}>
              {i + 1}. {c}
            </Text>
          ))}
          <Button
            label="ABRIR RECORRIDO ÓPTIMO EN GOOGLE MAPS"
            onPress={() => abrirRutaOptimizadaGoogleMaps(paradasOptimizadas, ultimaPosicion)}
          />
        </View>
      ) : null}
      <FlatList
        data={clientesDelDia}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Text style={styles.nombre}>
              {index + 1}. {item.nombre}{' '}
              <Text style={styles.estado}>({item.estado.replace('_', ' ')})</Text>
            </Text>
            <Text style={styles.detalle}>{item.direccion}</Text>
            <Text style={styles.detalle}>{item.pedido}</Text>
            <View style={styles.rowBtns}>
              <Button label="NAVEGAR" onPress={() => abrirNavegacion(item)} />
              <Button
                label="ENTREGAR"
                variant="secondary"
                onPress={() => {
                  useAppStore.setState({ clienteActualIndex: index });
                  router.push('/(repartidor)/en-entrega');
                }}
              />
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  avisoTexto: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
  pedidoBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    gap: 6,
  },
  pedidoTitle: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro },
  paradaItem: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginTop: 8 },
  nombre: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  estado: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, fontSize: 12 },
  detalle: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
