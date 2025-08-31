
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import type { User, Court, Booking, Company } from './types';

const generatePin = (): string => {
    const numbers = '0123456789';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let chars = [];
    for (let i = 0; i < 3; i++) {
        chars.push(numbers.charAt(Math.floor(Math.random() * numbers.length)));
        chars.push(letters.charAt(Math.floor(Math.random() * letters.length)));
    }
    return chars.sort(() => 0.5 - Math.random()).join('');
};

const generateCompanyCode = (): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    let code = '';
    for(let i=0; i<3; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for(let i=0; i<3; i++) {
        code += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    return code;
}


// --- INITIAL MOCK DATA ---
const initialCompanies: Company[] = [
    { id: '1', name: 'Default Company', companyCode: 'DEF123' },
];

const initialUsers: User[] = [
  { id: '1', name: 'Super Admin', email: 'super@admin.com', role: 'admin', pin: 'ABC123' },
  { id: '2', name: 'Default Company Admin', email: 'admin@courtsync.com', role: 'admin', pin: 'ADM456', companyId: '1' },
  { id: '3', name: 'Regular User', email: 'user@courtsync.com', role: 'user', pin: generatePin(), companyId: '1' },
];

const initialCourts: Court[] = [
  { id: '1', name: 'Central Tennis Court', location: 'Downtown Park', maxPlayers: 4, companyId: '1' },
  { id: '2', name: 'Downtown Basketball Court', location: 'City Center Sports Complex', maxPlayers: 10, companyId: '1' },
];

const initialBookings: Booking[] = [
  { id: '1', courtId: '1', userId: '3', date: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], time: '9:00 AM', status: 'approved' },
  { id: '2', courtId: '2', userId: '3', date: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0], time: '2:00 PM', status: 'pending' },
];

// --- STATE AND ACTIONS ---
interface AppState {
  user: User | null;
  users: User[];
  courts: Court[];
  bookings: Booking[];
  companies: Company[];
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
  | { type: 'REGENERATE_PIN'; payload: { userId: string, newPin: string }}
  | { type: 'ADD_COMPANY_AND_ADMIN'; payload: { company: Company, admin: User }};

const initialState: AppState = {
  user: null,
  users: initialUsers,
  courts: initialCourts,
  bookings: initialBookings,
  companies: initialCompanies,
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
    case 'ADD_COMPANY_AND_ADMIN':
        return {
            ...state,
            companies: [...state.companies, action.payload.company],
            users: [...state.users, action.payload.admin],
        };
    default:
      return state;
  }
};

// --- CONTEXT AND PROVIDER ---
interface StoreContextValue extends AppState {
  login: (email: string, pin: string, role: 'admin' | 'user', companyCode?: string) => boolean;
  superAdminLogin: (email: string, pin: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'pin'>) => void;
  addCourt: (court: Omit<Court, 'id'>) => void;
  deleteCourt: (courtId: string) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'status'>) => void;
  updateBookingStatus: (bookingId: string, status: Booking['status']) => void;
  regeneratePin: (userId: string) => void;
  addCompanyAndAdmin: (payload: { companyName: string; adminName: string; adminEmail: string }) => void;
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
          // Ensure super admin pin is always correct
          if (parsedState.users) {
            const superAdmin = parsedState.users.find((u: User) => u.email === 'super@admin.com');
            if (superAdmin) {
              superAdmin.pin = 'ABC123';
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
                bookings: state.bookings,
                companies: state.companies,
            };
            localStorage.setItem('courtSyncState', JSON.stringify(stateToSave));
        } catch(error) {
            console.error("Failed to save state to localStorage", error);
        }
    }
  }, [state, isInitialized]);


  const login = (email: string, pin: string, role: 'admin' | 'user', companyCode?: string) => {
    const company = state.companies.find(c => c.companyCode === companyCode);
    if (!company) return false;
    
    const user = state.users.find((u) => u.email === email && u.pin === pin && u.role === role && u.companyId === company.id);
    if (user) {
      dispatch({ type: 'LOGIN', payload: { user } });
      return true;
    }
    return false;
  };

  const superAdminLogin = (email: string, pin: string) => {
    const user = state.users.find((u) => u.email === email && u.pin === pin && u.role === 'admin' && !u.companyId);
     if (user) {
      dispatch({ type: 'LOGIN', payload: { user } });
      return true;
    }
    return false;
  }

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };
  
  const addUser = (user: Omit<User, 'id' | 'pin'>) => {
    const newPin = generatePin();
    const newUser = { ...user, id: (Math.max(...state.users.map(u => parseInt(u.id)), 0) + 1).toString(), pin: newPin };
    dispatch({ type: 'ADD_USER', payload: newUser });
  };

  const regeneratePin = (userId: string) => {
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

  const addCompanyAndAdmin = (payload: { companyName: string; adminName: string; adminEmail: string }) => {
    const newCompanyId = (Math.max(...state.companies.map(c => parseInt(c.id)), 0) + 1).toString();
    const newCompany: Company = {
        id: newCompanyId,
        name: payload.companyName,
        companyCode: generateCompanyCode(),
    };

    const newAdminId = (Math.max(...state.users.map(u => parseInt(u.id)), 0) + 1).toString();
    const newAdmin: User = {
        id: newAdminId,
        name: payload.adminName,
        email: payload.adminEmail,
        role: 'admin',
        pin: generatePin(),
        companyId: newCompanyId,
    };
    
    dispatch({ type: 'ADD_COMPANY_AND_ADMIN', payload: { company: newCompany, admin: newAdmin } });
  };
  
  if (!isInitialized) {
    return null; // or a loading spinner
  }

  return (
    <StoreContext.Provider value={{ ...state, login, superAdminLogin, logout, addUser, addCourt, deleteCourt, addBooking, updateBookingStatus, regeneratePin, addCompanyAndAdmin }}>
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
