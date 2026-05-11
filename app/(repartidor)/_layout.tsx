import { Redirect, Stack } from 'expo-router';
import { Platform, View } from 'react-native';

import { useAppStore } from '@/store/useAppStore';

export default function RepartidorLayout() {
  const usuario = useAppStore((s) => s.usuario);

  if (!usuario || usuario.rol !== 'repartidor') {
    return <Redirect href="/(auth)/login" />;
  }

  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };

  return (
    <View style={shellStyle}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
