interface EmptyStateProps {
  loading?: boolean
  icon?: string
  title: string
  description?: string
}

export function EmptyState({ loading, icon, title, description }: EmptyStateProps) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2">
      {icon && <span className="text-3xl text-muted-foreground/50">{icon}</span>}
      <p className="text-muted-foreground">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground/70">{description}</p>
      )}
    </div>
  )
}
