import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

// Generic success confirmation, used after destructive or otherwise
// non-obvious actions (like Clear Store) where a small inline status line
// could easily be missed.
export default function SuccessDialog({ open, onOpenChange, message }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">
            ✅ Success
          </Dialog.Title>
          <Dialog.Description className="dialog-description">
            {message || 'Done.'}
          </Dialog.Description>
          <Dialog.Close className="btn-primary dialog-close">OK</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}