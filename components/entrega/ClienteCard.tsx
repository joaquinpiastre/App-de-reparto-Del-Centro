import { StyleSheet, Text, View } from 'react-native';
import type { Cliente } from '@/types';

export function ClienteCard({ cliente }: { cliente: Cliente }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{cliente.orden}. {cliente.nombre}</Text>
      <Text style={styles.line}>{cliente.direccion}</Text>
      <Text style={styles.line}>{cliente.pedido}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12 },
  title: { fontFamily: 'Poppins_700Bold' },
  line: { fontFamily: 'Poppins_400Regular' },
});
