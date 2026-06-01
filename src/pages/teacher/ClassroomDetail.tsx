import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  BookOpen, 
  FileText, 
  Radio, 
  Copy, 
  UserMinus, 
  Eye, 
  EyeOff,
  UserCheck,
  UserX,
  Search,
  Mail,
  UserPlus,
  Trash2,
  MoreVertical,
  RefreshCw,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TeacherClassroomDetail() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [classroom, setClassroom] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  // New assignment form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [totalMarks, setTotalMarks] = useState("100");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [expectedSkillLevel, setExpectedSkillLevel] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [language, setLanguage] = useState("python");

  // Invite states
  const [inviteEmail, setInviteEmail] = useState("");
  const [bulkInviteEmails, setBulkInviteEmails] = useState("");
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Filter and pagination
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentPage, setStudentPage] = useState(1);

  // Assignment selective allocations
  const [assignType, setAssignType] = useState<"all" | "selective">("all");
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);

  // Classroom Rejudging state & handler (Phase 3)
  const [rejudgingClassroom, setRejudgingClassroom] = useState(false);
  const handleRejudgeClassroom = async () => {
    if (!classroomId) return;
    setRejudgingClassroom(true);
    toast({ title: "Rejudging classroom...", description: "Re-evaluating all student submissions inside classroom." });
    
    try {
      const { data: asgns } = await supabase.from("assignments").select("id").eq("classroom_id", classroomId);
      if (!asgns || asgns.length === 0) {
        toast({ title: "Rejudge Cancelled", description: "No assignments exist in this classroom." });
        setRejudgingClassroom(false);
        return;
      }

      const { data: subs } = await supabase
        .from("submissions")
        .select("*")
        .in("assignment_id", asgns.map(a => a.id));

      if (!subs || subs.length === 0) {
        toast({ title: "Rejudge Complete", description: "No submissions found in this classroom." });
        setRejudgingClassroom(false);
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const sub of subs) {
        try {
          const { error } = await supabase.functions.invoke("evaluate-submission-tests", {
            body: {
              submission_id: sub.id,
              rejudge: true,
              assignment_id: sub.assignment_id,
              student_id: sub.student_id,
              code: sub.code,
              language: sub.language || 'python'
            }
          });
          if (error) {
            failCount++;
          } else {
            successCount++;
          }
        } catch (e) {
          failCount++;
        }
      }

      toast({ 
        title: "Classroom Rejudged!", 
        description: `Successfully re-evaluated ${successCount} submissions, ${failCount} failed.` 
      });
    } catch (err: any) {
      toast({ title: "Rejudge Failed", description: err.message, variant: "destructive" });
    } finally {
      setRejudgingClassroom(false);
    }
  };

  // Debounce search effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(studentSearch);
    }, 400);
    return () => clearTimeout(handler);
  }, [studentSearch]);

  const filteredStudents = () => {
    return students.filter((s) => {
      const term = debouncedSearch.toLowerCase().trim();
      if (!term) return true;
      return (
        s.name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.uid?.toLowerCase().includes(term)
      );
    });
  };

  const load = async () => {
    if (!classroomId) return;

    const { data: cr } = await supabase.from("classrooms").select("*").eq("id", classroomId).single();
    if (cr) setClassroom(cr);

    // Load enrolled students including active/blocked statuses and filtering soft deletes
    const { data: enrollments } = await supabase
      .from("classroom_students")
      .select("student_id, joined_at, enrollment_status, is_active")
      .eq("classroom_id", classroomId)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (enrollments && enrollments.length > 0) {
      const ids = enrollments.map((e: any) => e.student_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", ids);
      if (profiles) {
        const enriched = profiles.map((p: any) => {
          const match = enrollments.find((e: any) => e.student_id === p.user_id);
          return {
            ...p,
            joined_at: match?.joined_at,
            enrollment_status: match?.enrollment_status,
          };
        });
        setStudents(enriched);
      }
    } else {
      setStudents([]);
    }

    // Load assignments for this classroom
    const { data: asgns } = await supabase
      .from("assignments")
      .select("*")
      .eq("classroom_id", classroomId)
      .order("created_at", { ascending: false });
    if (asgns) setAssignments(asgns);
  };

  useEffect(() => { load(); }, [classroomId]);

  const handleCreateAssignment = async () => {
    if (!user || !title.trim() || !classroomId) return;
    
    try {
      const { data: newAsgn, error: asgnError } = await supabase
        .from("assignments")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          created_by: user.id,
          classroom_id: classroomId,
          total_marks: parseInt(totalMarks) || 100,
          difficulty,
          expected_skill_level: expectedSkillLevel,
          language,
        })
        .select()
        .single();

      if (asgnError || !newAsgn) {
        toast({ title: "Error creating assignment", description: asgnError?.message, variant: "destructive" });
        return;
      }

      // Selective allocation
      if (assignType === "selective" && assignedStudentIds.length > 0) {
        const allocations = assignedStudentIds.map((sid) => ({
          assignment_id: newAsgn.id,
          student_id: sid,
          assigned_by: user.id,
        }));

        const { error: allocError } = await supabase
          .from("assignment_students")
          .insert(allocations);

        if (allocError) {
          toast({ title: "Warning", description: "Assignment created, but student permissions failed to bind.", variant: "destructive" });
        }

        // Target notifications to explicitly assigned students
        const notifications = assignedStudentIds.map((sid) => ({
          user_id: sid,
          type: "assignment_assigned" as const,
          title: "New Assignment Allocated",
          message: `A new private assignment "${title}" has been assigned to you in classroom "${classroom.classroom_name}".`,
          metadata: { assignment_id: newAsgn.id },
        }));
        await supabase.from("notifications").insert(notifications);
      } else {
        // Send notifications to ALL active students in the classroom
        const activeStudents = students.filter((s) => s.enrollment_status === "active");
        if (activeStudents.length > 0) {
          const notifications = activeStudents.map((s) => ({
            user_id: s.user_id,
            type: "assignment_assigned" as const,
            title: "New Assignment Posted",
            message: `A new assignment "${title}" has been posted in classroom "${classroom.classroom_name}".`,
            metadata: { assignment_id: newAsgn.id },
          }));
          await supabase.from("notifications").insert(notifications);
        }
      }

      toast({ title: "Assignment created", description: "Assignments and notification permissions have been applied." });
      
      setTitle(""); 
      setDescription(""); 
      setDueDate(""); 
      setTotalMarks("100"); 
      setAssignType("all");
      setAssignedStudentIds([]);
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Failed to create assignment", description: e.message, variant: "destructive" });
    }
  };

  const handleInviteStudent = async () => {
    if (!inviteEmail.trim() || !classroomId || !user) return;
    setInviting(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("email", inviteEmail.trim().toLowerCase())
        .single();

      if (profileError || !profileData) {
        toast({
          title: "User not found",
          description: `No student is registered on CodeTrace with the email: ${inviteEmail}`,
          variant: "destructive",
        });
        setInviting(false);
        return;
      }

      // Check if already enrolled in this classroom (even if soft-deleted)
      const { data: existing } = await supabase
        .from("classroom_students")
        .select("*")
        .eq("classroom_id", classroomId)
        .eq("student_id", profileData.user_id)
        .maybeSingle();

      if (existing) {
        if (existing.is_active && existing.enrollment_status === "active") {
          toast({ title: "Already Enrolled", description: "This student is already actively enrolled." });
          setInviteEmail("");
          setInviting(false);
          return;
        } else {
          // Reactivate them
          await supabase
            .from("classroom_students")
            .update({ enrollment_status: "active", is_active: true, deleted_at: null })
            .eq("id", existing.id);
        }
      } else {
        await supabase.from("classroom_students").insert({
          classroom_id: classroomId,
          student_id: profileData.user_id,
          invited_by: user.id,
          enrollment_status: "active",
        });
      }

      // Send persistent notification for student
      await supabase.from("notifications").insert({
        user_id: profileData.user_id,
        type: "announcement",
        title: "Classroom Enrollment",
        message: `You have been enrolled in the classroom "${classroom.classroom_name}" by ${profile?.name || "the teacher"}.`,
        metadata: { classroom_id: classroomId },
      });

      toast({ title: "Student Enrolled!", description: `${profileData.name} has been enrolled.` });
      setInviteEmail("");
      load();
    } catch (e: any) {
      toast({ title: "Enrollment failed", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleBulkInvite = async () => {
    if (!bulkInviteEmails.trim() || !classroomId || !user) return;
    setInviting(true);
    const emails = bulkInviteEmails
      .split(/[\s,;\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes("@"));

    if (emails.length === 0) {
      toast({ title: "No valid emails", description: "Please enter valid email addresses.", variant: "destructive" });
      setInviting(false);
      return;
    }

    try {
      const { data: matchedProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("email", emails);

      if (profilesError) throw profilesError;

      const foundEmails = matchedProfiles?.map((p) => p.email.toLowerCase()) || [];
      const notFoundEmails = emails.filter((e) => !foundEmails.includes(e));

      if (!matchedProfiles || matchedProfiles.length === 0) {
        toast({
          title: "Invites Failed",
          description: "None of the entered emails are registered on CodeTrace.",
          variant: "destructive",
        });
        setInviting(false);
        return;
      }

      const enrollmentsToCreate = [];
      const notificationsToCreate = [];

      for (const p of matchedProfiles) {
        const { data: existing } = await supabase
          .from("classroom_students")
          .select("*")
          .eq("classroom_id", classroomId)
          .eq("student_id", p.user_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("classroom_students")
            .update({ enrollment_status: "active", is_active: true, deleted_at: null })
            .eq("id", existing.id);
        } else {
          enrollmentsToCreate.push({
            classroom_id: classroomId,
            student_id: p.user_id,
            invited_by: user.id,
            enrollment_status: "active",
          });
        }

        notificationsToCreate.push({
          user_id: p.user_id,
          type: "announcement" as const,
          title: "Classroom Enrollment",
          message: `You have been enrolled in the classroom "${classroom.classroom_name}" by ${profile?.name || "the teacher"}.`,
          metadata: { classroom_id: classroomId },
        });
      }

      if (enrollmentsToCreate.length > 0) {
        await supabase.from("classroom_students").insert(enrollmentsToCreate);
      }
      if (notificationsToCreate.length > 0) {
        await supabase.from("notifications").insert(notificationsToCreate);
      }

      toast({
        title: "Bulk Invites Completed!",
        description: `Successfully enrolled ${matchedProfiles.length} students. ${
          notFoundEmails.length > 0 
            ? `${notFoundEmails.length} emails not found: ${notFoundEmails.join(", ")}` 
            : ""
        }`,
      });

      setBulkInviteEmails("");
      setIsBulkOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Bulk invite failed", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const changeStudentStatus = async (studentId: string, status: "active" | "blocked" | "removed") => {
    try {
      if (status === "removed") {
        // Soft delete
        const { error } = await supabase
          .from("classroom_students")
          .update({
            enrollment_status: "removed",
            is_active: false,
            deleted_at: new Date().toISOString(),
          })
          .eq("classroom_id", classroomId!)
          .eq("student_id", studentId);

        if (error) throw error;
        
        // Push live left notification
        await supabase.from("notifications").insert({
          user_id: studentId,
          type: "announcement" as const,
          title: "Enrolment Ended",
          message: `Your active enrollment in the classroom "${classroom.classroom_name}" has been completed/removed.`,
          metadata: { classroom_id: classroomId },
        });

        toast({ title: "Student removed from classroom" });
      } else {
        const { error } = await supabase
          .from("classroom_students")
          .update({ enrollment_status: status })
          .eq("classroom_id", classroomId!)
          .eq("student_id", studentId);

        if (error) throw error;

        // Push block notification if blocked
        if (status === "blocked") {
          await supabase.from("notifications").insert({
            user_id: studentId,
            type: "announcement" as const,
            title: "Enrolment Blocked",
            message: `Your enrollment in classroom "${classroom.classroom_name}" has been disabled/blocked by the instructor.`,
            metadata: { classroom_id: classroomId },
          });
        }

        toast({ title: `Student status updated to ${status}` });
      }
      load();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleSelectAllStudents = (currentList: any[]) => {
    if (selectedStudents.length === currentList.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(currentList.map((s) => s.user_id));
    }
  };

  const handleBulkRemoveStudents = async () => {
    if (selectedStudents.length === 0 || !classroomId) return;
    try {
      const { error } = await supabase
        .from("classroom_students")
        .update({
          enrollment_status: "removed",
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq("classroom_id", classroomId)
        .in("student_id", selectedStudents);

      if (error) throw error;

      toast({ title: "Bulk students removed", description: `Successfully removed ${selectedStudents.length} students.` });
      setSelectedStudents([]);
      load();
    } catch (e: any) {
      toast({ title: "Bulk removal failed", description: e.message, variant: "destructive" });
    }
  };

  const toggleVisibility = async (id: string, current: boolean) => {
    await supabase.from("assignments").update({ results_visible: !current }).eq("id", id);
    load();
  };

  const copyCode = () => {
    if (classroom?.classroom_code) {
      navigator.clipboard.writeText(classroom.classroom_code);
      toast({ title: "Code copied!", description: classroom.classroom_code });
    }
  };

  if (!classroom) {
    return (
      <DashboardLayout role="teacher">
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/classrooms")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{classroom.classroom_name}</h1>
              <Badge variant="outline" className="text-xs">{classroom.subject_name}</Badge>
              <Badge variant={classroom.is_active ? "default" : "secondary"} className="text-xs">
                {classroom.is_active ? "Active" : "Inactive"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] gap-1 border-amber-500/35 text-amber-500 hover:bg-amber-500/10 px-2.5 rounded-full shrink-0"
                disabled={rejudgingClassroom || assignments.length === 0}
                onClick={handleRejudgeClassroom}
              >
                {rejudgingClassroom ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Rejudge Classroom
              </Button>
            </div>
            {classroom.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{classroom.description}</p>
            )}
          </div>
          {/* Classroom code */}
          <div className="flex items-center gap-2 p-2 px-4 rounded-lg bg-black/30 border border-white/10">
            <span className="text-xs text-muted-foreground">Code:</span>
            <span className="font-mono text-lg font-bold tracking-widest text-primary">{classroom.classroom_code}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyCode}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-panel">
            <CardContent className="pt-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary p-1.5 bg-primary/10 rounded-lg" />
              <div>
                <p className="text-2xl font-bold">{students.length}</p>
                <p className="text-xs text-muted-foreground">Enrolled Students</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="pt-4 flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-green-400 p-1.5 bg-green-500/10 rounded-lg" />
              <div>
                <p className="text-2xl font-bold">{assignments.length}</p>
                <p className="text-xs text-muted-foreground">Assignments</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="pt-4 flex items-center gap-3">
              <FileText className="h-8 w-8 text-yellow-400 p-1.5 bg-yellow-500/10 rounded-lg" />
              <div>
                <p className="text-2xl font-bold">{new Date(classroom.created_at).toLocaleDateString()}</p>
                <p className="text-xs text-muted-foreground">Created</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="assignments">
          <TabsList>
            <TabsTrigger value="assignments">Assignments ({assignments.length})</TabsTrigger>
            <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
          </TabsList>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New Assignment</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md border-white/5 bg-card">
                  <DialogHeader>
                    <DialogTitle>Create Assignment for {classroom.classroom_name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" className="bg-background/50 border-white/10 h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label>Description / Instructions</Label>
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the assignment..." rows={3} className="bg-background/50 border-white/10 resize-none leading-relaxed text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Due Date</Label>
                        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-background/50 border-white/10 h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Marks</Label>
                        <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} min="1" max="1000" className="bg-background/50 border-white/10 h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <Select value={language} onValueChange={setLanguage}>
                          <SelectTrigger className="bg-background/50 border-white/10 h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="python">Python</SelectItem>
                            <SelectItem value="javascript">JavaScript</SelectItem>
                            <SelectItem value="java">Java</SelectItem>
                            <SelectItem value="c">C</SelectItem>
                            <SelectItem value="cpp">C++</SelectItem>
                            <SelectItem value="go">Go</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
                          <SelectTrigger className="bg-background/50 border-white/10 h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Easy">🟢 Easy</SelectItem>
                            <SelectItem value="Medium">🟡 Medium</SelectItem>
                            <SelectItem value="Hard">🔴 Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Skill Level</Label>
                        <Select value={expectedSkillLevel} onValueChange={(v: any) => setExpectedSkillLevel(v)}>
                          <SelectTrigger className="bg-background/50 border-white/10 h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Beginner">Beginner</SelectItem>
                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                            <SelectItem value="Advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Allocation Selector */}
                    <div className="space-y-2 border-t border-white/5 pt-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment Visibility</Label>
                      <Select value={assignType} onValueChange={(v: any) => setAssignType(v)}>
                        <SelectTrigger className="w-full h-9 bg-background/50 border-white/10 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Classroom-Wide (All Enrolled Students)</SelectItem>
                          <SelectItem value="selective">Selective Allocation (Private Mode)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {assignType === "selective" && (
                      <div className="space-y-2 border border-white/10 rounded-lg p-3 bg-black/10 animate-fadeIn">
                        <Label className="text-xs font-semibold text-muted-foreground">Select Assigned Students:</Label>
                        {students.filter(s => s.enrollment_status === 'active').length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 text-center font-mono">No active enrolled students.</p>
                        ) : (
                          <ScrollArea className="h-32">
                            <div className="space-y-2">
                              {students.filter(s => s.enrollment_status === 'active').map((s) => (
                                <label key={s.id} className="flex items-center gap-2 text-xs font-medium cursor-pointer p-1.5 hover:bg-white/5 rounded transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={assignedStudentIds.includes(s.user_id)}
                                    onChange={() => {
                                      setAssignedStudentIds(prev => 
                                        prev.includes(s.user_id) 
                                          ? prev.filter(id => id !== s.user_id) 
                                          : [...prev, s.user_id]
                                      );
                                    }}
                                    className="rounded border-white/10 bg-background text-primary"
                                  />
                                  <span>{s.name} ({s.uid || "—"})</span>
                                </label>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    )}

                    <Button onClick={handleCreateAssignment} className="w-full mt-2 h-9 font-semibold" disabled={!title.trim() || inviting}>
                      Create Assignment
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {assignments.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No assignments yet. Create the first one for this classroom.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {assignments.map((a) => (
                  <Card key={a.id} className="glass-panel">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{a.title}</CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">{a.total_marks}pts</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.language && <Badge variant="outline" className="text-[10px]">{a.language}</Badge>}
                        {a.difficulty && <Badge variant="outline" className="text-[10px]">{a.difficulty}</Badge>}
                        {a.due_date && <span className="text-xs text-muted-foreground">Due: {new Date(a.due_date).toLocaleDateString()}</span>}
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1" onClick={() => navigate(`/teacher/assignment/${a.id}`)}>
                          <FileText className="h-3 w-3" /> Submissions
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1" onClick={() => navigate(`/teacher/live-session/${a.id}`)}>
                          <Radio className="h-3 w-3" /> Live
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleVisibility(a.id, a.results_visible)}
                          title={a.results_visible ? "Hide results" : "Show results"}
                        >
                          {a.results_visible ? <Eye className="h-3.5 w-3.5 text-green-400" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="mt-4 space-y-4">
            {/* Toolbar: Search & Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search students by name, email..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 bg-background/50 border-white/10"
                />
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                {/* Manual Invite Dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <UserPlus className="h-4 w-4" /> Invite Student
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-card border-white/10">
                    <DialogHeader>
                      <DialogTitle>Invite Student by Email</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Enter the email of a registered CodeTrace user to add them directly to this classroom.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="student-email">Student Email</Label>
                        <Input
                          id="student-email"
                          type="email"
                          placeholder="student@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="bg-background/50 border-white/10"
                        />
                      </div>
                      <Button 
                        onClick={handleInviteStudent} 
                        disabled={!inviteEmail.trim() || inviting} 
                        className="w-full"
                      >
                        {inviting ? "Enrolling..." : "Enroll Student"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Bulk Invite Dialog */}
                <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" /> Bulk Import
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg bg-card border-white/10">
                    <DialogHeader>
                      <DialogTitle>Bulk Import Students</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Enter list of emails separated by space, commas, or new lines. Note: These students must have already created accounts on CodeTrace.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="bulk-emails">Email List</Label>
                        <Textarea
                          id="bulk-emails"
                          placeholder="student1@example.com, student2@example.com&#10;student3@example.com"
                          rows={6}
                          value={bulkInviteEmails}
                          onChange={(e) => setBulkInviteEmails(e.target.value)}
                          className="bg-background/50 border-white/10 resize-none font-mono text-xs"
                        />
                      </div>
                      <Button 
                        onClick={handleBulkInvite} 
                        disabled={!bulkInviteEmails.trim() || inviting} 
                        className="w-full font-semibold"
                      >
                        {inviting ? "Importing..." : `Import Students`}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Bulk actions banner */}
            {selectedStudents.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-950/20 animate-fadeIn text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-400">{selectedStudents.length}</span>
                  <span className="text-muted-foreground">students selected</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleBulkRemoveStudents}
                    className="gap-1.5 h-8 text-xs font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove Selected
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedStudents([])} 
                    className="h-8 text-xs text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Students Table */}
            <Card className="glass-panel overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 bg-white/5">
                      <TableHead className="w-[50px] pl-4">
                        <Checkbox
                          checked={
                            filteredStudents().length > 0 &&
                            selectedStudents.length === filteredStudents().length
                          }
                          onCheckedChange={() => handleSelectAllStudents(filteredStudents())}
                        />
                      </TableHead>
                      <TableHead className="font-mono w-[120px]">UID</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Email Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined Date</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents().length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          {studentSearch.trim() ? (
                            "No students matched your search filter."
                          ) : (
                            <div className="space-y-2">
                              <p>No active students enrolled yet.</p>
                              <p className="text-xs">Share classroom code <span className="font-mono font-bold text-primary">{classroom.classroom_code}</span> to onboard students.</p>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStudents().map((s) => (
                        <TableRow key={s.user_id} className="border-white/5 hover:bg-white/[0.02]">
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={selectedStudents.includes(s.user_id)}
                              onCheckedChange={() => handleSelectStudent(s.user_id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-primary font-medium">{s.uid || "—"}</TableCell>
                          <TableCell className="font-semibold">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{s.email}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={s.enrollment_status === "active" ? "default" : "secondary"}
                              className={
                                s.enrollment_status === "active" 
                                  ? "bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/25"
                                  : "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/25"
                              }
                            >
                              {s.enrollment_status === "active" ? "Active" : "Blocked"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {s.joined_at ? new Date(s.joined_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-white/10">
                                {s.enrollment_status === "active" ? (
                                  <DropdownMenuItem 
                                    className="text-amber-400 focus:text-amber-400 gap-2 cursor-pointer text-xs" 
                                    onClick={() => changeStudentStatus(s.user_id, "blocked")}
                                  >
                                    <UserX className="h-3.5 w-3.5" /> Disable / Block
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem 
                                    className="text-green-400 focus:text-green-400 gap-2 cursor-pointer text-xs" 
                                    onClick={() => changeStudentStatus(s.user_id, "active")}
                                  >
                                    <UserCheck className="h-3.5 w-3.5" /> Enable / Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  className="text-red-400 focus:text-red-400 gap-2 cursor-pointer text-xs" 
                                  onClick={() => changeStudentStatus(s.user_id, "removed")}
                                >
                                  <UserMinus className="h-3.5 w-3.5" /> Remove Student
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
