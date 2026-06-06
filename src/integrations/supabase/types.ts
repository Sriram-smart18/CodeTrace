export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          assignment_id: string | null
          classroom_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          classroom_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          classroom_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          }
        ]
      }
      analytics_snapshots: {
        Row: {
          classroom_id: string | null
          created_at: string
          id: string
          metrics: Json
          snapshot_type: string
          student_id: string | null
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          id?: string
          metrics: Json
          snapshot_type: string
          student_id?: string | null
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          snapshot_type?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_snapshots_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          }
        ]
      }
      monitoring_sessions: {
        Row: {
          abnormal_typing_spikes: number
          assignment_id: string | null
          classroom_id: string | null
          copy_paste_count: number
          created_at: string
          current_file: string | null
          editor_focus: boolean
          id: string
          language: string | null
          last_heartbeat: string
          status: string
          tab_switch_count: number
          user_id: string
        }
        Insert: {
          abnormal_typing_spikes?: number
          assignment_id?: string | null
          classroom_id?: string | null
          copy_paste_count?: number
          created_at?: string
          current_file?: string | null
          editor_focus?: boolean
          id?: string
          language?: string | null
          last_heartbeat?: string
          status?: string
          tab_switch_count?: number
          user_id: string
        }
        Update: {
          abnormal_typing_spikes?: number
          assignment_id?: string | null
          classroom_id?: string | null
          copy_paste_count?: number
          created_at?: string
          current_file?: string | null
          editor_focus?: boolean
          id?: string
          language?: string | null
          last_heartbeat?: string
          status?: string
          tab_switch_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_sessions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          }
        ]
      }
      notification_events: {
        Row: {
          classroom_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string
          payload: Json
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          payload?: Json
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          payload?: Json
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          }
        ]
      }
      activity_events: {
        Row: {
          assignment_id: string | null
          code_snapshot: string | null
          created_at: string
          event_type: string
          id: string
          language: string | null
          student_id: string
        }
        Insert: {
          assignment_id?: string | null
          code_snapshot?: string | null
          created_at?: string
          event_type: string
          id?: string
          language?: string | null
          student_id: string
        }
        Update: {
          assignment_id?: string | null
          code_snapshot?: string | null
          created_at?: string
          event_type?: string
          id?: string
          language?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          }
        ]
      }
      assessment_results: {
        Row: {
          id: string
          submission_id: string
          assignment_id: string
          student_id: string
          overall_score: number
          correctness_score: number
          quality_score: number
          plagiarism_score: number
          risk_level: string
          correctness_details: Json
          quality_details: Json
          plagiarism_details: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          assignment_id: string
          student_id: string
          overall_score: number
          correctness_score: number
          quality_score: number
          plagiarism_score: number
          risk_level: string
          correctness_details?: Json
          quality_details?: Json
          plagiarism_details?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          assignment_id?: string
          student_id?: string
          overall_score?: number
          correctness_score?: number
          quality_score?: number
          plagiarism_score?: number
          risk_level?: string
          correctness_details?: Json
          quality_details?: Json
          plagiarism_details?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_evaluations: {
        Row: {
          ai_indicators: Json | null
          ai_probability_score: number | null
          assignment_id: string
          behavioral_log: Json | null
          code_quality_score: number | null
          complexity_jump_detected: boolean | null
          correctness_score: number | null
          created_at: string
          detailed_report: Json | null
          evaluated_at: string
          faculty_review_recommended: boolean | null
          feedback: string | null
          highest_peer_similarity: number | null
          id: string
          integrity_verdict: string | null
          paste_suspected: boolean | null
          peer_ai_verdict: string | null
          peer_similarity_scores: Json | null
          plagiarism_indicators: Json | null
          plagiarism_score: number | null
          plagiarism_details: Json | null
          risk_level: string | null
          student_id: string
          style_inconsistency_detected: boolean | null
          submission_id: string
          suspicious_segments: Json | null
          total_score: number | null
        }
        Insert: {
          ai_indicators?: Json | null
          ai_probability_score?: number | null
          assignment_id: string
          behavioral_log?: Json | null
          code_quality_score?: number | null
          complexity_jump_detected?: boolean | null
          correctness_score?: number | null
          created_at?: string
          detailed_report?: Json | null
          evaluated_at?: string
          faculty_review_recommended?: boolean | null
          feedback?: string | null
          highest_peer_similarity?: number | null
          id?: string
          integrity_verdict?: string | null
          paste_suspected?: boolean | null
          peer_ai_verdict?: string | null
          peer_similarity_scores?: Json | null
          plagiarism_indicators?: Json | null
          plagiarism_score?: number | null
          risk_level?: string | null
          student_id: string
          style_inconsistency_detected?: boolean | null
          submission_id: string
          suspicious_segments?: Json | null
          total_score?: number | null
        }
        Update: {
          ai_indicators?: Json | null
          ai_probability_score?: number | null
          assignment_id?: string
          behavioral_log?: Json | null
          code_quality_score?: number | null
          complexity_jump_detected?: boolean | null
          correctness_score?: number | null
          created_at?: string
          detailed_report?: Json | null
          evaluated_at?: string
          faculty_review_recommended?: boolean | null
          feedback?: string | null
          highest_peer_similarity?: number | null
          id?: string
          integrity_verdict?: string | null
          paste_suspected?: boolean | null
          peer_ai_verdict?: string | null
          peer_similarity_scores?: Json | null
          plagiarism_indicators?: Json | null
          plagiarism_score?: number | null
          plagiarism_details?: Json | null
          risk_level?: string | null
          student_id?: string
          style_inconsistency_detected?: boolean | null
          submission_id?: string
          suspicious_segments?: Json | null
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_evaluations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_evaluations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          classroom_id: string | null
          created_at: string
          created_by: string
          description: string | null
          difficulty: string | null
          due_date: string | null
          expected_skill_level: string | null
          id: string
          language: string | null
          results_visible: boolean
          title: string
          total_marks: number
          updated_at: string
          max_submissions: number | null
          supported_languages: string[] | null
          reference_solution: string | null
        }
        Insert: {
          classroom_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          difficulty?: string | null
          due_date?: string | null
          expected_skill_level?: string | null
          id?: string
          language?: string | null
          results_visible?: boolean
          title: string
          total_marks?: number
          updated_at?: string
          max_submissions?: number | null
          supported_languages?: string[] | null
          reference_solution?: string | null
        }
        Update: {
          classroom_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          difficulty?: string | null
          due_date?: string | null
          expected_skill_level?: string | null
          id?: string
          language?: string | null
          results_visible?: boolean
          title?: string
          total_marks?: number
          updated_at?: string
          max_submissions?: number | null
          supported_languages?: string[] | null
          reference_solution?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      problems: {
        Row: {
          id: string
          assignment_id: string
          problem_statement: string
          constraints: string | null
          sample_input: string | null
          sample_output: string | null
          time_limit: number
          memory_limit: number
          reference_solution: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          problem_statement: string
          constraints?: string | null
          sample_input?: string | null
          sample_output?: string | null
          time_limit?: number
          memory_limit?: number
          reference_solution?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          problem_statement?: string
          constraints?: string | null
          sample_input?: string | null
          sample_output?: string | null
          time_limit?: number
          memory_limit?: number
          reference_solution?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problems_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          }
        ]
      }
      test_cases: {
        Row: {
          id: string
          assignment_id: string
          input: string | null
          expected_output: string
          is_hidden: boolean
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          input?: string | null
          expected_output: string
          is_hidden?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          input?: string | null
          expected_output?: string
          is_hidden?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          }
        ]
      }
      classroom_students: {
        Row: {
          classroom_id: string
          id: string
          joined_at: string
          student_id: string
          invited_by: string | null
          enrollment_status: string
          enrolled_at: string
          created_at: string
          deleted_at: string | null
          is_active: boolean
        }
        Insert: {
          classroom_id: string
          id?: string
          joined_at?: string
          student_id: string
          invited_by?: string | null
          enrollment_status?: string
          enrolled_at?: string
          created_at?: string
          deleted_at?: string | null
          is_active?: boolean
        }
        Update: {
          classroom_id?: string
          id?: string
          joined_at?: string
          student_id?: string
          invited_by?: string | null
          enrollment_status?: string
          enrolled_at?: string
          created_at?: string
          deleted_at?: string | null
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "classroom_students_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          classroom_code: string
          classroom_name: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          subject_name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          classroom_code: string
          classroom_name: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          subject_name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          classroom_code?: string
          classroom_name?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          subject_name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          assignment_id: string | null
          created_at: string
          dismissed: boolean
          event_summary: Json | null
          explanation: string
          id: string
          risk_level: string
          student_id: string
        }
        Insert: {
          alert_type: string
          assignment_id?: string | null
          created_at?: string
          dismissed?: boolean
          event_summary?: Json | null
          explanation: string
          id?: string
          risk_level?: string
          student_id: string
        }
        Update: {
          alert_type?: string
          assignment_id?: string | null
          created_at?: string
          dismissed?: boolean
          event_summary?: Json | null
          explanation?: string
          id?: string
          risk_level?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_suspended: boolean
          name: string
          role: Database["public"]["Enums"]["app_role"]
          uid: string | null
          updated_at: string
          user_id: string
          username: string | null
          avatar_url: string | null
          bio: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_suspended?: boolean
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          uid?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          avatar_url?: string | null
          bio?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_suspended?: boolean
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          uid?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          avatar_url?: string | null
          bio?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string
          behavioral_log: Json | null
          code: string | null
          id: string
          score: number | null
          status: string
          student_id: string
          submitted_at: string
          updated_at: string
          language: string
          verdict: string | null
          execution_time: number | null
          memory_used: number | null
          started_at: string
        }
        Insert: {
          assignment_id: string
          behavioral_log?: Json | null
          code?: string | null
          id?: string
          score?: number | null
          status?: string
          student_id: string
          submitted_at?: string
          updated_at?: string
          language?: string
          verdict?: string | null
          execution_time?: number | null
          memory_used?: number | null
          started_at?: string
        }
        Update: {
          assignment_id?: string
          behavioral_log?: Json | null
          code?: string | null
          id?: string
          score?: number | null
          status?: string
          student_id?: string
          submitted_at?: string
          updated_at?: string
          language?: string
          verdict?: string | null
          execution_time?: number | null
          memory_used?: number | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: "student_joined" | "student_left" | "assignment_submitted" | "fraud_detected" | "announcement" | "assignment_assigned" | "assignment_due"
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type: "student_joined" | "student_left" | "assignment_submitted" | "fraud_detected" | "announcement" | "assignment_assigned" | "assignment_due"
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: "student_joined" | "student_left" | "assignment_submitted" | "fraud_detected" | "announcement" | "assignment_assigned" | "assignment_due"
          user_id?: string
        }
        Relationships: []
      }
      assignment_students: {
        Row: {
          assignment_id: string
          student_id: string
          assigned_at: string
          assigned_by: string | null
          deleted_at: string | null
          is_active: boolean
        }
        Insert: {
          assignment_id: string
          student_id: string
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
        }
        Update: {
          assignment_id?: string
          student_id?: string
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assignment_students_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          }
        ]
      }
      projects: {
        Row: {
          id: string
          name: string
          student_id: string
          assignment_id: string | null
          classroom_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          student_id: string
          assignment_id?: string | null
          classroom_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          student_id?: string
          assignment_id?: string | null
          classroom_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          id: string
          project_id: string
          name: string
          type: "file" | "folder"
          parent_id: string | null
          content: string | null
          language: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          type: "file" | "folder"
          parent_id?: string | null
          content?: string | null
          language?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          type?: "file" | "folder"
          parent_id?: string | null
          content?: string | null
          language?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      editor_sessions: {
        Row: {
          project_id: string
          student_id: string
          active_file_id: string | null
          open_tabs: Json
          cursor_positions: Json
          layout_state: Json
          updated_at: string
        }
        Insert: {
          project_id: string
          student_id: string
          active_file_id?: string | null
          open_tabs: Json
          cursor_positions: Json
          layout_state: Json
          updated_at?: string
        }
        Update: {
          project_id?: string
          student_id?: string
          active_file_id?: string | null
          open_tabs?: Json
          cursor_positions?: Json
          layout_state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      terminal_sessions: {
        Row: {
          project_id: string
          student_id: string
          history_logs: Json
          updated_at: string
        }
        Insert: {
          project_id: string
          student_id: string
          history_logs: Json
          updated_at?: string
        }
        Update: {
          project_id?: string
          student_id?: string
          history_logs?: Json
          updated_at?: string
        }
        Relationships: []
      }

      submission_test_results: {
        Row: {
          id: string
          submission_id: string
          test_case_id: string
          passed: boolean
          execution_time: number | null
          memory_used: number | null
        }
        Insert: {
          id?: string
          submission_id: string
          test_case_id: string
          passed: boolean
          execution_time?: number | null
          memory_used?: number | null
        }
        Update: {
          id?: string
          submission_id?: string
          test_case_id?: string
          passed?: boolean
          execution_time?: number | null
          memory_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_test_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_test_results_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "teacher", "admin"],
    },
  },
} as const

export type AssessmentResult = Database["public"]["Tables"]["assessment_results"]["Row"];
