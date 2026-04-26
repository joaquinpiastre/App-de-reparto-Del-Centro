import { Text } from 'react-native';
import type { EstadoEntrega as Estado } from '@/types';

export function EstadoEntrega({ estado }: { estado: Estado }) {
  return <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Estado: {estado}</Text>;
}
