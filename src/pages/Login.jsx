import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import DeakoLogo from '../components/DeakoLogo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const usernameRef = useRef(null)

  useEffect(() => { usernameRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const user = await login(username, password)
    if (!user) {
      setError('Invalid credentials')
      return
    }
    navigate('/scan')
  }

  return (
    <div className="min-h-screen flex flex-col geo-bg">
      {/* Product banner header — mirrors scanner header position */}
      <div className="w-full flex-shrink-0">
        <img src="/product-banner.jpeg" alt="Deako products" className="w-full opacity-40" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
      <div className="glass-solid rounded-2xl w-full max-w-xl overflow-hidden">
        <div className="px-10 py-6">
        <h1 className="text-center text-sm font-semibold text-air-blue/60 tracking-tight mb-5">Returns Check In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-air-blue mb-2 uppercase tracking-wider">Username</label>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-air-blue transition"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-air-blue mb-2 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-air-blue transition"
            />
          </div>
          </div>

          {error && (
            <div className="text-terra text-sm text-center font-medium">{error}</div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-air-blue text-white font-semibold hover:bg-air-blue/80 transition text-lg"
          >
            Sign In
          </button>
        </form>

        <p className="text-center text-air-blue/40 text-xs mt-4">Deako Returns Processing</p>
        </div>
      </div>
      </div>
    </div>
  )
}
