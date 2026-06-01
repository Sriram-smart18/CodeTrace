import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function TeacherLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/teacher/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="font-mono text-2xl font-bold text-primary">&lt;/&gt;</span>
            <span className="text-2xl font-bold text-foreground">CodeTrace</span>
          </div>
          <p className="text-muted-foreground text-sm">Teacher Portal</p>
        </div>
        <Card className="shadow-lg border-accent/20">
          <CardHeader>
            <CardTitle>Teacher Login</CardTitle>
            <CardDescription>Access your monitoring dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teacher@university.edu" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            <div className="mt-4 flex items-center justify-between text-sm">
              <Link to="/forgot-password" style={{ color: "rgb(156 163 175)" }} className="hover:text-foreground hover:underline">Forgot password?</Link>
              <div className="text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/teacher/signup" className="text-primary hover:underline font-medium">Sign up</Link>
              </div>
            </div>
            <div className="mt-2 text-center text-sm text-muted-foreground">
              Are you a student?{" "}
              <Link to="/student/login" className="text-primary hover:underline font-medium">Student Login</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
