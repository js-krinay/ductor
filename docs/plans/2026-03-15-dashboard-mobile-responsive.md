# Dashboard Mobile Responsive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the klir Mission Control dashboard fully usable on mobile devices (320px–768px viewports) while preserving the existing desktop experience.

**Architecture:** Convert the fixed sidebar into a mobile drawer pattern (hidden by default on `<md`, toggle via hamburger). Replace table views with stacked card layouts on mobile using responsive breakpoints. Adjust typography, padding, and filter controls for touch targets and small screens.

**Tech Stack:** Tailwind CSS 4.x responsive utilities (`sm:`, `md:`, `lg:`), React state for drawer toggle, existing shadcn/ui primitives. No new dependencies.

---

### Task 1: Mobile sidebar drawer in Layout

**Files:**
- Modify: `klir/dashboard/src/components/Layout.tsx`

The sidebar is always visible at 56–192px width. On mobile (<768px), it should be a full-height overlay drawer that slides in from the left, toggled by a hamburger button in a top header bar. On `md:` and above, the existing collapsible sidebar behavior is preserved unchanged.

**Step 1: Add mobile state and overlay logic to Layout**

Replace the entire `Layout.tsx` with:

```tsx
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDashboardStore } from "@/store/dashboard";
import { useAuthStore } from "@/store/auth";
import ConnectionBanner from "@/components/ConnectionBanner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: "◉" },
  { to: "/sessions", label: "Sessions", icon: "◎" },
  { to: "/named-sessions", label: "Named", icon: "◈" },
  { to: "/agents", label: "Agents", icon: "◆" },
  { to: "/cron", label: "Cron", icon: "◷" },
  { to: "/tasks", label: "Tasks", icon: "◧" },
  { to: "/processes", label: "Processes", icon: "◫" },
] as const;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const connected = useDashboardStore((s) => s.connected);
  const clearToken = useAuthStore((s) => s.clearToken);
  const location = useLocation();

  // Close mobile drawer on navigation
  const handleNavClick = () => setMobileOpen(false);

  // Find current page label for mobile header
  const currentPage =
    NAV_ITEMS.find(
      (item) =>
        item.to === location.pathname ||
        (item.to !== "/" && location.pathname.startsWith(item.to)),
    )?.label ?? "Overview";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — overlay on mobile, static on desktop */}
      <aside
        className={cn(
          // Shared
          "flex flex-col border-r bg-card transition-all",
          // Mobile: fixed overlay drawer
          "fixed inset-y-0 left-0 z-50 w-48 md:relative md:z-auto",
          // Mobile: slide in/out
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          // Desktop: collapsible width
          collapsed ? "md:w-14" : "md:w-48",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <span className={cn("text-sm font-bold", collapsed && "md:hidden")}>
            klir
          </span>
          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto hidden h-7 w-7 md:inline-flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "→" : "←"}
          </Button>
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            ✕
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )
              }
            >
              <span className="w-5 text-center">{icon}</span>
              <span className={cn(collapsed && "md:hidden")}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-green-500" : "bg-red-500",
              )}
            />
            <span
              className={cn(
                "text-xs text-muted-foreground",
                collapsed && "md:hidden",
              )}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "mt-2 w-full text-xs",
              collapsed && "md:hidden",
            )}
            onClick={clearToken}
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </Button>
          <span className="text-sm font-bold">{currentPage}</span>
          <span
            className={cn(
              "ml-auto h-2 w-2 rounded-full",
              connected ? "bg-green-500" : "bg-red-500",
            )}
          />
        </div>

        <ConnectionBanner />
        <div className="flex-1 overflow-auto p-3 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

Key changes:
- Sidebar becomes `fixed` + `z-50` with `translate-x` on mobile, `relative` on `md:`
- Backdrop overlay closes drawer on tap
- Mobile top bar with hamburger `☰`, current page name, and connection dot
- Nav clicks auto-close the drawer
- Content padding reduces from `p-6` to `p-3` on mobile
- Desktop collapse behavior is preserved via `md:` prefixes
- Labels in collapsed mode use `md:hidden` instead of conditional render (so they always show on mobile drawer)

**Step 2: Verify mobile drawer**

Run: `cd klir/dashboard && npx vite --host`

Open on mobile viewport (320px) in browser dev tools:
- Sidebar should be hidden initially
- Hamburger `☰` button visible in top bar
- Tapping hamburger opens drawer with dark backdrop
- Tapping a nav link closes drawer and navigates
- Tapping backdrop closes drawer
- On desktop (≥768px), sidebar works as before (collapsible)

**Step 3: Commit**

```bash
git add klir/dashboard/src/components/Layout.tsx
git commit -m "feat(dashboard): Add mobile drawer navigation

