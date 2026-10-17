import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import type { AnchorResolution } from '../../domain/anchors.ts';

/** Estado de un ancla que no se encontró tal cual, para el aviso de la vista. */
export type AnchorStatus = Exclude<AnchorResolution['status'], 'found'> | null;

/** Aviso al seguir un enlace cuyo fragmento cambió o ya no está (formato §2.3.1). */
export function AnchorNotice({ status }: { status: AnchorStatus }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <p className="notice" role="status" data-testid="anchor-notice">
      {status === 'lost' ? t('links.anchorLost') : t('links.anchorApproximate')}
    </p>
  );
}

/** «Enlace copiado» durante unos segundos tras cada «Copiar enlace a la selección». */
export function CopiedNotice() {
  const { t } = useTranslation();
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      const copied = state.copiedLink;
      if (!copied || copied.seq === previous.copiedLink?.seq) return;
      setLabel(copied.label);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLabel(null), 3000);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <span className="copied-notice muted small" role="status" data-testid="link-copied-notice">
      {label && t('links.copied', { label })}
    </span>
  );
}
