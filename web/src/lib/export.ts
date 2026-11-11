/**
 * CSV and Excel export for reports. Both run in the browser on data the user can already read.
 */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv<T>(fileName: string, columns: ExportColumn<T>[], rows: T[]) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
}

export async function exportExcel<T>(fileName: string, columns: ExportColumn<T>[], rows: T[], sheet = 'Report') {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return { value: v, type: Number };
      if (typeof v === 'boolean') return { value: v, type: Boolean };
      if (v instanceof Date) return { value: v, type: Date, format: 'yyyy-mm-dd hh:mm' };
      return { value: String(v), type: String };
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeXlsxFile as any)([header, ...body], {
    fileName: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    sheet,
    columns: columns.map((c) => ({ width: Math.max(10, Math.min(40, c.header.length + 4)) })),
  });
}
