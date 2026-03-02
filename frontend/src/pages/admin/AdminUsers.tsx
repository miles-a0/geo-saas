import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await adminApi.users();
      setUsers(res.data.users);
    } finally { setLoading(false); }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">Users</h1>
      <div className="card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="text-left py-3 px-4">Email</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Plan</th>
              <th className="text-left py-3 px-4">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-surface-100">
                <td className="py-3 px-4">{u.email}</td>
                <td className="py-3 px-4">{u.first_name} {u.last_name}</td>
                <td className="py-3 px-4">
                  <span className="badge badge-info">{u.subscription_tier}</span>
                </td>
                <td className="py-3 px-4">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
