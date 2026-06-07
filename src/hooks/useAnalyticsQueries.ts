import { useQuery, useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Json } from "@/integrations/supabase/types";

// Types matching custom definitions
export interface ClassroomPerformance {
  classroom_id: string;
  classroom_name: string;
  average_score: number;
  completion_rate: number;
  student_count: number;
}

export interface TeacherStats {
  classrooms: number;
  assignments: number;
  submissions: number;
  enrolledStudents: number;
  fraudAlerts: number;
  todaySubmissions: number;
}

export interface ActivitySnapshot {
  id: string;
  classroom_id: string | null;
  student_id: string | null;
  snapshot_type: "classroom_weekly" | "student_daily" | "platform_daily";
  metrics: Json;
  created_at: string;
}

export interface ReportItem {
  id: string;
  student_name: string;
  student_uid: string;
  email: string;
  assignment_title: string;
  status: string;
  score: number | null;
  submitted_at: string;
  plagiarism_score: number | null;
  risk_level: string;
  behavioral_summary: Json;
}

export interface LiveSessionInfo {
  id: string;
  user_id: string;
  student_name: string;
  student_uid: string;
  classroom_id: string | null;
  classroom_name: string;
  assignment_id: string | null;
  assignment_title: string;
  status: "active" | "idle" | "abnormal";
  current_file: string | null;
  language: string | null;
  editor_focus: boolean;
  tab_switch_count: number;
  copy_paste_count: number;
  abnormal_typing_spikes: number;
  last_heartbeat: string;
}

// ── 1. TEACHER PORTAL QUERIES ──

export function useTeacherStatsQuery(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-stats", teacherId],
    queryFn: async (): Promise<TeacherStats> => {
      if (!teacherId) throw new Error("Missing teacher ID");

      const { data: classrooms } = await supabase
        .from("classrooms")
        .select("id")
        .eq("teacher_id", teacherId);
      const classroomIds = classrooms?.map((c) => c.id) || [];

      const { data: assignments } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", teacherId);
      const assignmentIds = assignments?.map((a) => a.id) || [];

      let submissionCount = 0;
      let todayCount = 0;
      let alertCount = 0;

      if (assignmentIds.length > 0) {
        const { count: subs } = await supabase
          .from("submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds);
        submissionCount = subs ?? 0;

        const todayStr = new Date().toISOString().split("T")[0];
        const { count: todaySubs } = await supabase
          .from("submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds)
          .gte("submitted_at", `${todayStr}T00:00:00Z`);
        todayCount = todaySubs ?? 0;

        const { count: alerts } = await supabase
          .from("fraud_alerts")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds)
          .eq("dismissed", false);
        alertCount = alerts ?? 0;
      }

      let enrolledCount = 0;
      if (classroomIds.length > 0) {
        const { count: enrolled } = await supabase
          .from("classroom_students")
          .select("*", { count: "exact", head: true })
          .in("classroom_id", classroomIds)
          .eq("is_active", true)
          .is("deleted_at", null);
        enrolledCount = enrolled ?? 0;
      }

      return {
        classrooms: classroomIds.length,
        assignments: assignmentIds.length,
        submissions: submissionCount,
        enrolledStudents: enrolledCount,
        fraudAlerts: alertCount,
        todaySubmissions: todayCount,
      };
    },
    enabled: !!teacherId,
    staleTime: 30000, // 30 seconds caching
  });
}

// ── 2. REPORTS ENGINE QUERIES ──

