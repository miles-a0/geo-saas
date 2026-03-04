import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Globe, Mail, Lock, AlertCircle, Check, Zap, Shield } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center">
            <Link to="/" className="inline-flex items-center gap-2">
              <Globe className="h-10 w-10 text-primary-600" />
              <span className="text-2xl font-bold text-surface-900">Geo-SaaS</span>
            </Link>
            <h1 className="mt-6 text-3xl font-bold text-surface-900">Welcome back</h1>
            <p className="mt-2 text-surface-500">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-surface-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-surface-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-surface-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Pricing */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-slate-900 to-slate-800 items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="text-center text-white mb-8">
            <h2 className="text-3xl font-bold mb-2">Optimize for AI Search</h2>
            <p className="text-slate-400">
              Get comprehensive GEO SEO reports that help your website stand out in ChatGPT,
              Claude, Perplexity, and Google AI Overviews.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Single Report */}
            <div className="bg-white rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium text-slate-600">Single Report</span>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-slate-900">£20</span>
                <span className="text-slate-500"> one-time</span>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Comprehensive GEO SEO analysis</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>AI citability score & breakdown</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Brand authority assessment</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>E-E-A-T evaluation</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Technical SEO check</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Schema & structured data analysis</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Platform presence audit</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Actionable recommendations</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>PDF report delivered via email</span>
                </li>
              </ul>
              <Link
                to="/register?plan=single"
                className="block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white text-center font-semibold rounded-lg transition-colors"
              >
                Buy Now
              </Link>
            </div>
            
            {/* Subscription */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 shadow-xl relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                BEST VALUE
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-amber-300" />
                <span className="text-sm font-medium text-primary-100">Annual Subscription</span>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-white">£15</span>
                <span className="text-primary-200"> /month</span>
              </div>
              <div className="mb-4 inline-block bg-primary-500/30 text-primary-100 text-xs font-medium px-2 py-1 rounded">
                12 reports/year — Save 25%
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2 text-sm text-white">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Everything in Single Report, plus:</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>12 reports per year</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Monthly monitoring</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Track progress over time</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Priority email support</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Cancel anytime</span>
                </li>
              </ul>
              <Link
                to="/register?plan=subscription"
                className="block w-full py-3 px-4 bg-white hover:bg-slate-50 text-primary-600 text-center font-semibold rounded-lg transition-colors"
              >
                Subscribe
              </Link>
            </div>
          </div>
          
          <p className="text-center text-slate-500 text-sm mt-6">
            Secure payment powered by Stripe • No hidden fees
          </p>
        </div>
      </div>
    </div>
  );
}
