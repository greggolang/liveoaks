import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api, IMPERSONATION_KEY } from '../api/client'

export const IMPERSONATION_NAME_KEY = 'impersonation_name'

export default function Impersonate() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setError('Missing token.'); return }

    api.auth.redeemImpersonation(token)
      .then(({ jwt, name }) => {
        sessionStorage.setItem(IMPERSONATION_KEY, jwt)
        sessionStorage.setItem(IMPERSONATION_NAME_KEY, name)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => setError('Token is invalid or has expired. Close this tab and try again.'))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-sm text-center shadow-sm">
          <p className="text-red-600 font-medium mb-1">Unable to open member view</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400 animate-pulse">Opening member view…</p>
    </div>
  )
}
