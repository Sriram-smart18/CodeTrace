import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";
import { PasswordValidator } from "@/components/ui/PasswordValidator";

export default function AdminSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      toast({ title: "Validation Error", description: "Please ensure your password meets all strong requirements.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, name, "admin");
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin Account created!", description: "Please check your email to verify your account." });
      navigate("/admin/login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md my-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">CodeTrace Admin</span>
          </div>
          <p className="text-muted-foreground text-sm">Platform Administration</p>
        </div>
        <Card className="shadow-lg border-white/5 bg-card/60 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Create Admin Account</CardTitle>
            <CardDescription>Register with admin administrative credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Admin Name" className="bg-background/50 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@codetrace.dev" className="bg-background/50 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {loading ? "Creating admin account..." : "Create Admin Account"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/admin/login" className="text-primary hover:underline font-medium">Sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
