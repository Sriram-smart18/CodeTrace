import { useCallback, useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Classroom = Tables<"classrooms">;
type Enrollment = Pick<Tables<"classroom_students">, "classroom_id" | "joined_at">;
type EnrolledClassroom = Classroom & { joined_at?: string };
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BookOpen, ArrowRight, Users, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function StudentClassrooms() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [classrooms, setClassrooms] = useState<EnrolledClassroom[]>([]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setClassrooms([]);
      return;
    }

    const { data: enrollments, error: enrollErr } = await supabase
      .from("classroom_students")
      .select("classroom_id, joined_at")
      .eq("student_id", user.id);

    if (enrollErr) {
      toast({ title: "Error", description: enrollErr.message, variant: "destructive" });
      setClassrooms([]);
      return;
    }

    const rows = (enrollments ?? []) as Enrollment[];
    if (rows.length === 0) {
      setClassrooms([]);
      return;
    }

    const ids = rows.map((e) => e.classroom_id);
    const { data: rooms, error: roomsErr } = await supabase
      .from("classrooms")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (roomsErr) {
      toast({ title: "Error", description: roomsErr.message, variant: "destructive" });
      setClassrooms([]);
      return;
    }

    const enriched: EnrolledClassroom[] = (rooms ?? []).map((r) => ({
      ...r,
      joined_at: rows.find((e) => e.classroom_id === r.id)?.joined_at,
    }));
    setClassrooms(enriched);
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  const handleJoin = async () => {
    if (!user || !code.trim()) return;
    setJoining(true);
    try {
      // Enroll via secure RPC join_classroom
      const { data, error: joinErr } = await supabase.rpc("join_classroom", {
        p_classroom_code: code.trim().toUpperCase()
      });

      if (joinErr) {
        toast({ title: "Error", description: joinErr.message, variant: "destructive" });
      } else {
        const result = data as { id: string; classroom_name: string };
        toast({ title: "Joined!", description: `Welcome to ${result.classroom_name}` });
        setCode("");
        setOpen(false);
        load();
      }
    } finally {
      setJoining(false);
    }
  };

  const leaveClassroom = async (classroomId: string, classroomName: string) => {
    if (!user) return;
    await supabase
      .from("classroom_students")
      .delete()
      .eq("classroom_id", classroomId)
      .eq("student_id", user.id);
    toast({ title: "Left classroom", description: `You left ${classroomName}` });
    load();
  };

  const SUBJECT_COLORS: Record<string, string> = {
    python: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    java: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "c++": "bg-purple-500/20 text-purple-300 border-purple-500/30",
    javascript: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    default: "bg-primary/20 text-primary border-primary/30",
  };

  const getSubjectColor = (subject: string) => {
    const key = subject.toLowerCase();
    return SUBJECT_COLORS[key] || SUBJECT_COLORS.default;
  };

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Classrooms</h1>
            <p className="text-sm text-muted-foreground">Enrolled in {classrooms.length} classroom(s)</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Join Classroom</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a Classroom</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the 6-character classroom code provided by your teacher.
                </p>
                <div className="space-y-2">
                  <Label>Classroom Code</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC123"
                    className="font-mono text-2xl tracking-widest text-center font-bold h-14"
                    maxLength={6}
                  />
                </div>
                <Button
                  onClick={handleJoin}
                  className="w-full"
                  disabled={code.trim().length !== 6 || joining}
                >
                  {joining ? "Joining..." : "Join Classroom"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {classrooms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground mb-4">You haven't joined any classrooms yet.</p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Join Your First Classroom
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classrooms.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="glass-panel flex flex-col hover:border-primary/40 transition-all">
                  <div className="h-1 w-full bg-gradient-to-r from-primary to-accent rounded-t-lg" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{c.classroom_name}</CardTitle>
                        <Badge className={`mt-1 text-[10px] border ${getSubjectColor(c.subject_name)}`} variant="outline">
                          {c.subject_name}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    {c.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Joined {c.joined_at ? new Date(c.joined_at).toLocaleDateString() : "—"}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-auto">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1.5"
                        onClick={() => navigate(`/student/classroom/${c.id}`)}
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:border-destructive/50"
                        onClick={() => leaveClassroom(c.id, c.classroom_name)}
                        title="Leave classroom"
                      >
                        <LogOut className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
