import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { COLORS } from '@/constants/colors';
import type { Cliente } from '@/types';

interface Props {
  clientes: Cliente[];
  destacarClienteId?: string | null;
}

/** Vista web: mapa embebido + lista de paradas enlazables (la app móvil usa mapa nativo). */
export function RutaTrazada({ clientes, destacarClienteId }: Props) {
  const src = useMemo(() => {
    const c = clientes[0];
    const lat = c?.coordenadas.lat ?? REGION_SAN_RAFAEL.latitude;
    const lng = c?.coordenadas.lng ?? REGION_SAN_RAFAEL.longitude;
    return `https://www.google.com/maps?q=${lat},${lng}&z=11&output=embed`;
  }, [clientes]);

  if (clientes.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Sin paradas para mostrar</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        title: 'Ruta',
        src,
        style: {
          border: 0,
          borderRadius: 16,
          width: '100%',
          height: 220,
          minHeight: 220,
          backgroundColor: '#e8e8e8',
        },
      })}
      <Text style={styles.listTitle}>Paradas ({clientes.length})</Text>
      {clientes.map((c, i) => (
        <Pressable
          key={c.id}
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/dir/?api=1&destination=${c.coordenadas.lat},${c.coordenadas.lng}`
            )
          }
          style={[
            styles.row,
            destacarClienteId === c.id ? styles.rowDestacada : undefined,
          ]}
        >
          <Text style={styles.rowText}>
            {i + 1}. {c.nombre} — {c.direccion}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  fallback: {
    minHeight: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackText: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
  listTitle: { fontFamily: 'Poppins_700Bold', marginTop: 12, color: COLORS.grisTexto },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  rowDestacada: { borderColor: COLORS.verdePrincipal, borderWidth: 2 },
  rowText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, fontSize: 14 },
});
