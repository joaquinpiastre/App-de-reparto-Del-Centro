import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';

export default function Index() {
  const usuario = useAppStore((s) => s.usuario);

  if (!usuario) {
    return <Redirect href="/(auth)/login" />;
  }

  if (usuario.rol === 'admin') {
    return <Redirect href="/(admin)" />;
  }

  return <Redirect href="/(repartidor)" />;
}
