import { useContext } from 'react'
import { PortalContext } from './portal-context-value'

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used within PortalProvider')
  return ctx
}
