import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { exportCsv, exportExcel, type ExportColumn } from '@/lib/export';
import { useToast } from '@/lib/toast';
import { errorMessage } from '@/lib/api';

export function ExportButtons<T>({ fileName, columns, rows, disabled }: { fileName: string; columns: ExportColumn<T>[]; rows: T[]; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const none = disabled || rows.length === 0;
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" disabled={none} icon={<Download className="h-4 w-4" />} onClick={() => exportCsv(fileName, columns, rows)}>
        CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={none}
        loading={busy}
        icon={<Download className="h-4 w-4" />}
        onClick={async () => {
          setBusy(true);
          try {
            await exportExcel(fileName, columns, rows);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Excel
      </Button>
    </div>
  );
}
