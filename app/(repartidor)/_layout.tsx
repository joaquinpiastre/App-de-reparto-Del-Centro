import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function RepartidorLayout() {
  const usuario = useAppStore((s) => s.usuario);
  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };
  const isWeb = Platform.OS === 'web';

  if (!usuario || usuario.rol !== 'repartidor') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={shellStyle}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          tabBarActiveTintColor: COLORS.verdeOscuro,
          tabBarInactiveTintColor: '#75808a',
          tabBarLabelStyle: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
          tabBarIconStyle: { marginTop: 2 },
          tabBarStyle: {
            height: isWeb ? 58 : 62,
            paddingTop: 6,
            paddingBottom: isWeb ? 6 : 8,
            backgroundColor: '#fff',
            borderTopColor: '#dde3e8',
            borderTopWidth: 1,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color, focused }) => <MaterialIcons name="home" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="ruta-del-dia" options={{ title: 'Ruta', tabBarIcon: ({ color, focused }) => <MaterialIcons name="alt-route" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color, focused }) => <MaterialIcons name="groups" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="resumen" options={{ title: 'Resumen', tabBarIcon: ({ color, focused }) => <MaterialIcons name="insights" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="en-entrega" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="camara" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="firma" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="pedido-calle" options={{ tabBarButton: () => null }} />
      </Tabs>
    </View>
  );
}
