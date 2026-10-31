/**
 * Temporizador del pomodoro (plan 14.7). Los navegadores espacian los temporizadores de una pestaña
 * oculta (Chrome, hasta uno por minuto tras cinco minutos); los de un worker dedicado no, así que
 * el fin de cada fase se avisa a su hora. Solo despierta al hilo principal: el tiempo se sigue
 * calculando allí desde la hora de fin.
 */
export interface TimerRequest {
  /** Hora de fin de la fase que corre; null para cancelar. */
  endsAt: number | null;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TimerRequest>) => void) | null;
  postMessage(message: 'due'): void;
};

let timer: ReturnType<typeof setTimeout> | undefined;

scope.onmessage = (event) => {
  clearTimeout(timer);
  const { endsAt } = event.data;
  if (endsAt === null) return;
  // Un poco después de la hora, para que el hilo principal ya la vea pasada.
  timer = setTimeout(() => scope.postMessage('due'), Math.max(0, endsAt - Date.now()) + 50);
};
