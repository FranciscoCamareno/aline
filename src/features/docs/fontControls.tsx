import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  FONT_CATALOG,
  fontStack,
  type CatalogFont,
  type FontCategory,
} from '../../app/fontCatalog.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import {
  catalogFontFor,
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  stepFontSize,
} from './typography.ts';

/**
 * Tipografía de la barra de los documentos con formato (fase 8.2): fuente con búsqueda y tamaño
 * con A− / A+. Las fuentes son las del catálogo (`app/fontCatalog.ts`); cada una se muestra con
 * su propio tipo de letra, que el navegador descarga solo al abrir la lista.
 */

const CATEGORIES: FontCategory[] = ['sans', 'serif', 'mono', 'hand', 'display'];

export function FontFamilyPicker({
  value,
  disabled,
  onPick,
}: {
  /** `font-family` de la selección; null = la del documento. */
  value: string | null;
  disabled: boolean;
  /** Fuente elegida; null = volver a la del documento. */
  onPick: (font: CatalogFont | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Posición de la lista; null mientras está cerrada (nunca se pinta sin colocar). */
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = catalogFontFor(value);

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return FONT_CATALOG.filter((f) => !q || normalizeForSearch(f.name).includes(q));
  }, [query]);

  /**
   * Coloca la lista bajo el botón. Va en una capa sobre `<body>` (como `app/ui/Menu.tsx`): dentro
   * de la barra la recortaría su desplazamiento, y su posición quedaría vieja si la barra se
   * recoloca. Se recalcula al desplazar, al cambiar el tamaño y si el botón se mueve.
   */
  const place = () => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const width = 260;
    setPosition({
      position: 'fixed',
      top: box.bottom + 4,
      left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
      width,
      // Cabe en lo que queda de ventana bajo el botón; la lista se desplaza dentro.
      maxHeight: Math.max(200, Math.min(420, window.innerHeight - box.bottom - 16)),
    });
  };
  useEffect(() => {
    if (!open) return;
    search.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
        setPosition(null);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setPosition(null);
      return;
    }
    place();
    setOpen(true);
  };

  const pick = (font: CatalogFont | null) => {
    setOpen(false);
    setPosition(null);
    setQuery('');
    onPick(font);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="doc-font-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('docs.font')}
        title={t('docs.font')}
        data-testid="doc-font"
        disabled={disabled}
        // Sin robar el foco al editor: la selección sigue donde estaba.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        style={current ? { fontFamily: fontStack(current) } : undefined}
      >
        <span className="doc-font-name">{current?.name ?? t('docs.fontDefault')}</span>
        <Icon name="chevron-abajo" size={14} />
      </button>
      {open &&
        position &&
        createPortal(
        <div
          ref={panel}
          className="doc-font-panel"
          style={position}
          data-testid="doc-font-panel"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setPosition(null);
            }
          }}
        >
          <input name="doc-font-search"
            ref={search}
            value={query}
            placeholder={t('docs.fontSearch')}
            aria-label={t('docs.fontSearch')}
            data-testid="doc-font-search"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) pick(filtered[0]);
            }}
          />
          <ul role="listbox" aria-label={t('docs.font')}>
            {!query.trim() && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!current}
                  data-testid="doc-font-default"
                  onClick={() => pick(null)}
                >
                  {t('docs.fontDefault')}
                </button>
              </li>
            )}
            {CATEGORIES.map((category) => {
              const fonts = filtered.filter((f) => f.category === category);
              if (!fonts.length) return null;
              return (
                <li key={category} className="doc-font-group">
                  <span className="doc-font-category">{t(`docs.fontCategory.${category}`)}</span>
                  <ul>
                    {fonts.map((font) => (
                      <li key={font.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={current?.id === font.id}
                          data-testid="doc-font-option"
                          style={{ fontFamily: fontStack(font) }}
                          onClick={() => pick(font)}
                        >
                          {font.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {!filtered.length && <li className="muted small">{t('docs.fontNone')}</li>}
          </ul>
        </div>,
          document.body,
        )}
    </>
  );
}

export function FontSizeControl({
  size,
  disabled,
  onChange,
}: {
  /** Tamaño de la selección en px; null = el del documento. */
  size: number | null;
  disabled: boolean;
  onChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const current = size ?? DEFAULT_FONT_SIZE;
  /** Lo que se está escribiendo en el número; null = se muestra el tamaño actual. */
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => {
    if (draft === null) return;
    const value = Math.round(Number(draft.replace(',', '.')));
    setDraft(null);
    if (Number.isFinite(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE) onChange(value);
  };
  const step = (direction: 1 | -1, label: string, icon: 'mas' | 'menos', testId: string) => (
    <button
      type="button"
      className="icon-button doc-size-step"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={
        disabled || (direction > 0 ? current >= FONT_SIZES.at(-1)! : current <= FONT_SIZES[0]!)
      }
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(stepFontSize(current, direction))}
    >
      <Icon name={icon} size={16} />
    </button>
  );
  return (
    <span className="doc-size">
      {step(-1, t('docs.fontSmaller'), 'menos', 'doc-font-smaller')}
      <input name="doc-font-size"
        className="doc-size-input"
        inputMode="numeric"
        aria-label={t('docs.fontSize')}
        title={t('docs.fontSize')}
        data-testid="doc-font-size"
        disabled={disabled}
        value={draft ?? String(current)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          } else if (e.key === 'Escape') {
            setDraft(null);
          }
        }}
      />
      {step(1, t('docs.fontLarger'), 'mas', 'doc-font-larger')}
    </span>
  );
}
