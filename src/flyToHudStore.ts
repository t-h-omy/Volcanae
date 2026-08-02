import { create } from 'zustand';

export interface FlyToHudFlight {
  id: string;
  emoji: string;
  fromScreenX: number;
  fromScreenY: number;
  targetSelector: string;
  onArrival?: () => void;
}

interface FlyToHudState {
  flights: FlyToHudFlight[];
}

interface FlyToHudActions {
  addFlight: (flight: Omit<FlyToHudFlight, 'id'>) => void;
  removeFlight: (id: string) => void;
}

export const useFlyToHudStore = create<FlyToHudState & FlyToHudActions>((set) => ({
  flights: [],
  addFlight: (flight) => {
    const id = crypto.randomUUID();
    set((state) => ({ flights: [...state.flights, { ...flight, id }] }));
  },
  removeFlight: (id) => set((state) => ({ flights: state.flights.filter((flight) => flight.id !== id) })),
}));
