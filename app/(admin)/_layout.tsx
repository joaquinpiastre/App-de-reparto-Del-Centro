import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

import { TabBarAncha } from '@/components/navigation/TabBarAncha';
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

  useEffect(() => {
    return suscribirPedidosCalle(() => {});
  }, []);

  useEffect(() => {
    if (!usuario || usuario.rol !== 'admin') return;
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
        `${top.calleMostrada} · ${top.repartidorNombre} · $${Number(top.total ?? 0).toFixed(0)}`
      );
    }
  }, [pedidos, usuario]);

  if (!usuario || usuario.rol !== 'admin') {
    return <Redirect href="/(auth)/login" />;
  }

  return <AdminTabs />;
}

function AdminTabs() {
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
          tabBarInactiveTintColor: '#9aa5af',
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 9,
            fontFamily: 'Poppins_600SemiBold',
            marginTop: 2,
            marginBottom: 0,
            width: '100%',
            textAlign: 'center',
          },
          tabBarIconStyle: { marginTop: 0, marginBottom: 2 },
          tabBarItemStyle: {
            flex: 1,
            minWidth: 0,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 1,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color, focused }) => <MaterialIcons name="dashboard" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="asignaciones" options={{ title: 'Asignar', tabBarIcon: ({ color, focused }) => <MaterialIcons name="assignment-ind" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="pedidos-calle" options={{ title: 'Pedidos', tabBarIcon: ({ color, focused }) => <MaterialIcons name="storefront" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="pedidos-historial" options={{ title: 'Hist. Pedidos', tabBarIcon: ({ color, focused }) => <MaterialIcons name="receipt-long" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="mapa-vivo" options={{ title: 'Mapa', tabBarIcon: ({ color, focused }) => <MaterialIcons name="map" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: ({ color, focused }) => <MaterialIcons name="history" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color, focused }) => <MaterialIcons name="groups" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="catalogo" options={{ title: 'Catálogo', tabBarIcon: ({ color, focused }) => <MaterialIcons name="table-chart" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="repartidores" options={{ title: 'Equipo', tabBarIcon: ({ color, focused }) => <MaterialIcons name="delivery-dining" size={focused ? 23 : 21} color={color} /> }} />
        <Tabs.Screen name="estadisticas" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
