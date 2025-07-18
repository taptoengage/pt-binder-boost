import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Menu, X, Users, Calendar, CreditCard, BarChart3, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { signInWithGoogle } = useAuth();

  return (
    <header className="fixed top-0 w-full bg-background/80 backdrop-blur-lg border-b border-border z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-heading-4 font-bold">PT Binder</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link to="#features" className="text-body hover:text-primary transition-colors">
              Features
            </Link>
            <Link to="#pricing" className="text-body hover:text-primary transition-colors">
              Pricing
            </Link>
            <Link to="#about" className="text-body hover:text-primary transition-colors">
              About
            </Link>
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Button variant="ghost" onClick={signInWithGoogle}>
              Sign In
            </Button>
            <Button variant="gradient" onClick={signInWithGoogle}>
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        <div className={cn(
          "md:hidden transition-all duration-200 overflow-hidden",
          isMenuOpen ? "max-h-64 pb-4" : "max-h-0"
        )}>
          <nav className="flex flex-col space-y-4 pt-4 border-t border-border">
            <Link to="#features" className="text-body hover:text-primary transition-colors">
              Features
            </Link>
            <Link to="#pricing" className="text-body hover:text-primary transition-colors">
              Pricing
            </Link>
            <Link to="#about" className="text-body hover:text-primary transition-colors">
              About
            </Link>
            <div className="flex flex-col space-y-2 pt-2">
              <Button variant="ghost" onClick={signInWithGoogle}>
                Sign In
              </Button>
              <Button variant="gradient" onClick={signInWithGoogle}>
                Get Started
              </Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function DashboardNavigation() {
  const navigate = useNavigate();
  
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="bg-background border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-heading-4 font-bold">PT Binder</span>
          </Link>

          {/* Dashboard Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              to="/dashboard" 
              className="flex items-center space-x-2 text-body hover:text-primary transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Clients</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/clients')}>
                  View All Clients
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/clients/new')}>
                  Add New Client
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/clients/manage')}>
                  Manage Client Profiles
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Schedule</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/schedule')}>
                  View Schedule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/schedule/new')}>
                  Schedule New Session
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/schedule/availability')}>
                  Manage Availability
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link 
              to="/finance" 
              className="flex items-center space-x-2 text-body hover:text-primary transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>Finance</span>
            </Link>
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings/business')}>
                  Business Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings/service-types')}>
                  My Services
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings/integrations')}>
                  Integrations
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/help')}>
                  Help & Support
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}