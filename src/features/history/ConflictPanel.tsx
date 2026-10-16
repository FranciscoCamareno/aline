import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConflictChoice, VaultService } from '../../application/VaultService.ts';
import { isMarkdownKind, type DocumentRecord, type Revision } from '../../domain/revision.ts';
import { diffLines } from '../../shared/diff.ts';
import { RevisionPreview } from './RevisionPreview.tsx';

interface Props {
  document: DocumentRecord;
  service: VaultService;
  onResolve: (choice: ConflictChoice) => Promise<void>;
  onClose: () => void;
}

/**
 * Conflicto entre cabezas divergentes (RF-37, RN-04, FP-04 paso 5): se muestran todas y el
 * propietario elige conservar una, conservar ambas (duplicando) o combinar notas a mano.
 * Ninguna opción borra versiones del historial.
 */
export function ConflictPanel({ document, service, onResolve, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [heads, setHeads] = useState<Revision[] | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [merged, setMerged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await service.conflictHeads(document.id);
      const texts: Record<string, string> = {};
      if (isMarkdownKind(document.kind)) {
        for (const head of list) {
          const p = await service.previewRevision(head.id);
          if (p.kind === 'note') texts[head.id] = p.body;
        }
      }
      if (cancelled) return;
      setHeads(list);
      setBodies(texts);
      setMerged(list.length ? (texts[list.at(-1)!.id] ?? '') : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [document.id, document.kind, document.headRevisionIds, service]);

  const diff = useMemo(() => {
    if (!heads || heads.length !== 2 || !isMarkdownKind(document.kind)) return null;
    return diffLines(bodies[heads[0]!.id] ?? '', bodies[heads[1]!.id] ?? '');
  }, [heads, bodies, document.kind]);

  const resolve = (choice: ConflictChoice) => {
    setBusy(true);
    onResolve(choice).finally(() => setBusy(false));
  };

  const label = (i: number) => t('conflict.version', { letter: String.fromCharCode(65 + i) });
  const format = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' });

  return (
    <aside
      className="side-panel wide"
      aria-label={t('conflict.title')}
      data-testid="conflict-panel"
    >
      <header>
        <h2>{t('conflict.title')}</h2>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </header>
      <p>{t('conflict.explanation')}</p>
      {heads && heads.length < 2 && <p className="muted">{t('conflict.none')}</p>}
      {heads && heads.length >= 2 && (
        <>
          <div className="conflict-columns">
            {heads.map((head, i) => (
              <section key={head.id} className="conflict-column">
                <h3>{label(i)}</h3>
                <p className="muted">
                  {format(head.createdAt)} · {t('conflict.device')} {head.deviceId.slice(0, 8)}
                </p>
                <RevisionPreview revisionId={head.id} service={service} />
                <button
                  type="button"
                  disabled={busy}
                  data-testid={`conflict-keep-${i}`}
                  onClick={() => resolve({ kind: 'keep', revisionId: head.id })}
                >
                  {t('conflict.keep', { version: label(i) })}
                </button>
              </section>
            ))}
          </div>

          {heads.length === 2 && (
            <section>
              <h3>{t('conflict.both')}</h3>
              <p className="muted">{t('conflict.bothHint', { a: label(0), b: label(1) })}</p>
              <button
                type="button"
                disabled={busy}
                data-testid="conflict-duplicate"
                onClick={() =>
                  resolve({
                    kind: 'duplicate',
                    keepRevisionId: heads[0]!.id,
                    copyRevisionId: heads[1]!.id,
                    copyTitle: t('conflict.copyTitle', { title: document.title }),
                  })
                }
              >
                {t('conflict.bothAction')}
              </button>
            </section>
          )}

          {document.kind === 'calendar' && (
            <section>
              <h3>{t('conflict.mergeEvents')}</h3>
              <p className="muted">{t('conflict.mergeEventsHint')}</p>
              <button
                type="button"
                disabled={busy}
                data-testid="conflict-merge-events"
                onClick={() => resolve({ kind: 'merge-events' })}
              >
                {t('conflict.mergeEventsAction')}
              </button>
            </section>
          )}

          {isMarkdownKind(document.kind) && (
            <section>
              <h3>{t('conflict.merge')}</h3>
              {diff && (
                <pre className="diff" aria-label={t('conflict.diff')} data-testid="conflict-diff">
                  {diff.map((line, i) => (
                    <span key={i} className={`diff-${line.op}`}>
                      {line.op === 'add' ? '+ ' : line.op === 'del' ? '− ' : '  '}
                      {line.text}
                      {'\n'}
                    </span>
                  ))}
                </pre>
              )}
              <textarea
                className="merge-editor"
                aria-label={t('conflict.mergeEditor')}
                data-testid="conflict-merge-text"
                value={merged ?? ''}
                onChange={(e) => setMerged(e.target.value)}
                rows={10}
              />
              <button
                type="button"
                disabled={busy || merged === null}
                data-testid="conflict-merge"
                onClick={() => resolve({ kind: 'merge', body: merged ?? '' })}
              >
                {t('conflict.mergeAction')}
              </button>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
