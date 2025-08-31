
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useStore } from '@/lib/store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { MapPin, Users, PlusCircle, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const courtFormSchema = z.object({
  name: z.string().min(3, { message: 'Court name must be at least 3 characters.' }),
  location: z.string().min(3, { message: 'Location must be at least 3 characters.' }),
  maxPlayers: z.coerce.number().min(1, { message: 'Must allow at least 1 player.' }),
});

export default function SuperAdminCourtsPage() {
  const { courts, companies, addCourt, deleteCourt } = useStore();
  const { toast } = useToast();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);

  const getCompanyCourts = (companyId: string | null) => {
    if (!companyId) return [];
    return courts.filter((c) => c.companyId === companyId);
  };
  
  const form = useForm<z.infer<typeof courtFormSchema>>({
    resolver: zodResolver(courtFormSchema),
    defaultValues: { name: '', location: '', maxPlayers: 2 },
  });

  function onSubmit(values: z.infer<typeof courtFormSchema>) {
    if (!selectedCompany) return;
    addCourt({ ...values, companyId: selectedCompany });
    toast({ title: 'Court Created', description: `Court ${values.name} has been added.` });
    form.reset();
    setCreateDialogOpen(false);
  }

  function handleDeleteCourt(courtId: string, courtName: string) {
    deleteCourt(courtId);
    toast({
      variant: 'destructive',
      title: 'Court Deleted',
      description: `Court ${courtName} has been removed.`,
    });
  }

  const companyCourts = getCompanyCourts(selectedCompany);
  const selectedCompanyName = companies.find(c => c.id === selectedCompany)?.name;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Manage Courts (Super Admin)</h1>
      <Card>
        <CardHeader>
          <CardTitle>View & Manage Courts by Company</CardTitle>
          <CardDescription>Select a company to see and manage its associated courts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select onValueChange={setSelectedCompany} value={selectedCompany || ''}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                    <Button disabled={!selectedCompany}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Create Court
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Court for {selectedCompanyName}</DialogTitle>
                        <DialogDescription>
                            Fill in the details for the new court.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Court Name</FormLabel>
                                <FormControl>
                                <Input placeholder="e.g., Center Court" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="location"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Location</FormLabel>
                                <FormControl>
                                <Input placeholder="e.g., Downtown Park" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="maxPlayers"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Max Players</FormLabel>
                                <FormControl>
                                <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit">Create Court</Button>
                        </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
          </div>

          {selectedCompany && (
            <>
              <h2 className="text-xl font-semibold mt-6">Courts for {selectedCompanyName}</h2>
              {companyCourts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Max Players</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companyCourts.map((court) => (
                      <TableRow key={court.id}>
                        <TableCell className="font-medium">{court.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            {court.location}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4" />
                            {court.maxPlayers}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the court
                                  "{court.name}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCourt(court.id, court.name)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No courts found for this company.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
