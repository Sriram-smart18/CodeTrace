// File: src/lib/schemaValidation.ts
import { z } from "zod";

// 1. Editor Sync Payload Schema
export const editorSyncPayloadSchema = z.object({
  project_id: z.string().uuid("Invalid project ID format"),
  student_id: z.string().uuid("Invalid student ID format"),
  active_file_id: z.string().uuid().nullable().optional(),
  open_tabs: z.array(z.string()).default([]),
  cursor_positions: z.record(
    z.string(),
    z.object({
      line: z.number().int().min(1),
      column: z.number().int().min(1)
    })
  ).default({}),
  layout_state: z.object({
    sidebarOpen: z.boolean().default(true),
    terminalOpen: z.boolean().default(true),
    previewOpen: z.boolean().default(true),
    activeSidebarTab: z.string().default("explorer"),
    sidebarWidth: z.number().min(100).max(600).default(260),
    terminalHeight: z.number().min(50).max(600).default(250)
  }).optional()
});

// 2. Submission Payload Schema
export const submissionPayloadSchema = z.object({
  assignment_id: z.string().uuid("Invalid assignment ID format"),
  student_id: z.string().uuid("Invalid student ID format"),
  status: z.enum(["draft", "submitted", "evaluated", "flagged"]).default("draft"),
  score: z.number().min(0).max(1000).nullable().optional(),
  behavioral_log: z.record(z.any()).optional().nullable()
});

// 3. Classroom Payload Schema
export const classroomPayloadSchema = z.object({
  classroom_name: z.string().min(2, "Classroom name must be at least 2 characters").max(100),
  subject_name: z.string().min(2, "Subject name must be at least 2 characters").max(100),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().default(true)
});

// 4. AI Queue Job Schema
export const aiQueueJobSchema = z.object({
  submission_id: z.string().uuid("Invalid submission ID format"),
  status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
  retry_count: z.number().int().nonnegative().max(3).default(0),
  error_logs: z.string().nullable().optional()
});

// 5. Analytics Request Schema
export const analyticsRequestSchema = z.object({
  classroom_id: z.string().uuid().optional(),
  assignment_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(15)
});

// --- Safe Validation Helpers ---

export function validateEditorSync(payload: unknown) {
  return editorSyncPayloadSchema.parse(payload);
}

export function validateSubmission(payload: unknown) {
  return submissionPayloadSchema.parse(payload);
}

export function validateClassroom(payload: unknown) {
  return classroomPayloadSchema.parse(payload);
}

export function validateAiJob(payload: unknown) {
  return aiQueueJobSchema.parse(payload);
}

export function validateAnalyticsRequest(payload: unknown) {
  return analyticsRequestSchema.parse(payload);
}
