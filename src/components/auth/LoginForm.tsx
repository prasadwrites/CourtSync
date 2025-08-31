
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const FormSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  pin: z.string().min(6, { message: 'PIN must be 6 characters.' }).max(6),
  role: z.enum(['admin', 'user'], { required_error: 'You need to select a role.' }),
  companyCode: z.string().optional(),
}).refine(data => {
    // companyCode is required if role is user or admin (but not super-admin)
    return data.role !== 'user' || (data.role === 'user' && data.companyCode && data.companyCode.length > 0);
}, {
    message: "Company code is required.",
    path: ["companyCode"],
}).refine(data => {
    // companyCode is required for company-admin
    return data.role !== 'admin' || (data.role === 'admin' && data.companyCode && data.companyCode.length > 0);
}, {
    message: "Company code is required for Company Admins.",
    path: ["companyCode"],
});

export function LoginForm() {
  const router = useRouter();
  const { login, superAdminLogin } = useStore();
  const { toast } = useToast();
  const [isCompanyAdmin, setIsCompanyAdmin] = React.useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: '',
      pin: '',
      role: 'user',
      companyCode: '',
    },
  });
  
  const role = form.watch("role");

  const onSubmit = (data: z.infer<typeof FormSchema>) => {
    let success = false;
    if (data.role === 'admin' && !data.companyCode) {
        // Super Admin Login
        success = superAdminLogin(data.email, data.pin);
    } else {
        // User or Company Admin Login
        success = login(data.email, data.pin, data.role, data.companyCode);
    }
    
    if (success) {
      toast({
        title: 'Login Successful',
        description: `Welcome! Redirecting to your dashboard...`,
      });
      router.push(data.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
    } else {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: 'Invalid credentials or company code. Please try again.',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Sign in as</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue('companyCode', ''); // Reset company code on role change
                  }}
                  defaultValue={field.value}
                  className="flex items-center space-x-4"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="user" />
                    </FormControl>
                    <FormLabel className="font-normal">User</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="admin" />
                    </FormControl>
                    <FormLabel className="font-normal">Administrator</FormLabel>
                  </FormItem>
                </RadioGroup>
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
                <Input placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>PIN</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••" {...field} maxLength={6} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className={cn("space-y-2 transition-opacity duration-300", role === 'admin' || role === 'user' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden')}>
            <FormField
            control={form.control}
            name="companyCode"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Company Code</FormLabel>
                <FormControl>
                    <Input placeholder="Enter company code" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        
        <Button type="submit" className="w-full">Sign In</Button>
      </form>
    </Form>
  );
}
