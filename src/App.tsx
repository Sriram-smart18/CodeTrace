import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { IdeDiagnosticsPanel } from "@/components/ide/diagnostics/IdeDiagnosticsPanel";
import { ThemeProvider } from "next-themes";
import { PwaUpdater } from "@/components/pwa/PwaUpdater";
import { OfflineOverlay } from "@/components/pwa/OfflineOverlay";
import { SessionTimeoutHandler } from "@/components/SessionTimeoutHandler";

if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_STRESS_TESTS === 'true') {
  import("@/utils/stressTestMode").then(m => m.stressTestEngine);
}

// Keep login pages eager for instant initial paint
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StudentLogin from "./pages/student/Login";
import StudentSignup from "./pages/student/Signup";
import TeacherLogin from "./pages/teacher/Login";
import TeacherSignup from "./pages/teacher/Signup";
import AdminLogin from "./pages/admin/Login";

// Route loader skeleton component
const RouteLoader = ({ message = "Loading component..." }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 space-y-4">
    <div className="relative flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <div className="absolute h-6 w-6 rounded-full bg-primary/10 animate-ping" />
    </div>
    <div className="space-y-1 text-center">
      <h3 className="text-sm font-semibold tracking-wide text-foreground">CodeTrace Workspace</h3>
      <p className="text-xs text-muted-foreground font-mono">{message}</p>
    </div>
  </div>
);

// HOC to wrap component in suspense
const withSuspense = <P extends object>(Component: React.ComponentType<P>, message?: string) => {
  return (props: P) => (
    <Suspense fallback={<RouteLoader message={message} />}>
      <Component {...props} />
    </Suspense>
  );
};

// Lazy loaded pages
const ForgotPassword = withSuspense(lazy(() => import("./pages/ForgotPassword")), "Loading password helper...");
const ResetPassword = withSuspense(lazy(() => import("./pages/ResetPassword")), "Loading password helper...");
const Profile = withSuspense(lazy(() => import("./pages/Profile")), "Loading profile details...");

// Student lazy loaded pages
const StudentDashboard = withSuspense(lazy(() => import("./pages/student/Dashboard")), "Loading student dashboard...");
const StudentAssignments = withSuspense(lazy(() => import("./pages/student/Assignments")), "Loading assignment workspace...");
const StudentSubmissions = withSuspense(lazy(() => import("./pages/student/Submissions")), "Loading submission tracker...");
const StudentEditor = withSuspense(lazy(() => import("./pages/student/Editor")), "Initializing Monaco cloud IDE...");
const StudentProjectBuilder = withSuspense(lazy(() => import("./pages/student/ProjectBuilder")), "Loading sandbox project builder...");
const StudentClassrooms = withSuspense(lazy(() => import("./pages/student/Classrooms")), "Loading student classrooms...");
const StudentClassroomDetail = withSuspense(lazy(() => import("./pages/student/ClassroomDetail")), "Loading classroom workspace...");

// Teacher lazy loaded pages
const TeacherDashboard = withSuspense(lazy(() => import("./pages/teacher/Dashboard")), "Loading teacher workspace...");
const TeacherStudents = withSuspense(lazy(() => import("./pages/teacher/Students")), "Loading classroom statistics...");
const TeacherAssignments = withSuspense(lazy(() => import("./pages/teacher/Assignments")), "Loading assignments manager...");
const TeacherSubmissions = withSuspense(lazy(() => import("./pages/teacher/Submissions")), "Loading student evaluations...");
const TeacherMonitoring = withSuspense(lazy(() => import("./pages/teacher/Monitoring")), "Initializing live classroom streams...");
const TeacherLiveSession = withSuspense(lazy(() => import("./pages/teacher/LiveSession")), "Connecting to student editor streams...");
const TeacherAssignmentDetail = withSuspense(lazy(() => import("./pages/teacher/AssignmentDetail")), "Loading assignment details...");
const TeacherClassrooms = withSuspense(lazy(() => import("./pages/teacher/Classrooms")), "Loading teacher classrooms...");
const TeacherClassroomDetail = withSuspense(lazy(() => import("./pages/teacher/ClassroomDetail")), "Loading classroom dashboard...");
const TeacherReports = withSuspense(lazy(() => import("./pages/teacher/Reports")), "Running classroom analytics engine...");
const TeacherMonitoringTest = withSuspense(lazy(() => import("./pages/teacher/MonitoringTest")), "Loading live monitoring simulator dashboard...");

