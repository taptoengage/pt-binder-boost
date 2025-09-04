import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

export interface Trainer {
  id: string
  business_name: string
  contact_email: string
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  trainer_id: string
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  trainer: Trainer | null
  client: Client | null
  loading: boolean
  authStatus: 'loading' | 'admin' | 'trainer' | 'client' | 'unauthenticated' | 'unassigned_role'
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Timeout wrapper for Supabase calls (7s default)
const withTimeout = <T,>(p: PromiseLike<T>, ms = 7000, op = 'supabase'): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error(`[auth-timeout] ${op} exceeded ${ms}ms`), { code: 'TIMEOUT' })), ms)
    ),
  ])


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [authStatus, setAuthStatus] = useState<'loading' | 'admin' | 'trainer' | 'client' | 'unauthenticated' | 'unassigned_role'>('loading')
  
  // Serialization and unmount guards
  const checkingRef = useRef(false)
  const mountedRef = useRef(true)
  const runIdRef = useRef(0) // helps ignore stale resolutions under StrictMode


  useEffect(() => {
    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return
      
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Defer Supabase calls to avoid blocking auth state changes
        setTimeout(() => {
          if (mountedRef.current) {
            checkUserType(session.user)
          }
        }, 0)
      } else {
        if (mountedRef.current) {
          setTrainer(null)
          setClient(null)
          setAuthStatus('unauthenticated')
          setLoading(false)
        }
      }
    })

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return
      
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        checkUserType(session.user)
      } else {
        setAuthStatus('unauthenticated')
        setLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  const checkUserType = async (currentUser: User) => {
    // Prevent overlapping runs
    if (checkingRef.current) {
      // quiet skip to avoid console spam
      return
    }
    
    checkingRef.current = true
    const myRunId = ++runIdRef.current
    
    if (!mountedRef.current) {
      checkingRef.current = false
      return
    }
    
    setLoading(true)
    console.log('[auth] start', { userId: currentUser.id })
    
    try {
      // 1) Check admin role FIRST
      const { data: isAdmin, error: adminError } = await withTimeout(
        supabase.rpc('has_role', { role_name: 'admin' }),
        7000,
        'has_role(admin)'
      )
      if (adminError) {
        console.warn('[auth] admin check error', adminError)
      }
      if (isAdmin) {
        if (runIdRef.current !== myRunId) return
        console.log('[auth] resolved: admin')
        if (mountedRef.current) {
          setTrainer(null)
          setClient(null)
          setAuthStatus('admin')
        }
        return
      }

      // 2) Check if user is a trainer
      const { data: trainerData, error: trainerError } = await withTimeout(
        supabase.from('trainers').select('*').eq('id', currentUser.id).single(),
        7000,
        'select trainers'
      )
      if (trainerError && !['PGRST116', '406'].includes(trainerError.code || '')) {
        console.warn('[auth] trainer error', trainerError)
      }
      
      if (trainerData && mountedRef.current) {
        if (runIdRef.current !== myRunId) return
        console.log('[auth] resolved: trainer')
        setTrainer(trainerData)
        setClient(null)
        setAuthStatus('trainer')
        return
      }

      // 3) Check if user is a client
      const { data: clientData, error: clientError } = await withTimeout(
        supabase.from('clients').select('*').eq('user_id', currentUser.id).single(),
        7000,
        'select clients'
      )
      if (clientError && !['PGRST116', '406'].includes(clientError.code || '')) {
        console.warn('[auth] client error', clientError)
      }
      
      if (clientData && mountedRef.current) {
        if (runIdRef.current !== myRunId) return
        console.log('[auth] resolved: client')
        setClient(clientData)
        setTrainer(null)
        setAuthStatus('client')
        return
      }

      // 4) No role found - needs onboarding
      if (runIdRef.current !== myRunId) return
      console.log('[auth] resolved: unassigned_role')
      if (mountedRef.current) {
        setTrainer(null)
        setClient(null)
        setAuthStatus('unassigned_role')
      }
    } catch (error) {
      console.warn('[auth] error', error)
      if (mountedRef.current) {
        setTrainer(null)
        setClient(null)
        setAuthStatus('unassigned_role')
      }
    } finally {
      checkingRef.current = false
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    })

    if (error) {
      console.error('Error signing in with Google:', error)
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    } else {
      setUser(null)
      setTrainer(null)
      setClient(null)
    }
  }

  const value = {
    user,
    session,
    trainer,
    client,
    loading,
    authStatus,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}