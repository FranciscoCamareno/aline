import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { homeRecent } from '../../application/home.ts';
import type { DocEditorKind, NewKind } from '../library/LibrarySidebar.tsx';

const RECENT_COUNT = 8;

/**
 * Barra lateral en «Inicio» (plan 11): «Nuevo» con todo lo que se puede crear y lo último
 * modificado. La exploración (carpetas, filtros, miniaturas) está en la vista principal.
 */
export function HomeSidebar({
  onCreate,
  onCreateDoc,
}: {
  onCreate: (kind: NewKind) => void;
  onCreateDoc: (editor: DocEditorKind) => void;
}) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const setActive = useUiStore((s) => s.setActive);
  const recent = useMemo(() => homeRecent(documents, RECENT_COUNT), [documents]);

  return (
    <>
      <div className="library-actions">
        <Menu
          className="new-menu"
          trigger={
            <>
              <Icon name="mas" size={18} />
              <span className="new-menu-label">{t('library.new')}</span>
              <Icon name="chevron-abajo" size={16} />
            </>
          }
          label={t('library.new')}
          triggerClassName="primary"
          testId="new-menu"
          items={[
            {
              id: 'new-canvas',
              label: t('library.kindCanvas'),
              icon: 'lienzo',
              onSelect: () => onCreate('canvas'),
            },
            {
              id: 'new-notebook',
              label: t('library.kindNotebook'),
              icon: 'cuaderno',
              onSelect: () => onCreate('notebook'),
            },
            {
              id: 'new-note',
              label: t('library.kindNote'),
              icon: 'nota',
              onSelect: () => onCreate('note'),
            },
            {
              id: 'new-doc-rich',
              label: t('docs.kindRich'),
              icon: 'documento',
              onSelect: () => onCreateDoc('tiptap'),
            },
            {
              id: 'new-doc-markdown',
              label: t('docs.kindMarkdown'),
              icon: 'documento-md',
              onSelect: () => onCreateDoc('milkdown'),
            },
          ]}
        />
      </div>
      <div className="library-scroll">
        <h3 className="section-title">{t('library.recent')}</h3>
        {recent.length === 0 ? (
          <p className="muted">{t('library.empty')}</p>
        ) : (
          <ul className="library-list recent-list" data-testid="home-sidebar-recent">
            {recent.map((d) => (
              <li key={d.id}>
                <KindIcon kind={d.kind} />
                <button
                  type="button"
                  className="renameable-text link-button"
                  onClick={() => setActive(d.id)}
                >
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
