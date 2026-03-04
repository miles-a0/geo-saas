import { useState, useEffect } from 'react';
import { adminApi, authApi } from '../../lib/api';
import { Trash2, Edit, Plus, X } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    company: '',
    subscriptionTier: 'free',
    monthlyReportsRemaining: 0,
  });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await adminApi.users();
      setUsers(res.data.users);
    } finally { setLoading(false); }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      company: '',
      subscriptionTier: 'free',
      monthlyReportsRemaining: 0,
    });
    setShowModal(true);
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      company: user.company || '',
      subscriptionTier: user.subscription_tier || 'free',
      monthlyReportsRemaining: user.monthly_reports_remaining || 0,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await adminApi.updateUser(editingUser.id, {
          firstName: formData.firstName,
          lastName: formData.lastName,
          company: formData.company,
          subscriptionTier: formData.subscriptionTier,
          monthlyReportsRemaining: formData.monthlyReportsRemaining,
        });
      } else {
        await authApi.register({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          company: formData.company,
        });
      }
      setShowModal(false);
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await adminApi.deleteUser(id);
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Users</h1>
        <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>
      
      <div className="card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="text-left py-3 px-4">Email</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Company</th>
              <th className="text-left py-3 px-4">Plan</th>
              <th className="text-left py-3 px-4">Credits</th>
              <th className="text-left py-3 px-4">Joined</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-surface-100">
                <td className="py-3 px-4">{u.email}</td>
                <td className="py-3 px-4">{u.first_name} {u.last_name}</td>
                <td className="py-3 px-4">{u.company || '-'}</td>
                <td className="py-3 px-4">
                  <span className="badge badge-info">{u.subscription_tier}</span>
                </td>
                <td className="py-3 px-4">{u.monthly_reports_remaining}</td>
                <td className="py-3 px-4">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal(u)} className="btn-ghost p-2">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="btn-ghost p-2 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingUser ? 'Edit User' : 'Create User'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email *</label>
                    <input
                      type="email"
                      className="input w-full"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password *</label>
                    <input
                      type="password"
                      className="input w-full"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      required={!editingUser}
                    />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={formData.firstName}
                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company</label>
                <input
                  type="text"
                  className="input w-full"
                  value={formData.company}
                  onChange={e => setFormData({...formData, company: e.target.value})}
                />
              </div>
              {editingUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Subscription Plan</label>
                    <select
                      className="input w-full"
                      value={formData.subscriptionTier}
                      onChange={e => setFormData({...formData, subscriptionTier: e.target.value})}
                    >
                      <option value="free">Free</option>
                      <option value="one_time">One Time</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Credits</label>
                    <input
                      type="number"
                      className="input w-full"
                      value={formData.monthlyReportsRemaining}
                      onChange={e => setFormData({...formData, monthlyReportsRemaining: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
