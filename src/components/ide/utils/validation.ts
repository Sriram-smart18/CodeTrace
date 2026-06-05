// File: src/components/ide/utils/validation.ts

export function validateFileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "File name cannot be empty.";
  }
  if (trimmed === "." || trimmed === "..") {
    return "File name cannot be '.' or '..'.";
  }
  
  const lower = trimmed.toLowerCase();
  const reserved = ["con", "nul", "aux", "prn", "com1", "com2", "com3", "com4", "lpt1", "lpt2", "lpt3"];
  if (reserved.includes(lower)) {
    return `"${trimmed}" is a reserved system name.`;
  }

  const invalidChars = /[/:*?"<>|]/;
  if (invalidChars.test(trimmed)) {
    return "File name cannot contain invalid characters: \\ / : * ? \" < > |";
  }

  return null; // Valid!
}
