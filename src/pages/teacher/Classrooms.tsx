import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Copy, Users, BookOpen, ArrowRight, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

type Classroom = Tables<"classrooms">;

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const isDev = import.meta.env.DEV;

export default function TeacherClassrooms() {
  const { user, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(generateCode());

  const fetchClassrooms = useCallback(async () => {
    if (!user) {
      setClassrooms([]);
      setEnrollmentCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    if (isDev) {
      console.log("FETCHING CLASSROOMS");
      console.log("AUTH USER ID", user.id);
      console.log("SESSION PRESENT", Boolean(session));
    }

    const { data, error } = await supabase
      .from("classrooms")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (isDev) {
      console.log("FETCH DATA", data);
      console.log("FETCH ERROR", error);
    }

    setClassrooms(data ?? []);
    if (isDev) console.log("STATE UPDATED", data ?? []);

    if (error) {
      toast({ title: "Error loading classrooms", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!data?.length) {
      setEnrollmentCounts({});
      setLoading(false);
      return;
    }

    const counts: Record<string, number> = {};
    await Promise.all(
      data.map(async (c) => {
        const { count, error: countErr } = await supabase
          .from("classroom_students")
          .select("*", { count: "exact", head: true })
          .eq("classroom_id", c.id);
        if (countErr && isDev) console.warn("enrollment count error", c.id, countErr);
        counts[c.id] = count ?? 0;
      })
    );
    setEnrollmentCounts(counts);
    setLoading(false);
  }, [user, session, toast]);

  useEffect(() => {
    if (authLoading) return;
    fetchClassrooms();
  }, [authLoading, fetchClassrooms]);

  const handleCreate = async () => {
    if (!user || !name.trim() || !subject.trim()) return;

    setCreating(true);
    if (isDev) {
      console.log("CURRENT USER", user);
      console.log("AUTH USER ID", user.id);
    }

    const { data, error } = await supabase
      .from("classrooms")
      .insert({
        teacher_id: user.id,
        classroom_name: name.trim(),
        subject_name: subject.trim(),
        description: description.trim() || null,
        classroom_code: code,
      })
      .select()
      .single();

    if (isDev) {
      console.log("INSERT RESPONSE", data);
      console.log("INSERT ERROR", error);
    }

    setCreating(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Classroom created", description: `Code: ${code}` });
    setName("");
    setSubject("");
    setDescription("");
    setCode(generateCode());
    setOpen(false);
    await fetchClassrooms();
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from("classrooms").update({ is_active: !current }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await fetchClassrooms();
  };

  const deleteClassroom = async (id: string) => {
    const { error } = await supabase.from("classrooms").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Classroom deleted" });
      await fetchClassrooms();
    }
  };

  const copyCode = (classroomCode: string) => {
    navigator.clipboard.writeText(classroomCode);
    toast({ title: "Code copied!", description: classroomCode });
  };

  const SUBJECT_COLORS: Record<string, string> = {
    python: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    java: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "c++": "bg-purple-500/20 text-purple-300 border-purple-500/30",
    javascript: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    default: "bg-primary/20 text-primary border-primary/30",
  };

  const getSubjectColor = (subjectName: string) => {
    const key = subjectName.toLowerCase();
    return SUBJECT_COLORS[key] || SUBJECT_COLORS.default;
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Classrooms</h1>
            <p className="text-sm text-muted-foreground">{classrooms.length} classroom(s)</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Classroom</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Classroom</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Classroom Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Python Programming Lab" />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Python, Java, DAA, ML" />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this classroom..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Classroom Code</Label>
                  <div className="flex gap-2">
                    <Input value={code} readOnly className="font-mono text-lg tracking-widest text-center font-bold" />
                    <Button variant="outline" size="icon" onClick={() => setCode(generateCode())}>↻</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this code with students to join</p>
                </div>
                <Button
                  onClick={handleCreate}
                  className="w-full"
                  disabled={!name.trim() || !subject.trim() || creating}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Classroom"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading classrooms...</p>
            </CardContent>
          </Card>
        ) : classrooms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground">No classrooms yet. Create your first classroom to get started.</p>
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
                <Card className={`glass-panel flex flex-col hover:border-primary/40 transition-all ${!c.is_active ? "opacity-60" : ""}`}>
                  <div className="h-1 w-full bg-gradient-to-r from-primary to-accent rounded-t-lg" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{c.classroom_name}</CardTitle>
                        <Badge className={`mt-1 text-[10px] border ${getSubjectColor(c.subject_name)}`} variant="outline">
                          {c.subject_name}
                        </Badge>
                      </div>
                      <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    {c.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                    )}

                    <div className="flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/10">
                      <span className="font-mono text-lg font-bold tracking-widest text-primary flex-1 text-center">
                        {c.classroom_code}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyCode(c.classroom_code)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {enrollmentCounts[c.id] ?? 0} students
                      </span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-auto">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1.5"
                        onClick={() => navigate(`/teacher/classroom/${c.id}`)}
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleActive(c.id, c.is_active)}
                        title={c.is_active ? "Deactivate" : "Activate"}
                      >
                        {c.is_active ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:border-destructive/50"
                        onClick={() => deleteClassroom(c.id)}
                        title="Delete classroom"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
