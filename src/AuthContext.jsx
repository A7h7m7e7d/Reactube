import { createContext, useContext, useEffect, useState } from 'react'
import { getUser, onAuthChange } from './lib/store'

const AuthContext = createContext({ user: null, loading: true })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    getUser().then((u) => {
      if (mounted) {
        setUser(u)
        setLoading(false)
      }
    })
    const unsub = onAuthChange((u) => mounted && setUser(u))
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
