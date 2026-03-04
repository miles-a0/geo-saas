import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

export default function AdminReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    try {
      const res = await adminApi.reports();
      setReports(res.data.reports);
    } finally { setLoading(false); }
  };

  const regenerate = async (id: string) => {
    await adminApi.regenerateReport(id);
    loadReports();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">All Reports</h1>
      <div className="card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="text-left py-3 px-4">Website</th>
              <th className="text-left py-3 px-4">User</th>
              <th className="text-left py-3 px-4">Score</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Date</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className="border-b border-surface-100">
                <td className="py-3 px-4">{r.website_url}</td>
                <td className="py-3 px-4">{r.user_email}</td>
                <td className="py-3 px-4">{r.geo_score || '—'}</td>
                <td className="py-3 px-4">
                  <span className={`badge ${r.status === 'completed' ? 'badge-success' : r.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-3 px-4">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <button onClick={() => regenerate(r.id)} className="text-primary-600 hover:underline text-sm">
                    Regenerate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
