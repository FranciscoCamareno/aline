import { useTranslation } from 'react-i18next';
import type { LinkableKind } from '../../domain/revision.ts';

/** Nombre visible de cada tipo enlazable, para los selectores y el autocompletado `[[`. */
export function useKindLabel(): (kind: LinkableKind) => string {
  const { t } = useTranslation();
  return (kind) => {
    switch (kind) {
      case 'canvas':
        return t('library.kindCanvas');
      case 'note':
        return t('library.kindNote');
      case 'doc':
        return t('docs.kindRich');
      case 'mddoc':
        return t('docs.kindMarkdown');
      case 'calendar':
        return t('calendar.title');
    }
  };
}
