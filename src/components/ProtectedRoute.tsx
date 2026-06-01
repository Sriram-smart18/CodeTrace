import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "student" | "teacher" | "admin";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { profile, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    // Redirect to appropriate login
    if (requiredRole === "admin") return <Navigate to="/admin/login" replace />;
    if (requiredRole) return <Navigate to={`/${requiredRole}/login`} replace />;
    return <Navigate to="/student/login" replace />;
  }

  if (requiredRole && profile && profile.role !== requiredRole) {
    // Redirect to their own dashboard
    return <Navigate to={`/${profile.role}/dashboard`} replace />;
  }

  // Check if suspended (field exists after migration)
  if (profile && profile.is_suspended) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="text-destructive text-4xl">⚠</div>
          <h2 className="text-xl font-bold text-foreground">Account Suspended</h2>
          <p className="text-muted-foreground text-sm">Your account has been suspended. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