// Admin lazy loaded pages
const AdminDashboard = withSuspense(lazy(() => import("./pages/admin/Dashboard")), "Loading admin panel...");
const AdminTeachers = withSuspense(lazy(() => import("./pages/admin/Teachers")), "Loading educator records...");
const AdminStudents = withSuspense(lazy(() => import("./pages/admin/Students")), "Loading student profiles...");
const AdminAnalytics = withSuspense(lazy(() => import("./pages/admin/Analytics")), "Loading SaaS metrics engine...");
const AdminUsers = withSuspense(lazy(() => import("./pages/admin/Users")), "Loading user manager...");

loader.config({ monaco });

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true} storageKey="tracecode-theme">
      <GlobalErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaUpdater />
          <OfflineOverlay />
          <IdeDiagnosticsPanel />
          <BrowserRouter>
          <AuthProvider>
            <SessionTimeoutHandler />
            <Routes>
              <Route path="/" element={<Index />} />
              
              {/* ── Recover/Reset routes ── */}
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

              {/* ── Student routes ── */}
              <Route path="/student/login" element={<StudentLogin />} />
              <Route path="/student/signup" element={<StudentSignup />} />
              <Route path="/student/dashboard" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
              <Route path="/student/classrooms" element={<ProtectedRoute requiredRole="student"><StudentClassrooms /></ProtectedRoute>} />
              <Route path="/student/classroom/:classroomId" element={<ProtectedRoute requiredRole="student"><StudentClassroomDetail /></ProtectedRoute>} />
              <Route path="/student/assignments" element={<ProtectedRoute requiredRole="student"><StudentAssignments /></ProtectedRoute>} />
              <Route path="/student/submissions" element={<ProtectedRoute requiredRole="student"><StudentSubmissions /></ProtectedRoute>} />
              <Route path="/student/editor" element={<ProtectedRoute requiredRole="student"><StudentEditor /></ProtectedRoute>} />
              <Route path="/student/editor/:assignmentId" element={<ProtectedRoute requiredRole="student"><StudentEditor /></ProtectedRoute>} />
              <Route path="/student/project-builder" element={<ProtectedRoute requiredRole="student"><StudentProjectBuilder /></ProtectedRoute>} />

              {/* ── Teacher routes ── */}
              <Route path="/teacher/login" element={<TeacherLogin />} />
              <Route path="/teacher/signup" element={<TeacherSignup />} />
              <Route path="/teacher/dashboard" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />
              <Route path="/teacher/classrooms" element={<ProtectedRoute requiredRole="teacher"><TeacherClassrooms /></ProtectedRoute>} />
              <Route path="/teacher/classroom/:classroomId" element={<ProtectedRoute requiredRole="teacher"><TeacherClassroomDetail /></ProtectedRoute>} />
              <Route path="/teacher/students" element={<ProtectedRoute requiredRole="teacher"><TeacherStudents /></ProtectedRoute>} />
              <Route path="/teacher/assignments" element={<ProtectedRoute requiredRole="teacher"><TeacherAssignments /></ProtectedRoute>} />
              <Route path="/teacher/submissions" element={<ProtectedRoute requiredRole="teacher"><TeacherSubmissions /></ProtectedRoute>} />
              <Route path="/teacher/monitoring" element={<ProtectedRoute requiredRole="teacher"><TeacherMonitoring /></ProtectedRoute>} />
              <Route path="/teacher/monitoring-test" element={<ProtectedRoute requiredRole="teacher"><TeacherMonitoringTest /></ProtectedRoute>} />
              <Route path="/teacher/live-session/:assignmentId" element={<ProtectedRoute requiredRole="teacher"><TeacherLiveSession /></ProtectedRoute>} />
              <Route path="/teacher/assignment/:assignmentId" element={<ProtectedRoute requiredRole="teacher"><TeacherAssignmentDetail /></ProtectedRoute>} />
              <Route path="/teacher/reports" element={<ProtectedRoute requiredRole="teacher"><TeacherReports /></ProtectedRoute>} />

              {/* ── Admin routes ── */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/teachers" element={<ProtectedRoute requiredRole="admin"><AdminTeachers /></ProtectedRoute>} />
              <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><AdminAnalytics /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </GlobalErrorBoundary>
  </ThemeProvider>
</QueryClientProvider>
);

export default App;
