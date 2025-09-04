import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, Check, X, Chrome } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

// Feature flag for email authentication
const EMAIL_AUTH_ENABLED = import.meta.env.VITE_EMAIL_AUTH_ENABLED === 'true';

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// Form schemas
const signUpSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type SignUpForm = z.infer<typeof signUpSchema>;
type SignInForm = z.infer<typeof signInSchema>;
type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

// Password strength checker
const getPasswordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  return {
    score,
    strength: score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong'
  };
};

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { authStatus, loading, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState<'oauth' | 'signup' | 'signin' | 'forgot'>('oauth');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Forms
  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" }
  });

  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" }
  });

  const forgotPasswordForm = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" }
  });

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && authStatus !== 'unauthenticated') {
      navigate('/dashboard');
    }
  }, [authStatus, loading, navigate]);

  // Password strength for signup
  const password = signUpForm.watch("password");
  const passwordStrength = password ? getPasswordStrength(password) : null;

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google sign in error:', error);
      toast({
        title: "Authentication Error",
        description: "Failed to sign in with Google. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (data: SignUpForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast({
            title: "Account Already Exists",
            description: "An account with this email already exists. Try signing in instead.",
            variant: "destructive",
          });
          setActiveTab('signin');
          signInForm.setValue('email', data.email);
        } else {
          toast({
            title: "Sign Up Error",
            description: error.message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Account Created",
          description: "Please check your email to verify your account.",
        });
        setActiveTab('signin');
        signInForm.setValue('email', data.email);
      }
    } catch (error) {
      console.error('Sign up error:', error);
      toast({
        title: "Sign Up Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (data: SignInForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: "Invalid Credentials",
            description: "Please check your email and password and try again.",
            variant: "destructive",
          });
        } else if (error.message.includes('Email not confirmed')) {
          toast({
            title: "Email Not Verified",
            description: "Please check your email and click the verification link before signing in.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sign In Error",
            description: error.message,
            variant: "destructive",
          });
        }
      }
      // Success will be handled by the auth state change listener
    } catch (error) {
      console.error('Sign in error:', error);
      toast({
        title: "Sign In Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });

      if (error) {
        toast({
          title: "Reset Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reset Email Sent",
          description: "Please check your email for password reset instructions.",
        });
        setActiveTab('signin');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      toast({
        title: "Reset Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-heading-2 bg-gradient-primary bg-clip-text text-transparent">
            Optimised Trainer
          </CardTitle>
          <CardDescription>
            Professional personal training management platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: EMAIL_AUTH_ENABLED ? '1fr 1fr' : '1fr' }}>
              <TabsTrigger value="oauth">Continue with Google</TabsTrigger>
              {EMAIL_AUTH_ENABLED && (
                <TabsTrigger value="signin">Email</TabsTrigger>
              )}
            </TabsList>

            {/* OAuth Tab */}
            <TabsContent value="oauth" className="space-y-4">
              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center gap-2 bg-gradient-primary hover:opacity-90 transition-all duration-300"
                size="lg"
              >
                <Chrome className="h-5 w-5" />
                {isLoading ? "Signing in..." : "Continue with Google"}
              </Button>
              <p className="text-center text-body-small text-muted-foreground">
                Quick and secure authentication with your Google account
              </p>
            </TabsContent>

            {/* Email Authentication Tabs */}
            {EMAIL_AUTH_ENABLED && (
              <>
                {/* Sign In Tab */}
                <TabsContent value="signin" className="space-y-4">
                  <div className="flex justify-center gap-2 mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('signin')}
                      className={activeTab === 'signin' ? 'bg-secondary' : ''}
                    >
                      Sign In
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('signup')}
                      className={activeTab === 'signup' ? 'bg-secondary' : ''}
                    >
                      Sign Up
                    </Button>
                  </div>

                  <Form {...signInForm}>
                    <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                      <FormField
                        control={signInForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signInForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Enter your password"
                                  {...field}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90">
                        {isLoading ? "Signing in..." : "Sign In"}
                      </Button>

                      <Button
                        type="button"
                        variant="link"
                        className="w-full"
                        onClick={() => setActiveTab('forgot')}
                      >
                        Forgot your password?
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                {/* Sign Up Tab */}
                <TabsContent value="signup" className="space-y-4">
                  <div className="flex justify-center gap-2 mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('signin')}
                      className={activeTab === 'signin' ? 'bg-secondary' : ''}
                    >
                      Sign In
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('signup')}
                      className={activeTab === 'signup' ? 'bg-secondary' : ''}
                    >
                      Sign Up
                    </Button>
                  </div>

                  <Form {...signUpForm}>
                    <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                      <FormField
                        control={signUpForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signUpForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Create a strong password"
                                  {...field}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </FormControl>
                            {passwordStrength && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant={passwordStrength.strength === 'strong' ? 'default' : 
                                            passwordStrength.strength === 'medium' ? 'secondary' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {passwordStrength.strength.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="space-y-1 text-xs">
                                  <div className="flex items-center gap-2">
                                    {password.length >= 8 ? 
                                      <Check className="h-3 w-3 text-success" /> : 
                                      <X className="h-3 w-3 text-destructive" />
                                    }
                                    <span className={password.length >= 8 ? 'text-success' : 'text-muted-foreground'}>
                                      At least 8 characters
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/[A-Z]/.test(password) ? 
                                      <Check className="h-3 w-3 text-success" /> : 
                                      <X className="h-3 w-3 text-destructive" />
                                    }
                                    <span className={/[A-Z]/.test(password) ? 'text-success' : 'text-muted-foreground'}>
                                      One uppercase letter
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/[a-z]/.test(password) ? 
                                      <Check className="h-3 w-3 text-success" /> : 
                                      <X className="h-3 w-3 text-destructive" />
                                    }
                                    <span className={/[a-z]/.test(password) ? 'text-success' : 'text-muted-foreground'}>
                                      One lowercase letter
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/[0-9]/.test(password) ? 
                                      <Check className="h-3 w-3 text-success" /> : 
                                      <X className="h-3 w-3 text-destructive" />
                                    }
                                    <span className={/[0-9]/.test(password) ? 'text-success' : 'text-muted-foreground'}>
                                      One number
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signUpForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showConfirmPassword ? "text" : "password"}
                                  placeholder="Confirm your password"
                                  {...field}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90">
                        {isLoading ? "Creating account..." : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                {/* Forgot Password Tab */}
                <TabsContent value="forgot" className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="text-heading-4 mb-2">Reset Password</h3>
                    <p className="text-body-small text-muted-foreground">
                      Enter your email and we'll send you a reset link
                    </p>
                  </div>

                  <Form {...forgotPasswordForm}>
                    <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                      <FormField
                        control={forgotPasswordForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90">
                        {isLoading ? "Sending reset email..." : "Send Reset Email"}
                      </Button>

                      <Button
                        type="button"
                        variant="link"
                        className="w-full"
                        onClick={() => setActiveTab('signin')}
                      >
                        Back to Sign In
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;