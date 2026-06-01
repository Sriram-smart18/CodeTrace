// File: src/components/ide/editor/IdeBreadcrumbs.tsx
import React, { useMemo } from "react";
import { ChevronRight, FileCode, FolderClosed } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { useShallow } from "zustand/react/shallow";

export const IdeBreadcrumbs: React.FC = () => {
  const breadcrumbMeta = useIdeStore(
    useShallow((state) => {
      const activeFileId = state.activeFileId;
      if (!activeFileId) return [];
      const path: string[] = [];
      let current = state.nodesById[activeFileId];
      
      while (current) {
        path.unshift(`${current.id}::${current.name}::${current.type}`);
        current = current.parentId ? state.nodesById[current.parentId] : null;
      }
      
      return path;
    })
  );

  const breadcrumbs = useMemo(() => {
    return breadcrumbMeta.map(meta => {
      const [id, name, type] = meta.split("::");
      return { id, name, type };
    });
  }, [breadcrumbMeta]);

  if (breadcrumbs.length === 0) return null;

  return (
    <div className="h-6 w-full bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-1.5 select-none font-mono text-[10px] text-slate-500 dark:text-muted-foreground/60 overflow-hidden shrink-0">
      <span className="truncate hover:text-slate-900 dark:hover:text-foreground cursor-pointer">workspace</span>
      {breadcrumbs.map((b, index) => (
        <React.Fragment key={b.id}>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0 hover:text-slate-900 dark:hover:text-foreground cursor-pointer">
            {b.type === "folder" ? (
              <FolderClosed className="h-3 w-3 text-blue-400 shrink-0" />
            ) : (
              <FileCode className="h-3 w-3 text-primary shrink-0" />
            )}
            <span className={index === breadcrumbs.length - 1 ? "text-slate-800 dark:text-muted-foreground font-semibold" : ""}>{b.name}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
