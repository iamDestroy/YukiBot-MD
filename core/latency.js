import { performance } from 'perf_hooks';
const dateFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
const traces = new WeakMap();
const enabled = process.env.BOT_LATENCY === '1';
export const statsDay = (now = Date.now()) => dateFormatter.format(now).split('/').reverse().join('-');
export function beginMessage(msg, clock) {
  if (!enabled && !clock) return;
  traces.set(msg, { received: (clock || performance.now.bind(performance))() });
}
export function markCommand(msg, clock) {
  const trace = traces.get(msg);
  if (trace) trace.command = (clock || performance.now.bind(performance))();
}
export function instrumentSocket(sock, { enabled: active = enabled, clock = () => performance.now(), report = info => console.log('[latency]', JSON.stringify(info)) } = {}) {
  if (!active) return;
  const send = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const trace = traces.get(options?.quoted);
    if (!trace || trace.reported) return send(jid, content, options);
    trace.reported = true;
    const started = clock();
    let ok = false;
    try { const result = await send(jid, content, options); ok = true; return result; }
    finally {
      const finished = clock();
      try {
        report({ internalMs: started - trace.received, commandReadyMs: trace.command == null ? null : trace.command - trace.received, sendMs: finished - started, totalMs: finished - trace.received, ok });
      } catch {}
    }
  };
}
