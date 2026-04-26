import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

import { COLORS } from '@/constants/colors';

export default function RepartidorLayout() {
  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };

  return (
    <View style={shellStyle}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          tabBarActiveTintColor: COLORS.verdeOscuro,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <MaterialIcons name="home" size={20} color={color} /> }} />
        <Tabs.Screen name="ruta-del-dia" options={{ title: 'Ruta', tabBarIcon: ({ color }) => <MaterialIcons name="route" size={20} color={color} /> }} />
        <Tabs.Screen name="resumen" options={{ title: 'Resumen', tabBarIcon: ({ color }) => <MaterialIcons name="insights" size={20} color={color} /> }} />
        <Tabs.Screen name="en-entrega" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="camara" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="firma" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="pedido-calle" options={{ tabBarButton: () => null }} />
      </Tabs>
    </View>
  );
}
