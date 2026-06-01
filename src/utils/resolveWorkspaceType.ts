import { WorkspaceType } from "@/types/workspace";

export function resolveWorkspaceType(assignment: { language?: string | null }): WorkspaceType {
  const sandboxLanguages = [
    'html',
    'css',
    'javascript-react',
    'typescript-react',
    'react',
    'nextjs'
  ];

  if (!assignment?.language) return 'editor';

  return sandboxLanguages.includes(assignment.language.toLowerCase())
    ? 'sandbox'
    : 'editor';
}
