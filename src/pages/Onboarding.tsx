import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Phone, Mail, Instagram, Facebook, MessageCircle, Link2, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Zod Schema for Onboarding Form
const OnboardingSchema = z.object({
  business_name: z.string().min(1, 'Business name is required.'),
  contact_email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  instagram_handle: z.string().optional().or(z.literal('')),
  whatsapp_id: z.string().optional().or(z.literal('')),
  facebook_id: z.string().optional().or(z.literal('')),
  trainerize_id: z.string().optional().or(z.literal('')),
  wechat_id: z.string().optional().or(z.literal('')),
})

type OnboardingFormData = z.infer<typeof OnboardingSchema>

export default function Onboarding() {
  const [initialLoading, setInitialLoading] = useState(true)
  const { user, trainer } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // React Hook Form initialization
  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(OnboardingSchema),
    defaultValues: {
      business_name: '',
      contact_email: '',
      phone: '',
      instagram_handle: '',
      whatsapp_id: '',
      facebook_id: '',
      trainerize_id: '',
      wechat_id: '',
    },
    mode: 'onChange'
  })

  const { handleSubmit, formState: { isSubmitting } } = form

  // Populate form default values from existing trainer data when available
  useEffect(() => {
    if (trainer) {
      form.reset({
        business_name: trainer.business_name || '',
        contact_email: trainer.contact_email || user?.email || '',
        phone: (trainer as any).phone || '',
        instagram_handle: (trainer as any).instagram_handle || '',
        whatsapp_id: (trainer as any).whatsapp_id || '',
        facebook_id: (trainer as any).facebook_id || '',
        trainerize_id: (trainer as any).trainerize_id || '',
        wechat_id: (trainer as any).wechat_id || '',
      })
      setInitialLoading(false)
    } else if (!user && !trainer) {
      setInitialLoading(false)
    }
  }, [user, trainer, form])

  // onSubmit function using react-hook-form
  const onSubmit = async (data: OnboardingFormData) => {
    if (!trainer?.id) {
      toast({ title: "Error", description: "Trainer profile not found. Please try logging in again.", variant: "destructive" })
      return
    }

    try {
      const payload = {
        business_name: data.business_name.trim(),
        contact_email: data.contact_email.trim() || null,
        phone: data.phone.trim() || null,
        instagram_handle: data.instagram_handle.trim() || null,
        whatsapp_id: data.whatsapp_id.trim() || null,
        facebook_id: data.facebook_id.trim() || null,
        trainerize_id: data.trainerize_id.trim() || null,
        wechat_id: data.wechat_id.trim() || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('trainers')
        .update(payload)
        .eq('id', trainer.id)

      if (error) {
        console.error('Error updating profile:', error)
        throw error
      }

      toast({
        title: "Success",
        description: "Business profile updated successfully!",
      })

      navigate('/dashboard')
    } catch (error: any) {
      console.error('Error in onSubmit:', error)
      toast({
        title: "Error",
        description: `An unexpected error occurred: ${error.message || 'Please try again.'}`,
        variant: "destructive",
      })
    }
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading onboarding data...</span>
      </div>
    )
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
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Business Name */}
              <FormField
                control={form.control}
                name="business_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your business name"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Contact Information Section */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                
                {/* Email */}
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" /> Email
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="your@email.com" type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Phone */}
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Phone className="w-4 h-4 mr-2 text-muted-foreground" /> Phone
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+61412345678" type="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Messaging Handles Section */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-lg font-semibold">Messaging Handles (Optional)</h3>
                
                {/* Instagram */}
                <FormField
                  control={form.control}
                  name="instagram_handle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Instagram className="w-4 h-4 mr-2 text-muted-foreground" /> Instagram Handle
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="@your_instagram_handle" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* WhatsApp */}
                <FormField
                  control={form.control}
                  name="whatsapp_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> WhatsApp ID
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., +61412345678" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Facebook */}
                <FormField
                  control={form.control}
                  name="facebook_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Facebook className="w-4 h-4 mr-2 text-muted-foreground" /> Facebook ID
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., your_facebook_profile_id" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Trainerize */}
                <FormField
                  control={form.control}
                  name="trainerize_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Link2 className="w-4 h-4 mr-2 text-muted-foreground" /> Trainerize ID
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., your_trainerize_username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* WeChat */}
                <FormField
                  control={form.control}
                  name="wechat_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> WeChat ID
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., your_wechat_id" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting || !form.formState.isValid}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up...
                  </>
                ) : 'Complete Setup'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}