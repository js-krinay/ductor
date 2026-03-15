import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDashboardStore } from "@/store/dashboard";
import { useAuthStore } from "@/store/auth";
import ConnectionBanner from "@/components/ConnectionBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { useHotkeys } from "@/hooks/useHotkeys";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: "\u25C9" },
  { to: "/sessions", label: "Sessions", icon: "\u25CE" },
  { to: "/named-sessions", label: "Named", icon: "\u25C8" },
  { to: "/agents", label: "Agents", icon: "\u25C6" },
  { to: "/cron", label: "Cron", icon: "\u25F7" },
  { to: "/tasks", label: "Tasks", icon: "\u25E7" },
  { to: "/processes", label: "Processes", icon: "\u25EB" },
] as const;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }
  const connected = useDashboardStore((s) => s.connected);
  const clearToken = useAuthStore((s) => s.clearToken);
  const navigate = useNavigate();

  const hotkeys = useMemo(
    () => [
      { combo: { key: "1" }, handler: () => navigate("/") },
      { combo: { key: "2" }, handler: () => navigate("/sessions") },
      { combo: { key: "3" }, handler: () => navigate("/named-sessions") },
      { combo: { key: "4" }, handler: () => navigate("/agents") },
      { combo: { key: "5" }, handler: () => navigate("/cron") },
      { combo: { key: "6" }, handler: () => navigate("/tasks") },
      { combo: { key: "7" }, handler: () => navigate("/processes") },
    ],
    [navigate],
  );
  useHotkeys(hotkeys);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-card transition-all",
          collapsed ? "w-14" : "w-48",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <span
            className={cn(
              "overflow-hidden text-sm font-bold whitespace-nowrap transition-all duration-200",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
            )}
          >
            klir
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? "\u2192" : "\u2190"}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )
              }
            >
              <span className="w-5 shrink-0 text-center">{icon}</span>
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap transition-all duration-200",
                  collapsed ? "w-0 opacity-0" : "w-28 opacity-100",
                )}
              >
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-success" : "bg-destructive",
              )}
              aria-label={connected ? "Connected" : "Disconnected"}
            />
            <span
              className={cn(
                "overflow-hidden text-xs text-muted-foreground whitespace-nowrap transition-all duration-200",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
              )}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
            <kbd
              className={cn(
                "ml-auto overflow-hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono whitespace-nowrap transition-all duration-200",
                collapsed ? "w-0 border-0 px-0 opacity-0" : "w-auto opacity-100",
              )}
            >
              {"\u2318K"}
            </kbd>
          </div>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn("mt-2 text-xs", collapsed ? "h-7 w-7" : "w-full")}
            onClick={clearToken}
          >
            <span className="shrink-0">{"\u23FB"}</span>
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-200",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
              )}
            >
              Logout
            </span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <ConnectionBanner />
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
