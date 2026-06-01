import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { StudentSidebar } from "@/components/StudentSidebar";
import { TeacherSidebar } from "@/components/TeacherSidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, LogOut, LayoutDashboard } from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "student" | "teacher" | "admin";
}

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = profile?.name
    ? profile.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "CT";

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
                <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded hidden sm:inline-block">
                  UID: {profile.uid}
                </span>
              )}
              
              <NotificationCenter />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-85 focus:outline-none transition-opacity">
                    <Avatar className="h-8 w-8 border border-white/10 ring-1 ring-primary/10">
                      <AvatarImage src={profile?.avatar_url || ""} alt={profile?.name} className="object-cover" />
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary uppercase font-sans">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start text-left">
                      <span className="text-xs font-medium text-foreground line-clamp-1 max-w-[120px]">{profile?.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize font-semibold">{profile?.role}</span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 border-white/5 bg-card/95 backdrop-blur-md shadow-xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold text-foreground leading-none">{profile?.name}</p>
                      <p className="text-xs text-muted-foreground leading-none font-mono truncate">{profile?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem asChild className="focus:bg-white/5 cursor-pointer text-xs">
                    <Link to={`/${profile?.role}/dashboard`} className="flex items-center gap-2 w-full">
                      <LayoutDashboard className="h-4 w-4 text-muted-foreground" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="focus:bg-white/5 cursor-pointer text-xs">
                    <Link to="/profile" className="flex items-center gap-2 w-full">
                      <User className="h-4 w-4 text-muted-foreground" /> Edit Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/5" />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate(`/${profile?.role || "student"}/login`);
                    }}
                    className="focus:bg-destructive/15 focus:text-destructive cursor-pointer text-xs text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto relative z-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
