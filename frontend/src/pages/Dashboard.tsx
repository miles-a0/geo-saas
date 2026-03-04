import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, CreditCard, TrendingUp, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { usersApi, reportsApi } = await import('../lib/api');
      const [creditsRes, reportsRes] = await Promise.all([
        usersApi.credits(),
        reportsApi.list({ limit: 5 }),
      ]);
      setCredits(creditsRes.data.credits);
      setReports(reportsRes.data.reports);
    } catch (error) {
      console.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    if (score >= 40) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'processing':
        return 'badge-warning';
      case 'failed':
        return 'badge-error';
      case 'pending':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">
          Welcome back, {user?.firstName || user?.email}
        </h1>
        <p className="text-surface-500 mt-1">
          Here's an overview of your GEO SEO reports
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <CreditCard className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="stat-value">{credits?.available || 0}</p>
              <p className="stat-label">Credits Available</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="stat-value">{credits?.totalPurchased || 0}</p>
              <p className="stat-label">Total Reports</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="stat-value capitalize">{user?.subscriptionTier || 'Free'}</p>
              <p className="stat-label">Subscription</p>
            </div>
          </div>
        </div>
      </div>

      {/* Credits Warning */}
      {(credits?.available || 0) < 2 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Low on credits</p>
            <p className="text-sm text-yellow-700 mt-1">
              You have {credits?.available} credits remaining. Purchase more to continue generating reports.
            </p>
            <Link to="/billing" className="btn-primary mt-3 inline-flex text-sm">
              Buy Credits
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-4">
        <Link to="/new-report" className="btn-primary">
          Generate New Report
        </Link>
        <Link to="/billing" className="btn-outline">
          Manage Subscription
        </Link>
      </div>

      {/* Recent Reports */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Recent Reports</h2>
          <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
            View all →
          </Link>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500">No reports yet</p>
            <Link to="/new-report" className="btn-primary mt-4">
              Generate Your First Report
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Website</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-surface-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-surface-900">{report.website_name || report.website_url}</p>
                        <p className="text-sm text-surface-500 truncate max-w-xs">{report.website_url}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {report.geo_score ? (
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold ${getScoreColor(report.geo_score)}`}>
                          {report.geo_score}
                        </span>
                      ) : (
                        <span className="text-surface-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={getStatusBadge(report.status)}>{report.status}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-surface-500">
                      {new Date(report.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {report.status === 'completed' && (
                        <Link
                          to={`/reports/${report.id}`}
                          className="text-sm text-primary-600 hover:text-primary-700"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
