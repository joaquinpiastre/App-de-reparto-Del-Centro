import { ClientesCatalogo } from '@/components/clientes/ClientesCatalogo';

export default function Clientes() {
  return (
    <ClientesCatalogo
      title="Clientes y talleres"
      subtitle="Catálogo central: clientes, talleres y baja de registros"
      puedeEliminar
    />
  );
}
