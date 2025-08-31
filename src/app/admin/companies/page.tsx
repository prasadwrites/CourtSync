
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, Building, KeyRound, Copy, InfoIcon } from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const companyFormSchema = z.object({
  companyName: z.string().min(3, { message: 'Company name must be at least 3 characters.' }),
  adminName: z.string().min(2, { message: 'Admin name must be at least 2 characters.' }),
  adminEmail: z.string().email({ message: 'Please enter a valid email for the admin.' }),
});

export default function CompaniesPage() {
  const { companies, users, addCompanyAndAdmin } = useStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof companyFormSchema>>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: { companyName: '', adminName: '', adminEmail: '' },
  });

  function onSubmit(values: z.infer<typeof companyFormSchema>) {
    addCompanyAndAdmin({
        companyName: values.companyName,
        adminName: values.adminName,
        adminEmail: values.adminEmail
    });
    toast({ title: 'Company Created', description: `Company ${values.companyName} and its admin have been created.` });
    form.reset();
    setIsDialogOpen(false);
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to Clipboard', description: text });
  };
  
  const getCompanyAdmin = (companyId: string) => {
    return users.find(u => u.companyId === companyId && u.role === 'admin');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Company Management</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Create Company
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Company</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new company and its administrator account.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., ACME Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="adminName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin&apos;s Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="adminEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin&apos;s Email</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., admin@acme.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit">Create Company & Admin</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Companies</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Company Code</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Admin Company ID</TableHead>
                  <TableHead>Admin PIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                    const admin = getCompanyAdmin(company.id);
                    return (
                        <TableRow key={company.id}>
                            <TableCell className="font-medium flex items-center gap-2">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                {company.name}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2 font-mono">
                                    {company.companyCode}
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(company.companyCode)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                            <TableCell>{admin?.name || 'N/A'}</TableCell>
                            <TableCell>
                                {admin && (
                                    <div className="flex items-center gap-2 font-mono">
                                        {admin.companyId}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                {admin && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                        <span className="cursor-help"><KeyRound className="h-4 w-4" /></span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                        <p className="font-mono tracking-widest">{admin.pin}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </TableCell>
                        </TableRow>
                    )
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
