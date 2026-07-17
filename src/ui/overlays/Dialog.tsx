import React, { Fragment } from "react";
import { Dialog as HeadlessDialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { ActionButton } from "@/ui/controls";

export interface DialogProps { open: boolean; onClose: (open: false) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; }

export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  return <Transition show={open} as={Fragment}>
    <HeadlessDialog onClose={() => onClose(false)} className="relative z-[var(--z-overlay)]">
      <TransitionChild enter="duration-150 ease-out" enterFrom="opacity-0" enterTo="opacity-100" leave="duration-150 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0">
        <div className="fixed inset-0 bg-[var(--color-overlay)]" aria-hidden />
      </TransitionChild>
      <div className="fixed inset-0 overflow-y-auto p-3 sm:p-6"><div className="flex min-h-full items-end justify-center sm:items-center">
        <TransitionChild enter="duration-200 ease-out" enterFrom="translate-y-3 opacity-0" enterTo="translate-y-0 opacity-100" leave="duration-150 ease-in" leaveFrom="translate-y-0 opacity-100" leaveTo="translate-y-3 opacity-0">
          <DialogPanel className="w-full max-w-lg overflow-hidden rounded-[var(--radius-dialog)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-[var(--space-card)]"><div>
              <DialogTitle className="text-lg font-semibold text-[var(--color-text)]">{title}</DialogTitle>
              {description && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>}
            </div><ActionButton variant="ghost" size="icon" aria-label="Fermer" onClick={() => onClose(false)}>×</ActionButton></div>
            <div className="max-h-[min(65vh,36rem)] overflow-y-auto p-[var(--space-card)] text-[var(--color-text)]">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] p-[var(--space-card)]">{footer}</div>}
          </DialogPanel>
        </TransitionChild>
      </div></div>
    </HeadlessDialog>
  </Transition>;
}
