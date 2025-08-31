
'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { User, KeyRound, Building } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function SuperAdminUsersPage() {
  const { users, companies } = useStore();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const getCompanyUsers = (companyId: string | null) => {
    if (!companyId) return [];
    return users.filter((u) => u.companyId === companyId);
  };
  
  const companyUsers = getCompanyUsers(selectedCompany);
  const selectedCompanyName = companies.find(c => c.id === selectedCompany)?.name;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Manage Users (Super Admin)</h1>
      <Card>
        <CardHeader>
          <CardTitle>View Users by Company</CardTitle>
          <CardDescription>Select a company to see all its associated users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Select onValueChange={setSelectedCompany}>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCompany && (
            <TooltipProvider>
              <h2 className="text-xl font-semibold mt-6">Users for {selectedCompanyName}</h2>
              {companyUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>PIN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companyUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            <User className="mr-2 h-4 w-4" />
                            {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No users found for this company.
                </div>
              )}
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
