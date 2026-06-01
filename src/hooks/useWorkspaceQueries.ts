import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useStudentAssignments(userId: string | undefined) {
  return useQuery({
    queryKey: ["student-assignments", userId],
    queryFn: async () => {
      if (!userId) return { assignments: [], classrooms: [], submissions: [] };

      // 1. Fetch Classrooms
      const { data: enrollments } = await supabase
        .from("classroom_students")
        .select("classroom_id")
        .eq("student_id", userId);

      const classroomIds = enrollments?.map((e) => e.classroom_id) || [];

      if (classroomIds.length === 0) {
        return { assignments: [], classrooms: [], submissions: [] };
      }

      const { data: rooms } = await supabase
        .from("classrooms")
        .select("id, classroom_name, subject_name")
        .in("id", classroomIds)
        .eq("is_active", true);

      // 2. Fetch Assignments
      const { data: asgns } = await supabase
        .from("assignments")
        .select("*, classrooms(classroom_name, subject_name)")
        .in("classroom_id", classroomIds)
        .order("due_date", { ascending: true });

      // 3. Fetch Submissions
      let subs: any[] = [];
      if (asgns && asgns.length > 0) {
        const aIds = asgns.map((a) => a.id);
        const { data: fetchSubs } = await supabase
          .from("submissions")
          .select("*")
          .eq("student_id", userId)
          .in("assignment_id", aIds);
        if (fetchSubs) subs = fetchSubs;
      }

      return {
        assignments: asgns || [],
        classrooms: rooms || [],
        submissions: subs,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent redundant dashboard fetches
  });
}
