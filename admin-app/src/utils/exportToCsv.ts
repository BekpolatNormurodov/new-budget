export function exportToCsv(
  filename: string,
  rows: Record<string, any>[],
  headers?: { key: string; label: string }[]
) {
  if (!rows || !rows.length) return;

  const headerKeys = headers ? headers.map((h) => h.key) : Object.keys(rows[0]);
  const headerLabels = headers ? headers.map((h) => h.label) : headerKeys;

  const csvContent = [
    headerLabels.map((l) => `"${String(l).replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      headerKeys
        .map((key) => {
          let val = row[key];
          if (val === null || val === undefined) val = '';
          if (typeof val === 'object') val = JSON.stringify(val);
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
