/** Sidebar icon for the Fabric page. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * @param props - slot runtime props carrying the icon size.
 * @returns the Fabric mark.
 */
export function FabricIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h6v6H4zM14 11h6v6h-6z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 13v4h4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
