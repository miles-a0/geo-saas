import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsApi, usersApi } from '../lib/api';
import { Globe, AlertCircle, CheckCircle } from 'lucide-react';

export default function NewReport() {
  const navigate = useNavigate();
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    usersApi.credits().then(res => console.log('credits:', res.data.credits));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await reportsApi.create({ websiteUrl, websiteName: websiteName || undefined });
      navigate('/reports');
    } catch (err: any) {
      if (err.response?.data?.code === 'INSUFFICIENT_CREDITS') {
        navigate('/billing');
      } else {
        setError(err.response?.data?.error || 'Failed to create report');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-surface-900 mb-2">Generate GEO Report</h1>
      <p className="text-surface-500 mb-8">Enter a website URL to analyze its AI search visibility</p>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="label">Website URL *</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Globe className="h-5 w-5 text-surface-400" />
            </div>
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="input pl-10"
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div>
          <label className="label">Website Name (Optional)</label>
          <input
            type="text"
            value={websiteName}
            onChange={(e) => setWebsiteName(e.target.value)}
            className="input"
            placeholder="My Awesome Website"
          />
        </div>

        <div className="flex items-center gap-3 p-4 bg-surface-50 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm text-surface-700">This report will use 1 credit</span>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Creating Report...' : 'Generate Report'}
        </button>
      </form>
    </div>
  );
}