Sidebar becomes a slide-out drawer on <768px viewports with
hamburger toggle, backdrop overlay, and auto-close on navigation.
Desktop collapsible sidebar is preserved unchanged."
```

---

### Task 2: Responsive page titles and view spacing

**Files:**
- Modify: `klir/dashboard/src/views/Overview.tsx`
- Modify: `klir/dashboard/src/views/Sessions.tsx`
- Modify: `klir/dashboard/src/views/NamedSessions.tsx`
- Modify: `klir/dashboard/src/views/Agents.tsx`
- Modify: `klir/dashboard/src/views/Cron.tsx`
- Modify: `klir/dashboard/src/views/Tasks.tsx`
- Modify: `klir/dashboard/src/views/Processes.tsx`
- Modify: `klir/dashboard/src/views/MessageThread.tsx`

Since the mobile top bar (Task 1) already shows the current page name, the `<h1>` titles are redundant on mobile. Hide them on small screens and tighten vertical spacing.

**Step 1: Update all view headers**

In every view file, change the page title `<h1>` from:

```tsx
<h1 className="text-2xl font-bold">...</h1>
```

to:

```tsx
<h1 className="hidden text-2xl font-bold md:block">...</h1>
```

And change root container `space-y-6` / `space-y-4` to:

```tsx
<div className="space-y-3 md:space-y-6">  {/* or md:space-y-4 if it was space-y-4 */}
```

Apply to all 8 view files. The `MessageThread.tsx` title uses `mb-4`, change to `mb-2 md:mb-4`.

Also in `Overview.tsx`, change `StatCard`'s value from `text-3xl` to `text-2xl md:text-3xl`:

```tsx
<p className="text-2xl font-bold md:text-3xl">{value}</p>
```

**Step 2: Verify spacing**

Run dev server, check each view at 375px viewport:
- No `<h1>` visible (already shown in mobile top bar from Task 1)
- Tighter vertical spacing between sections
- Stat cards show slightly smaller numbers

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/
git commit -m "feat(dashboard): Responsive titles and spacing

Hide page titles on mobile (shown in top bar), tighten vertical
spacing, and scale stat card numbers for small viewports."
```

---

### Task 3: Mobile card layout for Sessions table

**Files:**
- Modify: `klir/dashboard/src/views/Sessions.tsx`

The Sessions table has 8 columns and is unusable on mobile. Replace with a stacked card layout on `<md` viewports while keeping the sortable table on desktop.

**Step 1: Add mobile card layout**

Replace the Sessions view content (the `<Table>` block and its parent) with a layout that conditionally renders cards on mobile and table on desktop:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";

type SortKey = "last_active" | "total_cost_usd" | "total_tokens" | "message_count";

