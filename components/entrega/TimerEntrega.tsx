import { Text } from 'react-native';

export function TimerEntrega({ segundos }: { segundos: number }) {
  const min = String(Math.floor(segundos / 60)).padStart(2, '0');
  const sec = String(segundos % 60).padStart(2, '0');
  return <Text style={{ fontFamily: 'Poppins_800ExtraBold', fontSize: 32 }}>{min}:{sec}</Text>;
}
