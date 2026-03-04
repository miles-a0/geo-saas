import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { paymentsApi, usersApi } from '../lib/api';
import { Zap, AlertCircle, Terminal } from 'lucide-react';

export default function Billing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [credits, setCredits] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [creditsToBuy, setCreditsToBuy] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const addDebug = (msg: string) => {
    setDebugLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    loadData();
    if (searchParams.get('success')) alert('Payment successful!');
    if (searchParams.get('canceled')) alert('Payment canceled');
    
    // Auto-trigger payment flow if plan is specified in URL
    const plan = searchParams.get('plan');
    if (plan === 'subscription') {
      handleSubscribe();
    } else if (plan === 'single') {
      handleBuyCredits();
    }
  }, [searchParams]);

  const loadData = async () => {
    const res = await usersApi.credits();
    setCredits(res.data.credits);
  };

  const handleBuyCredits = async () => {
    setLoading(true);
    setError(null);
    addDebug('Starting buy credits request...');
    addDebug(`Credits to buy: ${creditsToBuy}`);
    
    try {
      addDebug('Calling paymentsApi.createCheckout...');
      const res = await paymentsApi.createCheckout(creditsToBuy);
      addDebug(`Response received: ${JSON.stringify(res.data)}`);
      window.location.href = res.data.url;
    } catch (e: any) {
      addDebug(`ERROR: ${e.message}`);
      if (e.response) {
        addDebug(`Response status: ${e.response.status}`);
        addDebug(`Response data: ${JSON.stringify(e.response.data)}`);
      }
      const errorMsg = e.response?.data?.error || e.message || 'Failed to create checkout';
      setError(errorMsg);
      console.error(e);
    }
    setLoading(false);
    addDebug('Request complete');
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    addDebug('Starting subscription request...');
    
    try {
      addDebug('Calling paymentsApi.createSubscription...');
      const res = await paymentsApi.createSubscription();
      addDebug(`Response received: ${JSON.stringify(res.data)}`);
      window.location.href = res.data.url;
    } catch (e: any) {
      addDebug(`ERROR: ${e.message}`);
      if (e.response) {
        addDebug(`Response status: ${e.response.status}`);
        addDebug(`Response data: ${JSON.stringify(e.response.data)}`);
      }
      const errorMsg = e.response?.data?.error || e.message || 'Failed to create subscription';
      setError(errorMsg);
      console.error(e);
    }
    setLoading(false);
    addDebug('Request complete');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-surface-900 mb-2">Billing & Credits</h1>
      <p className="text-surface-500 mb-8">Manage your subscription and purchase credits</p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Payment Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <div className="mb-6">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900"
        >
          <Terminal className="h-4 w-4" />
          {showDebug ? 'Hide' : 'Show'} Debug Info
        </button>
        
        {showDebug && (
          <div className="mt-2 p-4 bg-gray-900 text-green-400 rounded-lg text-xs font-mono max-h-64 overflow-y-auto">
            <p className="text-yellow-400 mb-2">=== Debug Log ===</p>
            {debugLog.map((log, i) => (
              <p key={i} className="mb-1">{log}</p>
            ))}
            {debugLog.length === 0 && <p className="text-gray-500">No debug messages yet. Click a button to start.</p>}
            
            <p className="text-yellow-400 mt-4 mb-2">=== User Info ===</p>
            <p>User logged in: {user ? 'Yes' : 'No'}</p>
            <p>User email: {user?.email || 'N/A'}</p>
            <p>Subscription tier: {user?.subscriptionTier || 'N/A'}</p>
          </div>
        )}
      </div>

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
