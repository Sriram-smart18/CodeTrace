// File: src/components/ide/utils/icons.tsx
import React from "react";
import { File, Folder, FolderOpen, FileCode, FileText } from "lucide-react";

export const getFileIcon = (filename: string): React.ReactNode => {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : "";

  switch (ext) {
    case "py":
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.91 2C6.98 2 7.23 4.14 7.23 4.14L7.24 6.34H12V7H5.21S2 7.37 2 12.09c0 4.72 2.78 4.61 2.78 4.61h1.65v-2.31s-.08-2.77 2.73-2.77h4.86s2.69-.04 2.69-2.58V5.3s.25-3.3-4.8-3.3zm-2.47 1.48a.74.74 0 1 1 0 1.48.74.74 0 0 1 0-1.48z" fill="#387EB8" />
          <path d="M12.09 22c4.93 0 4.68-2.14 4.68-2.14l-.01-2.2H12v-.66h6.79S22 16.63 22 11.91c0-4.72-2.78-4.61-2.78-4.61h-1.65v2.31s.08 2.77-2.73 2.77H10s-2.69.04-2.69 2.58v3.74s-.25 3.3 4.78 3.3zm2.47-1.48a.74.74 0 1 1 0-1.48.74.74 0 0 1 0 1.48z" fill="#FFE873" />
        </svg>
      );
    case "js":
      return (
        <svg className="h-3.5 w-3.5 shrink-0 rounded-[2px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" fill="#F7DF1E" />
          <path d="M18.8 19.3c-.6.9-1.6 1.4-2.8 1.4-1.9 0-3-1.1-3-2.9h1.9c0 .9.6 1.4 1.2 1.4.6 0 .9-.3.9-.8v-7.3h2v7.3c0 1.1-.3 1.8-.2 2.3zM12.8 16.9c-.3 1.5-1.4 2.5-3.1 2.5-1.9 0-3.1-1.2-3-3.2h1.9c0 1 .5 1.5 1.2 1.5.7 0 1.1-.4 1.1-1.2 0-2.4-3.1-2-3-5.2 0-1.7 1.1-2.8 2.8-2.8 1.6 0 2.6.9 2.9 2.3h-1.9c-.2-.6-.5-1-1-1-.5 0-.8.3-.8.9.1 2.2 3.1 1.8 3 5.2z" fill="#000000" />
        </svg>
      );
    case "ts":
      return (
        <svg className="h-3.5 w-3.5 shrink-0 rounded-[2px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" fill="#3178C6" />
          <path d="M6 7h7v2H9.5v10h-2V9H6V7zm10.3 7c0-1.7-1.3-2.2-2.8-2.5-1.1-.2-1.5-.5-1.5-1 0-.5.4-.8 1.1-.8.7 0 1.1.2 1.3.6l1.6-1c-.6-1-1.6-1.6-2.9-1.6-2.1 0-3.2 1.2-3.2 2.8 0 1.7 1.2 2.2 2.7 2.5 1.2.2 1.6.6 1.6 1.1 0 .6-.5.9-1.2.9-.9 0-1.4-.4-1.7-1.1l-1.6 1c.5 1.2 1.7 2.1 3.3 2.1 2.3-.1 3.4-1.3 3.4-3z" fill="#FFFFFF" />
        </svg>
      );
    case "tsx":
    case "jsx":
      return (
        <svg className="h-3.5 w-3.5 shrink-0 animate-spin-slow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="2" fill="#00D8FF" />
          <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="#00D8FF" strokeWidth="1.5" fill="none" transform="rotate(30 12 12)" />
          <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="#00D8FF" strokeWidth="1.5" fill="none" transform="rotate(90 12 12)" />
          <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="#00D8FF" strokeWidth="1.5" fill="none" transform="rotate(150 12 12)" />
        </svg>
      );
    case "html":
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 2H21.5L19.5 20L12 22L4.5 20L2.5 2Z" fill="#E34F26" />
          <path d="M12 3.5V20.3L18.1 18.7L19.7 3.5H12Z" fill="#EF652A" />
          <path d="M12 7.7H8.8L9 9.8H12V11.9H9.2L9.6 15.5L12 16.2V18.3L6.8 16.9L6.1 9.8L6 7.7H12V7.7Z" fill="#EDEDED" />
          <path d="M12 7.7H17.8L17.2 14.1L12 15.5V13.4L15.1 12.6L15.3 10.4H12V8.3L12.1 7.7H12Z" fill="#FFFFFF" />
        </svg>
      );
    case "css":
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.5 2H21.5L19.5 20L12 22L4.5 20L2.5 2Z" fill="#1572B6" />
          <path d="M12 3.5V20.3L18.1 18.7L19.7 3.5H12Z" fill="#33A9DC" />
          <path d="M12 7.7H8.8L9 9.8H12V11.9H9.2L9.6 15.5L12 16.2V18.3L6.8 16.9L6.1 9.8L6 7.7H12V7.7Z" fill="#EDEDED" />
          <path d="M12 7.7H17.8L17.2 14.1L12 15.5V13.4L15.1 12.6L15.3 10.4H12V8.3L12.1 7.7H12Z" fill="#FFFFFF" />
        </svg>
      );
    case "json":
      return (
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#2E7D32" />
          <text x="50%" y="65%" dominantBaseline="middle" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">{"{}"}</text>
        </svg>
      );
    case "md":
      return <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    case "sql":
      return <FileCode className="h-3.5 w-3.5 text-purple-400 shrink-0" />;
    case "java":
      return <FileCode className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case "c":
    case "cpp":
      return <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
    case "go":
      return <FileCode className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
    default:
      return <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
  }
};
