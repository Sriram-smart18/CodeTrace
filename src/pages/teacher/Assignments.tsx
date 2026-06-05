import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Eye, EyeOff, Radio, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Tables } from "@/integrations/supabase/types";

type EnrichedAssignment = Tables<"assignments"> & {
  classrooms: { classroom_name: string | null; subject_name: string | null } | null;
};

export default function TeacherAssignments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [totalMarks, setTotalMarks] = useState("100");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [expectedSkillLevel, setExpectedSkillLevel] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchAssignments = useCallback(() => {
    if (!user) return;
    supabase
      .from("assignments")
      .select("*, classrooms(classroom_name, subject_name)")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAssignments(data);
      });
  }, [user]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    const { error } = await supabase.from("assignments").insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      created_by: user.id,
      total_marks: parseInt(totalMarks) || 100,
      difficulty,
      expected_skill_level: expectedSkillLevel,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment created" });
      setTitle(""); setDescription(""); setDueDate(""); setTotalMarks("100");
      setDifficulty("Medium"); setExpectedSkillLevel("Beginner"); setOpen(false);
      fetchAssignments();
    }
  };

  const toggleVisibility = async (id: string, current: boolean) => {
    const { error } = await supabase.from("assignments").update({ results_visible: !current }).eq("id", id);
    if (!error) {
      setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, results_visible: !current } : a));
      toast({ title: !current ? "Results visible to students" : "Results hidden from students" });
    }
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Assignments</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Assignment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Assignment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" />
                </div>
                <div className="space-y-2">
                  <Label>Description / Instructions</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the assignment, constraints, and requirements..." rows={4} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Marks</Label>
                    <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} min="1" max="1000" placeholder="100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={difficulty} onValueChange={(v: "Easy" | "Medium" | "Hard") => setDifficulty(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">🟢 Easy</SelectItem>
                        <SelectItem value="Medium">🟡 Medium</SelectItem>
                        <SelectItem value="Hard">🔴 Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Skill Level</Label>
                    <Select value={expectedSkillLevel} onValueChange={(v: "Beginner" | "Intermediate" | "Advanced") => setExpectedSkillLevel(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {assignments.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No assignments created yet.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {assignments.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{a.title}</CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">{a.total_marks || 100} marks</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.description && <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {a.due_date && <Badge variant="outline" className="text-xs">Due: {new Date(a.due_date).toLocaleDateString()}</Badge>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {a.difficulty && (
                        <Badge variant="outline" className={`text-[10px] ${
                          a.difficulty === 'Hard' ? 'border-destructive/40 text-destructive' :
                          a.difficulty === 'Medium' ? 'border-warning/40 text-warning' :
                          'border-success/40 text-success'
                        }`}>{a.difficulty}</Badge>
                      )}
                      {a.expected_skill_level && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{a.expected_skill_level}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.results_visible ? (
                        <Eye className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Label htmlFor={`vis-${a.id}`} className="text-xs text-muted-foreground cursor-pointer">
                        Results {a.results_visible ? "visible" : "hidden"}
                      </Label>
                      <Switch
                        id={`vis-${a.id}`}
                        checked={a.results_visible}
                        onCheckedChange={() => toggleVisibility(a.id, a.results_visible)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 flex-1"
                      onClick={() => navigate(`/teacher/assignment/${a.id}`)}
                    >
                      <FileText className="h-3 w-3" /> Submissions
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 flex-1"
                      onClick={() => navigate(`/teacher/live-session/${a.id}`)}
                    >
                      <Radio className="h-3 w-3" /> Live
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
