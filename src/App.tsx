import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Student pages
import StudentLogin from "./pages/student/Login";
import StudentSignup from "./pages/student/Signup";
import StudentDashboard from "./pages/student/Dashboard";
import StudentAssignments from "./pages/student/Assignments";
import StudentSubmissions from "./pages/student/Submissions";
import StudentEditor from "./pages/student/Editor";
import StudentProjectBuilder from "./pages/student/ProjectBuilder";
import StudentClassrooms from "./pages/student/Classrooms";
import StudentClassroomDetail from "./pages/student/ClassroomDetail";

// Teacher pages
import TeacherLogin from "./pages/teacher/Login";
import TeacherSignup from "./pages/teacher/Signup";
import TeacherDashboard from "./pages/teacher/Dashboard";
import TeacherStudents from "./pages/teacher/Students";
import TeacherAssignments from "./pages/teacher/Assignments";
import TeacherSubmissions from "./pages/teacher/Submissions";
import TeacherMonitoring from "./pages/teacher/Monitoring";
import TeacherLiveSession from "./pages/teacher/LiveSession";
import TeacherAssignmentDetail from "./pages/teacher/AssignmentDetail";
import TeacherClassrooms from "./pages/teacher/Classrooms";
import TeacherClassroomDetail from "./pages/teacher/ClassroomDetail";

// Admin pages
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminTeachers from "./pages/admin/Teachers";
import AdminStudents from "./pages/admin/Students";
import AdminAnalytics from "./pages/admin/Analytics";

loader.config({ monaco });

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />

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
            <Route path="/teacher/live-session/:assignmentId" element={<ProtectedRoute requiredRole="teacher"><TeacherLiveSession /></ProtectedRoute>} />
            <Route path="/teacher/assignment/:assignmentId" element={<ProtectedRoute requiredRole="teacher"><TeacherAssignmentDetail /></ProtectedRoute>} />

            {/* ── Admin routes ── */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/teachers" element={<ProtectedRoute requiredRole="admin"><AdminTeachers /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><AdminAnalytics /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
