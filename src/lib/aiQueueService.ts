// File: src/lib/aiQueueService.ts
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "./invokeEdgeFunction";

const db = supabase as any;

export interface EvaluationJob {
  id: string;
  submission_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  retry_count: number;
  error_logs: string | null;
  started_at: string | null;
  completed_at: string | null;
}

class AiQueueService {
  private processingCount = 0;
  private maxConcurrency = 2;
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private retryBackoffs = [5000, 15000, 45000]; // 5s, 15s, 45s

  /**
   * Enqueue a new AI evaluation job. Deduplicates using DB constraint and selects existing if any.
   */
  public async enqueueJob(submissionId: string): Promise<string> {
    try {
      // 1. Check if there's already an active job for this submission
      const { data: existingJobs } = await db
        .from("evaluation_jobs")
        .select("id, status")
        .eq("submission_id", submissionId)
        .in("status", ["pending", "processing"]);

      if (existingJobs && existingJobs.length > 0) {
        console.log(`[AiQueueService] Job already active for submission ${submissionId}: ${existingJobs[0].id}`);
        return existingJobs[0].id;
      }

      // 2. Insert new pending job
      const { data: newJob, error } = await db
        .from("evaluation_jobs")
        .insert({
          submission_id: submissionId,
          status: "pending",
          retry_count: 0
        })
        .select("id")
        .single();

      if (error) {
        // Handle unique constraint or RLS failures
        if (error.code === "23505") { // unique key violation
          const { data: retryCheck } = await db
            .from("evaluation_jobs")
            .select("id")
            .eq("submission_id", submissionId)
            .in("status", ["pending", "processing"])
            .single();
          if (retryCheck) return retryCheck.id;
        }
        throw error;
      }

      console.log(`[AiQueueService] Enqueued job: ${newJob.id}`);
      
      // Wake up the queue processor immediately
      this.processQueue();

      return newJob.id;
    } catch (e) {
      console.error("[AiQueueService] Failed to enqueue job:", e);
      throw e;
    }
  }

  /**
   * Starts background processing loops (polling + realtime channel)
   */
  public start(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      this.processQueue();
    }, 10000); // Poll every 10 seconds for robustness

    // Initial run
    this.processQueue();
    console.log("[AiQueueService] Background queue processor started.");
  }

  public stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isProcessing = false;
  }

  /**
   * Core processing loop
   */
  private async processQueue() {
    if (this.isProcessing || this.processingCount >= this.maxConcurrency) return;
    this.isProcessing = true;

    try {
      // Fetch oldest pending jobs within current capacity
      const capacity = this.maxConcurrency - this.processingCount;
      if (capacity <= 0) return;

      const { data: pendingJobs, error } = await db
        .from("evaluation_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(capacity);

      if (error) {
        console.error("[AiQueueService] Error fetching pending jobs:", error);
        return;
      }

      if (pendingJobs && pendingJobs.length > 0) {
        console.log(`[AiQueueService] Found ${pendingJobs.length} pending jobs to process.`);
        pendingJobs.forEach((job: any) => {
          this.executeJob(job as EvaluationJob);
        });
      }
    } catch (e) {
      console.error("[AiQueueService] Process queue exception:", e);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single evaluation job
   */
  private async executeJob(job: EvaluationJob) {
    this.processingCount++;
    console.log(`[AiQueueService] Executing job ${job.id} for submission ${job.submission_id}`);

    try {
      // 1. Transition status to processing
      const { error: transitionError } = await db
        .from("evaluation_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString()
        })
        .eq("id", job.id);

      if (transitionError) throw transitionError;

      // 2. Invoke Edge Function
      const { error: evalError } = await invokeEdgeFunction("evaluate-submission", {
        submission_id: job.submission_id,
      });

      if (evalError) {
        throw evalError;
      }

      // 3. Mark completed
      await db
        .from("evaluation_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          error_logs: null
        })
        .eq("id", job.id);

      console.log(`[AiQueueService] Job ${job.id} completed successfully.`);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.warn(`[AiQueueService] Job ${job.id} failed: ${errorMsg}`);

      const nextRetryCount = job.retry_count + 1;
      
      if (nextRetryCount <= 3) {
        const backoffMs = this.retryBackoffs[nextRetryCount - 1] || 5000;
        console.log(`[AiQueueService] Scheduling retry #${nextRetryCount} in ${backoffMs}ms for job ${job.id}`);

        // Set state back to pending after retry backoff has elapsed
        setTimeout(async () => {
          await db
            .from("evaluation_jobs")
            .update({
              status: "pending",
              retry_count: nextRetryCount,
              error_logs: `Retry #${nextRetryCount} scheduled. Previous error: ${errorMsg}`
            })
            .eq("id", job.id);

          this.processQueue();
        }, backoffMs);
      } else {
        // Exceeded retries, mark as failed permanently
        await db
          .from("evaluation_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_logs: `Exceeded max retries (3). Final error: ${errorMsg}`
          })
          .eq("id", job.id);

        console.error(`[AiQueueService] Job ${job.id} permanently failed.`);
      }
    } finally {
      this.processingCount = Math.max(0, this.processingCount - 1);
      // Run next items in the queue
      this.processQueue();
    }
  }
}

export const aiQueueService = new AiQueueService();
