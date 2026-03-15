import { useEffect, useState } from "react";
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
  { to: "/commands", label: "Commands", icon: "◇" },
] as const;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);
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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? "→" : "←"}
          </Button>
          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
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
              aria-label={connected ? "Connected" : "Disconnected"}
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
            aria-label="Open menu"
            className="h-8 w-8"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </Button>
          <span className="text-sm font-bold">{currentPage}</span>
          <span
            aria-label={connected ? "Connected" : "Disconnected"}
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
