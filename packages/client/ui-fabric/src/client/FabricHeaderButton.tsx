/** Session-header button that opens the Fabric tab. */

interface FabricHeaderProps {
  readonly open: () => void
}

/**
 * @param props - injected opener for the Fabric tab.
 * @returns the Fabric header control.
 */
export function FabricHeaderButton({ open }: FabricHeaderProps) {
  return (
    <button type="button" onClick={open} title="Fabric" style={{ padding: '2px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
      Fabric
    </button>
  )
}
