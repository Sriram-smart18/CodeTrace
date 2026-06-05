import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useIdeStore } from "@/components/ide/store/ideStore";
import { SandboxWorkspace } from "@/components/ide/SandboxWorkspace";
import { Tables } from "@/integrations/supabase/types";

export default function ProjectBuilder() {
  console.count('[PROJECT BUILDER RENDER]');
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const initializeProjectStore = useIdeStore((state) => state.initializeProject);
  const loadProjectFromPersistence = useIdeStore((state) => state.loadProjectFromPersistence);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !user?.id) return;
    
    if (initializedRef.current) return;
    initializedRef.current = true;

    const loadWorkspace = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (assignmentId) {
          console.log('[SANDBOX MODE] ASSIGNMENT');
          
          // Verify assignment
          const { data: asg, error: asgErr } = await supabase
            .from("assignments")
            .select("id, title")
            .eq("id", assignmentId)
            .maybeSingle();
            
          if (asgErr || !asg) {
            setError("Sandbox assignment not found or access denied.");
            setLoading(false);
            return;
          }

          // Fetch or create assignment project
          const { data: project, error: projFetchErr } = await supabase
            .from("projects")
            .select("*")
            .eq("assignment_id", assignmentId)
            .eq("student_id", user.id)
            .maybeSingle();
            
          if (projFetchErr) throw projFetchErr;

          let currentProjectId = project?.id;
          let filesList: Tables<"project_files">[] = [];

          if (!project) {
            // Create assignment sandbox template
            const { data: newProj, error: projErr } = await supabase
              .from("projects")
              .insert({
                name: `Workspace - ${asg.title}`,
                student_id: user.id,
                assignment_id: assignmentId,
              })
              .select()
              .single();
              
            if (projErr) throw projErr;
            project = newProj;
            currentProjectId = newProj.id;

            // Simple HTML assignment starter template
            const templates = [
              {
                name: "index.html",
                type: "file",
                language: "html",
                content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${asg.title}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>${asg.title}</h1>\n  <p>Start coding your assignment here!</p>\n  <script src="script.js"></script>\n</body>\n</html>`
              },
              { name: "style.css", type: "file", language: "css", content: `body { font-family: sans-serif; background: #0f172a; color: white; padding: 2rem; }` },
              { name: "script.js", type: "file", language: "javascript", content: `console.log("Assignment loaded.");` }
            ];

            const filePayloads = templates.map((t) => ({
              project_id: currentProjectId,
              name: t.name,
              type: t.type as "file" | "folder",
              content: t.content,
              language: t.language
            }));

            const { data: newFiles, error: fileErr } = await supabase.from("project_files").insert(filePayloads).select();
            if (fileErr) throw fileErr;
            filesList = newFiles || [];
          } else {
            const { data: files, error: fileErr } = await supabase.from("project_files").select("*").eq("project_id", currentProjectId);
            if (fileErr) throw fileErr;
            filesList = files || [];
          }

          const mappedNodes = filesList.map((f: Tables<"project_files">) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            parentId: f.parent_id,
            content: f.content || "",
            language: f.language || "javascript",
            createdAt: f.created_at,
            updatedAt: f.updated_at
          }));

          initializeProjectStore(currentProjectId, project.name, mappedNodes);
          await loadProjectFromPersistence(currentProjectId);
          setProjectId(currentProjectId);
        } else {
          console.log('[SANDBOX MODE] PRACTICE');
          
          const { data: project, error: projFetchErr } = await supabase
            .from("projects")
            .select("*")
            .eq("name", "Personal Sandbox Workspace")
            .eq("student_id", user.id)
            .is("assignment_id", null)
            .maybeSingle();
            
          if (projFetchErr) throw projFetchErr;

          let currentProjectId = project?.id;
          let filesList: Tables<"project_files">[] = [];

          if (!project) {
            const { data: newProj, error: projErr } = await supabase
              .from("projects")
              .insert({
                name: "Personal Sandbox Workspace",
                student_id: user.id,
                assignment_id: null,
              })
              .select()
              .single();
              
            if (projErr) throw projErr;
            project = newProj;
            currentProjectId = newProj.id;

            const templates = [
              { name: "index.html", type: "file", language: "html", content: `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Practice Sandbox</h1>\n</body>\n</html>` }
            ];

            const filePayloads = templates.map((t) => ({
              project_id: currentProjectId,
              name: t.name,
              type: t.type as "file" | "folder",
              content: t.content,
              language: t.language
            }));

            const { data: newFiles, error: fileErr } = await supabase.from("project_files").insert(filePayloads).select();
            if (fileErr) throw fileErr;
            filesList = newFiles || [];
          } else {
            const { data: files, error: fileErr } = await supabase.from("project_files").select("*").eq("project_id", currentProjectId);
            if (fileErr) throw fileErr;
            filesList = files || [];
          }

          const mappedNodes = filesList.map((f: Tables<"project_files">) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            parentId: f.parent_id,
            content: f.content || "",
            language: f.language || "javascript",
            createdAt: f.created_at,
            updatedAt: f.updated_at
          }));

          initializeProjectStore(currentProjectId, project.name, mappedNodes);
          await loadProjectFromPersistence(currentProjectId);
          setProjectId(currentProjectId);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to initialize sandbox workspace.");
      } finally {
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [assignmentId, user?.id, authLoading, initializeProjectStore, loadProjectFromPersistence]);

  if (authLoading || (user?.id && loading)) {
    return (
      <DashboardLayout role="student">
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user?.id) {
    return (
      <DashboardLayout role="student">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-500 font-mono text-xs space-y-4">
          <p>Authentication required.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout role="student">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-400 font-mono text-xs space-y-4">
          <p>{error}</p>
          <button 
            onClick={() => navigate('/student/assignments')}
            className="px-4 py-2 mt-4 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!projectId) return null;

  return (
    <DashboardLayout role="student">
      <SandboxWorkspace 
        projectId={projectId} 
        assignmentId={assignmentId}
        initialMode="builder"
        onBack={() => window.history.back()}
      />
    </DashboardLayout>
  );
}
