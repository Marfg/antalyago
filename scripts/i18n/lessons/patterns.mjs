/**
 * Ders sayfası için kalıp çevirileri: [Türkçe, English, Русский].
 * {0}, {1}… herhangi bir metni yakalar (koordinat, sayı, ad…); yakalanan metin
 * sözlükte ya da başka bir kalıpta varsa o da çevrilir. Burada: tek tek
 * yazılması gereksiz tekrarlı metinler (merdiven/ağ adımları), JS'te parça
 * parça birleştirilen cümleler ve kalıplara giren tek sözcükler.
 * Yer tutucusu olmayan satırlar düz çeviri olarak eklenir.
 */

/* Katalogdaki, tek başına ekrana çıkmayan cümle parçaları ve geliştirici
   iletileri: bunlar yukarıdaki kalıplarla bütün cümle olarak çevrilir.
   tests/i18n.test.js bu kimliklerin çevirisini istemez. */
export const fragments = [
  '1tgrh5913', '16eooge1v', 'zih5aevqq', '1fwoykm1d', '1jco00w18', '1nenm451a', // bağlantılar, snapback
  'aoqsrl1qu', '1jvfqq11d', '1462dvgd5', 'vrj6sp17p',
  '1wdusujxi', // [scene-03…] geliştirici iletisi
  '5oj84hh2d', 'kerlm61bq', '148b8t7fs', '1x44d732g', 'cxhlnkyci', // [scene-release], test kancası
];

