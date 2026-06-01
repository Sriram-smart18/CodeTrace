# TraceCode Teacher Administration Guide

This guide describes how to configure, monitor, and grade coding assessments using the TraceCode Teacher Portal.

---

## 1. Assignment Creation & Configuration

To set up a coding challenge:
1. Navigate to **Assignments** and click **Create Assignment**.
2. Define the Assignment Title, Difficulty (Easy, Medium, Hard), total score marks, and the Due Date.
3. Switch to the **Challenge Configuration** tab to configure:
   * **Supported Languages**: Check allowed runtimes (e.g., Python, JavaScript, Java, C++, C).
   * **Max Submissions**: Enforce submission quotas (e.g. Unlimited, 10, 5, 1 attempt).
   * **Limits**: Specify custom CPU Time limits (in seconds) and Memory limits (in MB).

---

## 2. Test Case Configurations

TraceCode splits test cases into two classes:
* **Public Test Cases**: Visible to students in the Console panel. Useful for verifying basic structure.
* **Hidden Test Cases**: Locked behind database RLS policies. The inputs and expected outputs are never visible in client cache or API responses. They are used for final score grading.

### Adding Test Cases
1. Go to the **Test Cases** editor inside the Assignment Detail view.
2. Input the Standard Input (`stdin`) parameter block.
3. Input the Expected Standard Output (`stdout`) parameter block.
4. Set the **Is Hidden** toggle to determine visibility.

---

## 3. Real-Time Classroom Proctoring

During exams or active classes, open the **Live Session** view:
* **Student Registry**: Lists active, offline, and suspended students.
* **Typing Indicator**: Shows keypress metrics, run executions, and copy-paste counters.
* **Real-time Editor Sync**: Click on any student to view their editor content *in real time* inside a read-only Monaco instance.
* **Verdict badges**: Sidebar updates in real time to show the student's highest score and latest test execution verdict (e.g. `ACCEPTED`, `WRONG ANSWER`).

---

## 4. Grading, AI Reviews, & Rejudges

### AI Grading Reviews
TraceCode integrates an asynchronous code evaluation reviewer. When a student submits, they instantly receive their compilation/test verdict. Concurrently, an AI review job is queued in the background to analyze code quality and structure. Results populate the student's detail card without blocking execution flow.

### Rejudging Engine
If a test case had a bug or memory limits were adjusted:
* **Rejudge Submission**: Recalculates code output matching parameters for a single submission.
* **Rejudge Assignment**: Batch-evaluates all student submissions for a specific assignment.
* **Rejudge Classroom**: Triggers updates across all classroom assignments.
