import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { paymentsApi, usersApi } from '../lib/api';
import { Zap } from 'lucide-react';

export default function Billing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [credits, setCredits] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [creditsToBuy, setCreditsToBuy] = useState(1);

  useEffect(() => {
    loadData();
    if (searchParams.get('success')) alert('Payment successful!');
    if (searchParams.get('canceled')) alert('Payment canceled');
  }, [searchParams]);

  const loadData = async () => {
    const res = await usersApi.credits();
    setCredits(res.data.credits);
  };

  const handleBuyCredits = async () => {
    setLoading(true);
    try {
      const res = await paymentsApi.createCheckout(creditsToBuy);
      window.location.href = res.data.url;
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await paymentsApi.createSubscription();
      window.location.href = res.data.url;
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-surface-900 mb-2">Billing & Credits</h1>
      <p className="text-surface-500 mb-8">Manage your subscription and purchase credits</p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Current Plan */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-8 w-8 text-primary-600" />
            <div>
              <p className="text-2xl font-bold capitalize">{user?.subscriptionTier || 'Free'}</p>
              <p className="text-surface-500">{credits?.available || 0} credits available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Monthly Subscription</h2>
        <div className="flex items-center justify-between p-4 bg-primary-50 rounded-lg">
          <div>
            <p className="font-semibold">Pro Monthly</p>
            <p className="text-sm text-surface-600">£15/month (billed annually) - 12 reports/year</p>
          </div>
          <button onClick={handleSubscribe} disabled={loading} className="btn-primary">
            {user?.subscriptionTier === 'monthly' ? 'Current Plan' : 'Subscribe'}
          </button>
        </div>
      </div>

      {/* Buy Credits */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Buy Individual Reports</h2>
        <div className="flex items-center gap-4 mb-4">
          <input
            type="number"
            min="1"
            max="100"
            value={creditsToBuy}
            onChange={(e) => setCreditsToBuy(parseInt(e.target.value) || 1)}
            className="input w-24"
          />
          <span className="text-surface-600">credits = £{creditsToBuy * 20}</span>
        </div>
        <button onClick={handleBuyCredits} disabled={loading} className="btn-primary">
          {loading ? 'Processing...' : 'Buy Credits'}
        </button>
      </div>
    </div>
  );
}
