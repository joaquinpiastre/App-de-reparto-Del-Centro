import { router } from 'expo-router';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';

import { RutaTrazada } from '@/components/mapa/RutaTrazada';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import type { Cliente } from '@/types';

function abrirNavegacion(c: Cliente) {
  const { lat, lng } = c.coordenadas;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url);
}

export default function RutaDelDia() {
  const { clientesDelDia, clienteActualIndex, jornadaActiva } = useAppStore();

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
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginTop: 8 },
  nombre: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  estado: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, fontSize: 12 },
  detalle: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
