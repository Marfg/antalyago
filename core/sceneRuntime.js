/**
 * core/sceneRuntime.js
 *
 * Sahne tabanlı öğrenme deneyiminin TEK orkestratörü. DOM yok, canvas yok,
 * localStorage yok — yalnız sahne yaşam döngüsünü (mount/unmount/complete/
 * advance) yönetir ve olayları enjekte edilen `emitEvent` callback'ine
 * (genelde core/eventLog.js'in EventLog.append()'ine bağlanır) iletir.
 *
 * BİLEREK yok: `boardSizesSeen`, `19x19`, "Anladım" kartı, board-picker
 * DOM'u gibi Sahne #1'e özgü hiçbir şey. Runtime yalnız şu jenerik
 * sözleşmeyi bilir:
 *
 *   scene = { id, version, title, curriculumRef, mount, unmount, canComplete, complete }
 *
 * Sahne kimliğinin (`id`) müfredat lesson/step indeksine SIKI bağımlılığı
 * YOKTUR — `curriculumRef` yalnız pedagojik bir referanstır (bkz.
 * scenes/sceneRegistry.js, scenes/scene01BoardIntro.js).
 *
 * v0.10 — Replay sözleşmesi eklendi (bkz. görev talimatı Bölüm A):
 *   runtime.start(sceneId, { mode: 'replay' })  — aynı/başka bir sahneyi
 *     TEMİZ biçimde (gerçek unmount + gerçek yeniden mount) yeniden başlatır.
 *   runtime.replayActive()                      — aktif sahneyi replay eder.
 * Replay GENEL bir runtime yeteneğidir — hiçbir sahne kendi özel "reload"
 * fonksiyonunu icat ETMEZ. `mode` context'e ve HER `context.emit()`
 * payload'ına otomatik eklenir ('normal'|'replay'), böylece analitik
 * normal/replay akışını event payload'ından ayırt edebilir. Replay,
 * completedSceneIds'e ASLA dokunmaz — yalnız progressAdapter.setActive()
 * çağrılır (mevcut davranışla aynı), completion kaydı SİLİNMEZ/tekrar
 * eklenmez (sceneProgressAdapter.markCompleted zaten idempotent).
 */

/**
 * @param {object} params
 * @param {import('../scenes/sceneRegistry.js').SceneRegistry} params.registry
 * @param {{setActive(id:string):void, markCompleted(id:string):void}|null} [params.progressAdapter]
 *   — opsiyonel; verilmezse tamamlama yalnızca bellek-içi bilinir (testler için).
 * @param {(eventPartial:{type:string, lessonId?:?string, stepId?:?string, payload?:object}) => void} [params.emitEvent]
 * @param {object|((scene:object)=>object)} [params.contextExtras]
 *   — host'a özgü (DOM/canvas/adapter) ek context alanları. Runtime bunların
 *   İÇİNİ asla bilmez/okumaz — yalnız sahnenin context'ine birleştirir.
 *   Böylece runtime DOM'dan tamamen bağımsız kalır (bkz. dosya başı notu).
 * @param {() => Date} [params.now]
 */
