import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultService } from '../../application/VaultService.ts';
import { internalLink } from '../../domain/links.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { LinkPicker, type LinkPick } from './LinkPicker.tsx';

export interface TextRange {
  from: number;
  to: number;
}

/**
 * «Enlazar selección» en los editores de texto: se recuerda la selección al abrir el selector
 * (que se lleva el foco) y, al elegir destino, el editor la convierte en enlace con `apply`.
 */
export function useSelectionLinker({
  sourceId,
  service,
  onCreateNote,
  apply,
  onClose,
}: {
  sourceId: string;
  service: VaultService;
  onCreateNote: (title: string) => Promise<DocumentRecord>;
  apply: (range: TextRange, pick: LinkPick) => void;
  /** Devolver el foco al editor al cerrar sin elegir. */
  onClose: () => void;
}): { open: (range: TextRange) => void; picker: ReactNode } {
  const { t } = useTranslation();
  const [range, setRange] = useState<TextRange | null>(null);
  const finish = (pick: LinkPick) => {
    if (range) apply(range, pick);
    setRange(null);
  };
  const picker = range && (
    <LinkPicker
      title={t('links.selectionTitle')}
      sourceId={sourceId}
      service={service}
      onPick={finish}
      onCreateNote={(title) => {
        void onCreateNote(title).then((doc) => finish({ url: internalLink(doc.id), title }));
      }}
      onWeb={(url) => finish({ url, title: url })}
      onClose={() => {
        setRange(null);
        onClose();
      }}
    />
  );
  return { open: setRange, picker };
}

/** Ctrl/⌘+K, el atajo de «Enlazar selección» en los tres editores de texto. */
export function isLinkShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}

/** Ctrl/⌘+Mayús+K: «Copiar enlace a la selección». */
export function isCopyLinkShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}
