import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

// Shown after clicking System Check. Three states:
//   - Passed with data: backend up, chunks in store, ready to query
//   - Running but empty: backend up, nothing ingested yet, Ask will return nothing
//   - Unknown: health call itself failed, backend may be down
export default function SystemCheckDialog({ open, onOpenChange, health }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">
            {health && health.ok && health.chunks > 0 ? '✅ System Check Passed' : '⚠️ System Check'}
          </Dialog.Title>
          <Dialog.Description className="dialog-description">
            {health && health.ok && health.chunks > 0
              ? `All systems operational. ${health.chunks} content chunk${health.chunks !== 1 ? 's' : ''} ready for search.`
              : health && (!health.ok || health.chunks === 0)
              ? 'System is running but no content has been loaded yet. Click Load Page first.'
              : 'Could not retrieve system status.'}
          </Dialog.Description>
          <Dialog.Close className="btn-primary dialog-close">OK</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
