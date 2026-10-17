/**
 * Exportar a PDF un documento con formato (fase 8.4): la impresión del navegador, con «Guardar
 * como PDF». Se imprime una copia del contenido en un contenedor propio (sin la barra, los
 * paneles ni los saltos de página de la vista, que el navegador pagina por su cuenta), en A4 con
 * los márgenes de la vista «Hoja» y en colores claros aunque el tema sea oscuro.
 */
export function printRichDoc(content: HTMLElement, title: string): void {
  const root = document.createElement('div');
  root.className = 'print-root';
  const copy = content.cloneNode(true) as HTMLElement;
  copy.removeAttribute('contenteditable');
  copy.classList.add('print-doc');
  for (const el of copy.querySelectorAll('.doc-page-break, .doc-page-end, .ProseMirror-gapcursor')) {
    el.remove();
  }
  root.append(copy);
  document.body.append(root);
  const html = document.documentElement;
  html.classList.add('printing-doc');
  const previousTitle = document.title;
  // El nombre que propone «Guardar como PDF» sale del título de la página.
  document.title = title;
  const cleanup = () => {
    html.classList.remove('printing-doc');
    root.remove();
    document.title = previousTitle;
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}
