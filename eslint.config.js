import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  {
    files: [
      "src/components/ui/**/*.tsx",
      "src/components/ide/**/*.tsx",
      "src/components/ide/**/*.ts",
      "src/components/monitoring/FraudAlerts.tsx",
      "src/components/IntegrityReport.tsx",
      "src/hooks/useIdeMonitoring.ts",
      "src/hooks/useWorkspaceQueries.ts",
      "src/lib/**/*.ts",
      "src/utils/**/*.ts",
      "src/vite-env.d.ts",
      "supabase.d.ts",
      "tailwind.config.ts",
      "supabase/functions/**/*.ts",
      "src/pages/teacher/MonitoringTest.tsx",
      "src/pages/teacher/AssignmentDetail.tsx",
      "src/pages/teacher/Reports.tsx",
      "src/pages/teacher/Submissions.tsx",
      "src/pages/student/Classrooms.tsx",
      "src/test/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
