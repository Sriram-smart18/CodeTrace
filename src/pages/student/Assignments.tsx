import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Code, Calendar, Clock, CheckCircle, AlertTriangle, Search, School, BookOpen } from "lucide-react";

// Type for assignment with nested classroom join
interface AssignmentWithClassroom {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  classroom_id: string | null;
  language: string | null;
  difficulty: string | null;
  expected_skill_level: string | null;
  total_marks: number;
  results_visible: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  classrooms: { classroom_name: string; subject_name: string } | null;
}

export default function StudentAssignments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AssignmentWithClassroom[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data: enrollments } = await supabase
        .from("classroom_students")
        .select("classroom_id")
        .eq("student_id", user.id);

      const classroomIds = enrollments?.map((e) => e.classroom_id) || [];

      if (classroomIds.length === 0) {
        setAssignments([]);
        setClassrooms([]);
        setLoading(false);
        return;
      }

      const { data: rooms } = await supabase
        .from("classrooms")
        .select("id, classroom_name, subject_name")
        .in("id", classroomIds)
        .eq("is_active", true);
      setClassrooms(rooms ?? []);

      const { data: asgns } = await supabase
        .from("assignments")
        .select("*, classrooms(classroom_name, subject_name)")
        .in("classroom_id", classroomIds)
        .order("due_date", { ascending: true });
      setAssignments((asgns ?? []) as AssignmentWithClassroom[]);

      if (asgns && asgns.length > 0) {
        const aIds = asgns.map((a) => a.id);
        const { data: subs } = await supabase
          .from("submissions")
          .select("*")
          .eq("student_id", user.id)
          .in("assignment_id", aIds);
        setSubmissions(subs ?? []);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const getSubmission = (assignmentId: string) => submissions.find((s) => s.assignment_id === assignmentId);

  const filtered = assignments.filter((a) => {
    if (selectedClassroom !== "all" && a.classroom_id !== selectedClassroom) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.classrooms?.classroom_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "evaluated": return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "flagged": return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "evaluated": return "default";
      case "flagged": return "destructive";
      case "submitted": return "secondary";
      default: return "outline";
    }
  };

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assignments</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} assignment(s)</p>
          </div>
        </div>

        {/* Filters */}
        {classrooms.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assignments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue placeholder="All Classrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classrooms</SelectItem>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.classroom_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="glass-panel animate-pulse">
                <CardContent className="h-40" />
              </Card>
            ))}
          </div>
        ) : classrooms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
              <p className="text-muted-foreground">You haven't joined any classrooms yet.</p>
              <Button onClick={() => navigate("/student/classrooms")}>Join a Classroom</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No assignments found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((a) => {
              const sub = getSubmission(a.id);
              const isOverdue = a.due_date && new Date(a.due_date) < new Date() && !sub;
              return (
                <Card key={a.id} className={`glass-panel hover:shadow-md transition-shadow flex flex-col ${isOverdue ? "border-destructive/30" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{a.title}</CardTitle>
                        {a.classrooms && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <School className="h-3 w-3" />
                            <span>{a.classrooms.classroom_name}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span>{a.classrooms.subject_name}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {sub ? (
                          <>
                            {statusIcon(sub.status)}
                            <Badge variant={statusVariant(sub.status)} className="capitalize text-xs">{sub.status}</Badge>
                          </>
                        ) : (
                          <Badge variant={isOverdue ? "destructive" : "outline"} className="text-xs">
                            {isOverdue ? "Overdue" : "Pending"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    {a.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.language && <Badge variant="outline" className="text-[10px]">{a.language}</Badge>}
                      {a.difficulty && (
                        <Badge variant="outline" className={`text-[10px] ${
                          a.difficulty === "Hard" ? "border-destructive/40 text-destructive" :
                          a.difficulty === "Medium" ? "border-yellow-500/40 text-yellow-400" :
                          "border-green-500/40 text-green-400"
                        }`}>{a.difficulty}</Badge>
                      )}
                      {a.due_date && (
                        <div className={`flex items-center gap-1 text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                          <Calendar className="h-3 w-3" />
                          {isOverdue ? "Overdue" : `Due ${new Date(a.due_date).toLocaleDateString()}`}
                        </div>
                      )}
                      {sub?.score !== null && sub?.score !== undefined && (
                        <span className="font-mono text-xs font-semibold text-primary ml-auto">
                          {sub.score}/{a.total_marks || 100}
                        </span>
                      )}
                    </div>
                    <Button
                      className="w-full mt-auto"
                      onClick={() => navigate(`/student/editor/${a.id}`)}
                    >
                      <Code className="h-4 w-4 mr-2" />
                      {sub ? "View / Edit" : "Open Assignment"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
