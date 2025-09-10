
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye, EyeOff, Info } from 'lucide-react';

const FormSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  pin: z.string().min(6, { message: 'PIN must be 6 characters.' }).max(6),
  role: z.enum(['admin', 'user'], { required_error: 'You need to select a role.' }),
  companyCode: z.string().optional(),
});

export function LoginForm() {
  const router = useRouter();
  const { login, superAdminLogin } = useStore();
  const { toast } = useToast();
  const [showPin, setShowPin] = React.useState(false);

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
    // If the role is admin and there is no company code, it's a super admin.
    if (data.role === 'admin' && !data.companyCode) {
        success = superAdminLogin(data.email, data.pin);
    } else {
        // Otherwise it is a company admin or a user.
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
                  onValueChange={field.onChange}
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
                <div className="relative">
                    <Input 
                      type={showPin ? 'text' : 'password'} 
                      placeholder="••••••" 
                      {...field} 
                      maxLength={6}
                      className="pr-10"
                    />
                    <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="absolute inset-y-0 right-0 h-full px-3"
                        onClick={() => setShowPin(prev => !prev)}
                    >
                        {showPin ? <EyeOff /> : <Eye />}
                        <span className="sr-only">{showPin ? 'Hide PIN' : 'Show PIN'}</span>
                    </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className={cn("space-y-2 transition-opacity duration-300", role === 'admin' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pointer-events-none')}>
            <FormField
            control={form.control}
            name="companyCode"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Company Code</FormLabel>
                <FormControl>
                    <Input placeholder="Enter company code" {...field} disabled={role !== 'admin'} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
             {role === 'admin' && (
                <Alert variant="default" className="flex items-start gap-3 text-xs">
                    <Info className="h-4 w-4 mt-0.5"/>
                    <div className="flex-1">
                        Leave the Company Code blank to sign in as a Super Admin.
                    </div>
                </Alert>
            )}
        </div>
        
        <Button type="submit" className="w-full">Sign In</Button>
      </form>
    </Form>
  );
}
