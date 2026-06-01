// File: src/components/ide/explorer/GlobalSearch.tsx
import React, { useState, useMemo, useEffect } from "react";
import { Search, ChevronDown, ChevronRight, FileText, CaseSensitive, Regex, Type } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { cn } from "@/lib/utils";
import { getFileIcon } from "../utils/icons";

interface SearchHit {
  lineNumber: number;
  lineText: string;
  matchIndex: number;
  matchLength: number;
}

interface FileSearchResult {
  fileId: string;
  fileName: string;
  hits: SearchHit[];
}

export const GlobalSearch: React.FC = () => {
  const nodesById = useIdeStore((state) => state.nodesById);
  const openFile = useIdeStore((state) => state.openFile);
  const setRevealRequest = useIdeStore((state) => state.setRevealRequest);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");

  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [regexError, setRegexError] = useState<string | null>(null);

  // Debounce the search query to keep interactions fluid on large codebases
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400); // 400ms debounce
    return () => clearTimeout(handler);
  }, [query]);

  // Expand new results automatically
  const prevResultsKeyRef = React.useRef("");
  const resultsKey = debouncedQuery + includePattern + excludePattern;

  // Validate regular expression to prevent ReDoS (Regular Expression Denial of Service)
  useEffect(() => {
    if (!useRegex || !debouncedQuery.trim()) {
      setRegexError(null);
      return;
    }
    const q = debouncedQuery.trim();
    if (q.length > 80) {
      setRegexError("Regex is too long (max 80 chars)");
      return;
    }
    if (/([\*\+\?][\*\+\?]+)/.test(q)) {
      setRegexError("Consecutive quantifiers (*+, ++, etc.) not allowed");
      return;
    }
    // Nested repetition quantifier check (e.g. groups containing + or * followed by a quantifier)
    if (/\([^\)]*[\*\+\?\{][^\)]*\)[\*\+\?\{]/.test(q)) {
      setRegexError("Nested repetition group (ReDoS hazard) rejected");
      return;
    }
    try {
      new RegExp(wholeWord ? `\\b${q}\\b` : q);
      setRegexError(null);
    } catch (e: any) {
      setRegexError(e.message || "Invalid regular expression");
    }
  }, [debouncedQuery, useRegex, wholeWord]);

  // Memoize search execution to avoid rebuilding matches unnecessarily
  const results = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q || regexError) return [];

    const matches: FileSearchResult[] = [];

    // Precompile Regex once if useRegex is enabled to drastically optimize search performance
    let compiledRegex: RegExp | null = null;
    if (useRegex) {
      try {
        const flags = caseSensitive ? "g" : "gi";
        compiledRegex = new RegExp(wholeWord ? `\\b${q}\\b` : q, flags);
      } catch (e) {
        return [];
      }
    }

    // Include / Exclude filters
    const includes = includePattern
      .split(",")
      .map((p) => p.trim().replace(/\*/g, "").toLowerCase())
      .filter(Boolean);
    const excludes = (excludePattern || "node_modules,dist,build,package-lock.json")
      .split(",")
      .map((p) => p.trim().replace(/\*/g, "").toLowerCase())
      .filter(Boolean);

    Object.values(nodesById).forEach((node) => {
      if (node.type !== "file" || !node.content) return;

      const lowerName = node.name.toLowerCase();

      // Excludes filter gate
      const isExcluded = excludes.some((ex) => lowerName.includes(ex));
      if (isExcluded) return;

      // Includes filter gate
      if (includes.length > 0) {
        const isIncluded = includes.some((inc) => lowerName.includes(inc));
        if (!isIncluded) return;
      }

      const lines = node.content.split("\n");
      const hits: SearchHit[] = [];

      lines.forEach((lineText, idx) => {
        if (useRegex && compiledRegex) {
          try {
            // Reset the regex cursor position for each line check
            compiledRegex.lastIndex = 0;
            let match;
            while ((match = compiledRegex.exec(lineText)) !== null) {
              hits.push({
                lineNumber: idx + 1,
                lineText,
                matchIndex: match.index,
                matchLength: match[0].length,
              });
              if (!compiledRegex.global) break;
            }
          } catch (e) {
            // Suppress search runtime errors
          }
        } else {
          let lineToSearch = caseSensitive ? lineText : lineText.toLowerCase();
          const targetQuery = caseSensitive ? q : q.toLowerCase();
          
          let startIdx = 0;
          let matchIndex = -1;

          while ((matchIndex = lineToSearch.indexOf(targetQuery, startIdx)) !== -1) {
            // Whole word filter gate
            if (wholeWord) {
              const prevChar = lineText[matchIndex - 1] || " ";
              const nextChar = lineText[matchIndex + targetQuery.length] || " ";
              const isWordBoundary = /[^a-zA-Z0-9_]/.test(prevChar) && /[^a-zA-Z0-9_]/.test(nextChar);
              if (!isWordBoundary) {
                startIdx = matchIndex + 1;
                continue;
              }
            }

            hits.push({
              lineNumber: idx + 1,
              lineText,
              matchIndex,
              matchLength: targetQuery.length,
            });
            startIdx = matchIndex + targetQuery.length;
          }
        }
      });

      if (hits.length > 0) {
        matches.push({
          fileId: node.id,
          fileName: node.name,
          hits: hits.slice(0, 100), // Cap hits per file at 100 for safety
        });
      }
    });

    return matches.slice(0, 50); // Cap files matched at 50 for safety
  }, [nodesById, debouncedQuery, includePattern, excludePattern, caseSensitive, useRegex, wholeWord, regexError]);

  // Toggle file expand collapse state
  const toggleFile = (id: string) => {
    setExpandedFiles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Expand all by default when search completes
  useEffect(() => {
    if (resultsKey !== prevResultsKeyRef.current && results.length > 0) {
      prevResultsKeyRef.current = resultsKey;
      const initialExpanded: Record<string, boolean> = {};
      results.forEach((r) => {
        initialExpanded[r.fileId] = true;
      });
      setExpandedFiles(initialExpanded);
    }
  }, [results, resultsKey]);

  const handleHitClick = (fileId: string, lineNumber: number, column: number) => {
    openFile(fileId);
    setRevealRequest({
      fileId,
      line: lineNumber,
      column: column + 1,
      ts: Date.now(),
    });
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 select-none">
      {/* Search Header Options */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Search in Files</span>
        </div>

        {/* Input box with toggles */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-20 h-8 text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-850 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-primary rounded font-mono"
            autoFocus
          />
          <div className="absolute right-1.5 flex gap-0.5">
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={cn(
                "p-1 rounded text-[10px] transition-colors border",
                caseSensitive
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              )}
              title="Match Case (Alt+C)"
            >
              <CaseSensitive className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setWholeWord(!wholeWord)}
              className={cn(
                "p-1 rounded text-[10px] transition-colors border",
                wholeWord
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              )}
              title="Match Whole Word (Alt+W)"
            >
              <Type className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={cn(
                "p-1 rounded text-[10px] transition-colors border",
                useRegex
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              )}
              title="Use Regular Expression (Alt+R)"
            >
              <Regex className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {regexError && (
          <p className="text-[10px] text-red-500 font-mono font-medium leading-none mt-1">
            {regexError}
          </p>
        )}

        {/* Glob Filters */}
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[9px]">
          <div>
            <label className="text-slate-400 mb-0.5 block leading-none">Files to Include</label>
            <input
              type="text"
              placeholder="e.g. *.py, *.js"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              className="w-full px-1.5 py-1 text-[10px] bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-850 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary rounded"
            />
          </div>
          <div>
            <label className="text-slate-400 mb-0.5 block leading-none">Files to Exclude</label>
            <input
              type="text"
              placeholder="node_modules, dist"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              className="w-full px-1.5 py-1 text-[10px] bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-850 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary rounded"
            />
          </div>
        </div>
      </div>

      {/* Results Collapsible List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-0.5">
        {debouncedQuery.trim() === "" ? (
          <div className="text-center py-12 text-xs text-slate-400 dark:text-muted-foreground/45 italic">
            Enter a search term to find occurrences in all virtual files.
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400 dark:text-muted-foreground/45 italic">
            No occurrences found.
          </div>
        ) : (
          results.map((res) => {
            const isExpanded = !!expandedFiles[res.fileId];
            return (
              <div key={res.fileId} className="w-full text-xs font-mono select-none">
                {/* File Header */}
                <div
                  onClick={() => toggleFile(res.fileId)}
                  className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] text-slate-700 dark:text-slate-350 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  {getFileIcon(res.fileName)}
                  <span className="truncate font-semibold ml-0.5">{res.fileName}</span>
                  <span className="text-[10px] text-slate-400 dark:text-muted-foreground/50 ml-1.5">({res.hits.length})</span>
                </div>

                {/* Hits under file */}
                {isExpanded && (
                  <div className="border-l border-slate-200 dark:border-slate-800 ml-[18px] pl-1.5 py-0.5 space-y-0.5">
                    {res.hits.map((hit, idx) => {
                      const matchStart = hit.matchIndex;
                      const matchEnd = hit.matchIndex + hit.matchLength;
                      
                      const beforeMatch = hit.lineText.substring(0, matchStart);
                      const matchedText = hit.lineText.substring(matchStart, matchEnd);
                      const afterMatch = hit.lineText.substring(matchEnd);

                      return (
                        <div
                          key={idx}
                          onClick={() => handleHitClick(res.fileId, hit.lineNumber, hit.matchIndex)}
                          className="flex items-start gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors group select-text"
                        >
                          <span className="text-[10px] text-slate-400 dark:text-muted-foreground/40 font-semibold group-hover:text-primary leading-tight mt-0.5">
                            {hit.lineNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1 truncate leading-tight select-none">
                            {beforeMatch}
                            <mark className="bg-amber-250 dark:bg-amber-900/60 text-slate-900 dark:text-slate-100 rounded-sm px-0.5 border border-amber-300 dark:border-amber-700/30">
                              {matchedText}
                            </mark>
                            {afterMatch}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
