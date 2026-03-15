import type React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const TOASTER_STYLE = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
} as React.CSSProperties;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Dark-only per design spec
      theme="dark"
      className="toaster group"
      style={TOASTER_STYLE}
      {...props}
    />
  );
};

export { Toaster };
