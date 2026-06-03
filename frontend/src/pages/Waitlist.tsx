import { Navigate } from 'react-router-dom'

// All membership request traffic now goes through the branded /register form.
export default function Waitlist() {
  return <Navigate to="/register" replace />
}
