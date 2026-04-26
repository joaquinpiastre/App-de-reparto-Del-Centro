import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProductoLista } from '@/types';

interface ListaPreciosState {
  productos: ProductoLista[];
  ultimoArchivo: string | null;
  ultimaImportacion: number | null;
  setLista: (productos: ProductoLista[], nombreArchivo: string) => void;
  limpiar: () => void;
}

export const useListaPreciosStore = create<ListaPreciosState>()(
  persist(
    (set) => ({
      productos: [],
      ultimoArchivo: null,
      ultimaImportacion: null,
      setLista: (productos, nombreArchivo) =>
        set({
          productos,
          ultimoArchivo: nombreArchivo,
          ultimaImportacion: Date.now(),
        }),
      limpiar: () => set({ productos: [], ultimoArchivo: null, ultimaImportacion: null }),
    }),
    {
      name: 'delcentro-lista-precios',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
