import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigation } from '@/components/Navigation';
import { useAuth } from '@/hooks/useAuth';
import { 
  Users, 
  Calendar, 
  CreditCard, 
  BarChart3, 
  Shield, 
  Clock, 
  Smartphone,
  ArrowRight,
  Check,
  Star
} from 'lucide-react';

export default function Landing() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-display mb-6 bg-gradient-primary bg-clip-text text-transparent animate-fade-in-up">
              Streamline Your Personal Training Business
            </h1>
            <p className="text-body-large text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in-up">
              PT Binder helps independent personal trainers manage clients, schedules, and payments 
              in one professional platform. Reduce admin time and focus on what you do best.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up">
              <Button size="xl" variant="gradient" className="group" onClick={signInWithGoogle}>
                Start Your Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="xl" variant="professional">
                Watch Demo
              </Button>
            </div>
            <p className="text-body-small text-muted-foreground mt-4">
              14-day free trial • No credit card required • Setup in minutes
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-heading-1 mb-4">Everything You Need to Run Your PT Business</h2>
            <p className="text-body-large text-muted-foreground max-w-2xl mx-auto">
              Built specifically for independent personal trainers who want to spend less time on admin 
              and more time training clients.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Client Management</CardTitle>
                <CardDescription>
                  Keep detailed client profiles, track session packages, and monitor progress all in one place.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Smart Scheduling</CardTitle>
                <CardDescription>
                  Manage your availability, book sessions, and sync with Google Calendar seamlessly.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Payment Tracking</CardTitle>
                <CardDescription>
                  Track payments, manage overdue accounts, and reconcile with Xero for complete financial control.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Business Analytics</CardTitle>
                <CardDescription>
                  Get insights into your earnings, client retention, and business growth with detailed reports.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Secure & Private</CardTitle>
                <CardDescription>
                  Your data is completely isolated with enterprise-grade security. Each trainer's data is private.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-elevated hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Mobile Optimized</CardTitle>
                <CardDescription>
                  Access your business from anywhere with our fully responsive design that works on all devices.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-4 bg-secondary/30">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-heading-1 mb-6">Focus on Training, Not Admin</h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-heading-4 mb-1">Save 10+ Hours Per Week</h3>
                    <p className="text-muted-foreground">
                      Automate scheduling, payment tracking, and client communications.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-heading-4 mb-1">Increase Revenue</h3>
                    <p className="text-muted-foreground">
                      Never miss a payment and optimize your schedule for maximum earnings.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-heading-4 mb-1">Professional Image</h3>
                    <p className="text-muted-foreground">
                      Provide clients with a professional experience that builds trust and loyalty.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <Card className="card-glow">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <span>Today's Schedule</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium">Sarah Johnson</p>
                      <p className="text-body-small text-muted-foreground">9:00 AM - Strength Training</p>
                    </div>
                    <span className="status-success px-2 py-1 rounded text-body-small">Confirmed</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium">Mike Chen</p>
                      <p className="text-body-small text-muted-foreground">11:00 AM - HIIT Session</p>
                    </div>
                    <span className="status-warning px-2 py-1 rounded text-body-small">Pending</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium">Emma Davis</p>
                      <p className="text-body-small text-muted-foreground">2:00 PM - Functional Movement</p>
                    </div>
                    <span className="status-success px-2 py-1 rounded text-body-small">Confirmed</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-heading-1 mb-4">Ready to Transform Your PT Business?</h2>
            <p className="text-body-large text-muted-foreground mb-8">
              Join hundreds of personal trainers who have streamlined their business with PT Binder.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="xl" variant="gradient" className="group" onClick={signInWithGoogle}>
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="xl" variant="professional">
                Schedule Demo
              </Button>
            </div>
            <div className="flex items-center justify-center space-x-1 mt-6">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-warning text-warning" />
              ))}
              <span className="ml-2 text-body-small text-muted-foreground">
                4.9/5 from 200+ trainers
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-8 px-4">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-heading-4 font-bold">PT Binder</span>
          </div>
          <p className="text-background/70">
            Streamlining personal training businesses worldwide
          </p>
        </div>
      </footer>
    </div>
  );
}