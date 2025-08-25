import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Mail, Zap, Users, Calendar, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const UnderConstruction = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const handleWaitlistSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address to join the waitlist.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    // Determine source based on how user got here
    const currentPath = window.location.pathname;
    const source = currentPath === '/under-construction' ? 'under-construction' : 'restricted-access';

    try {
      const { data, error } = await supabase.functions.invoke('waitlist-signup', {
        body: {
          email: email.trim(),
          source: source,
          referrer: window.location.href,
          metadata: {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            originalPath: currentPath !== '/under-construction' ? currentPath : undefined
          }
        }
      });

      if (error) throw error;

      setIsSuccess(true);
      setEmail('');
      
      toast({
        title: "Successfully added to waitlist!",
        description: data.duplicate 
          ? "You're already on our waitlist - we'll notify you when we launch!"
          : "We'll notify you as soon as we're ready to launch.",
      });
    } catch (error: any) {
      console.error('Waitlist signup error:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again or contact support if the problem persists.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Users,
      title: "Client Management",
      description: "Comprehensive client profiles, progress tracking, and communication tools"
    },
    {
      icon: Calendar,
      title: "Smart Scheduling",
      description: "Automated booking system with conflict detection and availability management"
    },
    {
      icon: BarChart3,
      title: "Performance Analytics",
      description: "Detailed insights into client progress, business metrics, and growth trends"
    },
    {
      icon: Zap,
      title: "Workflow Automation",
      description: "Streamlined processes for payments, notifications, and routine tasks"
    }
  ];

  const testimonials = [
    {
      quote: "This platform has transformed how I manage my personal training business.",
      author: "Sarah Johnson",
      role: "Certified Personal Trainer"
    },
    {
      quote: "The scheduling system alone has saved me hours every week.",
      author: "Mike Chen",
      role: "Fitness Coach"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto mb-16">
          <Badge variant="outline" className="mb-6 px-4 py-2 text-sm font-medium">
            🚀 Coming Soon
          </Badge>
          
          <h1 className="text-display mb-6 bg-gradient-primary bg-clip-text text-transparent">
            The Ultimate Platform for Personal Trainers
          </h1>
          
          <p className="text-body-large text-muted-foreground mb-8 max-w-2xl mx-auto">
            We're building the most comprehensive training management platform designed specifically 
            for modern fitness professionals. Join our waitlist for exclusive early access.
          </p>

          {/* Waitlist Form */}
          <Card className="card-elevated max-w-md mx-auto mb-12">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-heading-4">Join the Waitlist</CardTitle>
              <CardDescription>
                Be the first to know when we launch
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSuccess ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
                  <p className="text-body font-medium text-success">
                    You're on the list! We'll be in touch soon.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSignup} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Adding to waitlist..." : "Join Waitlist"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-heading-2 mb-4">Powerful Features for Modern Trainers</h2>
            <p className="text-body text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage, grow, and optimize your personal training business
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="card-gradient hover-lift">
                <CardContent className="p-6 text-center">
                  <feature.icon className="h-8 w-8 text-primary mx-auto mb-4" />
                  <h3 className="text-heading-4 mb-2">{feature.title}</h3>
                  <p className="text-body-small text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Social Proof */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-heading-2 mb-4">Trusted by Fitness Professionals</h2>
            <p className="text-body text-muted-foreground">
              Join hundreds of trainers who are already excited about our platform
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="card-elevated">
                <CardContent className="p-6">
                  <blockquote className="text-body mb-4 italic">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold mr-3">
                      {testimonial.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{testimonial.author}</p>
                      <p className="text-body-small text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Card className="card-glow max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-heading-3 mb-4">Ready to Transform Your Business?</h3>
              <p className="text-body text-muted-foreground mb-6">
                Don't miss out on early access. Join our waitlist today and be among the first 
                to experience the future of personal training management.
              </p>
              
              <div className="flex items-center justify-center space-x-6 text-body-small text-muted-foreground">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-success mr-2" />
                  Free during beta
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-success mr-2" />
                  Premium support
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-success mr-2" />
                  No commitment
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-body-small text-muted-foreground">
            © 2024 Personal Trainer Platform. Built for fitness professionals, by fitness professionals.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default UnderConstruction;