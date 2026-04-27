import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { notificacionLocal } from '@/services/notificaciones';
import { suscribirPedidosCalle } from '@/services/pedidosCalle';
import { useAppStore } from '@/store/useAppStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';

export default function AdminLayout() {
  const usuario = useAppStore((s) => s.usuario);
  const pedidos = usePedidosCalleStore((s) => s.pedidos);
  const boot = useRef(true);
  const ultimaNotificada = useRef<string | null>(null);

  if (!usuario || usuario.rol !== 'admin') {
    return <Redirect href="/(auth)/login" />;
  }

  useEffect(() => {
    return suscribirPedidosCalle(() => {});
  }, []);

  useEffect(() => {
    const top = pedidos[0];
    if (!top || top.estado !== 'pendiente') return;
    if (boot.current) {
      boot.current = false;
      ultimaNotificada.current = top.id;
      return;
    }
    if (ultimaNotificada.current !== top.id) {
      ultimaNotificada.current = top.id;
      void notificacionLocal(
        'Nuevo pedido en calle',
        `${top.calleMostrada} · ${top.repartidorNombre} · $${top.total.toFixed(0)}`
      );
    }
  }, [pedidos]);

  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };
  const isWeb = Platform.OS === 'web';

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
        <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, focused }) => <MaterialIcons name="dashboard" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="pedidos-calle" options={{ title: 'Pedidos', tabBarIcon: ({ color, focused }) => <MaterialIcons name="notifications-active" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="mapa-vivo" options={{ title: 'Mapa', tabBarIcon: ({ color, focused }) => <MaterialIcons name="map" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: ({ color, focused }) => <MaterialIcons name="history" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="estadisticas" options={{ title: 'Stats', tabBarIcon: ({ color, focused }) => <MaterialIcons name="bar-chart" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color, focused }) => <MaterialIcons name="groups" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="repartidores" options={{ title: 'Repartidores', tabBarIcon: ({ color, focused }) => <MaterialIcons name="delivery-dining" size={focused ? 23 : 21} color={color} /> }} />
      </Tabs>
    </View>
  );
}
