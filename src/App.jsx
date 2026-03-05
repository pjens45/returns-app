import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Scanner from './pages/Scanner'
import Admin from './pages/Admin'

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/scan" replace />
  return children
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-air-blue text-lg">Loading...</div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/scan" replace /> : <Login />} />
      <Route path="/scan" element={<ProtectedRoute><Scanner /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
