import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../lib/api';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    company: user?.company || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usersApi.updateProfile(formData);
      await refreshUser();
      setMessage('Profile updated!');
    } catch (e) { setMessage('Error updating profile'); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">Settings</h1>
      
      {message && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg">{message}</div>}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                className="input"
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                className="input"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
              className="input"
            />
          </div>
          <div className="mt-4">
            <label className="label">Email</label>
            <input type="email" value={user?.email} disabled className="input bg-surface-100" />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
