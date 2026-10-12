// Orden para invocar pnpm desde un script: dentro de `pnpm run` se usa el mismo ejecutable
// (npm_execpath), aunque pnpm no esté en el PATH (p. ej. al lanzarlo con npx).
export function pnpmCommand(args: string): string {
  const execPath = process.env['npm_execpath'];
  if (execPath && /pnpm/i.test(execPath)) {
    return /\.(c?js|mjs)$/i.test(execPath)
      ? `"${process.execPath}" "${execPath}" ${args}`
      : `"${execPath}" ${args}`;
  }
  return `pnpm ${args}`;
}
