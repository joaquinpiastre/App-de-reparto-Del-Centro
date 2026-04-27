import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';
import { COLORS } from '@/constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'warning';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  iconLeft?: ReactNode;
  loading?: boolean;
}

export function Button({ label, onPress, variant = 'primary', iconLeft, loading = false }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 420;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact ? 42 : 46,
          paddingVertical: compact ? 10 : 12,
          paddingHorizontal: compact ? 12 : 16,
          borderRadius: compact ? 14 : 16,
        },
        styles[variant],
        pressed && styles.pressed,
      ]}
      disabled={loading}
    >
      {iconLeft ? <View style={styles.icon}>{iconLeft}</View> : null}
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.label, { fontSize: compact ? 13 : 14 }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  label: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 14 },
  icon: { marginRight: 8 },
  pressed: { transform: [{ scale: 0.98 }] },
  primary: { backgroundColor: COLORS.verdeOscuro },
  secondary: { backgroundColor: COLORS.acentoAzul },
  danger: { backgroundColor: COLORS.error },
  warning: { backgroundColor: COLORS.advertencia },
});
