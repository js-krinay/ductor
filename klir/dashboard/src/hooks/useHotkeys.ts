import { useEffect } from "react"

type KeyCombo = {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}

export function useHotkeys(combos: Array<{ combo: KeyCombo; handler: () => void }>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't trigger in input/textarea/contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      for (const { combo, handler } of combos) {
        const ctrlOrMeta = combo.ctrl || combo.meta
        const modMatch = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true
        const shiftMatch = combo.shift ? e.shiftKey : !e.shiftKey
        if (e.key.toLowerCase() === combo.key.toLowerCase() && modMatch && shiftMatch) {
          e.preventDefault()
          handler()
          return
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [combos])
}
