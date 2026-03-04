import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';
import { Users, FileText, DollarSign, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await adminApi.analytics();
      setData(res.data);
    } finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="stat-value">{data?.analytics?.totalUsers || 0}</p>
              <p className="stat-label">Total Users</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><FileText className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="stat-value">{data?.analytics?.completedReports || 0}</p>
              <p className="stat-label">Reports Generated</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><TrendingUp className="h-5 w-5 text-yellow-600" /></div>
            <div>
              <p className="stat-value">{data?.analytics?.pendingReports || 0}</p>
              <p className="stat-label">Pending Reports</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><DollarSign className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="stat-value">£{(data?.analytics?.totalRevenue || 0).toFixed(2)}</p>
              <p className="stat-label">Total Revenue</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Users</h2>
          <div className="space-y-3">
            {data?.recentUsers?.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-surface-100">
                <div>
                  <p className="font-medium">{u.email}</p>
                  <p className="text-sm text-surface-500">{new Date(u.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Reports</h2>
          <div className="space-y-3">
            {data?.recentReports?.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-surface-100">
                <div>
                  <p className="font-medium">{r.website_url}</p>
                  <p className="text-sm text-surface-500">{r.user_email}</p>
                </div>
                <span className={`badge ${r.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
