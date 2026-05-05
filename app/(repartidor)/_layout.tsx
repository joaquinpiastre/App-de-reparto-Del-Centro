import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

import { TabBarAncha } from '@/components/navigation/TabBarAncha';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function RepartidorLayout() {
  const usuario = useAppStore((s) => s.usuario);

  if (!usuario || usuario.rol !== 'repartidor') {
    return <Redirect href="/(auth)/login" />;
  }

  return <RepartidorTabs />;
}

function RepartidorTabs() {
  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };

  return (
    <View style={shellStyle}>
      <Tabs
        tabBar={(props) => <TabBarAncha {...props} />}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          tabBarActiveTintColor: COLORS.verdeOscuro,
          tabBarInactiveTintColor: '#75808a',
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 12,
            fontFamily: 'Poppins_600SemiBold',
            marginTop: 4,
            marginBottom: 2,
            width: '100%',
            textAlign: 'center',
          },
          tabBarIconStyle: { marginTop: 2, marginBottom: 4 },
          tabBarItemStyle: {
            flex: 1,
            minWidth: 0,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 4,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color, focused }) => <MaterialIcons name="home" size={focused ? 26 : 24} color={color} /> }} />
        <Tabs.Screen name="ruta-del-dia" options={{ title: 'Ruta', tabBarIcon: ({ color, focused }) => <MaterialIcons name="alt-route" size={focused ? 26 : 24} color={color} /> }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color, focused }) => <MaterialIcons name="groups" size={focused ? 26 : 24} color={color} /> }} />
        <Tabs.Screen name="resumen" options={{ title: 'Resumen', tabBarIcon: ({ color, focused }) => <MaterialIcons name="insights" size={focused ? 26 : 24} color={color} /> }} />
        <Tabs.Screen name="en-entrega" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="camara" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="firma" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="pedido-calle" options={{ tabBarButton: () => null }} />
      </Tabs>
    </View>
  );
}