export default function Sessions() {
  const sessions = useDashboardStore((s) => s.sessions);
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("last_active");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [sessions, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active sessions
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Sessions</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {sorted.map((s) => (
          <Card
            key={s.chat_id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigate(`/sessions/${s.chat_id}`)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{s.chat_id}</span>
                <Badge variant="outline">{s.provider}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{s.model}</span>
                {s.topic_name && <span>· {s.topic_name}</span>}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{s.message_count} msgs</span>
                <span>{formatCost(s.total_cost_usd)}</span>
                <span>{formatTokens(s.total_tokens)}</span>
                <span className="ml-auto">{formatRelativeTime(s.last_active)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: sortable table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chat</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("message_count")}>
                Messages
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("total_cost_usd")}>
                Cost
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("total_tokens")}>
                Tokens
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("last_active")}>
                Last Active
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow
                key={s.chat_id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => navigate(`/sessions/${s.chat_id}`)}
              >
                <TableCell className="font-mono text-sm">{s.chat_id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.provider}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.model}</TableCell>
                <TableCell>{s.topic_name ?? "—"}</TableCell>
                <TableCell>{s.message_count}</TableCell>
                <TableCell>{formatCost(s.total_cost_usd)}</TableCell>
                <TableCell>{formatTokens(s.total_tokens)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(s.last_active)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Verify mobile cards**

On 375px viewport:
- Sessions render as stacked cards with chat ID, provider badge, model, topic, stats row
- Tapping a card navigates to message thread
- On desktop (≥768px), original sortable table is unchanged

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Sessions.tsx
git commit -m "feat(dashboard): Mobile card layout for Sessions view

Show stacked cards with key session info on <768px viewports.
Desktop sortable table is preserved unchanged."
```

---

### Task 4: Mobile card layout for Cron table

**Files:**
- Modify: `klir/dashboard/src/views/Cron.tsx`

Same pattern as Sessions: cards on mobile, table on desktop. The expandable run history becomes a collapsible section inside each card.

**Step 1: Add mobile card layout**

Replace the Cron view with:

```tsx
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDashboardStore } from "@/store/dashboard";
import { toggleCronJob, fetchCronHistory } from "@/api/client";
import type { CronRunEntry } from "@/types/api";
import { formatDuration, formatRelativeTime } from "@/lib/format";

export default function Cron() {
  const cronJobs = useDashboardStore((s) => s.cronJobs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<CronRunEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function handleToggle(jobId: string, enabled: boolean) {
    try {
      await toggleCronJob(jobId, enabled);
    } catch (err) {
      toast.error(`Failed to toggle job: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleExpand(jobId: string) {
    if (expandedId === jobId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(jobId);
    setRunHistory([]);
    setHistoryError(null);
    setLoadingHistory(true);
    try {
      const res = await fetchCronHistory(jobId);
      setRunHistory(res.runs);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  }

  if (cronJobs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No cron jobs configured
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Cron Jobs</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {cronJobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span
                  className="font-medium cursor-pointer"
                  onClick={() => handleExpand(job.id)}
                >
                  {job.title}
                </span>
                <Switch
                  checked={job.enabled}
                  onCheckedChange={(v) => handleToggle(job.id, v)}
                />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{job.schedule}</span>
                <Badge variant="outline">{job.provider}</Badge>
                {job.consecutive_errors > 0 && (
                  <Badge variant="destructive">{job.consecutive_errors} errors</Badge>
                )}
              </div>
              {job.last_duration_ms != null && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last: {formatDuration(job.last_duration_ms / 1000)}
                </div>
              )}

              {/* Expanded run history */}
              {expandedId === job.id && (
                <div className="mt-3 rounded bg-accent/20 p-2">
                  {loadingHistory ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : historyError ? (
                    <p className="text-xs text-destructive">{historyError}</p>
                  ) : runHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No run history</p>
                  ) : (
                    <div className="space-y-2">
                      {runHistory.map((run) => (
                        <div key={run.ts} className="flex items-center gap-2 text-xs">
                          <Badge
                            variant={run.status === "success" ? "default" : "destructive"}
                          >
                            {run.status}
                          </Badge>
                          <span>{formatRelativeTime(run.ts)}</span>
                          <span>{formatDuration(run.duration_ms / 1000)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table (unchanged) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last Duration</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead>Provider</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cronJobs.map((job) => (
              <Fragment key={job.id}>
                <TableRow
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => handleExpand(job.id)}
                >
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="font-mono text-sm">{job.schedule}</TableCell>
                  <TableCell>
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(v) => handleToggle(job.id, v)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell>
                    {job.last_duration_ms != null
                      ? formatDuration(job.last_duration_ms / 1000)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {job.consecutive_errors > 0 ? (
                      <Badge variant="destructive">{job.consecutive_errors}</Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{job.provider}</Badge>
                  </TableCell>
                </TableRow>

                {expandedId === job.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-accent/20 p-4">
                      {loadingHistory ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                      ) : historyError ? (
                        <p className="text-sm text-destructive">{historyError}</p>
                      ) : runHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No run history</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Summary</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {runHistory.map((run) => (
                              <TableRow key={run.ts}>
                                <TableCell className="text-sm">
                                  {formatRelativeTime(run.ts)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={run.status === "success" ? "default" : "destructive"}
                                  >
                                    {run.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatDuration(run.duration_ms / 1000)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {run.error ?? run.summary}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

On 375px viewport:
- Cron jobs render as cards with title, schedule, toggle switch, provider badge
- Tapping title expands run history as inline list (not nested table)
- Desktop table unchanged

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Cron.tsx
git commit -m "feat(dashboard): Mobile card layout for Cron view

Show cron jobs as stacked cards on <768px with inline run
history expansion. Desktop table preserved."
```

---

### Task 5: Mobile card layout for Tasks table

**Files:**
- Modify: `klir/dashboard/src/views/Tasks.tsx`

**Step 1: Add mobile card layout**

Replace the Tasks view with:

```tsx
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { cancelTask } from "@/api/client";
import { formatDuration } from "@/lib/format";

export default function Tasks() {
  const tasks = useDashboardStore((s) => s.tasks);

  async function handleCancel(taskId: string) {
    try {
      await cancelTask(taskId);
    } catch (err) {
      toast.error(`Failed to cancel task: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No tasks
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === "running" ? "default" : s === "done" ? "secondary" : "destructive";

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Tasks</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {tasks.map((t) => (
          <Card key={t.task_id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t.name}</span>
                <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t.parent_agent}</span>
                <Badge variant="outline">{t.provider}</Badge>
                <span>{formatDuration(t.elapsed_seconds)}</span>
              </div>
              {t.prompt_preview && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {t.prompt_preview}
                </p>
              )}
              {t.status === "running" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => handleCancel(t.task_id)}
                >
                  Cancel
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table (unchanged) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Elapsed</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.task_id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.parent_agent}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.provider}</Badge>
                </TableCell>
                <TableCell>{formatDuration(t.elapsed_seconds)}</TableCell>
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                  {t.prompt_preview}
                </TableCell>
                <TableCell>
                  {t.status === "running" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancel(t.task_id)}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

On 375px: tasks as cards with name, status badge, agent/provider/elapsed row, truncated prompt, full-width cancel button for running tasks. Desktop table unchanged.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Tasks.tsx
git commit -m "feat(dashboard): Mobile card layout for Tasks view"
```

---

### Task 6: Mobile card layout for Processes table

**Files:**
- Modify: `klir/dashboard/src/views/Processes.tsx`

**Step 1: Add mobile card layout**

Replace the Processes view with:

```tsx
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { abortChat } from "@/api/client";
import { formatRelativeTime } from "@/lib/format";

export default function Processes() {
  const processes = useDashboardStore((s) => s.processes);

  async function handleAbort(chatId: number) {
    try {
      await abortChat(chatId);
    } catch (err) {
      toast.error(`Failed to abort: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (processes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active processes
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Processes</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {processes.map((p) => (
          <Card key={p.pid}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.label}</span>
                <span className="font-mono text-xs text-muted-foreground">PID {p.pid}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{p.chat_id}</span>
                <span>{formatRelativeTime(p.registered_at)}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="mt-2 w-full"
                onClick={() => handleAbort(p.chat_id)}
              >
                Abort
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table (unchanged) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PID</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Chat</TableHead>
              <TableHead>Started</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.map((p) => (
              <TableRow key={p.pid}>
                <TableCell className="font-mono">{p.pid}</TableCell>
                <TableCell>{p.label}</TableCell>
                <TableCell className="font-mono text-sm">{p.chat_id}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(p.registered_at)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleAbort(p.chat_id)}
                  >
                    Abort
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

On 375px: processes as cards with label, PID, chat ID, time, full-width abort button. Desktop table unchanged.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Processes.tsx
git commit -m "feat(dashboard): Mobile card layout for Processes view"
```

---

### Task 7: Responsive NamedSessions filter buttons

**Files:**
- Modify: `klir/dashboard/src/views/NamedSessions.tsx`

The filter buttons sit inline with the title. On mobile, with the title hidden, the filters should stack or wrap.

**Step 1: Update filter layout**

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";

const STATUSES = ["all", "running", "idle", "ended"] as const;

export default function NamedSessions() {
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all" ? namedSessions : namedSessions.filter((ns) => ns.status === filter);

  if (namedSessions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No named sessions
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hidden text-2xl font-bold md:block">Named Sessions</h1>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ns) => (
          <Card key={ns.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ns.name}</CardTitle>
                <StatusBadge status={ns.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ns.provider}</Badge>
                <span className="text-muted-foreground">{ns.model}</span>
              </div>
              <p className="text-muted-foreground line-clamp-2">{ns.prompt_preview}</p>
              <p className="text-xs text-muted-foreground">{ns.message_count} messages</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "running" ? "default" : status === "ended" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
```

Changes:
- Title/filter container becomes `flex-col gap-2 sm:flex-row` so filters appear below (or alone when title is hidden on mobile)
- Grid gap reduced to `gap-3` for tighter mobile cards

**Step 2: Verify**

On 375px: filter buttons span full width at top (no title), cards are 1-column. On tablet: 2-column. Desktop: title + filters inline, 3-column grid.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/NamedSessions.tsx
git commit -m "feat(dashboard): Responsive NamedSessions filters

Filters stack vertically on mobile, inline with title on desktop.
Grid gap tightened for small screens."
```

---

### Task 8: Mobile-optimized MessageThread view

**Files:**
- Modify: `klir/dashboard/src/views/MessageThread.tsx`

The chat thread is mostly fine but needs tighter padding and the title hidden.

**Step 1: Update MessageThread layout**

Change the title:
```tsx
<h1 className="mb-2 hidden text-2xl font-bold md:mb-4 md:block">Chat {chatId}</h1>
```

Change message bubble padding from `p-4` to `p-3 md:p-4`:
```tsx
<div className={`rounded-lg p-3 md:p-4 ${isOutbound ? "bg-card" : "bg-accent/30"}`}>
```

Change the streaming response blocks similarly:
```tsx
<div className="rounded-lg bg-card p-3 md:p-4">
```
```tsx
<div className="rounded-lg bg-card p-3 text-sm text-muted-foreground animate-pulse md:p-4">
```

Change the input form gap:
```tsx
<form ... className="flex gap-2 border-t pt-3 md:pt-4">
```

**Step 2: Verify**

On 375px: messages fill width with tighter padding, no title (shown in top bar), input bar has less top padding. Desktop unchanged.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/MessageThread.tsx
git commit -m "feat(dashboard): Mobile-optimized MessageThread spacing"
```

---

### Task 9: Responsive Overview stat cards and config section

**Files:**
- Modify: `klir/dashboard/src/views/Overview.tsx`

**Step 1: Update Overview**

```tsx
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";

export default function Overview() {
  const sessions = useDashboardStore((s) => s.sessions);
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const agents = useDashboardStore((s) => s.agents);
  const tasks = useDashboardStore((s) => s.tasks);
  const processes = useDashboardStore((s) => s.processes);
  const observers = useDashboardStore((s) => s.observers);
  const config = useDashboardStore((s) => s.config);

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="hidden text-2xl font-bold md:block">Mission Control</h1>

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Link to="/sessions">
          <StatCard title="Active Sessions" value={sessions.length} />
        </Link>
        <Link to="/named-sessions">
          <StatCard
            title="Named Sessions"
            value={namedSessions.filter((ns) => ns.status !== "ended").length}
          />
        </Link>
        <Link to="/tasks">
          <StatCard
            title="Running Tasks"
            value={tasks.filter((t) => t.status === "running").length}
          />
        </Link>
        <Link to="/processes">
          <StatCard title="Active Processes" value={processes.length} />
        </Link>
      </div>

      {/* Observers */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">Observers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(observers).map(([name, status]) => (
              <Badge
                key={name}
                variant={status ? "default" : "secondary"}
                className="text-xs"
              >
                {name}: {status ? "running" : "stopped"}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      {agents.length > 0 && (
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <Badge
                  key={a.name}
                  variant={a.status === "running" ? "default" : "destructive"}
                >
                  {a.name}: {a.status}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config summary */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {Object.entries(config).map(([key, value]) => (
              <span key={key}>
                {key}: <span className="text-foreground">{String(value)}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
      <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <p className="text-2xl font-bold md:text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
```

Changes:
- Stat cards: always 2 columns (even on mobile), 4 on `lg:`. Removed `sm:grid-cols-2` since `grid-cols-2` is the base now.
- StatCard padding reduced on mobile (`p-3`), title text smaller (`text-xs`), value `text-2xl`
- Card headers tighter on mobile
- Config section uses `gap-x-4 gap-y-1` for better wrapping

**Step 2: Verify**

On 375px: 2-column stat grid with compact cards, tight section spacing. Observer badges wrap nicely. Desktop: 4-column stats, original sizing.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Overview.tsx
git commit -m "feat(dashboard): Responsive Overview with compact stat cards

2-column stat grid on mobile with tighter card padding,
4-column on desktop. Section headings and spacing scaled."
```

---

### Task 10: Update Agents view with responsive spacing

**Files:**
- Modify: `klir/dashboard/src/views/Agents.tsx`

**Step 1: Update Agents view**

Minor changes — just the hidden title and tighter grid:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatDuration } from "@/lib/format";

export default function Agents() {
  const agents = useDashboardStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No agents configured
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Agents</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Card key={a.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{a.name}</CardTitle>
                <Badge variant={a.status === "running" ? "default" : "destructive"}>
                  {a.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span>{formatDuration(a.uptime_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restarts</span>
                <span>{a.restart_count}</span>
              </div>
              {a.last_crash_error && (
                <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {a.last_crash_error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Changes: hidden title, `gap-3` grid, `space-y-3 md:space-y-4`.

**Step 2: Verify**

On 375px: single-column agent cards. Desktop: 2–3 column grid with title.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Agents.tsx
git commit -m "feat(dashboard): Responsive Agents view spacing"
```

---

### Task 11: Build verification

**Files:** None (verification only)

**Step 1: Run TypeScript check**

```bash
cd klir/dashboard && npx tsc -b --noEmit
```

Expected: no errors.

**Step 2: Run lint**

```bash
cd klir/dashboard && npx eslint .
```

Expected: no errors.

**Step 3: Run production build**

```bash
cd klir/dashboard && npx vite build
```

Expected: successful build output.

**Step 4: Commit any fixes if needed**

If any lint/type errors, fix them and commit:

```bash
git add klir/dashboard/
git commit -m "fix(dashboard): Resolve lint/type issues from mobile responsive changes"
```
