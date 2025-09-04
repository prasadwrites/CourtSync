
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, CreditCard, Star } from 'lucide-react';
import Link from 'next/link';

const creditPackages = [
  {
    name: '1 Credit',
    credits: 1,
    price: 100,
    features: ['Book one session'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=100&cu=INR',
  },
  {
    name: '2 Credits',
    credits: 2,
    price: 200,
    features: ['Two sessions'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=200&cu=INR',
  },
  {
    name: '3 Credits',
    credits: 3,
    price: 300,
    features: ['Three sessions'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=300&cu=INR',
  },
  {
    name: '4 Credits',
    credits: 4,
    price: 400,
    features: ['Four sessions'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=400&cu=INR',
  },
   {
    name: '5 Credits',
    credits: 5,
    price: 500,
    features: ['Perfect for a week'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=500&cu=INR',
    popular: true,
  },
  {
    name: '10 Credits',
    credits: 10,
    price: 1000,
    features: ['Great value pack'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=1000&cu=INR',
  },
  {
    name: '20 Credits',
    credits: 20,
    price: 2000,
    features: ['For dedicated players'],
    gpayLink: 'gpay://upi/pay?pa=7907542025@okbizaxis&pn=CourtSync%20Credits&am=2000&cu=INR',
  },
];

export default function BuyCreditsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Buy Credits</h1>
        <p className="text-muted-foreground">
          Purchase credits to book courts. After payment, an admin will update your balance.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {creditPackages.map((pkg) => (
          <Card key={pkg.name} className={`flex flex-col ${pkg.popular ? 'border-primary ring-2 ring-primary' : ''}`}>
            {pkg.popular && (
              <Badge className="absolute -top-3 self-center px-3 py-1 flex items-center gap-1">
                <Star className="h-4 w-4" /> POPULAR
              </Badge>
            )}
            <CardHeader>
              <CardTitle>{pkg.name}</CardTitle>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{pkg.credits}</span>
                <span className="text-muted-foreground">Credits</span>
              </div>
              <CardDescription>₹{pkg.price}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-2">
                {pkg.features.map(feature => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>{feature}</span>
                    </div>
                ))}
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href={pkg.gpayLink} target="_blank">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buy Now with Google Pay
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
       <Card>
        <CardHeader>
            <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground">
            <p>1. Choose a credit package and click "Buy Now". This will open Google Pay.</p>
            <p>2. Complete the payment using the pre-filled details.</p>
            <p>3. After payment, please contact your company administrator. They will verify your purchase and add the credits to your account.</p>
            <p className="text-sm pt-2">
                <strong>Please Note:</strong> Credit balance is not updated automatically. Manual verification is required.
            </p>
        </CardContent>
       </Card>
    </div>
  );
}
