import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, 
  UserPlus, 
  UserMinus, 
  FileText, 
  AlertTriangle, 
  Megaphone, 
  BookOpen, 
  Clock, 
  CheckCheck,
  Search,
  Filter,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  useNotificationsInfiniteQuery, 
  useMarkNotificationReadMutation, 
  useMarkAllNotificationsReadMutation 
} from "@/hooks/useAnalyticsQueries";
import { subscriptionManager } from "@/lib/subscriptionManager";
import { useQueryClient } from "@tanstack/react-query";
import { List } from "react-window";
import type { Tables } from "@/integrations/supabase/types";

interface NotificationRowExtraProps {
  items: Tables<"notification_events">[];
  handleNotifClick: (n: Tables<"notification_events">) => void;
  getNotifIcon: (t: string) => React.ReactNode;
}

interface NotificationRowProps extends NotificationRowExtraProps {
  index: number;
  style: React.CSSProperties;
}

// Virtualized Row component matching react-window 2.2.7
const NotificationRow = ({ index, style, items, handleNotifClick, getNotifIcon }: NotificationRowProps) => {
  const n = items[index];
  if (!n) return null;

  return (
    <div style={style} className="px-1">
      <DropdownMenuItem
        onClick={() => handleNotifClick(n)}
        className={cn(
          "p-2.5 flex items-start gap-3 border-b border-white/5 focus:bg-white/5 cursor-pointer transition-colors focus:text-foreground h-[66px] w-full",
          !n.read ? "bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary" : ""
        )}
      >
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex-shrink-0 mt-0.5">
          {getNotifIcon(n.event_type)}
        </div>
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground leading-tight truncate">{n.title}</p>
          <p className="text-[10px] text-muted-foreground leading-normal line-clamp-1">{n.message}</p>
          <p className="text-[8px] text-muted-foreground/50 font-mono">
            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {" · "}{new Date(n.created_at).toLocaleDateString()}
          </p>
        </div>
      </DropdownMenuItem>
    </div>
  );
};

