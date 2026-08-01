import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

// Confirmation gate before wiping the backend's in-memory vector store.
// Replaces the native browser confirm() dialog, which exposes the raw
// origin/port and looks out of place next to the app's other Radix dialogs.
export default function ConfirmClearDialog({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">
            ⚠️ Clear All Content?
          </Dialog.Title>
          <Dialog.Description className="dialog-description">
            This removes every ingested page from the store and cannot be undone. You will need to reload any pages you want to query again.
          </Dialog.Description>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Dialog.Close className="btn-secondary dialog-close">Cancel</Dialog.Close>
            <button
              className="btn-primary dialog-close"
              onClick={() => { onOpenChange(false); onConfirm() }}
            >
              Clear Store
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}