'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import type { User, Court, Booking } from './types';

const generatePin = (): string => {
    const numbers = '0123456789';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const chars = [];
    for (let i = 0; i < 3; i++) {
        chars.push(numbers.charAt(Math.floor(Math.random() * numbers.length)));
        chars.push(letters.charAt(Math.floor(Math.random() * letters.length)));
    }
    // Shuffle the characters
    for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
};


// --- INITIAL MOCK DATA ---
const initialUsers: User[] = [
  { id: '1', name: 'Admin User', email: 'admin@courtsync.com', role: 'admin', pin: 'ABC123' },
  { id: '2', name: 'Regular User', email: 'user@courtsync.com', role: 'user', pin: generatePin() },
];

const initialCourts: Court[] = [
  { id: '1', name: 'Central Tennis Court', location: 'Downtown Park', maxPlayers: 4 },
  { id: '2', name: 'Downtown Basketball Court', location: 'City Center Sports Complex', maxPlayers: 10 },
  { id: '3', name: 'Westside Volleyball Court', location: 'Westside Beach', maxPlayers: 12 },
  { id: '4', name: 'North Park Pickleball', location: 'North Park', maxPlayers: 4 },
];

const initialBookings: Booking[] = [
  { id: '1', courtId: '1', userId: '2', date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: '9:00 AM', status: 'approved' },
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
  | { type: 'SET_INITIAL_STATE', payload: Partial<AppState> }
  | { type: 'LOGIN'; payload: { user: User } }
  | { type: 'LOGOUT' }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'ADD_COURT'; payload: Court }
  | { type: 'DELETE_COURT'; payload: string }
  | { type: 'ADD_BOOKING'; payload: Booking }
  | { type: 'UPDATE_BOOKING_STATUS'; payload: { bookingId: string; status: Booking['status'] } }
  | { type: 'REGENERATE_PIN'; payload: { userId: string, newPin: string }};

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
      return { ...state, user: action.payload.user };
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
    case 'REGENERATE_PIN':
      return {
        ...state,
        users: state.users.map((u) =>
            u.id === action.payload.userId ? { ...u, pin: action.payload.newPin } : u
        ),
      };
    default:
      return state;
  }
};

// --- CONTEXT AND PROVIDER ---
interface StoreContextValue extends AppState {
  login: (email: string, pin: string, role: 'admin' | 'user') => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'pin'>) => void;
  addCourt: (court: Omit<Court, 'id'>) => void;
  deleteCourt: (courtId: string) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'status'>) => void;
  updateBookingStatus: (bookingId: string, status: Booking['status']) => void;
  regeneratePin: (userId: string) => void;
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
          // Ensure admin pin is always correct
          if (parsedState.users) {
            const admin = parsedState.users.find((u: User) => u.role === 'admin');
            if (admin) {
              admin.pin = 'ABC123';
            }
          }
          dispatch({ type: 'SET_INITIAL_STATE', payload: parsedState });
      } else {
        dispatch({ type: 'SET_INITIAL_STATE', payload: initialState });
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
  }, [state, isInitialized]);


  const login = (email: string, pin: string, role: 'admin' | 'user') => {
    const user = state.users.find((u) => u.email === email && u.role === role && u.pin === pin);
    if (user) {
      dispatch({ type: 'LOGIN', payload: { user } });
      return true;
    }
    return false;
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };
  
  const addUser = (user: Omit<User, 'id' | 'pin'>) => {
    const newPin = generatePin();
    const newUser = { ...user, id: (Math.max(...state.users.map(u => parseInt(u.id)), 0) + 1).toString(), pin: newPin };
    dispatch({ type: 'ADD_USER', payload: newUser });
  };

  const regeneratePin = (userId: string) => {
    const user = state.users.find(u => u.id === userId);
    if (user && user.role === 'admin') {
        // Do not regenerate PIN for admin
        return;
    }
    const newPin = generatePin();
    dispatch({ type: 'REGENERATE_PIN', payload: { userId, newPin } });
  }

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
    <StoreContext.Provider value={{ ...state, login, logout, addUser, addCourt, deleteCourt, addBooking, updateBookingStatus, regeneratePin }}>
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
