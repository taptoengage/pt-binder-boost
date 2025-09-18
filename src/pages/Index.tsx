import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();

  const handleSignIn = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center px-4">
      <div className="text-center max-w-2xl mx-auto">
        <div className="animate-fade-in-up">
          <h1 className="text-display mb-6 bg-gradient-primary bg-clip-text text-transparent">
            Optimised Trainer
          </h1>
          <p className="text-body-large text-muted-foreground mb-8 leading-relaxed">
            Professional personal training management platform. 
            Streamline your client sessions, track progress, and grow your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={handleSignIn}
              size="lg"
              className="text-lg px-8 py-6 bg-gradient-primary hover:opacity-90 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-glow"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
