import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  normalizeIdentifiers,
  getLanguageAgnosticIR,
  computePlagiarismRiskLevel,
  shouldTriggerAI,
  classifyMatchSource
} from "../../supabase/functions/check-plagiarism/index";

describe("Plagiarism Engine v2.1 Tests", () => {
  describe("Identifier and Formatting Normalization", () => {
    it("should strip comments, collapse whitespaces, and sort imports", () => {
      const pyCode = `
# This is a comment
import sys
import os

def hello():
    # Another comment
    print("hello")
`;
      const normalized = normalizeCode(pyCode);
      // Imports should be sorted alphabetically, comments stripped, multiple spaces collapsed
      expect(normalized).toContain("import os import sys def hello(): print(\"str\")");
    });

    it("should normalize identifiers sequentially", () => {
      const code = "const myVar = 10; function myFunction(a, b) { return a + b; }";
      const normalized = normalizeIdentifiers(code);
      // myVar -> var_0, myFunction -> var_1, a -> var_2, b -> var_3
      // keywords like const, function, return should not be changed
      expect(normalized).toBe("const var_0 = 10; function var_1(var_2, var_3) { return var_2 + var_3; }");
    });
  });

  describe("Structural Similarity IR Generation", () => {
    it("should generate unified brace IR for Python code", () => {
      const pyCode = `
def process(x):
    if x > 0:
        for i in range(x):
            print(i)
    else:
        return 0
`;
      const ir = getLanguageAgnosticIR(pyCode, "python");
      // Should normalize loops, conditionals, function declarations
      expect(ir).toContain("FUNC_START:F0");
      expect(ir).toContain("COND_START");
      expect(ir).toContain("LOOP_START");
      expect(ir).toContain("LOOP_END");
      expect(ir).toContain("COND_END");
      expect(ir).toContain("FUNC_END");
    });

    it("should generate language-agnostic IR for JS/TS code", () => {
      const jsCode = `
function process(x) {
    if (x > 0) {
        for (let i = 0; i < x; i++) {
            console.log(i);
        }
      } else {
        return 0;
    }
}
`;
      const ir = getLanguageAgnosticIR(jsCode, "javascript");
      expect(ir).toContain("FUNC_START:F0");
      expect(ir).toContain("COND_START");
      expect(ir).toContain("LOOP_START");
      expect(ir).toContain("LOOP_END");
      expect(ir).toContain("COND_END");
      expect(ir).toContain("FUNC_END");
    });

    it("should calculate StructuralSimilarity independently and detect recursive patterns", () => {
      const recPyCode = `
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
`;
      const ir = getLanguageAgnosticIR(recPyCode, "python");
      expect(ir).toContain("RECURSION");
    });
  });

  describe("CRITICAL Risk Gating & Multi-Engine Agreement", () => {
    it("should gate CRITICAL risk level requiring FinalScore >= 85 and at least 2 engines >= 80", () => {
      // Case 1: FinalScore >= 85, AST >= 80, Winnowing >= 80 -> CRITICAL
      expect(computePlagiarismRiskLevel(86, 80, 80, 50)).toBe("CRITICAL");

      // Case 2: FinalScore >= 85, AST >= 80, Structural >= 80 -> CRITICAL
      expect(computePlagiarismRiskLevel(88, 80, 40, 80)).toBe("CRITICAL");

      // Case 3: FinalScore >= 85, Winnowing >= 80, Structural >= 80 -> CRITICAL
      expect(computePlagiarismRiskLevel(90, 30, 80, 85)).toBe("CRITICAL");

      // Case 4: FinalScore >= 85, but only 1 engine >= 80 -> Downgrade to HIGH
      expect(computePlagiarismRiskLevel(87, 85, 75, 60)).toBe("HIGH");

      // Case 5: FinalScore >= 85, no engines >= 80 -> Downgrade to HIGH
      expect(computePlagiarismRiskLevel(95, 70, 70, 70)).toBe("HIGH");

      // Case 6: FinalScore < 85 -> not CRITICAL (e.g. 75 is HIGH, 50 is MEDIUM, 30 is LOW)
      expect(computePlagiarismRiskLevel(84, 90, 90, 90)).toBe("HIGH");
      expect(computePlagiarismRiskLevel(75, 90, 90, 90)).toBe("HIGH");
      expect(computePlagiarismRiskLevel(50, 90, 90, 90)).toBe("MEDIUM");
      expect(computePlagiarismRiskLevel(30, 90, 90, 90)).toBe("LOW");
    });
  });

  describe("AI Trigger Thresholds (Cost Optimization)", () => {
    it("should run AI review only if at least one engine is > 50", () => {
      // AST > 50 -> Trigger AI
      expect(shouldTriggerAI(55, 10, 10)).toBe(true);

      // Winnowing > 50 -> Trigger AI
      expect(shouldTriggerAI(10, 51, 10)).toBe(true);

      // Structural > 50 -> Trigger AI
      expect(shouldTriggerAI(10, 10, 60)).toBe(true);

      // All <= 50 -> Skip AI
      expect(shouldTriggerAI(50, 50, 50)).toBe(false);
      expect(shouldTriggerAI(10, 20, 30)).toBe(false);
    });
  });

  describe("Match Source Classification", () => {
    it("should classify match sources correctly based on assignments and classrooms", () => {
      const assignmentId = "assign-1";
      const studentId = "student-1";
      const classroomId = "class-1";
      const classroomMap = new Map<string, string>();
      classroomMap.set("assign-1", "class-1");
      classroomMap.set("assign-2", "class-1");
      classroomMap.set("assign-3", "class-2");

      // Teacher reference solution -> same_assignment
      expect(classifyMatchSource({ student_id: "teacher", assignment_id: "assign-1" }, assignmentId, studentId, classroomId, classroomMap)).toBe("same_assignment");

      // Same assignment -> same_assignment
      expect(classifyMatchSource({ student_id: "student-2", assignment_id: "assign-1" }, assignmentId, studentId, classroomId, classroomMap)).toBe("same_assignment");

      // Same student, different assignment -> historical_submission
      expect(classifyMatchSource({ student_id: "student-1", assignment_id: "assign-2" }, assignmentId, studentId, classroomId, classroomMap)).toBe("historical_submission");

      // Different student, different assignment, same classroom -> previous_assignment
      expect(classifyMatchSource({ student_id: "student-2", assignment_id: "assign-2" }, assignmentId, studentId, classroomId, classroomMap)).toBe("previous_assignment");

      // Different student, different assignment, different classroom -> cross_classroom
      expect(classifyMatchSource({ student_id: "student-3", assignment_id: "assign-3" }, assignmentId, studentId, classroomId, classroomMap)).toBe("cross_classroom");
    });
  });
});