export function useReportsQuery(
  teacherId: string | undefined,
  filters: {
    classroomId?: string;
    assignmentId?: string;
    search?: string;
    page: number;
    limit: number;
  }
) {
  return useQuery({
    queryKey: ["reports", teacherId, filters],
    queryFn: async (): Promise<{ data: ReportItem[]; totalCount: number }> => {
      if (!teacherId) return { data: [], totalCount: 0 };

      // 1. Fetch teacher assignments
      let assignmentQuery = supabase
        .from("assignments")
        .select("id, title")
        .eq("created_by", teacherId);
      
      if (filters.classroomId) {
        assignmentQuery = assignmentQuery.eq("classroom_id", filters.classroomId);
      }
      
      const { data: assignments } = await assignmentQuery;
      const assignmentIds = assignments?.map((a) => a.id) || [];
      const assignmentTitles = new Map(assignments?.map((a) => [a.id, a.title] as [string, string]));

      if (assignmentIds.length === 0) {
        return { data: [], totalCount: 0 };
      }

      // 2. Fetch submissions & evaluations
      let query = supabase
        .from("submissions")
        .select(`
          id,
          submitted_at,
          status,
          score,
          assignment_id,
          student_id,
          behavioral_log
        `, { count: "exact" })
        .in("assignment_id", assignmentIds)
        .order("submitted_at", { ascending: false });

      if (filters.assignmentId) {
        query = query.eq("assignment_id", filters.assignmentId);
      }

      // Apply Server-Side Pagination
      const from = (filters.page - 1) * filters.limit;
      const to = from + filters.limit - 1;
      query = query.range(from, to);

      const { data: submissions, count, error } = await query;
      if (error || !submissions) return { data: [], totalCount: 0 };

      // 3. Fetch profiles and evaluations
      const studentIds = [...new Set(submissions.map((s) => s.student_id))];
      const { data: profiles } = studentIds.length > 0 
        ? await supabase.from("profiles").select("user_id, name, uid, email").in("user_id", studentIds)
        : { data: [] };

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p] as [string, typeof p]));

      const submissionIds = submissions.map((s) => s.id);
      const { data: evaluations } = submissionIds.length > 0
        ? await supabase.from("ai_evaluations").select("submission_id, plagiarism_score, risk_level, integrity_verdict, plagiarism_indicators").in("submission_id", submissionIds)
        : { data: [] };

      const evaluationMap = new Map(evaluations?.map((e) => [e.submission_id, e] as [string, typeof e]));

      const reportItems: ReportItem[] = submissions.map((s) => {
        const student = profileMap.get(s.student_id);
        const evalItem = evaluationMap.get(s.id);
        return {
          id: s.id,
          student_name: student?.name || "Unknown",
          student_uid: student?.uid || "—",
          email: student?.email || "—",
          assignment_title: assignmentTitles.get(s.assignment_id) || "Legacy Assignment",
          status: s.status,
          score: s.score,
          submitted_at: s.submitted_at,
          plagiarism_score: evalItem?.plagiarism_score || 0,
          risk_level: evalItem?.risk_level || "low",
          behavioral_summary: s.behavioral_log || {},
          plagiarism_indicators: evalItem?.plagiarism_indicators || null,
        };
      });

      // Filter locally by search if provided
      let filtered = reportItems;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = reportItems.filter(
          (item) =>
            item.student_name.toLowerCase().includes(searchLower) ||
            item.student_uid.toLowerCase().includes(searchLower) ||
            item.assignment_title.toLowerCase().includes(searchLower)
        );
      }

      return {
        data: filtered,
        totalCount: count ?? 0,
      };
    },
    enabled: !!teacherId,
    staleTime: 10000,
  });
}

// ── 3. INFINITE SCROLL NOTIFICATIONS ──

export function useNotificationsInfiniteQuery(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["notification-events", userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return { data: [], nextCursor: null };

      const pageSize = 15;
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("notification_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        data: data || [],
        nextCursor: data.length === pageSize ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
  });
}

// ── 4. LIVE MONITORING QUERIES ──

export function useLiveMonitoringQuery(teacherId: string | undefined, classroomId?: string) {
  return useQuery({
    queryKey: ["live-monitoring", teacherId, classroomId],
    queryFn: async (): Promise<LiveSessionInfo[]> => {
      if (!teacherId) return [];

      let query = supabase
        .from("monitoring_sessions")
        .select(`
          *,
          classrooms(classroom_name)
        `);

      if (classroomId) {
        query = query.eq("classroom_id", classroomId);
      } else {
        // Scoped to all teacher's classrooms
        const { data: classrooms } = await supabase
          .from("classrooms")
          .select("id")
          .eq("teacher_id", teacherId);
        const classroomIds = classrooms?.map((c) => c.id) || [];
        if (classroomIds.length === 0) return [];
        query = query.in("classroom_id", classroomIds);
      }

      const { data: sessions, error } = await query;
      if (error || !sessions) return [];

      const studentIds = [...new Set(sessions.map((s) => s.user_id))];
      const { data: profiles } = studentIds.length > 0
        ? await supabase.from("profiles").select("user_id, name, uid").in("user_id", studentIds)
        : { data: [] };

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p] as [string, typeof p]));

      const assignmentIds = [...new Set(sessions.map((s) => s.assignment_id).filter(Boolean))] as string[];
      const { data: assignments } = assignmentIds.length > 0
        ? await supabase.from("assignments").select("id, title").in("id", assignmentIds)
        : { data: [] };

      const assignmentMap = new Map(assignments?.map((a) => [a.id, a.title] as [string, string]));

      return (sessions as (Tables<"monitoring_sessions"> & {
        classrooms: { classroom_name: string } | { classroom_name: string }[] | null;
      })[]).map((s) => {
        const student = profileMap.get(s.user_id);
        const classroomsObj = Array.isArray(s.classrooms) ? s.classrooms[0] : s.classrooms;
        return {
          id: s.id,
          user_id: s.user_id,
          student_name: student?.name || "Unknown Student",
          student_uid: student?.uid || "—",
          classroom_id: s.classroom_id,
          classroom_name: classroomsObj?.classroom_name || "Unknown",
          assignment_id: s.assignment_id,
          assignment_title: assignmentMap.get(s.assignment_id || "") || "Legacy Assignment",
          status: s.status as "active" | "idle" | "abnormal",
          current_file: s.current_file,
          language: s.language,
          editor_focus: s.editor_focus || false,
          tab_switch_count: s.tab_switch_count || 0,
          copy_paste_count: s.copy_paste_count || 0,
          abnormal_typing_spikes: s.abnormal_typing_spikes || 0,
          last_heartbeat: s.last_heartbeat,
        };
      });
    },
    enabled: !!teacherId,
    refetchInterval: 30000, // Sync sessions status every 30s
  });
}

