
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building, User, Coins } from 'lucide-react';
import type { User as UserType } from '@/lib/types';


const creditFormSchema = z.object({
  amount: z.coerce.number(),
});

export default function ManageCreditsPage() {
  const { user, companies, users, updateUserCredits } = useStore();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const isSuperAdmin = !user?.companyId;

  const form = useForm<z.infer<typeof creditFormSchema>>({
    resolver: zodResolver(creditFormSchema),
    defaultValues: { amount: 0 },
  });
  
  const companyUsers = isSuperAdmin
    ? (selectedCompanyId ? users.filter(u => u.companyId === selectedCompanyId) : [])
    : users.filter(u => u.companyId === user?.companyId);

  const selectedUser = users.find(u => u.id === selectedUserId);

  function onSubmit(values: z.infer<typeof creditFormSchema>) {
    if (!selectedUserId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a user.' });
        return;
    }
    updateUserCredits(selectedUserId, values.amount);
    toast({ title: 'Credits Updated', description: `Updated credits for ${selectedUser?.name}.` });
    form.reset({ amount: 0 });
    // The select dropdowns will reset as the user object is updated
  }
  
  const handleCompanySelect = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedUserId(null); // Reset user selection when company changes
  }
  
  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    form.reset({ amount: 0 });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Manage User Credits</h1>
      
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Allocate Credits</CardTitle>
          <CardDescription>Select a user and enter an amount to add or remove credits. Use a negative number to remove credits.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isSuperAdmin && (
                    <FormItem>
                        <FormLabel>Company</FormLabel>
                        <Select onValueChange={handleCompanySelect}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a company" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {companies.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    <div className="flex items-center gap-2">
                                        <Building className="h-4 w-4 text-muted-foreground" />
                                        {c.name}
                                    </div>
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </FormItem>
                  )}
                   <FormItem>
                        <FormLabel>User</FormLabel>
                        <Select onValueChange={handleUserSelect} value={selectedUserId || ''} disabled={isSuperAdmin && !selectedCompanyId}>
                             <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a user" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {companyUsers.map(u => (
                                     <SelectItem key={u.id} value={u.id}>
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            {u.name}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormItem>
                </div>

                {selectedUserId && (
                    <div className="space-y-4 rounded-lg border bg-card text-card-foreground p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{selectedUser?.name}</h3>
                            <div className="flex items-center gap-2 text-lg font-bold">
                                <Coins className="h-5 w-5 text-yellow-500" />
                                {selectedUser?.credits}
                                <span className="text-sm font-normal text-muted-foreground">Current Credits</span>
                            </div>
                        </div>
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Credits to Add or Remove</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="e.g., 10 or -5" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}
                
                <Button type="submit" disabled={!selectedUserId}>Update Credits</Button>
              </form>
            </Form>
        </CardContent>
      </Card>
    </div>
  );
}
