import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { CLIENTES_DEMO_SEED } from '@/constants/demoData';

export default function Clientes() {
  const [q, setQ] = useState('');
  const data = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return CLIENTES_DEMO_SEED;
    return CLIENTES_DEMO_SEED.filter(
      (c) =>
        c.nombre.toLowerCase().includes(s) ||
        c.direccion.toLowerCase().includes(s) ||
        c.telefono.includes(s)
    );
  }, [q]);

  return (
    <Screen title="Gestión de clientes" subtitle="Catálogo demo + buscador">
      <TextInput
        style={styles.input}
        placeholder="Buscar por nombre, dirección o teléfono"
        placeholderTextColor={COLORS.grisSecundario}
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.nombre}</Text>
            <Text style={styles.row}>
              {item.direccion} · {item.telefono}
            </Text>
            <Text style={styles.row}>Pedido típico: {item.pedido}</Text>
          </View>
        )}
      />
      <Button
        label="AGREGAR CLIENTE (próximamente)"
        onPress={() => {}}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
  },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8 },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
});
