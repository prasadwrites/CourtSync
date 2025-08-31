'use client';

import { recommendCourts, type RecommendCourtsOutput } from '@/ai/flows/court-recommendation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Lightbulb, MapPin, Users, Loader2, Search, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const recommendationSchema = z.object({
  preferredSport: z.string().min(1, 'Please enter a sport'),
  preferredTimeOfDay: z.string().min(1, 'Please select a time'),
});

function CourtRecommender() {
  const [recommendations, setRecommendations] = useState<RecommendCourtsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof recommendationSchema>>({
    resolver: zodResolver(recommendationSchema),
    defaultValues: { preferredSport: 'tennis', preferredTimeOfDay: 'afternoon' },
  });

  async function onSubmit(values: z.infer<typeof recommendationSchema>) {
    setIsLoading(true);
    setError(null);
    setRecommendations(null);
    try {
      const result = await recommendCourts(values);
      setRecommendations(result);
    } catch (e) {
      setError('Could not get recommendations. Please try again.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-yellow-400" />
          AI Court Recommender
        </CardTitle>
        <CardDescription>
          Tell us what you're looking for, and we'll find the perfect spot for you.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="preferredSport"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sport</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Tennis, Basketball" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preferredTimeOfDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time of Day</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {recommendations && (
              <div className="pt-4">
                <h4 className="font-semibold mb-2">Our Recommendations:</h4>
                <div className="space-y-2">
                  {recommendations.map((rec) => (
                    <div key={rec.courtName} className="p-3 border rounded-md bg-background/50">
                      <p className="font-semibold">{rec.courtName}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4" />
                        Available: {rec.availableTimes.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Find Courts
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

export default function UserDashboard() {
  const { courts } = useStore();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Dashboard</h1>
        <p className="text-muted-foreground">Find and book your next game.</p>
      </div>

      <CourtRecommender />

      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Browse All Courts</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courts.map((court) => (
            <Card key={court.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{court.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 pt-1">
                  <MapPin className="h-4 w-4" /> {court.location}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Up to {court.maxPlayers} players</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => router.push(`/user/courts/${court.id}`)}>
                  View Availability
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
