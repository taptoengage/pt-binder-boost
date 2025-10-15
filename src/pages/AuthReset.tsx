import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

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

const AuthReset = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" }
  });

  const password = form.watch("password");
  const passwordStrength = password ? getPasswordStrength(password) : null;

  // Helper to merge params from search and hash
  const getAllURLParams = () => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);

    const get = (k: string) => search.get(k) ?? hash.get(k);
    return {
      type: get('type'),
      code: get('code'),
      token: get('token'),
      token_hash: get('token_hash'),
      access_token: get('access_token'),
      refresh_token: get('refresh_token'),
    };
  };

  // Check if we have valid reset tokens
  useEffect(() => {
    const params = getAllURLParams();

    const validateToken = async () => {
      try {
        // Try token_hash format first (from email links)
        if (params.type === 'recovery' && params.token_hash) {
          console.log('AuthReset: recovery(token_hash)');
          const { error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: 'recovery'
          });
          if (error) {
            console.error('Token hash verification error:', error);
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        }
        // Try modern format: code + type=recovery
        else if (params.type === 'recovery' && params.code) {
          console.log('AuthReset: recovery(code)');
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) {
            console.error('Code exchange error:', error);
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        }
        // Fall back to current format: token + type=recovery
        else if (params.type === 'recovery' && params.token) {
          console.log('AuthReset: recovery(token)');
          const { error } = await supabase.auth.exchangeCodeForSession(params.token);
          if (error) {
            console.error('Token exchange error:', error);
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        }
        // Final fallback: access_token + refresh_token (legacy)
        else if (params.access_token && params.refresh_token) {
          console.log('AuthReset: legacy(access/refresh)');
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) {
            console.error('Session set error:', error);
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        }
        // No valid parameters found
        else {
          console.log('AuthReset: no params');
          setIsValidToken(false);
        }
      } catch (error) {
        console.error('Token validation failed:', error);
        setIsValidToken(false);
      }
    };

    validateToken();
  }, []);

  const handleResetPassword = async (data: ResetPasswordForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });

      if (error) {
        toast({
          title: "Password Reset Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password Updated",
          description: "Your password has been successfully updated. You can now sign in with your new password.",
        });
        // Redirect to auth page after successful reset
        navigate('/auth');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      toast({
        title: "Password Reset Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
        <Card className="w-full max-w-md card-elevated">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-heading-2 text-destructive">
              Invalid Reset Link
            </CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate('/auth')} 
              className="w-full bg-gradient-primary hover:opacity-90"
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-heading-2 bg-gradient-primary bg-clip-text text-transparent">
            Reset Password
          </CardTitle>
          <CardDescription>
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleResetPassword)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your new password"
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
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm your new password"
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
                {isLoading ? "Updating password..." : "Update Password"}
              </Button>

              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => navigate('/auth')}
              >
                Back to Sign In
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthReset;