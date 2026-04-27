import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';

import { RutaTrazada } from '@/components/mapa/RutaTrazada';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { suscribirAdminPedidos } from '@/services/adminPedidos';
import { useAppStore } from '@/store/useAppStore';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import type { Cliente, PedidoAdmin } from '@/types';

function abrirNavegacion(c: Cliente) {
  const { lat, lng } = c.coordenadas;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url);
}

function abrirRutaOptimizadaGoogleMaps(paradas: string[], origen?: { lat: number; lng: number } | null) {
  if (paradas.length === 0) return;
  const p = paradas.filter(Boolean);
  if (p.length === 1) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p[0])}&travelmode=driving`;
    void Linking.openURL(url);
    return;
  }
  const destination = p[p.length - 1];
  const waypoints = p.slice(0, p.length - 1);
  const originParam = origen ? `&origin=${encodeURIComponent(`${origen.lat},${origen.lng}`)}` : '';
  const wp = waypoints.length
    ? `&waypoints=${encodeURIComponent(`optimize:true|${waypoints.join('|')}`)}`
    : '';
  const url = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(
    destination
  )}&travelmode=driving${wp}`;
  void Linking.openURL(url);
}

export default function RutaDelDia() {
  const { clientesDelDia, clienteActualIndex, jornadaActiva, ultimaPosicion, usuario } = useAppStore();
  const pedidosAdmin = useAdminPedidosStore((s) => s.pedidos);

  useEffect(() => suscribirAdminPedidos(() => {}), []);

  const pedidosActivos = useMemo<PedidoAdmin[]>(() => {
    return pedidosAdmin.filter(
      (p) =>
        p.repartidorId === usuario?.id && (p.estado === 'asignado' || p.estado === 'en_ruta')
    );
  }, [pedidosAdmin, usuario?.id]);

  const paradasOptimizadas = useMemo<string[]>(() => {
    const set = new Set<string>();
    pedidosActivos.forEach((pedido) => {
      pedido.calles.forEach((calle) => {
        const key = calle.trim();
        if (key) set.add(key);
      });
    });
    return Array.from(set);
  }, [pedidosActivos]);

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
      {pedidosActivos.length > 0 ? (
        <View style={styles.pedidoBox}>
          <Text style={styles.pedidoTitle}>Pedidos asignados: {pedidosActivos.length}</Text>
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
