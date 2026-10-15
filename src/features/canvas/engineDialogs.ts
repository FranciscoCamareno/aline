/**
 * Retoques a los diálogos que el motor monta en <body>.
 *
 * El diálogo de ayuda trae un encabezado con enlaces externos (documentación, blog, GitHub,
 * YouTube). La aplicación no ofrece salidas a la red sin que el usuario las pida (diseño §13), así
 * que se retira ese encabezado. Ocultarlo con CSS no basta: un enlace con `display: none` no
 * recibe foco.
 *
 * Esos enlaces eran, además, lo único enfocable del diálogo: el motor da el foco inicial al
 * segundo enfocable y su trampa de tabulación cuenta con ellos. Sin ellos el foco se quedaría en
 * la biblioteca y Escape no cerraría nada, así que el foco pasa al contenido del diálogo (que ya
 * es enfocable con tabindex) y Tab se queda dentro.
 */
const EXTERNAL_LINKS = '.HelpDialog__header';
const handled = new WeakSet<Element>();

function strip(root: ParentNode): void {
  for (const element of root.querySelectorAll(EXTERNAL_LINKS)) element.remove();
  for (const help of root.querySelectorAll('.HelpDialog')) {
    if (handled.has(help)) continue;
    handled.add(help);
    const content = help.querySelector<HTMLElement>('.Modal__content');
    // Después del intento del motor (un setTimeout al montarse), que ya no encuentra nada.
    window.setTimeout(() => {
      if (help.isConnected && !help.contains(document.activeElement)) content?.focus();
    }, 30);
    help.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Tab') event.preventDefault();
    });
  }
}

/** Empieza a retirar los enlaces externos del diálogo de ayuda. Devuelve la función que lo para. */
export function removeExternalLinksFromEngineDialogs(): () => void {
  let inner: MutationObserver | null = null;

  const watch = (container: Element) => {
    inner?.disconnect();
    strip(container);
    inner = new MutationObserver(() => strip(container));
    inner.observe(container, { childList: true, subtree: true });
  };

  // Los diálogos del motor cuelgan de <body>, cada uno en un contenedor propio.
  const outer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.classList.contains('excalidraw-modal-container')) {
          watch(node);
        }
      }
    }
  });
  outer.observe(document.body, { childList: true });
  for (const existing of document.querySelectorAll('.excalidraw-modal-container')) {
    watch(existing);
  }

  return () => {
    outer.disconnect();
    inner?.disconnect();
  };
}
