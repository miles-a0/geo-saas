import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Globe, AlertCircle, Check, Zap, Shield } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPlan = searchParams.get('plan') || 'single';
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    company: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Pre-select the plan based on URL parameter
  }, [selectedPlan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(formData);
      // Redirect to billing with the selected plan
      navigate(`/billing?plan=${selectedPlan}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center">
            <Link to="/" className="inline-flex items-center gap-2">
              <Globe className="h-10 w-10 text-primary-600" />
              <span className="text-2xl font-bold text-surface-900">Geo-SaaS</span>
            </Link>
            <h1 className="mt-6 text-3xl font-bold text-surface-900">Create account</h1>
            <p className="mt-2 text-surface-500">Start optimizing for AI search today</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">First name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="input"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="label">Last name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="input"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="label">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label className="label">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="input"
                placeholder="Your Company Ltd"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-surface-500">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Pricing */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-slate-900 to-slate-800 items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="text-center text-white mb-8">
            <h2 className="text-3xl font-bold mb-2">Choose Your Plan</h2>
            <p className="text-slate-400">
              Get started with a comprehensive GEO SEO report and track your AI search performance.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Single Report */}
            <div className={`bg-white rounded-2xl p-6 shadow-xl transition-all ${selectedPlan === 'single' ? 'ring-4 ring-primary-500' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium text-slate-600">Single Report</span>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-slate-900">£20</span>
                <span className="text-slate-500"> one-time</span>
              </div>
              <ul className="space-y-2 mb-6">
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Comprehensive GEO analysis</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>AI citability score</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Brand authority</span>
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
                  <span>PDF report via email</span>
                </li>
              </ul>
              <div className={`text-center text-sm font-medium ${selectedPlan === 'single' ? 'text-primary-600' : 'text-slate-400'}`}>
                {selectedPlan === 'single' ? '✓ Selected' : 'One-time purchase'}
              </div>
            </div>
            
            {/* Subscription */}
            <div className={`bg-gradient-to-br rounded-2xl p-6 shadow-xl relative transition-all ${selectedPlan === 'subscription' ? 'ring-4 ring-white' : 'from-primary-600 to-primary-700'}`}>
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
              <ul className="space-y-2 mb-6">
                <li className="flex items-start gap-2 text-sm text-white">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Everything in Single Report</span>
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
                  <span>Track progress</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Priority support</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-primary-100">
                  <Check className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
                  <span>Cancel anytime</span>
                </li>
              </ul>
              <div className={`text-center text-sm font-medium ${selectedPlan === 'subscription' ? 'text-white' : 'text-primary-200'}`}>
                {selectedPlan === 'subscription' ? '✓ Selected' : '12 reports/year'}
              </div>
            </div>
          </div>
          
          <p className="text-center text-slate-500 text-sm mt-6">
            Secure payment powered by Stripe • 30-day money-back guarantee
          </p>
        </div>
      </div>
    </div>
  );
}
