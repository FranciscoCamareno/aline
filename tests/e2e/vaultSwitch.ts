import type { Locator, Page } from '@playwright/test';

/**
 * Pulsa algo que cambia de almacén y espera a que la aplicación recargue. `switchVault`
 * (app/vaults.ts) primero guarda lo pendiente y después llama a `location.reload()`: sin esperar
 * a la recarga, la prueba sigue mirando la página vieja, que puede mostrar lo mismo que la nueva
 * («Carpeta al día»), y su siguiente clic choca con la navegación (lo vimos en el CI de Linux).
 */
export async function clickAndWaitForReload(page: Page, target: Locator): Promise<void> {
  const reloaded = page.waitForEvent('load', { timeout: 30_000 });
  await target.click();
  await reloaded;
}
