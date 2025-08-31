
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, User, Shield, RefreshCw, KeyRound, Coins, Pencil } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const userFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
});

const creditFormSchema = z.object({
    amount: z.coerce.number(),
});

export default function UsersPage() {
  const { user, users, addUser, regeneratePin, updateUserCredits } = useStore();
  const [isUserDialogOpen, setUserDialogOpen] = useState(false);
  const [isCreditDialogOpen, setCreditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof users[0] | null>(null);
  const { toast } = useToast();

  const companyUsers = users.filter(u => u.companyId === user?.companyId && u.role ==='user');

  const userForm = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '' },
  });
  
  const creditForm = useForm<z.infer<typeof creditFormSchema>>({
    resolver: zodResolver(creditFormSchema),
    defaultValues: { amount: 0 },
  });

  function onUserSubmit(values: z.infer<typeof userFormSchema>) {
    if (!user?.companyId) return;
    addUser({ ...values, role: 'user', companyId: user.companyId });
    toast({ title: 'User Created', description: `User ${values.name} has been added.` });
    userForm.reset();
    setUserDialogOpen(false);
  }

  function onCreditSubmit(values: z.infer<typeof creditFormSchema>) {
    if (!selectedUser) return;
    updateUserCredits(selectedUser.id, values.amount);
    toast({ title: 'Credits Updated', description: `Updated credits for ${selectedUser.name}.` });
    creditForm.reset();
    setCreditDialogOpen(false);
    setSelectedUser(null);
  }

  function handleRegeneratePin(userId: string, userName: string) {
    regeneratePin(userId);
    toast({
      title: 'PIN Regenerated',
      description: `A new PIN has been regenerated for ${userName}.`,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <Dialog open={isUserDialogOpen} onOpenChange={setUserDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new user account for your company. They will start with 1 credit.
              </DialogDescription>
            </DialogHeader>
            <Form {...userForm}>
              <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="space-y-4 py-4">
                <FormField
                  control={userForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit">Create User</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Users</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>PIN</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={'secondary'}>
                        <User className="mr-2 h-4 w-4" />
                        User
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                           <span className="cursor-help"><KeyRound className="h-4 w-4" /></span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono tracking-widest">{u.pin}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <Coins className="h-4 w-4 text-yellow-500" />
                            {u.credits}
                        </div>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                       <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setSelectedUser(u);
                            creditForm.setValue('amount', 0);
                            setCreditDialogOpen(true);
                        }}
                       >
                         <Pencil className="mr-2 h-4 w-4" />
                         Manage
                       </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegeneratePin(u.id, u.name)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        PIN
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
      
       <Dialog open={isCreditDialogOpen} onOpenChange={setCreditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Manage Credits</DialogTitle>
              <DialogDescription>
                Allocate or remove credits for {selectedUser?.name}. Enter a positive number to add credits, or a negative number to remove them.
              </DialogDescription>
            </DialogHeader>
            <Form {...creditForm}>
              <form onSubmit={creditForm.handleSubmit(onCreditSubmit)} className="space-y-4 py-4">
                <FormField
                  control={creditForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credits to Add/Remove</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit">Update Credits</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
    </div>
  );
}
