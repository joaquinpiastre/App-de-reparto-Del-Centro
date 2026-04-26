import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export function useGPS() {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  useEffect(() => {
    let mounted = true;
    Location.getCurrentPositionAsync().then((position) => {
      if (mounted) setCoords(position.coords);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return coords;
}
