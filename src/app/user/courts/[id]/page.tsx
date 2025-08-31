
'use client';

import { useStore } from '@/lib/store';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDays, format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';


const timeSlots = Array.from({ length: 12 }, (_, i) => {
    const startHour = i + 9;
    const endHour = startHour + 1;
    const formatHour = (hour: number) => {
        const h = hour % 12 === 0 ? 12 : hour % 12;
        const ampm = hour < 12 || hour === 24 ? 'AM' : 'PM';
        return `${h}:00 ${ampm}`;
    };
    return {
        startTime: formatHour(startHour).replace(' 12', '12'),
        display: `${formatHour(startHour)} - ${formatHour(endHour)}`
    }
});


export default function CourtDetailPage() {
  const { courts, bookings, user, addBooking } = useStore();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const court = courts.find((c) => c.id === params.id);
  
  const today = new Date();
  today.setHours(0,0,0,0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const twoWeeksFromNow = new Date(today);
  twoWeeksFromNow.setDate(today.getDate() + 14);

  const [date, setDate] = useState<Date | undefined>(tomorrow);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  
  const hasCredits = user ? user.credits > 0 : false;

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
    .filter((b) => b.courtId === court.id && b.date === selectedDateString && (b.status === 'approved' || b.status === 'pending'))
    .map((b) => b.time);

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setConfirmOpen(true);
  };
  
  const handleBookingConfirm = () => {
    if (selectedTime && date && user) {
        const success = addBooking({
            courtId: court.id,
            userId: user.id,
            date: selectedDateString,
            time: selectedTime,
        });
        if (success) {
            toast({
                title: 'Booking Request Sent',
                description: 'Your request is pending administrator approval. 1 credit was deducted.'
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Booking Failed',
                description: 'You do not have enough credits to make this booking.'
            });
        }
    }
    setConfirmOpen(false);
    setSelectedTime(null);
  }

  const getSlotVariant = (time: string) => {
    const booking = bookings.find(b => b.courtId === court.id && b.date === selectedDateString && b.time === time);
    if (!booking) return "outline";
    if (booking.status === 'approved') return 'destructive';
    if (booking.status === 'pending') return 'secondary';
    return 'outline';
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
      
       {!hasCredits && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
                You have no credits remaining. You must have at least 1 credit to book a court. Please contact your company administrator.
            </AlertDescription>
          </Alert>
        )}

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle>Select a Date</CardTitle>
                <CardDescription>Choose a day to see available times. Bookings are available for the next two weeks.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                 <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(day) => day < tomorrow || day > twoWeeksFromNow}
                    className="rounded-md"
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Available Time Slots</CardTitle>
                <CardDescription>
                   For {date ? format(date, 'PPP') : 'today'}. Each booking is for 1 hour and costs 1 credit.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {date ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {timeSlots.map(slot => {
                            const isBooked = bookedSlots.includes(slot.startTime);
                            return (
                                <Button 
                                    key={slot.startTime} 
                                    variant={getSlotVariant(slot.startTime)}
                                    disabled={isBooked || !hasCredits}
                                    onClick={() => handleTimeSelect(slot.startTime)}
                                >
                                    <Clock className="mr-2 h-4 w-4"/>
                                    {slot.display}
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
                    Requesting this time slot will deduct 1 credit. Are you sure you want to proceed?
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
                <p><span className="font-semibold">Court:</span> {court.name}</p>
                <p><span className="font-semibold">Date:</span> {date && format(date, 'PPP')}</p>
                <p><span className="font-semibold">Time:</span> {selectedTime && timeSlots.find(s => s.startTime === selectedTime)?.display}</p>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                <Button onClick={handleBookingConfirm}>Confirm Request (1 Credit)</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
