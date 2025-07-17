import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, Trainer } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

interface AuthContextType {
  user: User | null
  trainer: Trainer | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        checkTrainerRecord(session.user)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      
      if (session?.user) {
        await checkTrainerRecord(session.user)
      } else {
        setTrainer(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkTrainerRecord = async (user: User) => {
    try {
      const { data: existingTrainer, error } = await supabase
        .from('trainers')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking trainer record:', error)
        setLoading(false)
        return
      }

      if (!existingTrainer) {
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
          console.error('Error creating trainer record:', insertError)
          setLoading(false)
          return
        }

        setTrainer(newTrainer)
        navigate('/onboarding')
      } else {
        setTrainer(existingTrainer)
        navigate('/dashboard')
      }
    } catch (error) {
      console.error('Error in checkTrainerRecord:', error)
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
      navigate('/')
    }
  }

  const value = {
    user,
    trainer,
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