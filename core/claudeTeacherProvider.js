/**
 * core/claudeTeacherProvider.js
 *
 * Gerçek Claude provider'ı — ama API anahtarını ASLA görmez. Yalnızca
 * localhost'ta çalışan küçük bir dev proxy'ye (scripts/ai/teacher-proxy.mjs)
 * yapılandırılmış context'i POST eder; gerçek Anthropic çağrısını ve API
 * anahtarını proxy taşır (bkz. spesifikasyon §5).
 *
 * core/mockTeacherProvider.js ile AYNI sözleşmeyi uygular:
 *   { name, async generateTeacherResponse(context) -> {ok, raw, error, latencyMs, provider} }
 * core/teacherAssistant.js hangi provider'ın kullanıldığını bilmez.
 *
 * Saf DEĞİL (network I/O var) ama DOM/localStorage'a dokunmaz — testler
 * fetchImpl'i enjekte ederek gerçek ağ olmadan doğrulanabilir.
 */

export function createClaudeTeacherProvider({
  endpoint = 'http://localhost:8787/api/ai-teacher',
  fetchImpl = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null),
  timeoutMs = 8000,
} = {}) {
  return {
    name: 'claude',
    async generateTeacherResponse(context) {
      const startedAt = Date.now();
      if (!fetchImpl) {
        return { ok: false, raw: null, error: 'FETCH_UNAVAILABLE', latencyMs: 0, provider: 'claude' };
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context }),
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, raw: text || null, error: `HTTP_${res.status}`, latencyMs: Date.now() - startedAt, provider: 'claude' };
        }

        const data = await res.json();
        if (!data || typeof data.message !== 'string') {
          return { ok: false, raw: JSON.stringify(data), error: 'MALFORMED_PROXY_RESPONSE', latencyMs: Date.now() - startedAt, provider: 'claude' };
        }
        return { ok: true, raw: data.message, error: null, latencyMs: Date.now() - startedAt, provider: 'claude' };
      } catch (err) {
        if (timer) clearTimeout(timer);
        const error = err?.name === 'AbortError' ? 'TIMEOUT' : (err?.message || 'NETWORK_ERROR');
        return { ok: false, raw: null, error, latencyMs: Date.now() - startedAt, provider: 'claude' };
      }
    },
  };
}
