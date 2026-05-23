import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code, Calendar, Clock, CheckCircle, AlertTriangle, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

export default function StudentClassroomDetail() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [classroom, setClassroom] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    if (!classroomId || !user) return;
    const load = async () => {
      const { data: cr } = await supabase.from("classrooms").select("*").eq("id", classroomId).single();
      if (cr) setClassroom(cr);

      const { data: asgns } = await supabase
        .from("assignments")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("due_date", { ascending: true });
      if (asgns) setAssignments(asgns);

      if (asgns && asgns.length > 0) {
        const ids = asgns.map((a: any) => a.id);
        const { data: subs } = await supabase
          .from("submissions")
          .select("*")
          .eq("student_id", user.id)
          .in("assignment_id", ids);
        if (subs) setSubmissions(subs);
      }
    };
    load();
  }, [classroomId, user]);

  const getSubmission = (assignmentId: string) => submissions.find((s) => s.assignment_id === assignmentId);

  const statusIcon = (status: string) => {
    switch (status) {
      case "evaluated": return <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />;
      case "flagged": return <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />;
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

  if (!classroom) {
    return (
      <DashboardLayout role="student">
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/student/classrooms")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{classroom.classroom_name}</h1>
              <Badge variant="outline" className="text-xs">{classroom.subject_name}</Badge>
            </div>
            {classroom.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{classroom.description}</p>
            )}
          </div>
        </div>

        {/* Assignments */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Assignments ({assignments.length})
          </h2>

          {assignments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No assignments yet in this classroom.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {assignments.map((a, i) => {
                const sub = getSubmission(a.id);
                const isOverdue = a.due_date && new Date(a.due_date) < new Date() && !sub;
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className={`glass-panel flex flex-col hover:shadow-md transition-shadow ${isOverdue ? "border-destructive/30" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">{a.title}</CardTitle>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {sub ? (
                              <>
                                {statusIcon(sub.status)}
                                <Badge variant={statusVariant(sub.status)} className="capitalize text-xs">{sub.status}</Badge>
                              </>
                            ) : (
                              <Badge variant={isOverdue ? "destructive" : "outline"} className="text-xs">
                                {isOverdue ? "Overdue" : "Not submitted"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col gap-3">
                        {a.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {a.language && <Badge variant="outline" className="text-[10px]">{a.language}</Badge>}
                          {a.difficulty && (
                            <Badge variant="outline" className={`text-[10px] ${
                              a.difficulty === "Hard" ? "border-destructive/40 text-destructive" :
                              a.difficulty === "Medium" ? "border-yellow-500/40 text-yellow-400" :
                              "border-green-500/40 text-green-400"
                            }`}>{a.difficulty}</Badge>
                          )}
                          {a.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              Due: {new Date(a.due_date).toLocaleDateString()}
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
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
