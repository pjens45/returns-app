import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { db, seedDatabase } from '../db/database'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState(30)
  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const timerRef = useRef(null)
  const warningTimerRef = useRef(null)
  const onTimeoutRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      try {
        // Explicitly open the DB first — surfaces version-upgrade blocks quickly
        await db.open()
        await seedDatabase()
      } catch (err) {
        console.error('[Auth] DB init failed:', err)
        // If the DB is blocked (old tab holding v5), delete and retry once
        if (err.name === 'UpgradeError' || err.message?.includes('blocked')) {
          console.warn('[Auth] DB blocked — deleting and retrying')
          try {
            await db.delete()
            await db.open()
            await seedDatabase()
          } catch (retryErr) {
            console.error('[Auth] DB retry also failed:', retryErr)
          }
        }
      }
      const saved = sessionStorage.getItem('currentUser')
      if (saved) {
        try { setUser(JSON.parse(saved)) } catch { /* noop */ }
      }
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    db.settings.get('sessionTimeout').then(s => {
      if (s) setSessionTimeout(s.value)
    })
  }, [])

  const login = useCallback(async (username, password) => {
    const u = await db.users.where('username').equals(username).first()
    if (!u || u.password !== password) return null
    setUser(u)
    sessionStorage.setItem('currentUser', JSON.stringify(u))
    return u
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    sessionStorage.removeItem('currentUser')
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    setTimeoutWarning(false)
  }, [])

  const resetInactivity = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    setTimeoutWarning(false)
    const totalMs = sessionTimeout * 60 * 1000
    warningTimerRef.current = setTimeout(() => {
      setTimeoutWarning(true)
    }, totalMs * 0.8)
    timerRef.current = setTimeout(() => {
      setTimeoutWarning(false)
      if (onTimeoutRef.current) onTimeoutRef.current()
    }, totalMs)
  }, [sessionTimeout])

  const setOnTimeout = useCallback((fn) => {
    onTimeoutRef.current = fn
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, sessionTimeout, setSessionTimeout, resetInactivity, setOnTimeout, timeoutWarning }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
