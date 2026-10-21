import { z } from 'zod';

/**
 * zod configurado para la aplicación. Por omisión zod compila validadores rápidos con
 * `Function` y, para saber si puede, prueba a evaluar una cadena: con la CSP sin
 * `'unsafe-eval'` (diseño §13) eso es una violación en cada página y worker. `jitless` lo
 * desactiva; como zod lee la opción al crear cada esquema, todo el dominio importa `z` desde
 * aquí y nunca directamente de 'zod'.
 */
z.config({ jitless: true });

export { z };