// ── 5. STUDENT DASHBOARD QUERIES ──

export function useStudentProgressQuery(studentId: string | undefined) {
  return useQuery({
    queryKey: ["student-progress", studentId],
    queryFn: async () => {
      if (!studentId) return null;

      // Submissions and evaluations
      const { data: submissions } = await supabase
        .from("submissions")
        .select("*, assignments(title, language)")
        .eq("student_id", studentId);

      const submissionIds = submissions?.map((s) => s.id) || [];

      const { data: evaluations } = submissionIds.length > 0
        ? await supabase.from("ai_evaluations").select("*").in("submission_id", submissionIds)
        : { data: [] };

      // Calculate streak locally
      const dates = submissions?.map((s) => new Date(s.submitted_at).toDateString()) || [];
      const uniqueDates = [...new Set(dates)].map((d) => new Date(d));
      uniqueDates.sort((a, b) => b.getTime() - a.getTime());

      let streak = 0;
      let currentStreak = 0;
      const today = new Date();
      today.setHours(0,0,0,0);
      
      let checkDate = new Date(today);

      for (let i = 0; i < uniqueDates.length; i++) {
        const diffTime = Math.abs(checkDate.getTime() - uniqueDates[i].getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          currentStreak++;
          checkDate = uniqueDates[i];
        } else {
          break;
        }
      }
      streak = currentStreak;

      // Language usage count
      const langFootprints: Record<string, number> = {};
      submissions?.forEach((s) => {
        const lang = s.assignments?.language || "javascript";
        langFootprints[lang] = (langFootprints[lang] || 0) + 1;
      });

      const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
      const languageDistribution = Object.entries(langFootprints).map(([lang, count], idx) => ({
        name: lang.toUpperCase(),
        value: count,
        color: COLORS[idx % COLORS.length],
      }));

      // Aggregates
      const totalScore = (evaluations || []).reduce((acc: number, curr) => acc + (curr.total_score || 0), 0);
      const avgScore = evaluations?.length ? Math.round(totalScore / evaluations.length) : 0;

      return {
        completedAssignments: submissions?.filter((s) => s.status === "graded" || s.status === "completed").length || 0,
        streak,
        averageScore: avgScore,
        languageDistribution,
        submissionsCount: submissions?.length || 0,
        submissions,
      };
    },
    enabled: !!studentId,
  });
}

// ── 6. ADMIN SYSTEM QUERIES ──

export function useAdminAnalyticsQuery(adminId: string | undefined) {
  return useQuery({
    queryKey: ["admin-platform-stats", adminId],
    queryFn: async () => {
      if (!adminId) return null;

      const [
        { count: teachers },
        { count: students },
        { count: classrooms },
        { count: assignments },
        { count: submissions },
        { count: evaluations },
        { count: alerts },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("classrooms").select("*", { count: "exact", head: true }),
        supabase.from("assignments").select("*", { count: "exact", head: true }),
        supabase.from("submissions").select("*", { count: "exact", head: true }),
        supabase.from("ai_evaluations").select("*", { count: "exact", head: true }),
        supabase.from("fraud_alerts").select("*", { count: "exact", head: true }).eq("dismissed", false),
      ]);

      return {
        totalTeachers: teachers ?? 0,
        totalStudents: students ?? 0,
        totalClassrooms: classrooms ?? 0,
        totalAssignments: assignments ?? 0,
        totalSubmissions: submissions ?? 0,
        totalAiEvaluations: evaluations ?? 0,
        totalPlagiarismAlerts: alerts ?? 0,
      };
    },
    enabled: !!adminId,
    staleTime: 60000, // Platform aggregates stale after 1 minute
  });
}

// ── 7. OPTIMISTIC MUTATION HOOKS ──

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const { error } = await supabase
        .from("notification_events")
        .update({ read: true })
        .eq("id", eventId);
      if (error) throw error;
      return eventId;
    },
    onMutate: async ({ eventId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["notification-events"] });

      // Snapshot previous value
      const previousPages = queryClient.getQueryData(["notification-events"]);

      // Optimistically update notifications
      queryClient.setQueriesData({ queryKey: ["notification-events"] }, (old: InfiniteData<{ data: Tables<"notification_events">[]; nextCursor: number | null }> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((item) =>
              item.id === eventId ? { ...item, read: true } : item
            ),
          })),
        };
      });

      return { previousPages };
    },
    onError: (err, variables, context) => {
      if (context?.previousPages) {
        queryClient.setQueryData(["notification-events"], context.previousPages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-events"] });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error } = await supabase
        .from("notification_events")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);
      if (error) throw error;
      return userId;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notification-events"] });
      const previousPages = queryClient.getQueryData(["notification-events"]);

      queryClient.setQueriesData({ queryKey: ["notification-events"] }, (old: InfiniteData<{ data: Tables<"notification_events">[]; nextCursor: number | null }> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((item) => ({ ...item, read: true })),
          })),
        };
      });

      return { previousPages };
    },
    onError: (err, variables, context) => {
      if (context?.previousPages) {
        queryClient.setQueryData(["notification-events"], context.previousPages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-events"] });
    },
  });
}
