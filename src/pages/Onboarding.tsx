import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Building2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Onboarding() {
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const { trainer } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    if (trainer) {
      setBusinessName(trainer.business_name || '')
      setInitialLoading(false)
    }
  }, [trainer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!trainer || !businessName.trim()) return

    setLoading(true)

    try {
      const { error } = await supabase
        .from('trainers')
        .update({ business_name: businessName.trim() })
        .eq('id', trainer.id)

      if (error) {
        console.error('Error updating business name:', error)
        toast({
          title: "Error",
          description: "Failed to update business name. Please try again.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Success",
        description: "Business profile updated successfully!",
      })

      navigate('/dashboard')
    } catch (error) {
      console.error('Error in handleSubmit:', error)
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-heading-2">Welcome to PT Binder!</CardTitle>
          <CardDescription>
            Let's set up your business profile to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                type="text"
                placeholder="Enter your business name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !businessName.trim()}
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}