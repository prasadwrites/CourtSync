
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, Trash2, User, Shield, RefreshCw, KeyRound, Building, Hash, Coins } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { User as UserType } from '@/lib/types';


const userFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  role: z.enum(['admin', 'user']),
});

export default function ManageUsersPage() {
  const { companies, users, addUser, deleteUser, regeneratePin } = useStore();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [visiblePin, setVisiblePin] = useState<string | null>(null);
  const { toast } = useToast();

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  const companyUsers = selectedCompanyId ? users.filter(u => u.companyId === selectedCompanyId) : [];

  const form = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '', role: 'user'},
  });

  function onSubmit(values: z.infer<typeof userFormSchema>) {
    if (!selectedCompanyId) return;
    addUser({ ...values, role: values.role as 'admin' | 'user', companyId: selectedCompanyId });
    toast({ title: 'User Created', description: `User ${values.name} has been added.` });
    form.reset();
    setCreateDialogOpen(false);
  }


  function handleRegeneratePin(userId: string, userName: string) {
    regeneratePin(userId);
    toast({
      title: 'PIN Regenerated',
      description: `A new PIN has been regenerated for ${userName}.`,
    });
  }
  
  function handleDeleteUser(user: UserType) {
    deleteUser(user.id);
    toast({
      variant: 'destructive',
      title: 'User Deleted',
      description: `User ${user.name} has been removed from ${selectedCompany?.name}.`,
    });
  }

  const togglePinVisibility = (userId: string) => {
    setVisiblePin(visiblePin === userId ? null : userId);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Manage All Users</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedCompanyId}>
              <PlusCircle className="mr-2 h-4 w-4" /> Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Create a new user for {selectedCompany?.name}. A PIN will be auto-generated.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
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
                  control={form.control}
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
                 <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
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
          <CardTitle>Select a Company</CardTitle>
          <CardDescription>Choose a company to view and manage its users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="max-w-sm w-full">
                    <Select onValueChange={setSelectedCompanyId} value={selectedCompanyId || ''}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a company..." />
                    </SelectTrigger>
                    <SelectContent>
                        {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                            <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                {company.name}
                            </div>
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
                {selectedCompany && (
                    <Badge variant="outline" className="font-mono">
                        <Hash className="mr-2 h-4 w-4" />
                        {selectedCompany.companyCode}
                    </Badge>
                )}
            </div>

            {selectedCompanyId && (
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
                    {companyUsers.length > 0 ? (
                        companyUsers.map((u) => (
                        <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.name}</TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell>
                            <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                                {u.role === 'admin' ? <Shield className="mr-2 h-4 w-4" /> : <User className="mr-2 h-4 w-4" />}
                                {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                            </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    {visiblePin === u.id ? (
                                        <span className="font-mono tracking-widest">{u.pin}</span>
                                    ) : (
                                        <span className="font-mono tracking-widest">••••••</span>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePinVisibility(u.id)}>
                                        <KeyRound className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Coins className="h-4 w-4 text-yellow-500" />
                                    {u.credits}
                                </div>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Regenerate PIN
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action will regenerate the PIN for {u.name}. The user will need to be informed of their new PIN.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleRegeneratePin(u.id, u.name)}>
                                        Regenerate
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="destructive" size="sm">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the user "{u.name}". This action cannot be undone.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteUser(u)}>
                                        Delete
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No users found for this company.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
                </Table>
            )}
        </CardContent>
       </Card>
    </div>
  );
}
