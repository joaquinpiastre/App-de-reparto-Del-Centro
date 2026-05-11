import { ClientesCatalogo } from '@/components/clientes/ClientesCatalogo';

export default function ClientesRepartidor() {
  return (
    <ClientesCatalogo
      title="Clientes y talleres"
      subtitle="Alta y edición de clientes y talleres (la baja la gestiona admin)"
      puedeEliminar={false}
      showBack
    />
  );
}
