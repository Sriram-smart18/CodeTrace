# TraceCode Student Guide

Welcome to the TraceCode Coding Platform! This manual explains how to write, run, and submit assignments on the platform.

---

## 1. Navigating Your Dashboard

After logging in as a student, you will see your Dashboard:
* **Active Assignments**: View pending coding challenges and their respective due dates.
* **Progress Panel**: View your overall accepted submission stats and metrics.
* **Attempt Trackers**: Check remaining submission attempts for each assignment.

---

## 2. Editor Workspace

When you open an assignment, you enter the editor workspace:
* **Monaco Editor (Center)**: Features standard syntax highlighting, autocomplete, code indentation support, and custom language selections.
* **Problem Panel (Left)**: Contains the description, constraints, and sample input/output parameters.
* **History Tab (Left)**: Lists your past submissions. Clicking "Load Code" lets you restore and load any older code snapshot directly back into your active editor.
* **Leaderboard Tab (Left)**: View top rankings. Tie-breaking rules sort rankings by:
  1. **Score** (Descending)
  2. **Execution Time** (Ascending)
  3. **Accepted Timestamp** (Ascending - prevents tie gaps)

---

## 3. Running & Testing Code

Use the bottom panel console tabs to test and debug programs:

### Interactive Console
1. Press the **RUN** button to run code locally on the execution server.
2. If your program requests user input, type parameters directly into the interactive terminal and press **Enter** to write to standard input (`stdin`).
3. Press **STOP** to abort hung or looping programs.

### Test Case Results
* Click **SUBMIT** to run code against the assignment's official test suite.
* View test results inside the **Test Results** tab. For public test cases, you can view input parameters and mismatch comparisons. For hidden test cases, matching parameters are hidden for integrity.
* Click individual test case buttons to drill down into duration (in ms) and peak memory usage (in KB).
