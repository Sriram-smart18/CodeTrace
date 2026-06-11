import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Search, 
  UserX, 
  UserCheck, 
  Trash2, 
  Shield, 
  GraduationCap, 
  Users, 
  RotateCcw, 
  AlertTriangle,
  Activity,
  UserCheck2,
  RefreshCw,
  ArrowLeftRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { Tables } from "@/integrations/supabase/types";

type UserProfile = Tables<"profiles">;

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading users", description: error.message, variant: "destructive" });
    } else if (data) {
      setUsers(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggleSuspend = async (userId: string, currentlySuspended: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_suspended: !currentlySuspended })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: currentlySuspended ? "Account Activated" : "Account Suspended",
        description: `The user account has been successfully ${currentlySuspended ? "activated" : "suspended"}.`
      });
      loadUsers();
    }
  };

  const toggleRole = async (userId: string, currentRole: "student" | "teacher" | "admin") => {
    if (currentRole === "admin") {
      toast({ title: "Error", description: "Administrator role cannot be changed.", variant: "destructive" });
      return;
    }

    const nextRole = currentRole === "student" ? "teacher" : "student";

    const { error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error changing role", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "Role Updated",
        description: `User role successfully changed to ${nextRole}.`
      });
      loadUsers();
    }
  };

  const softDeleteUser = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_deleted: true })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error deleting user", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "User Soft-Deleted", 
        description: "The user has been successfully soft-deleted. Academic and assignment integrity records are preserved."
      });
      loadUsers();
    }
  };

  const restoreUser = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_deleted: false })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error restoring user", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "User Restored", 
        description: "The user account has been restored to active status."
      });
      loadUsers();
    }
  };

  // Calculate statistics (excluding soft-deleted users except for the deleted statistic itself)
  const totalStudents = users.filter(u => u.role === "student" && !u.is_deleted).length;
  const totalTeachers = users.filter(u => u.role === "teacher" && !u.is_deleted).length;
  const activeUsers = users.filter(u => !u.is_suspended && !u.is_deleted).length;
  const suspendedUsers = users.filter(u => u.is_suspended && !u.is_deleted).length;

  // Filtering Logic
  const filteredUsers = users.filter((u) => {
    // 1. Search filter
    const matchesSearch = 
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.uid && u.uid.toLowerCase().includes(search.toLowerCase()));

    // 2. Role filter
    const matchesRole = 
      roleFilter === "all" || 
      u.role === roleFilter;

    // 3. Status filter
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = !u.is_suspended && !u.is_deleted;
    } else if (statusFilter === "suspended") {
      matchesStatus = u.is_suspended && !u.is_deleted;
    } else if (statusFilter === "deleted") {
      matchesStatus = u.is_deleted;
    } else if (statusFilter === "all") {
      // By default, hide deleted users from the "All" status view to avoid clutter
      matchesStatus = !u.is_deleted;
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
              User Management
            </h1>
            <p className="text-muted-foreground text-sm">
              SaaS admin controls to manage student and teacher privileges safely.
            </p>
          </div>
          <Button 
            onClick={loadUsers} 
            variant="outline" 
            size="sm" 
            className="w-full md:w-auto gap-2 border-white/10 hover:bg-secondary/40"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Statistics Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-md border-white/5 bg-card/60 backdrop-blur-md transition-all hover:scale-[1.01] hover:border-primary/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Students</p>
                <h3 className="text-3xl font-bold text-foreground font-mono">{totalStudents}</h3>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
                <GraduationCap className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-white/5 bg-card/60 backdrop-blur-md transition-all hover:scale-[1.01] hover:border-primary/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Teachers</p>
                <h3 className="text-3xl font-bold text-foreground font-mono">{totalTeachers}</h3>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500 border border-purple-500/20">
                <Users className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-white/5 bg-card/60 backdrop-blur-md transition-all hover:scale-[1.01] hover:border-primary/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Active Accounts</p>
                <h3 className="text-3xl font-bold text-foreground font-mono">{activeUsers}</h3>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                <Activity className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-white/5 bg-card/60 backdrop-blur-md transition-all hover:scale-[1.01] hover:border-primary/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Suspended Accounts</p>
                <h3 className="text-3xl font-bold text-foreground font-mono">{suspendedUsers}</h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <Card className="shadow-md border-white/5 bg-card/40 backdrop-blur-md">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or UID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-white/10 w-full"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="w-full sm:w-40 space-y-1">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="bg-background/50 border-white/10 w-full">
                    <SelectValue placeholder="Role Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10 text-foreground">
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="student">Students</SelectItem>
                    <SelectItem value="teacher">Teachers</SelectItem>
                    <SelectItem value="admin">Administrators</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-44 space-y-1">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background/50 border-white/10 w-full">
                    <SelectValue placeholder="Status Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10 text-foreground">
                    <SelectItem value="all">Active/Suspended</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="suspended">Suspended Only</SelectItem>
                    <SelectItem value="deleted">Soft-Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Users Table */}
        <Card className="shadow-md border-white/5 bg-card/60 backdrop-blur-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow className="border-b border-white/5">
                  <TableHead className="font-mono py-4 pl-6">UID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground/45" />
                        <p className="text-sm">No users matching search or filter criteria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id} className="border-b border-white/5 hover:bg-secondary/10 transition-colors">
                      <TableCell className="font-mono text-primary font-medium py-4 pl-6">
                        {u.uid || "—"}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {u.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.role === "admin" ? (
                          <Badge variant="destructive" className="bg-red-500/10 text-red-500 border border-red-500/20 font-bold gap-1">
                            <Shield className="h-3 w-3" /> System Admin
                          </Badge>
                        ) : u.role === "teacher" ? (
                          <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                            Teacher
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                            Student
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.is_deleted ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground border-white/10 bg-white/5">
                            Deleted
                          </Badge>
                        ) : u.is_suspended ? (
                          <Badge variant="destructive" className="text-xs font-medium">
                            Suspended
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {u.role === "admin" ? (
                          <span className="text-xs text-muted-foreground font-mono inline-flex items-center gap-1.5 bg-white/5 py-1 px-2.5 rounded-md border border-white/5 select-none pr-3 pl-3">
                            <Shield className="h-3 w-3 text-red-500" /> Protected
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 justify-end">
                            {/* Role Toggle Action */}
                            {!u.is_deleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1 border-white/5 hover:bg-secondary/40"
                                onClick={() => toggleRole(u.user_id, u.role as "student" | "teacher" | "admin")}
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                                {u.role === "student" ? "Make Teacher" : "Make Student"}
                              </Button>
                            )}

                            {/* Suspend / Activate Action */}
                            {!u.is_deleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-8 text-xs gap-1.5 border-white/5 ${
                                  u.is_suspended 
                                    ? "hover:bg-emerald-500/10 hover:text-emerald-400" 
                                    : "hover:bg-amber-500/10 hover:text-amber-400"
                                }`}
                                onClick={() => toggleSuspend(u.user_id, u.is_suspended)}
                              >
                                {u.is_suspended ? (
                                  <><UserCheck className="h-3.5 w-3.5" /> Activate</>
                                ) : (
                                  <><UserX className="h-3.5 w-3.5" /> Suspend</>
                                )}
                              </Button>
                            )}

                            {/* Delete / Restore Action */}
                            {u.is_deleted ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1.5 border-white/5 hover:bg-emerald-500/10 hover:text-emerald-400"
                                onClick={() => restoreUser(u.user_id)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Restore
                              </Button>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="destructive" 
                                    className="h-8 text-xs gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-white/10 text-foreground">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-xl font-bold flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-red-500" /> Confirm Soft-Delete
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-muted-foreground text-sm pt-2">
                                      Are you sure you want to delete <strong>{u.name}</strong> ({u.email})? 
                                      <br /><br />
                                      This will perform a <strong>soft delete</strong>. The user will no longer be able to log in, but their submissions, assignment evaluations, academic integrity results, and logs will be preserved in the system for auditing purposes.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="gap-2">
                                    <AlertDialogCancel className="bg-secondary/40 border-white/5 hover:bg-secondary/70">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => softDeleteUser(u.user_id)} 
                                      className="bg-red-600 text-white hover:bg-red-700"
                                    >
                                      Soft-Delete User
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