export function createSceneRuntime({ registry, progressAdapter = null, emitEvent = () => {}, contextExtras = {}, now = () => new Date() }) {
  let activeScene = null;
  let activeContext = null;
  let mounted = false;
  let completed = false;

  function buildContext(scene, mode) {
    const extras = typeof contextExtras === 'function' ? (contextExtras(scene) || {}) : contextExtras;
    // registry SIRASINDAKİ bir sonraki sahne var mı — sahne modüllerinin
    // "Sonraki konu" / "Konular" ayrımını YAPMASI için (bkz. scenes/
    // topicEndControls.js). Registry statik olduğu için mount anında BİR
    // KEZ hesaplanması yeterli.
    const hasNextScene = registry.next(scene.id) != null;
    return {
      ...extras,
      sceneId: scene.id,
      sceneVersion: scene.version,
      curriculumRef: scene.curriculumRef,
      mode,
      hasNextScene,
      /**
       * Sahne kendi ANLAMLI event'lerini (ör. scene_intro_confirmed,
       * scene_board_size_viewed, scene_completion_unlocked) bununla üretir.
       * sceneId/sceneVersion/mode payload'a OTOMATİK eklenir — her sahne
       * bunu kendi başına tekrarlamak zorunda kalmaz.
       */
      emit(type, payload = {}) {
        emitEvent({
          type,
          lessonId: scene.curriculumRef?.lessonId ?? null,
          stepId: scene.id,
          payload: { sceneId: scene.id, sceneVersion: scene.version, mode, ...payload },
        });
      },
      requestComplete() { return runtime.completeAndAdvance(); },
      /** Sahnenin pedagojik hedefi karşılandığı ANDA çağrılır — completion'ı
          KALICI olarak işaretler (advance ETMEZ). Zaten tamamlanmışsa
          güvenli no-op (bkz. runtime.complete()). */
      markComplete() { return runtime.complete(); },
      /** "Sonraki konu" eylemi — YALNIZ registry sırasındaki bir sonraki
          sahneye geçer, completion'a dokunmaz (o zaten markComplete()
          ile önceden işaretlenmiş olmalı). */
      advanceToNext() { return runtime.advance(); },
      /** Aktif sahneyi TEMİZ biçimde (gerçek unmount+mount) replay modunda
          yeniden başlatır — bkz. runtime.replayActive(). */
      replayActive() { return runtime.replayActive(); },
    };
  }

  function safeCall(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  function unmountActive() {
    if (activeScene && mounted) {
      safeCall(() => activeScene.unmount(activeContext), null);
    }
    activeScene = null;
    activeContext = null;
    mounted = false;
    completed = false;
  }

  const runtime = {
    /**
     * Bir sahneyi kaydeder/başlatır. Aynı sahne zaten mount'luysa VE
     * mode:'normal' ise NO-OP döner (tekrar mount ETMEZ) — "Scene mount
     * yalnız bir kez çalışıyor" sözleşmesi. mode:'replay' bu kısayolu
     * BİLEREK atlar — aktif sahne olsa bile GERÇEK bir unmount+yeniden
     * mount döngüsü çalışır (bkz. dosya başı v0.10 notu).
     *
     * Bilinmeyen bir id veya mount() içinde atılan bir hata güvenle
     * `scene_failed` üretir, runtime'ı ÇÖKERTMEZ — mount hatası ayrıca
     * `console.error` ile sahne id'si ve gerçek exception'la loglanır
     * (bkz. görev talimatı Bölüm C — önbellekte kalmış eski modül
     * sürümleriyle karşılaşıldığında teşhisi kolaylaştırmak için).
     *
     * @param {string} sceneId
     * @param {{mode?: 'normal'|'replay'}} [options]
     */
    start(sceneId, { mode = 'normal' } = {}) {
      if (activeScene?.id === sceneId && mounted && mode === 'normal') {
        return { ok: true, alreadyMounted: true, scene: activeScene, context: activeContext };
      }
      unmountActive();
      const scene = registry.get(sceneId);
      if (!scene) {
        emitEvent({ type: 'scene_failed', lessonId: null, stepId: sceneId, payload: { sceneId, reason: 'UNKNOWN_SCENE', mode } });
        return { ok: false, reason: 'UNKNOWN_SCENE' };
      }
      const context = buildContext(scene, mode);
      let mountException = null;
      const mountOk = (() => {
        try { scene.mount(context); return true; }
        catch (e) { mountException = e; return false; }
      })();
      if (!mountOk) {
        // eslint-disable-next-line no-console
        console.error(`[sceneRuntime] Sahne mount hatası: ${scene.id}`, mountException);
        emitEvent({
          type: 'scene_failed',
          lessonId: scene.curriculumRef?.lessonId ?? null,
          stepId: scene.id,
          payload: { sceneId: scene.id, reason: 'MOUNT_ERROR', mode },
        });
        return { ok: false, reason: 'MOUNT_ERROR' };
      }
      activeScene = scene;
      activeContext = context;
      mounted = true;
      completed = false;
      progressAdapter?.setActive(scene.id);
      context.emit('scene_started');
      if (mode === 'replay') context.emit('scene_replay_started');
      return { ok: true, scene, context, mode };
    },

    canComplete() {
      if (!activeScene || !mounted) return false;
      return !!safeCall(() => activeScene.canComplete(activeContext), false);
    },

    /**
     * Sahneyi tamamlar. Zaten tamamlanmışsa veya canComplete() false ise
     * NO-OP (tamamlama event'i İKİNCİ KEZ ÜRETİLMEZ) — "Completion yalnız
     * bir kez işleniyor" / "Tamamlanamayan sahne ilerlemiyor" sözleşmesi.
     */
    complete() {
      if (!activeScene || !mounted) return { ok: false, reason: 'NO_ACTIVE_SCENE' };
      if (completed) return { ok: false, reason: 'ALREADY_COMPLETED' };
      if (!runtime.canComplete()) return { ok: false, reason: 'NOT_READY' };
      const scene = activeScene, context = activeContext;
      safeCall(() => scene.complete(context), null);
      completed = true;
      context.emit('scene_completed');
      progressAdapter?.markCompleted(scene.id);
      return { ok: true, sceneId: scene.id };
    },

    /**
     * Aktif sahneyi unmount eder ve registry sırasındaki bir SONRAKİ
     * sahneyi başlatır. Sonraki sahne yoksa (ör. yalnızca Sahne #1 kayıtlı)
     * `{done:true, nextSceneId:null}` döner — çağıran taraf bunu güvenli
     * bir "sıradaki sahne hazırlanıyor" durumuna çevirir; runtime kendisi
     * hiçbir eski sayfaya YÖNLENDİRMEZ.
     */
    advance() {
      if (!activeScene) return { ok: false, reason: 'NO_ACTIVE_SCENE' };
      const finishedId = activeScene.id;
      const nextScene = registry.next(finishedId);
      unmountActive();
      if (!nextScene) return { ok: true, done: true, nextSceneId: null };
      const started = runtime.start(nextScene.id);
      return { ok: started.ok, done: false, nextSceneId: nextScene.id, ...started };
    },

    /** "Devam et" düğmesinin tek çağrısı: complete() + advance() birlikte. */
    completeAndAdvance() {
      const result = runtime.complete();
      if (!result.ok) return result;
      const advanced = runtime.advance();
      return { ...result, advance: advanced };
    },

    /** Aktif sahneyi TEMİZ biçimde (unmount+mount) replay modunda yeniden
        başlatır. Aktif sahne yoksa güvenli no-op döner. */
    replayActive() {
      if (!activeScene) return { ok: false, reason: 'NO_ACTIVE_SCENE' };
      return runtime.start(activeScene.id, { mode: 'replay' });
    },

    getActiveSceneId() { return activeScene?.id ?? null; },
    isMounted() { return mounted; },
    isCompleted() { return completed; },
    destroy() { unmountActive(); },
  };

  return runtime;
}
