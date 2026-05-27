import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, BookOpen, Brain, Activity } from "lucide-react";

export default function Index() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold text-primary">&lt;/&gt;</span>
            <span className="text-xl font-bold text-foreground">TraceCode</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/login">Student</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/login">Teacher</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <div className="container mx-auto px-4 py-24">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium border border-primary/20">
              <span className="font-mono">&lt;/&gt;</span> AI-Powered Multi-Teacher Coding Classroom
            </div>
            <h1 className="text-5xl font-bold text-foreground tracking-tight leading-tight">
              Code. Learn.<br />
              <span className="text-primary">Collaborate Securely.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              A complete classroom platform — teachers create isolated classrooms, students join and code interactively, AI monitors academic integrity in real time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="gap-2">
                <Link to="/student/signup">
                  <GraduationCap className="h-5 w-5" />
                  Join as Student
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2">
                <Link to="/teacher/signup">
                  <Users className="h-5 w-5" />
                  Join as Teacher
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="container mx-auto px-4 pb-24">
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {[
              {
                icon: BookOpen,
                title: "Multi-Classroom System",
                desc: "Teachers create isolated classrooms per subject. Students join with a 6-character code and see only their enrolled classes.",
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                icon: Brain,
                title: "AI Integrity Analysis",
                desc: "20-factor AI evaluation detects AI-generated code, plagiarism, and suspicious behavioral patterns at submission time.",
                color: "text-purple-400",
                bg: "bg-purple-500/10",
              },
              {
                icon: Activity,
                title: "Live Interactive Terminal",
                desc: "Real VSCode-style terminal with stdin support. Run Python, JavaScript, Java, C, C++, and Go interactively.",
                color: "text-green-400",
                bg: "bg-green-500/10",
              },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm space-y-3">
                <div className={`inline-flex p-3 rounded-lg ${f.bg}`}>
                  <f.icon className={`h-6 w-6 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          © 2026 TraceCode V2 — AI-Powered Multi-Teacher Coding Classroom Platform
        </div>
      </footer>
    </div>
  );
}
