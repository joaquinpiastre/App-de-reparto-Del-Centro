import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface CierreJornadaResumen {
  id: string;
  fechaIso: string;
  repartidorNombre: string;
  completados: number;
  total: number;
  minutosEnRuta: number;
}

interface HistorialState {
  cierres: CierreJornadaResumen[];
  registrarCierre: (c: Omit<CierreJornadaResumen, 'id'>) => void;
}

export const useHistorialStore = create<HistorialState>()(
  persist(
    (set) => ({
      cierres: [],
      registrarCierre: (c) =>
        set((s) => ({
          cierres: [
            {
              ...c,
              id: `hj-${Date.now()}`,
            },
            ...s.cierres,
          ].slice(0, 60),
        })),
    }),
    {
      name: 'delcentro-historial-jornadas',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
