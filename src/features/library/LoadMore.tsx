import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** Filas que se pintan de cada lista antes de pedir más (plan 9.21). */
export const LIBRARY_PAGE = 150;
/** Distancia al final de la lista a la que se cargan más filas al desplazarse. */
const AHEAD = 400;

/**
 * Final de una lista larga de la barra lateral (plan 9.21): con miles de documentos solo se pintan
 * las primeras filas, y al desplazarse cerca de este punto (o al pulsarlo, con el teclado) se
 * pintan las siguientes. Así la barra no retrasa la apertura del lienzo ni cada guardado.
 *
 * Se escucha el desplazamiento del contenedor, no un IntersectionObserver: añadir filas no
 * dispara un `scroll`, así que una carga nunca encadena la siguiente (con el observador y el foco
 * en el botón, el navegador mantenía el final a la vista y cargaba la lista entera).
 */
export function LoadMore({ rest, onMore }: { rest: number; onMore: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLLIElement>(null);
  const latest = useRef(onMore);
  useEffect(() => {
    latest.current = onMore;
  });
  useEffect(() => {
    const element = ref.current;
    const scroller = element?.closest<HTMLElement>('.library-scroll');
    if (!element || !scroller) return;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      const gap = element.getBoundingClientRect().top - scroller.getBoundingClientRect().bottom;
      if (gap > AHEAD) return;
      // Una carga por fotograma como mucho.
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
      });
      latest.current();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <li ref={ref} className="load-more" data-testid="library-load-more">
      <button type="button" className="link-button" onClick={onMore}>
        {t('library.showMore', { count: Math.min(rest, LIBRARY_PAGE) })}
      </button>
    </li>
  );
}
