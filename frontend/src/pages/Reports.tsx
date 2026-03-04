import { useState, useEffect } from 'react';
import { reportsApi } from '../lib/api';
import { FileText, Download, Trash2 } from 'lucide-react';

export default function Reports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    try {
      const res = await reportsApi.list({ limit: 50 });
      setReports(res.data.reports);
    } finally { setLoading(false); }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await reportsApi.download(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `GEO-Report-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) { console.error('Download failed', e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    await reportsApi.delete(id);
    loadReports();
  };

  if (loading) return <div className="animate-pulse">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">My Reports</h1>
      {reports.length === 0 ? (
        <div className="text-center py-12 text-surface-500">No reports yet</div>
      ) : (
        <div className="grid gap-4">
          {reports.map(report => (
            <div key={report.id} className="card-hover flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <FileText className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium">{report.website_name || report.website_url}</p>
                  <p className="text-sm text-surface-500">{new Date(report.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${report.status === 'completed' ? 'badge-success' : report.status === 'processing' ? 'badge-warning' : 'badge-neutral'}`}>
                  {report.status}
                </span>
                {report.status === 'completed' && (
                  <button onClick={() => handleDownload(report.id)} className="btn-ghost p-2">
                    <Download className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => handleDelete(report.id)} className="btn-ghost p-2 text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
