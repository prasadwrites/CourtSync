
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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { MapPin, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function SuperAdminCourtsPage() {
  const { courts, companies } = useStore();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const getCompanyCourts = (companyId: string | null) => {
    if (!companyId) return [];
    return courts.filter((c) => c.companyId === companyId);
  };
  
  const companyCourts = getCompanyCourts(selectedCompany);
  const selectedCompanyName = companies.find(c => c.id === selectedCompany)?.name;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Manage Courts (Super Admin)</h1>
      <Card>
        <CardHeader>
          <CardTitle>View Courts by Company</CardTitle>
          <CardDescription>Select a company to see all its associated courts.</CardDescription>
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
            <>
              <h2 className="text-xl font-semibold mt-6">Courts for {selectedCompanyName}</h2>
              {companyCourts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Max Players</TableHead>
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
