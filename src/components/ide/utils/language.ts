// File: src/components/ide/utils/language.ts

export function getLanguageFromFilename(filename: string): string {
  const parts = filename.split(".");
  if (parts.length <= 1) return "plaintext";
  const ext = parts.pop()?.toLowerCase();
  switch (ext) {
    case "py":
      return "python";
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "tsx":
      return "typescriptreact";
    case "jsx":
      return "javascriptreact";
    case "html":
      return "html";
    case "css":
      return "css";
    case "json":
      return "json";
    case "java":
      return "java";
    case "cpp":
      return "cpp";
    case "c":
      return "c";
    case "go":
      return "go";
    case "sql":
      return "sql";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}
