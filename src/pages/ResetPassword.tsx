import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PasswordValidator } from "@/components/ui/PasswordValidator";
import { KeyRound, Loader2, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we have an active session (which Supabase automatically parses from hash)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(!!session);
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      toast({
        title: "Validation Error",
        description: "Please ensure your new password meets all strong requirements.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({
          title: "Reset Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password Updated!",
          description: "Your password has been changed successfully. Please log in with your new password.",
        });
        
        // Force signOut to invalidate the temporary reset session
        await supabase.auth.signOut();
        navigate("/student/login");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({
        title: "Unexpected Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm font-medium">Verifying reset token...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <KeyRound className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">CodeTrace</span>
          </div>
          <p className="text-muted-foreground text-sm">Account Security</p>
        </div>

        {hasSession ? (
          <Card className="shadow-lg border-white/5 bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                Choose a strong, secure new password that meets the security policy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <PasswordValidator
                    value={password}
                    onChange={setPassword}
                    confirmValue={confirmPassword}
                    onConfirmChange={setConfirmPassword}
                    showConfirmField={true}
                    onValidityChange={setIsPasswordValid}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !isPasswordValid}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving Password...
                    </>
                  ) : (
                    "Save New Password"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg border-destructive/20 bg-destructive/5 backdrop-blur-md">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive mb-1">
                <AlertCircle className="h-5 w-5" />
                <CardTitle className="text-lg">Invalid or Expired Reset Link</CardTitle>
              </div>
              <CardDescription>
                The recovery link you clicked is either expired, invalid, or has already been used. Password reset links are single-use and expire quickly for security reasons.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request New Reset Link</Link>
              </Button>
              <Button variant="ghost" asChild className="w-full text-muted-foreground hover:text-foreground">
                <Link to="/student/login">Back to Login</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
