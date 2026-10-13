/**
 * Sustituto de las dependencias opcionales de jsPDF (html2canvas, canvg, dompurify), que no se
 * instalan ni se distribuyen: la aplicación solo inserta imágenes en el PDF (diseño §12.1).
 * Si algún día se llamara a jsPDF.html() o a la conversión de SVG, fallaría de forma explícita.
 */
function unavailable(): never {
  throw new Error('Función de jsPDF no disponible en esta aplicación (solo se insertan imágenes)');
}

export default unavailable;
export const Canvg = { fromString: unavailable };
export const sanitize = unavailable;
