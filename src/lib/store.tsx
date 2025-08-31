'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import type { User, Court, Booking } from './types';

// --- INITIAL MOCK DATA ---
const initialUsers: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@courtsync.com', role: 'admin' },
  { id: '2', name: 'Regular User', email: 'user@courtsync.com', role: 'user' },
];

const initialCourts: Court[] = [
  { id: '1', name: 'Central Tennis Court', location: 'Downtown Park', maxPlayers: 4 },
  { id: '2', name: 'Downtown Basketball Court', location: 'City Center Sports Complex', maxPlayers: 10 },
  { id: '3', name: 'Westside Volleyball Court', location: 'Westside Beach', maxPlayers: 12 },
  { id: '4', name: 'North Park Pickleball', location: 'North Park', maxPlayers: 4 },
];

const initialBookings: Booking[] = [
  { id: '1', courtId: '1', userId: '2', date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: '10:00 AM', status: 'approved' },
  { id: '2', courtId: '2', userId: '2', date: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0], time: '2:00 PM', status: 'pending' },
];

// --- STATE AND ACTIONS ---
interface AppState {
  user: User | null;
  users: User[];
  courts: Court[];
  bookings: Booking[];
}

type Action =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'ADD_COURT'; payload: Court }
  | { type: 'DELETE_COURT'; payload: string }
  | { type: 'ADD_BOOKING'; payload: Booking }
  | { type: 'UPDATE_BOOKING_STATUS'; payload: { bookingId: string; status: Booking['status'] } };

const initialState: AppState = {
  user: null,
  users: initialUsers,
  courts: initialCourts,
  bookings: initialBookings,
};

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { ...state, user: null };
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'ADD_COURT':
        return { ...state, courts: [...state.courts, action.payload] };
    case 'DELETE_COURT':
        return { ...state, courts: state.courts.filter(c => c.id !== action.payload) };
    case 'ADD_BOOKING':
      return { ...state, bookings: [...state.bookings, action.payload] };
    case 'UPDATE_BOOKING_STATUS':
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.payload.bookingId ? { ...b, status: action.payload.status } : b
        ),
      };
    default:
      return state;
  }
};

// --- CONTEXT AND PROVIDER ---
interface StoreContextValue extends AppState {
  login: (email: string, role: 'admin' | 'user') => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id'>) => void;
  addCourt: (court: Omit<Court, 'id'>) => void;
  deleteCourt: (courtId: string) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'status'>) => void;
  updateBookingStatus: (bookingId: string, status: Booking['status']) => void;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const storedState = localStorage.getItem('courtSyncState');
    if (storedState) {
        const parsedState = JSON.parse(storedState);
        // Basic merge, could be more sophisticated
        dispatch({ type: 'LOGIN', payload: parsedState.user });
        // You might want to dispatch actions to set users, courts, bookings as well if they change
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if(isInitialized) {
        localStorage.setItem('courtSyncState', JSON.stringify({ user: state.user }));
    }
  }, [state.user, isInitialized]);


  const login = (email: string, role: 'admin' | 'user') => {
    const user = state.users.find((u) => u.email === email && u.role === role);
    if (user) {
      dispatch({ type: 'LOGIN', payload: user });
      return true;
    }
    return false;
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };
  
  const addUser = (user: Omit<User, 'id'>) => {
    const newUser = { ...user, id: (state.users.length + 1).toString() };
    dispatch({ type: 'ADD_USER', payload: newUser });
  };

  const addCourt = (court: Omit<Court, 'id'>) => {
    const newCourt = { ...court, id: (state.courts.length + 1).toString() };
    dispatch({ type: 'ADD_COURT', payload: newCourt });
  };

  const deleteCourt = (courtId: string) => {
    dispatch({ type: 'DELETE_COURT', payload: courtId });
  };
  
  const addBooking = (booking: Omit<Booking, 'id' | 'status'>) => {
    const newBooking = { ...booking, id: (state.bookings.length + 1).toString(), status: 'pending' as const };
    dispatch({ type: 'ADD_BOOKING', payload: newBooking });
  };

  const updateBookingStatus = (bookingId: string, status: Booking['status']) => {
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { bookingId, status } });
  };
  
  if (!isInitialized) {
    return null; // or a loading spinner
  }

  return (
    <StoreContext.Provider value={{ ...state, login, logout, addUser, addCourt, deleteCourt, addBooking, updateBookingStatus }}>
      {children}
    </StoreContext.Provider>
  );
};

// --- HOOK ---
export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
