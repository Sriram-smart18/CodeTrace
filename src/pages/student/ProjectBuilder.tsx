import { useState, useCallback, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  FilePlus,
  FolderPlus,
  Play,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileCode,
  FileText as FileTextIcon,
  Folder,
  FolderOpen,
  Terminal,
  Eye,
  Send,
  X,
  Loader2,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Types
interface ProjectFile {
  name: string;
  content: string;
  language: string;
}

interface ProjectFolder {
  name: string;
  children: string[]; // file paths
  expanded: boolean;
}

// Default project template
const DEFAULT_FILES: Record<string, ProjectFile> = {
  "index.html": {
    name: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <h1>Hello, CodeTrace!</h1>
    <p>Start building your web application.</p>
    <button id="btn">Click me</button>
  </div>
  <script src="script.js"></script>
</body>
</html>`,
    language: "html",
  },
  "style.css": {
    name: "style.css",
    content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

#app {
  text-align: center;
  padding: 2rem;
}

h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 0.5rem;
}

p {
  color: #94a3b8;
  margin-bottom: 1.5rem;
}

button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: #2563eb;
}`,
    language: "css",
  },
  "script.js": {
    name: "script.js",
    content: `// Your JavaScript code here
document.getElementById('btn').addEventListener('click', () => {
  const app = document.getElementById('app');
  const p = document.createElement('p');
  p.textContent = 'Button clicked at ' + new Date().toLocaleTimeString();
  p.style.color = '#a78bfa';
  app.appendChild(p);
});

console.log('Script loaded successfully!');`,
    language: "javascript",
  },
};

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
      return <FileCode className="h-4 w-4 text-orange-400" />;
    case "css":
      return <FileCode className="h-4 w-4 text-blue-400" />;
    case "js":
    case "ts":
      return <FileCode className="h-4 w-4 text-yellow-400" />;
    case "json":
      return <FileCode className="h-4 w-4 text-green-400" />;
    default:
      return <FileTextIcon className="h-4 w-4 text-muted-foreground" />;
  }
}

function getMonacoLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html": return "html";
    case "css": return "css";
    case "js": return "javascript";
    case "ts": return "typescript";
    case "json": return "json";
    case "md": return "markdown";
    case "py": return "python";
    case "java": return "java";
    case "cpp": case "c": return "cpp";
    default: return "plaintext";
  }
}

