# TraceCode Teacher Administration Manual

This guide describes how to configure coding assignments, proctor exams, analyze real-time copy-paste telemetry, and manage grading using the TraceCode Teacher Portal.

---

## 1. Assignment Creation & Resource Quotas

To set up a new coding challenge:
1. Navigate to **Assignments** from the sidebar and click **New Assignment** (or **Create Assignment**).
2. Set the Title, Due Date, and Difficulty (Easy, Medium, Hard).
3. Specify the **Resource Quota Parameters**:
   * **Max Submissions**: Prevent brute-forcing by locking attempts (e.g. Unlimited, 10, 5, or 1 attempt).
   * **CPU Time Limit**: Set maximum CPU run time in seconds (Default: 5 seconds).
   * **Memory Limit**: Set sandboxed execution RAM limits in MB (Default: 256 MB).
   * **Supported Runtimes**: Check permitted languages (Python, JavaScript, etc.).

---

## 2. Test Case Setup & RLS Protection

TraceCode splits testing specifications into two isolation layers:

### A. Public Test Cases
* **Purpose**: Verifies that the student's program conforms to basic signature inputs and outputs.
* **Access**: Readable by students. Input/output parameters are displayed on correct or incorrect match verdicts.

### B. Hidden Test Cases
* **Purpose**: Prevents cheating or hardcoded outputs. Used for final score calculations.
* **Access**: Encrypted and secured via Row Level Security (RLS) policies. Student client tokens are blocked from querying hidden test cases. They are fetched exclusively by Supabase Edge Functions in the secure Deno environment.

### Creating Test Cases
1. Go to the **Test Cases** section in your Assignment view.
2. Provide the Standard Input (`stdin`) block and the Expected Output (`stdout`) block.
3. Toggle the **Is Hidden** switch to protect grading inputs.

---

## 3. Real-Time Classroom Proctoring

During exams or programming labs, teachers can monitor student progress live:
* **Realtime Student Feed**: Lists all active students, connection status (Online/Offline), keypress metrics, compilation runs, and paste counters.
* **Bi-directional Live Stream**: Click any student in the registry to render their active workspace editor. This loads a read-only instance of the student's Monaco editor displaying their current code, updating in real-time as they type.
* **Realtime Verdicts**: Shows the student's highest score and latest code execution outcome (e.g., `ACCEPTED`, `WRONG ANSWER`, `TIME LIMIT EXCEEDED`, `COMPILATION ERROR`) live.

---

## 4. Paste Monitoring Analytics & Alerts Feed

TraceCode monitors clipboard actions to verify code authorship. Access these insights via the Proctoring Dashboard:
* **Telemetry Feed**: Captures the total pasted characters, pasted lines, first/last paste timestamps, and largest pasted blocks.
* **Alert System**: Detects unusual behavioral patterns and marks them by severity:
  * 🟢 **LOW RISK**: Standard typing or small format fixes.
  * 🟡 **MEDIUM RISK**: Copy-pasting larger blocks of code (e.g., >30 characters or >3 lines).
  * 🔴 **HIGH RISK**: Importing major structural solutions (e.g., >1000 characters or >50 lines of code).
* **Correlation Timeline**: Plots student compiler runs, stdin tests, copy-paste events, and submissions in a chronological feed to identify suspicious workflows.

---

## 5. Grading Reviews & Rejudges

### OpenRouter AI Feedback Review
When a student submits code, their score is evaluated instantly against the test suite. In the background, the code is analyzed by the OpenRouter AI engine (`openai/gpt-oss-20b:free`) to assess readability, styling, runtime complexity, and potential logic gaps.
* Review cards populate the student submission details page.
* Features grading summaries and personalized feedback tips.

### Database Rejudging Engine
If you modify test cases or adjust resource limits, you can re-grade past submissions without student interaction:
* **Rejudge Submission**: Re-evaluates a single code run.
* **Rejudge Assignment**: Batch updates grades for all student submissions for a specific assignment.
* **Rejudge Classroom**: Synchronizes and updates all assignments within a classroom.
