import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

// Shown whenever a backend call fails (ingest, query, or health check).
// Covers things like a missing/invalid API key, backend down, or a
// rejected request — anywhere result.ok is false. Distinct from the
// SystemCheckDialog, which reports a passing/pending state, not a failure.
export default function ErrorDialog({ open, onOpenChange, message }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">
            ⚠️ Error
          </Dialog.Title>
          <Dialog.Description className="dialog-description">
            {message || 'Something went wrong.'}
          </Dialog.Description>
          <Dialog.Close className="btn-primary dialog-close">OK</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}