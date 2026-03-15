import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"

const COMMANDS = [
  { id: "overview", label: "Overview", icon: "\u25C9", path: "/" },
  { id: "sessions", label: "Sessions", icon: "\u25CE", path: "/sessions" },
  { id: "named", label: "Named Sessions", icon: "\u25C8", path: "/named-sessions" },
  { id: "agents", label: "Agents", icon: "\u25C7", path: "/agents" },
  { id: "cron", label: "Cron", icon: "\u25F7", path: "/cron" },
  { id: "tasks", label: "Tasks", icon: "\u2B17", path: "/tasks" },
  { id: "processes", label: "Processes", icon: "\u2B27", path: "/processes" },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  const execute = useCallback(
    (cmd: (typeof COMMANDS)[number]) => {
      navigate(cmd.path)
      setOpen(false)
      setQuery("")
    },
    [navigate]
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery("")
        setSelectedIndex(0)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!open) return null

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      execute(filtered[selectedIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
      setQuery("")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" />
      {/* Palette */}
      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-muted-foreground text-sm">{"\u25B8"}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Navigate to..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            aria-label="Command palette search"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
            esc
          </kbd>
        </div>
        <ul className="max-h-64 overflow-y-auto py-2" role="listbox" aria-label="Navigation commands">
          {filtered.length === 0 && (
            <li className="px-4 py-2 text-sm text-muted-foreground">No results</li>
          )}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={i === selectedIndex}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm",
                i === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50"
              )}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="w-5 text-center text-muted-foreground">{cmd.icon}</span>
              <span>{cmd.label}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            <kbd className="font-mono">{"\u2191\u2193"}</kbd> navigate {"\u00B7"} <kbd className="font-mono">{"\u23CE"}</kbd> select {"\u00B7"} <kbd className="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
