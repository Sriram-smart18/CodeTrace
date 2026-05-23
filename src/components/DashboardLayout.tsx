import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { StudentSidebar } from "@/components/StudentSidebar";
import { TeacherSidebar } from "@/components/TeacherSidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "student" | "teacher" | "admin";
}

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const { profile } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {role === "student" ? <StudentSidebar /> : role === "admin" ? <AdminSidebar /> : <TeacherSidebar />}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <header className="h-14 flex items-center border-b border-white/5 bg-background/50 backdrop-blur-md px-4 gap-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-primary glow-text">&lt;/&gt;</span>
              <span className="font-semibold text-foreground tracking-tight">CodeTrace</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {profile?.uid && (
                <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                  UID: {profile.uid}
                </span>
              )}
              <span className="text-sm text-muted-foreground">{profile?.name}</span>
              <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full capitalize">
                {profile?.role}
              </span>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto relative z-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
