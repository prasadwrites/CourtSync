'use client';

import { useStore } from '@/lib/store';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDays, format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, ArrowLeft, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const timeSlots = Array.from({ length: 12 }, (_, i) => `${i + 9}:00 ${i + 9 < 12 ? 'AM' : 'PM'}`);

export default function CourtDetailPage() {
  const { courts, bookings, user, addBooking } = useStore();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const court = courts.find((c) => c.id === params.id);
  const today = new Date();
  today.setHours(0,0,0,0);
  const [date, setDate] = useState<Date | undefined>(today);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  if (!court) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Court not found</h1>
        <Button onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }
  
  const selectedDateString = date ? format(date, 'yyyy-MM-dd') : '';

  const bookedSlots = bookings
    .filter((b) => b.courtId === court.id && b.date === selectedDateString && b.status === 'approved')
    .map((b) => b.time);

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setConfirmOpen(true);
  };
  
  const handleBookingConfirm = () => {
    if (selectedTime && date && user) {
        addBooking({
            courtId: court.id,
            userId: user.id,
            date: selectedDateString,
            time: selectedTime,
        });
        toast({
            title: 'Booking Request Sent',
            description: 'Your request is pending administrator approval.'
        });
    }
    setConfirmOpen(false);
    setSelectedTime(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4"/>
            <span className="sr-only">Back</span>
        </Button>
        <div>
            <h1 className="text-3xl font-bold tracking-tight">{court.name}</h1>
            <div className="flex items-center gap-4 text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {court.location}</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" /> Up to {court.maxPlayers} players</span>
            </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle>Select a Date</CardTitle>
                <CardDescription>Choose a day to see available times.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                 <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(day) => day < today}
                    className="rounded-md"
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Available Time Slots</CardTitle>
                <CardDescription>
                   For {date ? format(date, 'PPP') : 'today'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {date ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {timeSlots.map(time => {
                            const isBooked = bookedSlots.includes(time);
                            return (
                                <Button 
                                    key={time} 
                                    variant={isBooked ? "secondary" : "outline"}
                                    disabled={isBooked}
                                    onClick={() => handleTimeSelect(time)}
                                >
                                    <Clock className="mr-2 h-4 w-4"/>
                                    {time}
                                </Button>
                            )
                        })}
                    </div>
                ) : (
                    <p className="text-muted-foreground">Please select a date to see times.</p>
                )}
            </CardContent>
        </Card>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Confirm Booking Request</DialogTitle>
                <DialogDescription>
                    Are you sure you want to request this time slot?
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
                <p><span className="font-semibold">Court:</span> {court.name}</p>
                <p><span className="font-semibold">Date:</span> {date && format(date, 'PPP')}</p>
                <p><span className="font-semibold">Time:</span> {selectedTime}</p>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                <Button onClick={handleBookingConfirm}>Confirm Request</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
