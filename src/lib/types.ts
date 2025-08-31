
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  pin: string;
  credits: number;
  companyId?: string; // Optional for super admin
}

export interface Court {
  id: string;
  name: string;
  location: string;
  maxPlayers: number;
  companyId: string;
}

export interface Booking {
  id: string;
  courtId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g., "10:00 AM"
  status: 'pending' | 'approved' | 'rejected';
}

export interface Company {
    id: string;
    name: string;
    companyCode: string;
}