export default [
  /* Kalıplara giren tek sözcükler */
  ['Siyah', 'Black', 'чёрные'],
  ['Beyaz', 'White', 'белые'],
  ['siyah', 'black', 'чёрных'],
  ['beyaz', 'white', 'белых'],
  ['Kenardaki', 'An edge', 'на краю'],
  ['<strong>{0}</strong>', '<strong>{0}</strong>', '<strong>{0}</strong>'],
  ['Antalya GO — Öğrenme Sahneleri', 'Antalya GO — Learning Scenes', 'Antalya GO — Обучающие сцены'],
  ['Konular', 'Topics', 'Темы'],
  ['Ses', 'Sound', 'Звук'],
  ['Ses açık', 'Sound on', 'Звук включён'],
  ['Falling in Love with Baduk, s. 132, Test 04; kaçış devamları özgün doğrulama', 'Falling in Love with Baduk, p. 132, Test 04; escape continuations independently verified', 'Falling in Love with Baduk, с. 132, Test 04; продолжения побегов проверены самостоятельно'],

  /* Birleşik etiketler: adım sayacı + başlık, "A · B" ikilileri ({0#} = yalnız sayı) */
  ['{0#} / {1#} · {2}', '{0} / {1} · {2}', '{0} / {1} · {2}'],
  ['{0#}. {1}', '{0}. {1}', '{0}. {1}'],
  ['{0} · {1}', '{0} · {1}', '{0} · {1}'],
  ['{0}: {1}', '{0}: {1}', '{0}: {1}'],
  ['{0} ({1#}/{2#})', '{0} ({1}/{2})', '{0} ({1}/{2})'],
  ['{0}: {1#} nefes', '{0}: {1} liberties', '{0}: дамэ {1}'],
  ['{0#} nefes', '{0} liberties', 'дамэ: {0}'],

  /* Merdiven ve ağ dizileri (scenes/ladderScenarioData.js, netScenarioData.js) */
  ['Siyah {0}: beyazın 1 nefesi kaldı.', 'Black {0}: White has 1 liberty left.', 'Чёрные {0}: у белых осталось 1 дамэ.'],
  ['Beyaz {0}: grup iki nefese uzadı; siyah beyazı yeniden atariye almalı.', 'White {0}: the group extended to two liberties; Black must give atari again.', 'Белые {0}: группа вытянулась до двух дамэ; чёрные должны снова поставить атари.'],
  ['Beyaz {0}: kenar yüzünden yalnız bir nefes açıldı.', 'White {0}: only one liberty opened because of the edge.', 'Белые {0}: из-за края открылось только одно дамэ.'],
  ['Siyah {0}. Hedef grubun {1} nefesi var.', 'Black {0}. The target group has {1} liberties.', 'Чёрные {0}. Дамэ у целевой группы: {1}.'],
  ['Beyaz {0}. Hedef grubun {1} nefesi var.', 'White {0}. The target group has {1} liberties.', 'Белые {0}. Дамэ у целевой группы: {1}.'],
  ['{0} beyaz taş birlikte yakalandı.', '{0} white stones captured together.', 'Белых камней взято вместе: {0}.'],

  /* Parça parça kurulan cümleler */
  ['{0} / 2 nefes bulundu.', '{0} / 2 liberties found.', 'Найдено дамэ: {0} / 2.'],
  ['{0} / 3 doğru atari.', '{0} / 3 correct ataris.', 'Верных атари: {0} / 3.'],
  ['Beyazı atariye aldın; fakat beyaz kaçınca {0} nefese ulaştı. Bu yön merdiven ritmini kurmuyor. Yeni denemeyle diğer yönü karşılaştır.',
    "You put White in atari, but after escaping White reached {0} liberties. This direction doesn't set up the ladder rhythm. Compare with the other direction in a new attempt.",
    'Вы поставили белых в атари, но, убежав, они получили дамэ: {0}. Это направление не задаёт ритм лестницы. Сравните с другим направлением в новой попытке.'],
  ['İlk kaçışta {0} beyaz taş yakalandı. Şimdi diğer başlangıç çıkışını sına.', 'On the first escape {0} white stones were captured. Now test the other starting exit.', 'При первом побеге взято белых камней: {0}. Теперь проверьте другой начальный выход.'],
  ['Bambuyu tamamlamak için {0} siyah taş daha yerleştir.', 'Place {0} more black stone(s) to complete the bamboo joint.', 'Поставьте ещё чёрных камней: {0}, чтобы завершить бамбук.'],
  ['{0} bu yönde kuruldu. Kendi biçiminle kesme denemesine geç.', '{0} built in this direction. Move on to a cutting attempt against your own shape.', '{0}: форма построена в этом направлении. Переходите к попытке разрезать свою форму.'],
  ['{0} Sıra beyazda.', '{0} White to play.', '{0} Ход белых.'],
  ['{0} Sıra siyahta.', '{0} Black to play.', '{0} Ход чёрных.'],
  ['{0} taş alındı. {1}', '{0} stone(s) captured. {1}', 'Взято камней: {0}. {1}'],
  ['Beyaz oynuyorsun · {0} taş, {1} nefes', 'You play White · {0} stones, {1} liberties', 'Вы играете белыми · камней: {0}, дамэ: {1}'],
  ['Siyah oynuyorsun · {0} taş, {1} nefes', 'You play Black · {0} stones, {1} liberties', 'Вы играете чёрными · камней: {0}, дамэ: {1}'],
  ['Dizi tamamlandı · {0} taş, {1} nefes', 'Sequence complete · {0} stones, {1} liberties', 'Последовательность завершена · камней: {0}, дамэ: {1}'],
  ['Snapback tamamlandı: bir taş kurban edildi, {0} rakip taşı geri alındı.', 'Snapback complete: one stone was sacrificed and {0} opposing stones were taken back.', 'Снэпбэк выполнен: пожертвован один камень, взято камней соперника: {0}.'],
  ['Beyaz oynuyorsun. Kurban taşını al.', 'You play White. Take the sacrifice stone.', 'Вы играете белыми. Возьмите камень-жертву.'],
  ['Siyah oynuyorsun. Kurban taşını al.', 'You play Black. Take the sacrifice stone.', 'Вы играете чёрными. Возьмите камень-жертву.'],
  ["Beyaz oynuyorsun. Rakibin tek nefesi işaretlendi; geri al.", "You play White. The opponent's single liberty is marked; take back.", 'Вы играете белыми. Единственное дамэ соперника отмечено — берите в ответ.'],
  ["Siyah oynuyorsun. Rakibin tek nefesi işaretlendi; geri al.", "You play Black. The opponent's single liberty is marked; take back.", 'Вы играете чёрными. Единственное дамэ соперника отмечено — берите в ответ.'],
];
