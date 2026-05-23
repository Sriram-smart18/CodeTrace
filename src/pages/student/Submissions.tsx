import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Local type for submission with nested relations
interface SubmissionWithRelations {
  id: string;
  status: string;
  submitted_at: string;
  score: number | null;
  assignments: {
    title: string;
    total_marks: number;
    classrooms: {
      classroom_name: string;
      subject_name: string;
    } | null;
  } | null;
}

export default function StudentSubmissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionWithRelations[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("submissions")
      .select("*, assignments(title, total_marks, classrooms(classroom_name, subject_name))")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSubmissions(data as SubmissionWithRelations[]);
      });
  }, [user]);

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
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Submissions</h1>
          <p className="text-sm text-muted-foreground">{submissions.length} submission(s)</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Classroom</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No submissions yet. Open an assignment to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((s) => {
                    const assignment = s.assignments;
                    const classroom = assignment?.classrooms;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">{assignment?.title || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {classroom?.classroom_name || "—"}
                          {classroom?.subject_name && (
                            <span className="text-muted-foreground/60"> · {classroom.subject_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(s.submitted_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(s.status)} className="capitalize text-xs">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.score !== null ? `${s.score}/${assignment?.total_marks || 100}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