export function NotificationCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "alert" | "join" | "system">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Fetch Infinite scroll notifications using TanStack Query
  const { 
    data: infiniteData, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage,
    isLoading 
  } = useNotificationsInfiniteQuery(user?.id);

  // Flatten infinite query pages
  const allNotifications = infiniteData
    ? infiniteData.pages.flatMap((page) => page.data)
    : [];

  const unreadCount = allNotifications.filter((n) => !n.read).length;

  // 2. Mutations with optimistic UI responses
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  const initializedRef = useRef(false);

  // 3. Centralized Realtime sync
  useEffect(() => {
    if (!user?.id) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const channelName = `notifications-${user.id}`;
    let unsub = () => {};
    
    try {
      // Subscribe to notification_events inserts
      unsub = subscriptionManager.subscribe(
        channelName,
        "notification_events",
        "INSERT",
        `user_id=eq.${user.id}`,
        (payload) => {
          // Trigger high-fidelity browser/app toast notification
          toast({
            title: payload.new.title,
            description: payload.new.message,
            variant: payload.new.event_type === "fraud_detected" ? "destructive" : "default",
          });

          // Invalidate cache to pull fresh records
          queryClient.invalidateQueries({ queryKey: ["notification-events", user.id] });
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to toast notifications:", err);
    }

    return () => {
      initializedRef.current = false;
      unsub();
    };
  }, [user, toast, queryClient]);

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    try {
      await markAllReadMutation.mutateAsync({ userId: user.id });
      toast({ title: "Inbox cleared", description: "All notification events marked as read." });
    } catch {
      toast({ title: "Operation failed", description: "Failed to mark notifications read.", variant: "destructive" });
    }
  };

  // Click handler
  const handleNotifClick = async (notif: Tables<"notification_events">) => {
    setIsOpen(false);

    if (!notif.read) {
      markReadMutation.mutate({ eventId: notif.id });
    }

    // Direct routing support based on payloads
    const payload = (notif.payload as { assignment_id?: string; classroom_id?: string }) || {};
    if (payload.assignment_id) {
      if (user?.email?.includes("teacher")) {
        navigate(`/teacher/assignment/${payload.assignment_id}`);
      } else {
        navigate(`/student/editor/${payload.assignment_id}`);
      }
    } else if (payload.classroom_id) {
      const rolePath = user?.email?.includes("teacher") ? "teacher" : "student";
      navigate(`/${rolePath}/classroom/${payload.classroom_id}`);
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "student_joined":
      case "classroom_joined":
        return <UserPlus className="h-4 w-4 text-green-400" />;
      case "student_left":
        return <UserMinus className="h-4 w-4 text-yellow-400" />;
      case "assignment_submitted":
        return <FileText className="h-4 w-4 text-blue-400" />;
      case "fraud_detected":
        return <AlertTriangle className="h-4 w-4 text-red-500 animate-bounce" />;
      case "teacher_announcements":
      case "announcement":
        return <Megaphone className="h-4 w-4 text-purple-400" />;
      case "assignment_assigned":
        return <BookOpen className="h-4 w-4 text-cyan-400" />;
      case "assignment_due":
        return <Clock className="h-4 w-4 text-orange-400" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Filter and Search computed logic
  const filteredNotifications = allNotifications.filter((n) => {
    const matchesSearch = 
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterType === "alert") {
      return n.event_type === "fraud_detected";
    }
    if (filterType === "join") {
      return n.event_type === "classroom_joined" || n.event_type === "student_joined" || n.event_type === "student_left";
    }
    if (filterType === "system") {
      return n.event_type === "teacher_announcements" || n.event_type === "assignment_due" || n.event_type === "assignment_assigned";
    }
    return true;
  });

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-1.5 rounded-lg border border-white/10 bg-background/50 hover:bg-white/5 transition-colors focus:outline-none">
          <Bell className="h-4.5 w-4.5 text-muted-foreground hover:text-foreground transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white ring-2 ring-background animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] border-white/5 bg-card/95 backdrop-blur-md shadow-2xl p-0 overflow-hidden">
        {/* Dropdown Header */}
        <DropdownMenuLabel className="p-4 flex items-center justify-between bg-white/[0.01] border-b border-white/5">
          <div className="space-y-0.5">
            <span className="font-semibold text-sm">Observation Inbox</span>
            <p className="text-[10px] text-muted-foreground font-mono">{unreadCount} unread notices</p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-7 text-[10px] text-primary hover:text-primary/90 hover:bg-primary/5 px-2 gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </DropdownMenuLabel>

        {/* Filters Ribbon */}
        <div className="px-3 py-2 border-b border-white/5 bg-black/10 space-y-2">
          {/* Search bar */}
          <div className="relative font-mono">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Filter inbox..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-white/10 rounded px-2.5 pl-7 py-1 text-[10px] text-foreground focus:outline-none focus:border-primary font-sans"
            />
          </div>

          {/* Type selectors */}
          <div className="flex gap-1.5 text-[9px] font-mono">
            {(["all", "alert", "join", "system"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "px-2 py-0.5 rounded border capitalize transition-all",
                  filterType === type 
                    ? "border-primary/45 bg-primary/10 text-primary" 
                    : "border-white/5 bg-white/5 text-muted-foreground hover:text-foreground"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable feed area */}
        <ScrollArea className="h-80">
          <div className="py-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-[10px] text-muted-foreground font-mono">Syncing updates...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <Bell className="h-8 w-8 text-muted-foreground/20" />
                <p className="text-[10px] text-muted-foreground font-mono">Inbox is fully resolved.</p>
              </div>
            ) : (
              <div className="flex flex-col w-full">
                <List<NotificationRowExtraProps>
                  rowCount={filteredNotifications.length}
                  rowHeight={68}
                  style={{ height: 260, width: "100%" }}
                  rowComponent={NotificationRow}
                  rowProps={{
                    items: filteredNotifications,
                    handleNotifClick,
                    getNotifIcon
                  }}
                />

                {/* Infinite scroll loader button */}
                {hasNextPage && (
                  <div className="p-2 border-t border-white/5 text-center bg-black/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="text-[9px] font-mono h-6 text-muted-foreground hover:text-foreground w-full"
                    >
                      {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Load Older Notices"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
