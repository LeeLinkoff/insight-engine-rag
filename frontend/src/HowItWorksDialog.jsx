import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import InstructionStep from './InstructionStep.jsx'
import InstructionSection from './InstructionSection.jsx'

// Detailed walkthrough, broken into InstructionStep components grouped by
// InstructionSection, rather than one long paragraph. Opened from the
// centered button on the About card above the URL input. Fully
// self-contained — the only thing it needs from App is whether it's open.
export default function HowItWorksDialog({ open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" style={{ maxWidth: 560 }}>
          <Dialog.Title className="dialog-title">How It Works</Dialog.Title>
          <Dialog.Description asChild>
            <div className="dialog-description" style={{ marginBottom: 16 }}>

              <InstructionSection label="Highlighter">
                <InstructionStep number={1} title="Enter a page URL">
                  Paste the address of any public web page into the Page URL field above.
                </InstructionStep>
                <InstructionStep number={2} title="Type a phrase to find">
                  Enter a word or phrase you want located on that page.
                </InstructionStep>
                <InstructionStep number={3} title="Preview or open it">
                  Click <strong>Preview below</strong> to load the page into the inline frame
                  with every match marked, or <strong>Open in new tab</strong> to see it full-size.
                  Use <strong>Test Connection</strong> first if you just want to confirm the
                  proxy itself is working.
                </InstructionStep>
              </InstructionSection>

              <InstructionSection label="Ask a Question">
                <InstructionStep number={1} title="Load one or more pages">
                  With a URL entered above, click <strong>Load Page</strong>. The backend fetches
                  it, splits it into sections, and prepares it for search. You can repeat this
                  with a different URL to load additional pages, each one <strong>adds</strong> to
                  what's searchable, it doesn't replace the pages already loaded.
                </InstructionStep>
                <InstructionStep number={2} title="Ask">
                  Type a question and click <strong>Ask</strong>. This stays disabled until at
                  least one page has been loaded successfully. The question is checked against
                  every page loaded so far, not just the most recent one.
                </InstructionStep>
                <InstructionStep number={3} title="Read the grounded answer">
                  The answer is generated strictly from whichever loaded pages actually matched
                  the question, which could be one page or several. If nothing loaded supports
                  an answer, it will say so rather than guess.
                </InstructionStep>
                <InstructionStep number={4} title="Check the sources">
                  Each source lists which page and which section it came from, with links to open
                  it raw, open it highlighted, or preview it highlighted inline below.
                </InstructionStep>
                <InstructionStep number={5} title="Watch for warnings">
                  A red banner means the answer failed a safety check and was withheld. An
                  amber banner means the answer came from a single source only, which can happen
                  even with multiple pages loaded if the question only matched one of them, worth
                  treating as one page's perspective rather than broadly confirmed.
                </InstructionStep>
              </InstructionSection>

              <InstructionSection label="System Check">
                <InstructionStep number={1} title="Confirm the backend is ready">
                  Click <strong>System Check</strong> any time to see whether the server is
                  running and how many sections are currently indexed.
                </InstructionStep>
              </InstructionSection>

            </div>
          </Dialog.Description>
          <Dialog.Close className="btn-primary dialog-close">Got it</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
