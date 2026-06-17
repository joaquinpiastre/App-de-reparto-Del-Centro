import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { COLORS } from '@/constants/colors';
import type { Cliente } from '@/types';

interface Props {
  clientes: Cliente[];
  destacarClienteId?: string | null;
}

export function RutaTrazada({ clientes }: Props) {
  const src = useMemo(() => {
    const c = clientes[0];
    const lat = c?.coordenadas.lat ?? REGION_SAN_RAFAEL.latitude;
    const lng = c?.coordenadas.lng ?? REGION_SAN_RAFAEL.longitude;
    return `https://www.google.com/maps?q=${lat},${lng}&z=11&output=embed`;
  }, [clientes]);

  if (clientes.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Sin coordenadas para mostrar</Text>
      </View>
    );
  }

  return React.createElement('iframe', {
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
  });
}

const styles = StyleSheet.create({
  fallback: {
    minHeight: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackText: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
});
