import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SandboxWorkspace } from "@/components/ide/SandboxWorkspace";
import { AssignmentWorkspace } from "@/components/ide/AssignmentWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveWorkspaceType } from "@/utils/resolveWorkspaceType";

export default function StudentEditor() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [isValidating, setIsValidating] = useState(!!assignmentId);
  const [isInvalid, setIsInvalid] = useState(false);
  const [workspaceType, setWorkspaceType] = useState<"editor" | "sandbox">("editor");

  useEffect(() => {
    if (authLoading || !user?.id) return;
    
    if (!assignmentId) {
      console.log('[CODING MODE] PRACTICE');
      setIsValidating(false);
      return;
    }
    
    console.log('[CODING MODE] ASSIGNMENT');
    
    const validateAssignment = async () => {
      try {
        const { data, error } = await supabase
          .from("assignments")
          .select("id, language")
          .eq("id", assignmentId)
          .maybeSingle();
          
        if (error || !data) {
          console.warn('[ASSIGNMENT ROUTE] Assignment not found', error);
          setIsInvalid(true);
        } else {
          // Resolve correct workspace type based on assignment metadata
          const type = resolveWorkspaceType(data);
          setWorkspaceType(type);
        }
      } catch (err) {
        setIsInvalid(true);
      } finally {
        setIsValidating(false);
      }
    };
    
    validateAssignment();
  }, [assignmentId, user?.id, authLoading]);

  if (authLoading || (user?.id && isValidating)) {
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
  
  if (assignmentId && isInvalid) {
    return (
      <DashboardLayout role="student">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-400 font-mono text-xs space-y-4">
          <p>Assignment not found or access denied.</p>
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

  return (
    <DashboardLayout role="student">
      {workspaceType === "sandbox" ? (
        <SandboxWorkspace 
          assignmentId={assignmentId} 
          projectId={assignmentId || "practice-mode"} 
          initialMode="builder" 
          onBack={() => navigate('/student/assignments')}
        />
      ) : (
        <AssignmentWorkspace 
          assignmentId={assignmentId} 
        />
      )}
    </DashboardLayout>
  );
}
