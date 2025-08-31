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
  { id: '1', courtId: '1', userId: '2', date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: '9:00 AM - 10:00 AM', status: 'approved' },
  { id: '2', courtId: '2', userId: '2', date: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0], time: '2:00 PM - 3:00 PM', status: 'pending' },
];

// --- STATE AND ACTIONS ---
interface AppState {
  user: User | null;
  users: User[];
  courts: Court[];
  bookings: Booking[];
}

type Action =
  | { type: 'SET_INITIAL_STATE', payload: Partial<AppState> }
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
    case 'SET_INITIAL_STATE':
        return { ...state, ...action.payload };
    case 'LOGIN':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      // When logging out, only clear the current user
      // The rest of the state (users, courts, bookings) should persist
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
    try {
      const storedState = localStorage.getItem('courtSyncState');
      if (storedState) {
          const parsedState = JSON.parse(storedState);
          // Combine initial static data with persisted dynamic data
          const combinedState = {
            ...initialState, // a base of users and courts
            ...parsedState,  // overwrite with persisted bookings and current user
          };
          dispatch({ type: 'SET_INITIAL_STATE', payload: combinedState });
      } else {
        // If no state in local storage, set the initial state and save it
        dispatch({ type: 'SET_INITIAL_STATE', payload: initialState });
        localStorage.setItem('courtSyncState', JSON.stringify(initialState));
      }
    } catch (error) {
        console.error("Failed to parse state from localStorage", error);
        dispatch({ type: 'SET_INITIAL_STATE', payload: initialState });
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
        try {
            // Only save the parts of the state that can be changed by user actions
            const stateToSave = {
                user: state.user,
                users: state.users,
                courts: state.courts,
                bookings: state.bookings
            };
            localStorage.setItem('courtSyncState', JSON.stringify(stateToSave));
        } catch(error) {
            console.error("Failed to save state to localStorage", error);
        }
    }
  }, [isInitialized, state]);


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
    const newUser = { ...user, id: (Math.max(...state.users.map(u => parseInt(u.id)), 0) + 1).toString() };
    dispatch({ type: 'ADD_USER', payload: newUser });
  };

  const addCourt = (court: Omit<Court, 'id'>) => {
    const newCourt = { ...court, id: (Math.max(...state.courts.map(c => parseInt(c.id)), 0) + 1).toString() };
    dispatch({ type: 'ADD_COURT', payload: newCourt });
  };

  const deleteCourt = (courtId: string) => {
    dispatch({ type: 'DELETE_COURT', payload: courtId });
  };
  
  const addBooking = (booking: Omit<Booking, 'id' | 'status'>) => {
    const newBooking = { ...booking, id: (Math.max(...state.bookings.map(b => parseInt(b.id)), 0) + 1).toString(), status: 'pending' as const };
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