export default function ProjectBuilder() {
  const { toast } = useToast();
  const [files, setFiles] = useState<Record<string, ProjectFile>>({ ...DEFAULT_FILES });
  const [activeFile, setActiveFile] = useState("index.html");
  const [openTabs, setOpenTabs] = useState<string[]>(["index.html", "style.css", "script.js"]);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["[system] Project Builder initialized.", "[system] Ready to code."]);
  const [showPreview, setShowPreview] = useState(true);
  const [newFileName, setNewFileName] = useState("");
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [folders, setFolders] = useState<Record<string, ProjectFolder>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build preview HTML by combining all files
  const previewHtml = useMemo(() => {
    const htmlFile = files["index.html"];
    if (!htmlFile) return "<p>No index.html found</p>";

    let html = htmlFile.content;

    // Inline CSS files
    Object.entries(files).forEach(([name, file]) => {
      if (name.endsWith(".css")) {
        const linkRegex = new RegExp(`<link[^>]*href=["']${name}["'][^>]*>`, "gi");
        html = html.replace(linkRegex, `<style>${file.content}</style>`);
      }
    });

    // Inline JS files
    Object.entries(files).forEach(([name, file]) => {
      if (name.endsWith(".js")) {
        const scriptRegex = new RegExp(`<script[^>]*src=["']${name}["'][^>]*></script>`, "gi");
        html = html.replace(
          scriptRegex,
          `<script>
try {
  const __origLog = console.log;
  console.log = (...args) => {
    __origLog(...args);
    window.parent.postMessage({ type: 'console', data: args.map(String).join(' ') }, '*');
  };
  console.error = (...args) => {
    window.parent.postMessage({ type: 'console', data: 'ERROR: ' + args.map(String).join(' ') }, '*');
  };
  ${file.content}
} catch(e) {
  window.parent.postMessage({ type: 'console', data: 'ERROR: ' + e.message }, '*');
}
</script>`
        );
      }
    });

    return html;
  }, [files]);

  // Listen for console messages from iframe
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.data?.type === "console") {
      const timestamp = new Date().toLocaleTimeString();
      setTerminalLogs((prev) => [...prev, `[${timestamp}] ${e.data.data}`]);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const updateFileContent = (filename: string, content: string) => {
    setFiles((prev) => ({
      ...prev,
      [filename]: { ...prev[filename], content },
    }));
  };

  const createFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    if (files[name]) {
      toast({ title: "File exists", description: `${name} already exists.`, variant: "destructive" });
      return;
    }
    setFiles((prev) => ({
      ...prev,
      [name]: { name, content: "", language: getMonacoLanguage(name) },
    }));
    setOpenTabs((prev) => [...prev, name]);
    setActiveFile(name);
    setNewFileName("");
    setNewFileDialogOpen(false);
    logTerminal(`Created file: ${name}`);
  };

  const deleteFile = (filename: string) => {
    if (Object.keys(files).length <= 1) {
      toast({ title: "Cannot delete", description: "Project must have at least one file.", variant: "destructive" });
      return;
    }
    const newFiles = { ...files };
    delete newFiles[filename];
    setFiles(newFiles);
    setOpenTabs((prev) => prev.filter((t) => t !== filename));
    if (activeFile === filename) {
      setActiveFile(Object.keys(newFiles)[0]);
    }
    logTerminal(`Deleted file: ${filename}`);
  };

  const closeTab = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((t) => t !== filename);
    setOpenTabs(newTabs);
    if (activeFile === filename && newTabs.length > 0) {
      setActiveFile(newTabs[newTabs.length - 1]);
    }
  };

  const openFile = (filename: string) => {
    setActiveFile(filename);
    if (!openTabs.includes(filename)) {
      setOpenTabs((prev) => [...prev, filename]);
    }
  };

  const logTerminal = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  const handleRun = () => {
    logTerminal("Building project...");
    logTerminal("Compiling HTML, CSS, JS...");
    setShowPreview(true);
    setTimeout(() => logTerminal("Build complete. Preview updated."), 300);
  };

  const handleSubmit = () => {
    const fileList = Object.keys(files).join(", ");
    logTerminal(`Submitting project: ${fileList}`);
    toast({ title: "Project submitted", description: `${Object.keys(files).length} files submitted for evaluation.` });
  };

  const sortedFiles = Object.keys(files).sort((a, b) => {
    // Sort: HTML first, then CSS, then JS, then rest
    const order = (f: string) => {
      if (f.endsWith(".html")) return 0;
      if (f.endsWith(".css")) return 1;
      if (f.endsWith(".js")) return 2;
      return 3;
    };
    return order(a) - order(b) || a.localeCompare(b);
  });

  const currentFile = files[activeFile];

  return (
    <DashboardLayout role="student">
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-card">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Project Builder</span>
            <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  <FilePlus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>New File</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    placeholder="filename.ext"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createFile()}
                  />
                  <Button onClick={createFile}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowPreview(!showPreview)} className="h-7">
              <Eye className="h-3.5 w-3.5 mr-1" />
              {showPreview ? "Hide" : "Show"} Preview
            </Button>
            <Button size="sm" variant="outline" onClick={handleRun} className="h-7">
              <Play className="h-3.5 w-3.5 mr-1" /> Run
            </Button>
            <Button size="sm" onClick={handleSubmit} className="h-7">
              <Send className="h-3.5 w-3.5 mr-1" /> Submit
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal">
            {/* File Explorer */}
            <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
              <div className="h-full flex flex-col bg-sidebar">
                <div className="px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/60 font-medium border-b border-sidebar-border">
                  Explorer
                </div>
                <ScrollArea className="flex-1">
                  <div className="py-1">
                    {sortedFiles.map((filename) => (
                      <ContextMenu key={filename}>
                        <ContextMenuTrigger>
                          <button
                            onClick={() => openFile(filename)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-sidebar-accent transition-colors",
                              activeFile === filename && "bg-sidebar-accent text-sidebar-primary font-medium"
                            )}
                          >
                            {getFileIcon(filename)}
                            <span className="truncate">{filename}</span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => deleteFile(filename)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Editor + Preview */}
            <ResizablePanel defaultSize={showPreview ? 50 : 82}>
              <div className="h-full flex flex-col">
                {/* Tabs */}
                <div className="flex items-center bg-sidebar border-b border-sidebar-border overflow-x-auto">
                  {openTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFile(tab)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-sidebar-border whitespace-nowrap transition-colors",
                        activeFile === tab
                          ? "bg-background text-foreground"
                          : "bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      {getFileIcon(tab)}
                      <span>{tab}</span>
                      <span
                        onClick={(e) => closeTab(tab, e)}
                        className="ml-1 rounded hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>

                {/* Monaco Editor */}
                <div className="flex-1 min-h-0">
                  {currentFile ? (
                    <Editor
                      height="100%"
                      language={getMonacoLanguage(activeFile)}
                      value={currentFile.content}
                      onChange={(val) => updateFileContent(activeFile, val || "")}
                      theme="vs-dark"
                      loading={
                        <div className="flex items-center justify-center h-full w-full bg-[#1e1e1e]">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      }
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', monospace",
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 8 },
                        renderWhitespace: "selection",
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Select a file to edit
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>

            {/* Live Preview */}
            {showPreview && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={32} minSize={20}>
                  <div className="h-full flex flex-col">
                    <div className="px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b bg-card flex items-center gap-1.5">
                      <Eye className="h-3 w-3" /> Live Preview
                    </div>
                    <div className="flex-1 bg-white">
                      <iframe
                        key={previewHtml}
                        srcDoc={previewHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title="Project Preview"
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>

        {/* Terminal */}
        <div className="h-36 border-t bg-sidebar flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 border-b border-sidebar-border">
            <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 uppercase tracking-wider font-medium">
              <Terminal className="h-3 w-3" /> Terminal
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-xs text-sidebar-foreground/60"
              onClick={() => setTerminalLogs([])}
            >
              Clear
            </Button>
          </div>
          <ScrollArea className="flex-1 px-3 py-1">
            <div className="font-mono text-xs space-y-0.5">
              {terminalLogs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-sidebar-foreground/80",
                    log.includes("ERROR") && "text-destructive",
                    log.includes("[system]") && "text-primary"
                  )}
                >
                  {log}
                </div>
              ))}
              {terminalLogs.length === 0 && (
                <span className="text-sidebar-foreground/40">Terminal ready.</span>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </DashboardLayout>
  );
}
