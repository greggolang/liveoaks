import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface User {
  id: string; first_name: string; last_name: string; email: string
  role: string; status: string; phone?: string; created_at: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const load = () => api.admin.users().then(d => setUsers(d as User[]))
  useEffect(() => { load() }, [])

  const setRole = async (id: string, role: string) => {
    await api.admin.updateRole(id, role)
    load()
  }
  const setStatus = async (id: string, status: string) => {
    await api.admin.updateStatus(id, status)
    load()
  }
  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await api.admin.deleteUser(id)
    load()
  }

  const roleColor: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    board: 'bg-blue-100 text-blue-700',
    member: 'bg-gray-100 text-gray-700',
  }
  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    inactive: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Members</h2>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.first_name} {u.last_name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select value={u.role} onChange={e => setRole(u.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${roleColor[u.role]}`}>
                    <option value="member">Member</option>
                    <option value="board">Board</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select value={u.status} onChange={e => setStatus(u.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusColor[u.status]}`}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteUser(u.id, `${u.first_name} ${u.last_name}`)}
                    className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
