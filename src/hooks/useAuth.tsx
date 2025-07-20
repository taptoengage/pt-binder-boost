import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { useNavigate } from 'react-router-dom'

export interface Trainer {
  id: string
  business_name: string
  contact_email: string
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
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
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Defer Supabase calls to avoid blocking auth state changes
        setTimeout(() => {
          checkUserType(session.user)
        }, 0)
      } else {
        setTrainer(null)
        setClient(null)
        setLoading(false)
      }
    })

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        checkUserType(session.user)
      } else {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkUserType = async (user: User) => {
    try {
      // First check if user is a trainer
      const { data: existingTrainer, error: trainerError } = await supabase
        .from('trainers')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (trainerError) {
        console.error('Error checking trainer record:', trainerError)
        setLoading(false)
        return
      }

      if (existingTrainer) {
        // User is a trainer
        setTrainer(existingTrainer)
        navigate('/dashboard')
        return
      }

      // Not a trainer, check if user is a client
      const { data: existingClient, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (clientError) {
        console.error('Error checking client record:', clientError)
        setLoading(false)
        return
      }

      if (existingClient) {
        // User is a registered client
        setClient(existingClient)
        navigate('/client/dashboard')
        return
      }

      // Check if this could be a new trainer (first-time login)
      if (!existingTrainer && !existingClient) {
        // Create new trainer record for first-time login
        const { data: newTrainer, error: insertError } = await supabase
          .from('trainers')
          .insert({
            id: user.id,
            business_name: 'My Fitness Business',
            contact_email: user.email || '',
          })
          .select()
          .single()

        if (insertError) {
          // User is neither trainer nor registered client - deny access
          console.error('Access denied: User not registered as trainer or client')
          await supabase.auth.signOut()
          // TODO: Add toast notification here when available
          navigate('/')
          setLoading(false)
          return
        }

        setTrainer(newTrainer)
        navigate('/onboarding')
      }
    } catch (error) {
      console.error('Error in checkUserType:', error)
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })

    if (error) {
      console.error('Error signing in with Google:', error)
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    } else {
      setUser(null)
      setTrainer(null)
      setClient(null)
      navigate('/')
    }
  }

  const value = {
    user,
    session,
    trainer,
    client,
    loading,
    signInWithGoogle,
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