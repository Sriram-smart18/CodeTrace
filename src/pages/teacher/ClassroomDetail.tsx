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
import { ArrowLeft, Plus, Users, BookOpen, FileText, Radio, Copy, UserMinus, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TeacherClassroomDetail() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const load = async () => {
    if (!classroomId) return;

    const { data: cr } = await supabase.from("classrooms").select("*").eq("id", classroomId).single();
    if (cr) setClassroom(cr);

    // Load enrolled students
    const { data: enrollments } = await supabase
      .from("classroom_students")
      .select("student_id, joined_at")
      .eq("classroom_id", classroomId);

    if (enrollments && enrollments.length > 0) {
      const ids = enrollments.map((e: any) => e.student_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", ids);
      if (profiles) {
        const enriched = profiles.map((p: any) => ({
          ...p,
          joined_at: enrollments.find((e: any) => e.student_id === p.user_id)?.joined_at,
        }));
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
    const { error } = await supabase.from("assignments").insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      created_by: user.id,
      classroom_id: classroomId,
      total_marks: parseInt(totalMarks) || 100,
      difficulty,
      expected_skill_level: expectedSkillLevel,
      language,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment created" });
      setTitle(""); setDescription(""); setDueDate(""); setTotalMarks("100"); setOpen(false);
      load();
    }
  };

  const removeStudent = async (studentId: string) => {
    await supabase
      .from("classroom_students")
      .delete()
      .eq("classroom_id", classroomId!)
      .eq("student_id", studentId);
    toast({ title: "Student removed from classroom" });
    load();
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Assignment for {classroom.classroom_name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" />
                    </div>
                    <div className="space-y-2">
                      <Label>Description / Instructions</Label>
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the assignment..." rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Due Date</Label>
                        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Marks</Label>
                        <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} min="1" max="1000" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <Select value={language} onValueChange={setLanguage}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Beginner">Beginner</SelectItem>
                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                            <SelectItem value="Advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleCreateAssignment} className="w-full" disabled={!title.trim()}>
                      Create Assignment
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {assignments.length === 0 ? (
              <Card>
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
          <TabsContent value="students" className="mt-4">
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">UID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No students enrolled yet. Share the code <span className="font-mono font-bold text-primary">{classroom.classroom_code}</span> with students.
                        </TableCell>
                      </TableRow>
                    ) : (
                      students.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-primary font-medium">{s.uid || "—"}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground">{s.email}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {s.joined_at ? new Date(s.joined_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 hover:bg-destructive/10 hover:border-destructive/50"
                              onClick={() => removeStudent(s.user_id)}
                            >
                              <UserMinus className="h-3 w-3" /> Remove
                            </Button>
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
