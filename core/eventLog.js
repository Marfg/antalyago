/**
 * core/eventLog.js
 *
 * Saf etkileşim günlüğü. DOM, localStorage, ağ çağrısı YOK.
 *
 * Persistence bu modülün sorumluluğu DEĞİLDİR — kayıtları kalıcı hâle
 * getirmek isteyen çağıran taraf (ör. ogren-3d.html'deki bir storage
 * adapter) `getAll()`/`restore()` üzerinden kendi I/O'sunu yapar.
 *
 * Event şekli (kullanıcı tarafından belirtilen sözleşme):
 *   { ts, sessionId, lessonId, stepId, type, payload }
 */

/**
 * Ham bir event tanımını normalize eder. `now`/`sessionId` enjekte
 * edilebilir — deterministik test için.
 */
export function createEvent({ type, payload = {}, sessionId = null, lessonId = null, stepId = null, now = () => new Date() }) {
  if (!type || typeof type !== 'string') {
    throw new Error('EVENT_LOG_INVALID_TYPE');
  }
  return {
    ts: now().toISOString(),
    sessionId,
    lessonId: lessonId ?? null,
    stepId: stepId ?? null,
    type,
    payload: payload ?? {},
  };
}

function randomSessionId() {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Bellek-içi event günlüğü. localStorage'a hiç dokunmaz.
 */
export class EventLog {
  constructor({ sessionId, now = () => new Date() } = {}) {
    this.sessionId = sessionId ?? randomSessionId();
    this._now = now;
    this._events = [];
  }

  /**
   * @param {{type:string, payload?:object, lessonId?:string, stepId?:string}} partialEvent
   * @returns {object} eklenen normalize edilmiş event
   */
  append(partialEvent) {
    const event = createEvent({ ...partialEvent, sessionId: this.sessionId, now: this._now });
    this._events.push(event);
    return event;
  }

  getAll() {
    return this._events.map(e => ({ ...e }));
  }

  clear() {
    this._events = [];
  }

  get size() {
    return this._events.length;
  }

  toJSON() {
    return this.getAll();
  }

  /**
   * Daha önce persist edilmiş event dizisini geri yükler (ör. sayfa
   * yenilendiğinde storage adapter'dan). Geçersiz girdiler sessizce atlanır.
   */
  restore(events) {
    if (!Array.isArray(events)) return;
    this._events = events.filter(e => e && typeof e.type === 'string').map(e => ({ ...e }));
  }
}
