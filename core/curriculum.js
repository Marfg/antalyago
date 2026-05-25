/**
 * core/curriculum.js
 *
 * Tüm ders verisi. DOM, render, animasyon yok.
 * CAM preset değerleri de burada — sadece veri, renderer kodu değil.
 */

export const CAM = {
  overview: {yaw:.50,pitch:.88,dist:500},
  high:     {yaw:.50,pitch:1.15,dist:470},
  top:      {yaw:.50,pitch:1.45,dist:440},
  corner_tl:{yaw:.85,pitch:.95,dist:420},
  corner_tr:{yaw:.15,pitch:.95,dist:420},
  center:   {yaw:.50,pitch:1.08,dist:460},
  board19:  {yaw:.50,pitch:1.25,dist:520},
};

export const CURRICULUM = [
  { id:'c1', title:'Temel Kurallar', lessons:[

    { id:'l1', title:'Tahta ve Taşlar', steps:[
      { text:`<p>Go, <strong>19×19'luk</strong> bir tahta üzerinde oynanan iki kişilik bir strateji oyunudur. <strong>9×9</strong> tahta başlangıç için daha uygundur.</p><p>Sıralı bir hamle oyunudur, <strong>siyah</strong> önce oynar.</p>`,
        assistant: [
          { msg: 'Bu, bir Go tahtası.', delay: 0 },
          { msg: 'Go iki kişilik bir oyun. Biri siyah, biri beyaz taşlarla oynar.', delay: 1200 },
          { msg: '9×9 ile 19×19 arasında fark var — görmek ister misin?', delay: 1400 },
        ],
        ctxButtons: [
          { label: 'Devam et', action: 'next_step' },
          { label: '19×19 göster', action: 'board19' },
          { label: 'Tekrar anlat', action: 'replay', muted: true },
        ],
        board:[], auto:true, boardSelector:true, size:9, camera:CAM.overview, fb:{t:'Tahta boyutunu seçerek farkı inceleyin.',c:'info'} },
      { text:`<p>Taşlar karelerin içine değil, <strong>çizgilerin kesişim noktalarına</strong> yerleştirilir.</p><p>Aşağıdaki tahtaya herhangi bir noktaya tıklayarak <strong>siyah taş koy.</strong></p>`, board:[], answers:'any', turn:'black', size:9, fb:{t:'Herhangi bir noktaya tıkla!',c:'info'}, fb_ok:'Mükemmel! Taşı doğru noktaya koydun.' },
      { text:`<p>Taşlar bir kez konulduktan sonra <strong>hareket ettirilemez</strong> — sadece yakalanarak kaldırılabilir.</p><div class="highlight-box">Go'da taşlar hareket etmez, sadece eklenir veya kaldırılır.</div>`, board:[{color:'W',x:4,y:4}], auto:true, size:9, fb:{t:'Bu beyaz taş artık o noktada sabit.',c:'info'} },
    ]},

    { id:'l2', title:'Nefes Noktaları', steps:[
      { text:`<p>Her taşın komşu boş noktalarına <strong><span class="term">nefes noktası</span></strong> denir.</p><p>Ortadaki bir taşın <strong>4 nefes noktası</strong> vardır (üst, alt, sol, sağ).</p>`, board:[{color:'B',x:4,y:4}], auto:true, showLiberties:true, size:9, camera:CAM.center, fb:{t:'Ortadaki siyah taşın 4 nefes noktası var.',c:'info'} },
      { text:`<p>Kenar noktasındaki taşın <strong>3 nefes noktası</strong>, köşedekinin ise <strong>2 nefes noktası</strong> vardır.</p><div class="highlight-box">Nefes noktası azaldıkça taş tehlikeye girer. Köşe ve kenar taşları daha savunmasızdır.</div>`, board:[{color:'B',x:0,y:0},{color:'W',x:8,y:4}], auto:true, showLiberties:true, size:9, fb:{t:'Köşe: 2 · Kenar: 3 · Orta: 4 nefes noktası',c:'info'} },
      { text:`<p>Yatay veya dikey olarak birbirine bağlı taşlar <strong>grup</strong> oluşturur. Grubun özgürlüğü tüm taşlarının boş komşularının toplamıdır.</p>`, board:[{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:5,y:4}], auto:true, showLiberties:true, size:9, fb:{t:'Bu üç taş bir grup — birlikte 8 nefes noktası var.',c:'info'} },
    ]},

    { id:'l3', title:'Taş Alma', steps:[
      { text:`<p>Bir taşın <strong>tüm nefes noktaları doldurulursa</strong>, o taş yakalanır ve tahtadan kalkar.</p><p>Beyaz taşın tek boş noktası var — oraya siyah taş koyarak beyazı yakala! <strong>E4 noktasına tıkla.</strong></p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], answer:{x:4,y:5}, turn:'black', size:9, fb:{t:'Beyaz taşın son nefes noktasına tıkla!',c:'info'}, fb_ok:'Yakaladın! Beyaz taş tahtadan kalkar.', fb_err:'Beyaz taşın çevresindeki boş noktayı bul.' },
      { text:`<p>Bir <strong>grubu</strong> yakalamak için grubun tüm nefes noktalarını doldurman gerekir.</p><p>İki beyaz taşın son nefes noktasını doldur — <strong>D5 noktasına tıkla.</strong></p>`, board:[{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:3},{color:'B',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'İki beyaz taşın son boş noktasını bul.',c:'info'}, fb_ok:'Grubu yakaladın!', fb_err:'Beyaz grubun son nefes noktasını bul.' },
      { text:`<p>Bir örnek daha! <strong>3 taşlı beyaz grup</strong> siyahlarla çevrilmiş.</p><p>Beyaz grubun tek nefes noktasını bul ve grubu yakala — <strong>E6 noktasına tıkla.</strong></p>`, board:[{color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'B',x:3,y:2},{color:'B',x:6,y:2},{color:'B',x:6,y:3},{color:'B',x:5,y:4},{color:'W',x:4,y:2},{color:'W',x:5,y:2},{color:'W',x:5,y:3}], answer:{x:4,y:3}, turn:'black', size:9, fb:{t:'3 taşlı beyaz grubun tek boş noktasını bul.',c:'info'}, fb_ok:'Mükemmel! Üç beyaz taş birden yakalandı.', fb_err:'E6 noktasına tıkla — beyazın tek boş komşusu.' },
    ]},

    { id:'l4', title:'Yasak Hamleler', steps:[
      { text:`<p>Kendi taşını nefessiz bırakacak bir hamle <strong>yapamazsın</strong> — bu <span class="term">öz-yakalama</span> yasağıdır.</p><p>Bu tahtada <strong>4 farklı yasak nokta</strong> var. X işaretli noktaları fark et — siyah bu noktalara taş koyamaz.</p>`, board:[{color:'W',x:4,y:0},{color:'W',x:6,y:0},{color:'W',x:4,y:1},{color:'W',x:5,y:1},{color:'W',x:6,y:1},{color:'W',x:0,y:3},{color:'W',x:1,y:4},{color:'W',x:4,y:4},{color:'W',x:0,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6},{color:'W',x:8,y:7},{color:'W',x:7,y:8}], auto:true, forbidden:[{x:5,y:0},{x:0,y:4},{x:4,y:5},{x:8,y:8}], size:9, fb:{t:'4 yasak nokta: beyazın sardığı boşluklara taş konamaz.',c:'info'} },
      { text:`<p><strong>İstisna:</strong> İntihar gibi görünen hamle rakip grubu <em>yakalıyorsa</em> geçerlidir.</p><p>Siyah üstte 5 beyazı yakalarken, beyaz altta 5 siyahı yakalar — yakalama istisnasını izle.</p>`, board:[{color:'W',x:3,y:0},{color:'W',x:5,y:0},{color:'W',x:3,y:1},{color:'W',x:4,y:1},{color:'W',x:5,y:1},{color:'W',x:3,y:6},{color:'W',x:4,y:6},{color:'W',x:5,y:6},{color:'W',x:2,y:7},{color:'W',x:6,y:7},{color:'W',x:2,y:8},{color:'W',x:6,y:8},{color:'B',x:2,y:0},{color:'B',x:6,y:0},{color:'B',x:2,y:1},{color:'B',x:6,y:1},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:2},{color:'B',x:3,y:7},{color:'B',x:4,y:7},{color:'B',x:5,y:7},{color:'B',x:3,y:8},{color:'B',x:5,y:8}], moves:[{color:'B',x:4,y:0,capture:[{x:3,y:0},{x:5,y:0},{x:3,y:1},{x:4,y:1},{x:5,y:1}]},{color:'W',x:4,y:8,capture:[{x:3,y:7},{x:4,y:7},{x:5,y:7},{x:3,y:8},{x:5,y:8}]}], size:9, fb:{t:'Yakalama istisnasını izle — iki hamle canlanıyor.',c:'info'} },
    ]},

    { id:'l5', title:'Ko Kuralı', steps:[
      { text:`<p><span class="term">Ko</span> — aynı pozisyonun sonsuza tekrar etmesini önleyen kuraldır.</p><p>Siyah beyazı yakalar — ama beyaz <strong>hemen geri alamaz</strong>, çünkü tahta önceki pozisyona döner.</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'W',x:4,y:4},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], moves:[{color:'B',x:4,y:5,capture:[{x:4,y:4}]}], moveSpeed:1.4, koPoint:{x:4,y:4}, size:9, camera:CAM.center, fb:{t:'Siyah yakaladı — beyaz hemen aynı noktaya dönemez. Bu Ko!',c:'info'} },
      { text:`<p>Ko savaşında oyuncular <strong>"ko tehdidi"</strong> yaparlar — tahtanın başka yerinde önemli bir hamle. Beyaz önce tehdit eder, siyah yanıtlar, sonra beyaz Ko'yu geri alır.</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], initialKoIndicator:{x:4,y:4,color:'red'}, moves:[{color:'W',x:6,y:2,indicatorAfter:{x:4,y:4,color:'green'}},{color:'B',x:2,y:2,indicatorAfter:{x:4,y:4,color:'green'}},{color:'W',x:4,y:4,capture:[{x:4,y:5}],indicatorAfter:null}], moveSpeed:1.4, size:9, camera:CAM.center, fb:{t:'Kırmızı = Ko yasak. Beyaz tehdit eder → siyah yanıtlar → yeşil = artık serbest!',c:'info'} },
    ]},

    { id:'l6', title:'Oyun Sonu ve Sayım', steps:[
      { text:`<p>Her iki oyuncu da art arda <strong>pas geçince</strong> oyun biter.</p><p>Kazanan, <strong>daha fazla bölge</strong> çeviren oyuncudur. Bölge = etrafı sarılmış boş noktalar.</p>`, board:[{color:'W',x:3,y:0},{color:'W',x:3,y:1},{color:'W',x:2,y:2},{color:'W',x:3,y:2},{color:'W',x:5,y:2},{color:'W',x:1,y:3},{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'W',x:5,y:3},{color:'W',x:6,y:3},{color:'W',x:1,y:4},{color:'W',x:4,y:4},{color:'W',x:6,y:4},{color:'W',x:2,y:5},{color:'W',x:2,y:6},{color:'W',x:3,y:6},{color:'W',x:3,y:7},{color:'W',x:3,y:8},{color:'W',x:4,y:8},{color:'B',x:4,y:0},{color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'B',x:7,y:1},{color:'B',x:4,y:2},{color:'B',x:6,y:2},{color:'B',x:2,y:3},{color:'B',x:7,y:3},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:7,y:4},{color:'B',x:3,y:5},{color:'B',x:4,y:5},{color:'B',x:5,y:5},{color:'B',x:6,y:5},{color:'B',x:4,y:6},{color:'B',x:4,y:7},{color:'B',x:6,y:7},{color:'B',x:5,y:8}], whiteTerritory:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:2},{x:1,y:2},{x:0,y:3},{x:0,y:4},{x:0,y:5},{x:1,y:5},{x:0,y:6},{x:1,y:6},{x:0,y:7},{x:1,y:7},{x:2,y:7},{x:0,y:8},{x:1,y:8},{x:2,y:8}], blackTerritory:[{x:5,y:0},{x:6,y:0},{x:7,y:0},{x:8,y:0},{x:6,y:1},{x:8,y:1},{x:7,y:2},{x:8,y:2},{x:8,y:3},{x:8,y:4},{x:7,y:5},{x:8,y:5},{x:5,y:6},{x:6,y:6},{x:7,y:6},{x:8,y:6},{x:5,y:7},{x:7,y:7},{x:8,y:7},{x:6,y:8},{x:7,y:8},{x:8,y:8}], auto:true, size:9, camera:CAM.high, fb:{t:'Siyah sol (20 puan) · Beyaz sağ (22 puan) — beyaz önde!',c:'info'} },
      { text:`<p>Puan hesabı: <strong>Bölge</strong> + <strong>Esirler</strong> + <strong>Komi</strong> (beyaza verilen avantaj, genellikle 6.5)</p><div class="highlight-box">Komi, siyahın ilk hamle avantajını dengeler.</div>`, board:[], auto:true, size:9, fb:{t:'Komi genellikle 6.5\'tir.',c:'info'} },
    ]},
  ]},

  { id:'c2', title:'Temel Teknikler', lessons:[

    { id:'l7', title:'Canlı Gruplar (İki Göz)', steps:[
      { text:`<p>Bir grup <strong>iki göze</strong> sahipse asla yakalanamaz — <em>ölümsüzdür.</em></p><p><span class="term">Göz</span> = grubun içindeki boş nokta. <strong>Yeşil halkalar</strong> tahtadaki tüm canlı grupları gösteriyor — her biri iki göze sahip.</p>`, size:19, board:[
        {color:'W',x:2,y:0},{color:'W',x:6,y:0},{color:'W',x:12,y:0},{color:'W',x:15,y:0},
        {color:'W',x:2,y:1},{color:'W',x:6,y:1},{color:'W',x:12,y:1},{color:'W',x:15,y:1},
        {color:'W',x:2,y:2},{color:'W',x:6,y:2},{color:'W',x:7,y:2},{color:'W',x:8,y:2},{color:'W',x:9,y:2},{color:'W',x:10,y:2},{color:'W',x:11,y:2},{color:'W',x:12,y:2},{color:'W',x:15,y:2},
        {color:'W',x:2,y:3},{color:'W',x:15,y:3},{color:'W',x:16,y:3},{color:'W',x:17,y:3},{color:'W',x:18,y:3},
        {color:'W',x:0,y:4},{color:'W',x:1,y:4},{color:'W',x:2,y:4},
        {color:'W',x:8,y:7},{color:'W',x:9,y:7},{color:'W',x:10,y:7},
        {color:'W',x:7,y:8},{color:'W',x:11,y:8},
        {color:'W',x:6,y:9},{color:'W',x:11,y:9},
        {color:'W',x:6,y:10},{color:'W',x:11,y:10},
        {color:'W',x:6,y:11},{color:'W',x:11,y:11},
        {color:'W',x:6,y:12},{color:'W',x:7,y:12},{color:'W',x:8,y:12},{color:'W',x:9,y:12},{color:'W',x:10,y:12},
        {color:'W',x:15,y:15},{color:'W',x:16,y:15},{color:'W',x:17,y:15},{color:'W',x:18,y:15},
        {color:'W',x:0,y:16},{color:'W',x:1,y:16},{color:'W',x:2,y:16},{color:'W',x:3,y:16},{color:'W',x:4,y:16},{color:'W',x:6,y:16},{color:'W',x:7,y:16},{color:'W',x:8,y:16},{color:'W',x:9,y:16},{color:'W',x:10,y:16},{color:'W',x:11,y:16},{color:'W',x:12,y:16},{color:'W',x:15,y:16},
        {color:'W',x:4,y:17},{color:'W',x:6,y:17},{color:'W',x:12,y:17},{color:'W',x:15,y:17},{color:'W',x:18,y:17},
        {color:'W',x:1,y:18},{color:'W',x:4,y:18},{color:'W',x:6,y:18},{color:'W',x:9,y:18},{color:'W',x:12,y:18},{color:'W',x:15,y:18},
        {color:'B',x:1,y:0},{color:'B',x:7,y:0},{color:'B',x:9,y:0},{color:'B',x:11,y:0},{color:'B',x:16,y:0},{color:'B',x:17,y:0},
        {color:'B',x:0,y:1},{color:'B',x:1,y:1},{color:'B',x:7,y:1},{color:'B',x:8,y:1},{color:'B',x:9,y:1},{color:'B',x:10,y:1},{color:'B',x:11,y:1},{color:'B',x:16,y:1},{color:'B',x:18,y:1},
        {color:'B',x:1,y:2},{color:'B',x:16,y:2},{color:'B',x:17,y:2},{color:'B',x:18,y:2},
        {color:'B',x:0,y:3},{color:'B',x:1,y:3},
        {color:'B',x:8,y:8},{color:'B',x:9,y:8},
        {color:'B',x:8,y:9},{color:'B',x:10,y:9},
        {color:'B',x:7,y:10},{color:'B',x:9,y:10},{color:'B',x:10,y:10},
        {color:'B',x:7,y:11},{color:'B',x:8,y:11},{color:'B',x:9,y:11},
        {color:'B',x:16,y:16},{color:'B',x:17,y:16},{color:'B',x:18,y:16},
        {color:'B',x:0,y:17},{color:'B',x:1,y:17},{color:'B',x:2,y:17},{color:'B',x:3,y:17},{color:'B',x:7,y:17},{color:'B',x:8,y:17},{color:'B',x:9,y:17},{color:'B',x:10,y:17},{color:'B',x:11,y:17},{color:'B',x:16,y:17},
        {color:'B',x:3,y:18},{color:'B',x:7,y:18},{color:'B',x:11,y:18},{color:'B',x:16,y:18},{color:'B',x:17,y:18},
      ], groupIndicators:[
        {x:0,y:0,color:'green'},{x:8,y:0,color:'green'},{x:10,y:0,color:'green'},{x:18,y:0,color:'green'},
        {x:17,y:1,color:'green'},{x:0,y:2,color:'green'},
        {x:9,y:9,color:'green'},{x:8,y:10,color:'green'},
        {x:17,y:17,color:'red'},
        {x:0,y:18,color:'red'},{x:2,y:18,color:'red'},{x:8,y:18,color:'red'},{x:10,y:18,color:'red'},{x:18,y:18,color:'red'},
      ], auto:true, camera:CAM.board19, fb:{t:'Yeşil çapraz = canlı grup gözü · Kırmızı çapraz = iki gözsüz, ölümlü nokta',c:'info'} },
      { text:`<p><strong>Sahte göz</strong> — rakip tarafından doldurulabilecek nokta gerçek göz değildir.</p><div class="highlight-box">İki gerçek göz = ölümsüz grup. Go'nun en temel kavramlarından biridir.</div>`, board:[{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4}], groupIndicators:[{x:3,y:3,color:'red'}], auto:true, size:9, fb:{t:'Kırmızı halka = tek göz, ölümlü grup — yakalanabilir!',c:'info'} },
    ]},

    { id:'l8', title:'Kesme ve Bağlama', steps:[
      { text:`<p><span class="term">Kesme</span> — rakibin iki taşı arasına girerek bağlantısını koparmak.</p><p>Siyahın iki taşı arasına gir — <strong>E4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answer:{x:4,y:3}, turn:'white', size:9, fb:{t:'Siyahın iki taşı arasına gir!',c:'info'}, fb_ok:'Kestik! Siyah artık iki ayrı grup.', fb_err:'Siyahın iki taşını birbirine bağlayan boşluğu bul.' },
      { text:`<p><span class="term">Bağlama</span> — kendi taşlarının arasını kapatarak grubu güçlendirmek.</p><p>Siyah taşları birleştir — <strong>D4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:3,y:5},{color:'W',x:2,y:4},{color:'W',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'Siyah taşlarını birleştir!',c:'info'}, fb_ok:'Güçlü bağlantı! Artık tek grup.', fb_err:'Siyah taşlar arasındaki boşluğu doldur.' },
    ]},

    { id:'l9', title:'Çift Atari', steps:[
      { text:`<p><span class="term">Çift atari</span> — tek hamleyle iki ayrı grubu aynı anda atariye almak. Beyaz ikisini birden kurtaramaz.</p><p>Çift atari noktasını bul ve oyna!</p>`,
        board:[{color:'W',x:5,y:3},{color:'W',x:4,y:4},{color:'B',x:6,y:3},{color:'B',x:5,y:4},{color:'B',x:4,y:5}],
        answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center,
        movesAfterAnswer:[{color:'W',x:5,y:2,capture:[]},{color:'B',x:3,y:4,capture:[{x:4,y:4}]}],
        fb:{t:'İki beyazı aynı anda atariye alacak noktayı bul!',c:'info'},
        fb_ok:'Çift atari! Sağdaki kurtarılırsa sol yakalanır — ya solu kurtarırsa?',
        fb_err:'Her iki beyaz gruba da atari yapacak noktayı bul.' },

      { text:`<p>Şimdi <strong>beyaz olarak</strong> oyna — hangi taşı kurtarırsın?</p><div class="highlight-box">Hangisini seçersen seç, diğer taş yakalanır.</div>`,
        board:[{color:'W',x:5,y:3},{color:'W',x:4,y:4},{color:'B',x:4,y:3},{color:'B',x:6,y:3},{color:'B',x:5,y:4},{color:'B',x:4,y:5}],
        answers:[{x:5,y:2},{x:3,y:4}], turn:'white', size:9, camera:CAM.center,
        movesAfterAnswerMap:{
          '5,2':[{color:'B',x:3,y:4,capture:[{x:4,y:4}]}],
          '3,4':[{color:'B',x:5,y:2,capture:[{x:5,y:3}]}]
        },
        fb:{t:'Beyaz taşlardan birinin yanındaki boş noktaya oyna.',c:'info'},
        fb_ok:'Bir taşı kurtardın — ama diğeri yakalandı. Çift atariden kaçış yoktur!',
        fb_err:'Beyaz taşlardan birini kurtarmak için yanındaki boş noktaya oyna.' },
    ]},

    { id:'l10', title:'Merdiven (Shicho)', steps:[

      { text:`<p><span class="term">Merdiven</span> (Japonca: <em>shicho</em>) — atariden kaçan taş her hamlede yeniden atariye girer ve köşeye doğru sürülür.</p><p>Beyaz kaçmaya çalıştıkça siyah kovalıyor — bu döngüyü izle.</p>`,
        board:[
          {color:'W',x:4,y:9},
          {color:'B',x:3,y:8},{color:'B',x:3,y:9},{color:'B',x:5,y:9},{color:'B',x:4,y:10},
        ],
        moves:[
          {color:'W',x:4,y:8,capture:[]},{color:'B',x:4,y:7,capture:[]},
          {color:'W',x:5,y:8,capture:[]},{color:'B',x:6,y:8,capture:[]},
          {color:'W',x:5,y:7,capture:[]},{color:'B',x:5,y:6,capture:[]},
          {color:'W',x:6,y:7,capture:[]},{color:'B',x:7,y:7,capture:[],speed:0.12},
          {color:'W',x:6,y:6,capture:[],speed:0.12},{color:'B',x:6,y:5,capture:[],speed:0.12},
          {color:'W',x:7,y:6,capture:[],speed:0.12},{color:'B',x:8,y:6,capture:[],speed:0.12},
          {color:'W',x:7,y:5,capture:[],speed:0.12},{color:'B',x:7,y:4,capture:[],speed:0.12},
          {color:'W',x:8,y:5,capture:[],speed:0.12},{color:'B',x:9,y:5,capture:[],speed:0.12},
          {color:'W',x:8,y:4,capture:[],speed:0.12},{color:'B',x:8,y:3,capture:[],speed:0.12},
          {color:'W',x:9,y:4,capture:[],speed:0.12},{color:'B',x:10,y:4,capture:[],speed:0.12},
          {color:'W',x:9,y:3,capture:[],speed:0.12},{color:'B',x:9,y:2,capture:[],speed:0.12},
          {color:'W',x:10,y:3,capture:[],speed:0.12},{color:'B',x:11,y:3,capture:[],speed:0.12},
          {color:'W',x:10,y:2,capture:[],speed:0.12},{color:'B',x:10,y:1,capture:[],speed:0.12},
          {color:'W',x:11,y:2,capture:[],speed:0.12},{color:'B',x:12,y:2,capture:[],speed:0.12},
          {color:'W',x:11,y:1,capture:[],speed:0.12},{color:'B',x:11,y:0,capture:[],speed:0.12},
          {color:'W',x:12,y:1,capture:[],speed:0.12},
          {color:'B',x:12,y:0,capture:[{x:4,y:9},{x:4,y:8},{x:5,y:8},{x:5,y:7},{x:6,y:7},{x:6,y:6},{x:7,y:6},{x:7,y:5},{x:8,y:5},{x:8,y:4},{x:9,y:4},{x:9,y:3},{x:10,y:3},{x:10,y:2},{x:11,y:2},{x:11,y:1},{x:12,y:1}],speed:0.12},
        ],
        moveSpeed:0.35, auto:true, size:13, camera:CAM.overview,
        fb:{t:'Beyaz her kaçışta köşeye yaklaşıyor — merdiven sonunda onu sıkıştırır.',c:'info'} },

      { text:`<p><strong>Merdiveni kıran taş</strong> — merdiven yolunda bir beyaz taş varsa, kaçan grup ona bağlanır ve kurtulur.</p><div class="highlight-box">Merdiven oynamadan önce taşın tüm yolunu kontrol et!</div>`,
        board:[
          {color:'W',x:4,y:9},{color:'W',x:9,y:4},
          {color:'B',x:3,y:8},{color:'B',x:3,y:9},{color:'B',x:5,y:9},{color:'B',x:4,y:10},
        ],
        groupIndicators:[{x:9,y:4,color:'green'}],
        moves:[
          {color:'W',x:4,y:8,capture:[]},{color:'B',x:4,y:7,capture:[]},
          {color:'W',x:5,y:8,capture:[]},{color:'B',x:6,y:8,capture:[]},
          {color:'W',x:5,y:7,capture:[]},{color:'B',x:5,y:6,capture:[]},
          {color:'W',x:6,y:7,capture:[]},{color:'B',x:7,y:7,capture:[]},
          {color:'W',x:6,y:6,capture:[]},{color:'B',x:6,y:5,capture:[]},
          {color:'W',x:7,y:6,capture:[]},{color:'B',x:8,y:6,capture:[]},
          {color:'W',x:7,y:5,capture:[]},{color:'B',x:7,y:4,capture:[]},
          {color:'W',x:8,y:5,capture:[]},{color:'B',x:9,y:5,capture:[]},
          {color:'W',x:8,y:4,capture:[]},
        ],
        moveSpeed:0.22, auto:true, size:13, camera:CAM.overview,
        fb:{t:'Beyaz (8,4) merdiveni kıran taşa bağlandı — artık köşeye sürülmez!',c:'info'} },

    ]},

    { id:'l11', title:'Ağ (Geta)', steps:[
      { text:`<p><span class="term">Ağ</span> (Japonca: <em>geta</em>) — bir taşı atari yapmadan, kaçış yollarını keserek tuzağa düşürmek.</p><p>Beyazın kaçış yolunu kesen noktayı bul — <strong>F6 noktasına tıkla.</strong></p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:4},{color:'B',x:4,y:5},{color:'B',x:5,y:5}], answer:{x:5,y:3}, turn:'black', size:9,
        movesAfterAnswer:[
          {color:'W',x:4,y:3,capture:[]},
          {color:'B',x:4,y:2,capture:[]},
          {color:'W',x:5,y:4,capture:[]},
          {color:'B',x:6,y:4,capture:[{x:4,y:4},{x:4,y:3},{x:5,y:4}]},
        ],
        fb:{t:'Beyazın tüm kaçış yollarını kapat!',c:'info'}, fb_ok:'Ağ kuruldu! Beyaz kaçmaya çalışıyor ama tuzakta.', fb_err:'Beyazın kaçış yollarını kapatan noktayı bul.' },
    ]},

    { id:'l12', title:'Snapback', steps:[
      { text:`<p><span class="term">Snapback</span> — rakibe taş kurban vererek daha büyük bir grubu yakalama tekniği.</p><p>Kurban ver — <strong>D5 noktasına tıkla.</strong></p>`,
        board:[
          {color:'W',x:3,y:3},{color:'W',x:2,y:4},{color:'W',x:4,y:4},{color:'W',x:4,y:5},
          {color:'B',x:4,y:3},{color:'B',x:5,y:3},{color:'B',x:5,y:4},{color:'B',x:2,y:5},{color:'B',x:5,y:5},{color:'B',x:3,y:6},{color:'B',x:4,y:6},
        ],
        answer:{x:3,y:4}, turn:'black', size:9,
        movesAfterAnswer:[
          {color:'W',x:3,y:5,capture:[{x:3,y:4}]},
          {color:'B',x:3,y:4,capture:[{x:3,y:5},{x:4,y:4},{x:4,y:5}]},
        ],
        fb:{t:'Kurbanı ver — beyaz alacak ama daha büyük grubu kaybedecek!',c:'info'}, fb_ok:'Snapback başladı! Beyaz kurbanı aldı ama tuzağa düştü.', fb_err:'D5 noktasına tıkla — kurbanı ver.' },
      { text:`<p>Bir snapback örneği daha. Kurban ver — <strong>A5 noktasına tıkla.</strong></p>`,
        board:[
          {color:'W',x:0,y:2},{color:'W',x:1,y:2},{color:'W',x:2,y:2},{color:'W',x:3,y:2},{color:'W',x:0,y:3},{color:'W',x:1,y:4},{color:'W',x:1,y:5},
          {color:'B',x:1,y:3},{color:'B',x:2,y:3},{color:'B',x:2,y:4},{color:'B',x:2,y:5},{color:'B',x:0,y:6},{color:'B',x:1,y:6},
        ],
        answer:{x:0,y:4}, turn:'black', size:9,
        movesAfterAnswer:[
          {color:'W',x:0,y:5,capture:[{x:0,y:4}]},
          {color:'B',x:0,y:4,capture:[{x:0,y:5},{x:1,y:4},{x:1,y:5}]},
        ],
        fb:{t:'Kurbanı ver — beyaz alacak ama grubu kaybedecek!',c:'info'}, fb_ok:'Snapback! Beyaz kurbanı aldı ama tuzağa düştü.', fb_err:'A5 noktasına tıkla — kurbanı ver.' },
    ]},
  ]},

  { id:'c3', title:'Strateji', lessons:[

    { id:'l13', title:'Açılış (Fuseki)', steps:[
      { text:`<p>Gerçek bir Go maçından alınan açılış pozisyonu. Siyah ve Beyaz köşelere yerleşmiş, kenar kontrolü için rekabet ediyor.</p>`, board:[
        {color:'W',x:15,y:5},{color:'W',x:16,y:5},{color:'W',x:2,y:6},{color:'W',x:15,y:8},{color:'W',x:3,y:9},
        {color:'W',x:2,y:12},{color:'W',x:1,y:13},{color:'W',x:16,y:13},{color:'W',x:1,y:14},{color:'W',x:2,y:14},
        {color:'W',x:16,y:14},{color:'W',x:3,y:15},{color:'W',x:4,y:15},{color:'W',x:16,y:15},{color:'W',x:2,y:16},
        {color:'W',x:5,y:16},{color:'W',x:14,y:16},{color:'W',x:15,y:16},
        {color:'B',x:8,y:2},{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:13,y:3},{color:'B',x:15,y:3},
        {color:'B',x:16,y:4},{color:'B',x:14,y:9},{color:'B',x:2,y:13},{color:'B',x:3,y:14},{color:'B',x:15,y:14},
        {color:'B',x:1,y:15},{color:'B',x:2,y:15},{color:'B',x:9,y:15},{color:'B',x:12,y:15},{color:'B',x:14,y:15},
        {color:'B',x:1,y:16},{color:'B',x:3,y:16},{color:'B',x:13,y:16},{color:'B',x:3,y:17}
      ], auto:true, size:19, camera:CAM.board19, fb:{t:'Açılış tamamlandı — her iki taraf da köşe ve kenarlara yerleşti.',c:'info'} },
      { text:`<p><span class="term">Fuseki</span> — Go'nun açılış aşaması. İlk 10-20 hamle tahtanın genel yapısını belirler.</p><p>Temel strateji: <strong>köşe → kenar → merkez</strong> sırasıyla bölge kurmak.</p>`, board:[], auto:true, size:9, camera:CAM.high, fb:{t:'Köşeler en değerli bölgelerdir.',c:'info'} },
      { text:`<p>Standart açılış noktaları:<ul><li><strong>Hoshi (4-4)</strong> — dengeli, esnek</li><li><strong>Komoku (3-4)</strong> — bölge odaklı</li><li><strong>San-san (3-3)</strong> — köşe kesin, az etki</li></ul>Bir köşe noktasına tıkla.</p>`, board:[], answers:[{x:2,y:2},{x:3,y:3},{x:2,y:3},{x:3,y:2}], turn:'black', size:9, fb:{t:'Köşe noktalarından birini seç.',c:'info'}, fb_ok:'İyi seçim! Köşeden açıldın.' },
      { text:`<p><strong>Yüksek (4. çizgi)</strong> hamleler etki alanı, <strong>alçak (3. çizgi)</strong> hamleler bölge kontrolü sağlar.</p><div class="highlight-box">Açılışta ne kadar çok köşe alırsan başlangıç avantajın artar.</div>`, board:[{color:'B',x:2,y:2},{color:'W',x:6,y:2},{color:'B',x:6,y:6},{color:'W',x:2,y:6}], auto:true, size:9, fb:{t:'Dört köşe de alındı — denge.',c:'info'} },
    ]},

    { id:'l14', title:'Orta Oyun', steps:[
      { text:`<p>Gerçek bir Go maçından alınan orta oyun pozisyonu. Gruplar şekillenmiş, mücadele tüm tahtaya yayılmış.</p>`, board:[
        {color:'W',x:6,y:2},{color:'W',x:5,y:3},{color:'W',x:8,y:3},{color:'W',x:5,y:4},{color:'W',x:6,y:4},
        {color:'W',x:7,y:4},{color:'W',x:17,y:4},{color:'W',x:2,y:5},{color:'W',x:15,y:5},{color:'W',x:16,y:5},
        {color:'W',x:18,y:5},{color:'W',x:2,y:6},{color:'W',x:17,y:6},{color:'W',x:1,y:7},{color:'W',x:6,y:7},
        {color:'W',x:12,y:7},{color:'W',x:1,y:8},{color:'W',x:3,y:8},{color:'W',x:6,y:8},{color:'W',x:14,y:8},
        {color:'W',x:15,y:8},{color:'W',x:16,y:8},{color:'W',x:3,y:9},{color:'W',x:8,y:9},{color:'W',x:9,y:9},
        {color:'W',x:3,y:10},{color:'W',x:6,y:10},{color:'W',x:7,y:10},{color:'W',x:2,y:11},{color:'W',x:2,y:12},
        {color:'W',x:3,y:12},{color:'W',x:1,y:13},{color:'W',x:5,y:13},{color:'W',x:6,y:13},{color:'W',x:7,y:13},
        {color:'W',x:8,y:13},{color:'W',x:16,y:13},{color:'W',x:1,y:14},{color:'W',x:2,y:14},{color:'W',x:4,y:14},
        {color:'W',x:6,y:14},{color:'W',x:10,y:14},{color:'W',x:16,y:14},{color:'W',x:3,y:15},{color:'W',x:4,y:15},
        {color:'W',x:7,y:15},{color:'W',x:16,y:15},{color:'W',x:2,y:16},{color:'W',x:5,y:16},{color:'W',x:14,y:16},
        {color:'W',x:15,y:16},
        {color:'B',x:4,y:2},{color:'B',x:5,y:2},{color:'B',x:7,y:2},{color:'B',x:8,y:2},{color:'B',x:9,y:2},
        {color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:6,y:3},{color:'B',x:7,y:3},{color:'B',x:10,y:3},
        {color:'B',x:13,y:3},{color:'B',x:15,y:3},{color:'B',x:17,y:3},{color:'B',x:16,y:4},{color:'B',x:3,y:5},
        {color:'B',x:8,y:5},{color:'B',x:3,y:6},{color:'B',x:2,y:7},{color:'B',x:3,y:7},{color:'B',x:4,y:7},
        {color:'B',x:5,y:8},{color:'B',x:8,y:8},{color:'B',x:13,y:9},{color:'B',x:14,y:9},{color:'B',x:15,y:9},
        {color:'B',x:4,y:10},{color:'B',x:8,y:10},{color:'B',x:3,y:11},{color:'B',x:5,y:11},{color:'B',x:7,y:11},
        {color:'B',x:9,y:11},{color:'B',x:4,y:12},{color:'B',x:5,y:12},{color:'B',x:7,y:12},{color:'B',x:8,y:12},
        {color:'B',x:14,y:12},{color:'B',x:2,y:13},{color:'B',x:3,y:13},{color:'B',x:4,y:13},{color:'B',x:3,y:14},
        {color:'B',x:5,y:14},{color:'B',x:7,y:14},{color:'B',x:15,y:14},{color:'B',x:1,y:15},{color:'B',x:2,y:15},
        {color:'B',x:6,y:15},{color:'B',x:9,y:15},{color:'B',x:10,y:15},{color:'B',x:12,y:15},{color:'B',x:14,y:15},
        {color:'B',x:1,y:16},{color:'B',x:3,y:16},{color:'B',x:13,y:16},{color:'B',x:3,y:17}
      ], auto:true, size:19, camera:CAM.board19, fb:{t:'Orta oyun — gruplar her iki tarafta da şekillenmiş.',c:'info'} },
      { text:`<p>Orta oyunda gruplar şekillenir, savaşlar başlar. Temel hedefler:</p><ul><li>Zayıf grupları <strong>güçlendir</strong></li><li>Rakibin zayıf gruplarına <strong>saldır</strong></li><li>Bölge sınırlarını <strong>netleştir</strong></li></ul>`, board:[{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'W',x:6,y:2},{color:'W',x:6,y:3},{color:'B',x:4,y:6},{color:'B',x:5,y:6},{color:'W',x:2,y:6},{color:'W',x:2,y:5}], auto:true, size:9, camera:CAM.overview, fb:{t:'Her iki taraf da bölge oluşturuyor.',c:'info'} },
      { text:`<p><span class="term">Sente</span> — rakibin cevap vermek zorunda kaldığı hamle (inisiyatif sende).</p><p><span class="term">Gote</span> — inisiyatifi rakibe bırakan hamle.</p><div class="highlight-box">Mümkün olduğunca sente hamleler yap.</div>`, board:[], auto:true, size:9, fb:{t:'Sente = taarruz · Gote = savunma',c:'info'} },
    ]},

    { id:'l15', title:'Son Oyun (Yose)', steps:[
      { text:`<p>Gerçek bir Go maçından alınan oyun sonu pozisyonu. Siyah ve Beyaz bölgeleri şekillenmiş; sayılacak alan ve esir taşlar görülüyor.</p>`, board:[
        {color:'W',x:6,y:1},{color:'W',x:0,y:2},{color:'W',x:6,y:2},
        {color:'W',x:0,y:3},{color:'W',x:1,y:3},{color:'W',x:5,y:3},{color:'W',x:8,y:3},
        {color:'W',x:1,y:4},{color:'W',x:2,y:4},{color:'W',x:5,y:4},{color:'W',x:6,y:4},{color:'W',x:7,y:4},{color:'W',x:8,y:4},{color:'W',x:10,y:4},{color:'W',x:11,y:4},{color:'W',x:12,y:4},{color:'W',x:14,y:4},{color:'W',x:17,y:4},{color:'W',x:18,y:4},
        {color:'W',x:2,y:5},{color:'W',x:4,y:5},{color:'W',x:5,y:5},{color:'W',x:7,y:5},{color:'W',x:10,y:5},{color:'W',x:12,y:5},{color:'W',x:13,y:5},{color:'W',x:14,y:5},{color:'W',x:15,y:5},{color:'W',x:16,y:5},{color:'W',x:18,y:5},
        {color:'W',x:2,y:6},{color:'W',x:5,y:6},{color:'W',x:7,y:6},{color:'W',x:10,y:6},{color:'W',x:17,y:6},
        {color:'W',x:1,y:7},{color:'W',x:5,y:7},{color:'W',x:6,y:7},{color:'W',x:9,y:7},{color:'W',x:12,y:7},{color:'W',x:13,y:7},
        {color:'W',x:1,y:8},{color:'W',x:2,y:8},{color:'W',x:3,y:8},{color:'W',x:6,y:8},{color:'W',x:9,y:8},{color:'W',x:12,y:8},{color:'W',x:14,y:8},{color:'W',x:15,y:8},{color:'W',x:16,y:8},
        {color:'W',x:3,y:9},{color:'W',x:5,y:9},{color:'W',x:7,y:9},{color:'W',x:8,y:9},{color:'W',x:9,y:9},{color:'W',x:12,y:9},{color:'W',x:16,y:9},
        {color:'W',x:3,y:10},{color:'W',x:5,y:10},{color:'W',x:6,y:10},{color:'W',x:7,y:10},{color:'W',x:10,y:10},{color:'W',x:11,y:10},{color:'W',x:12,y:10},{color:'W',x:13,y:10},{color:'W',x:15,y:10},{color:'W',x:16,y:10},
        {color:'W',x:2,y:11},{color:'W',x:17,y:11},
        {color:'W',x:1,y:12},{color:'W',x:2,y:12},{color:'W',x:3,y:12},{color:'W',x:6,y:12},{color:'W',x:9,y:12},{color:'W',x:11,y:12},{color:'W',x:12,y:12},{color:'W',x:17,y:12},
        {color:'W',x:0,y:13},{color:'W',x:1,y:13},{color:'W',x:5,y:13},{color:'W',x:6,y:13},{color:'W',x:7,y:13},{color:'W',x:8,y:13},{color:'W',x:9,y:13},{color:'W',x:10,y:13},{color:'W',x:16,y:13},
        {color:'W',x:1,y:14},{color:'W',x:2,y:14},{color:'W',x:4,y:14},{color:'W',x:6,y:14},{color:'W',x:8,y:14},{color:'W',x:10,y:14},{color:'W',x:16,y:14},
        {color:'W',x:3,y:15},{color:'W',x:4,y:15},{color:'W',x:5,y:15},{color:'W',x:7,y:15},{color:'W',x:8,y:15},{color:'W',x:15,y:15},{color:'W',x:16,y:15},
        {color:'W',x:2,y:16},{color:'W',x:5,y:16},{color:'W',x:6,y:16},{color:'W',x:14,y:16},{color:'W',x:15,y:16},
        {color:'W',x:13,y:17},{color:'W',x:14,y:17},{color:'W',x:13,y:18},
        {color:'B',x:0,y:1},{color:'B',x:1,y:1},
        {color:'B',x:1,y:2},{color:'B',x:2,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:2},{color:'B',x:7,y:2},{color:'B',x:8,y:2},{color:'B',x:9,y:2},
        {color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:6,y:3},{color:'B',x:7,y:3},{color:'B',x:9,y:3},{color:'B',x:10,y:3},{color:'B',x:11,y:3},{color:'B',x:12,y:3},{color:'B',x:13,y:3},{color:'B',x:14,y:3},{color:'B',x:15,y:3},{color:'B',x:17,y:3},{color:'B',x:18,y:3},
        {color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:9,y:4},{color:'B',x:13,y:4},{color:'B',x:15,y:4},{color:'B',x:16,y:4},
        {color:'B',x:3,y:5},{color:'B',x:8,y:5},{color:'B',x:9,y:5},
        {color:'B',x:3,y:6},{color:'B',x:4,y:6},{color:'B',x:8,y:6},{color:'B',x:9,y:6},{color:'B',x:11,y:6},
        {color:'B',x:2,y:7},{color:'B',x:3,y:7},{color:'B',x:4,y:7},{color:'B',x:7,y:7},{color:'B',x:8,y:7},{color:'B',x:10,y:7},
        {color:'B',x:4,y:8},{color:'B',x:5,y:8},{color:'B',x:7,y:8},{color:'B',x:8,y:8},{color:'B',x:10,y:8},
        {color:'B',x:4,y:9},{color:'B',x:10,y:9},{color:'B',x:13,y:9},{color:'B',x:14,y:9},{color:'B',x:15,y:9},
        {color:'B',x:4,y:10},{color:'B',x:8,y:10},{color:'B',x:9,y:10},{color:'B',x:14,y:10},
        {color:'B',x:3,y:11},{color:'B',x:4,y:11},{color:'B',x:5,y:11},{color:'B',x:6,y:11},{color:'B',x:7,y:11},{color:'B',x:9,y:11},{color:'B',x:10,y:11},{color:'B',x:11,y:11},{color:'B',x:12,y:11},{color:'B',x:13,y:11},{color:'B',x:14,y:11},{color:'B',x:15,y:11},{color:'B',x:16,y:11},
        {color:'B',x:4,y:12},{color:'B',x:5,y:12},{color:'B',x:7,y:12},{color:'B',x:8,y:12},{color:'B',x:10,y:12},{color:'B',x:14,y:12},{color:'B',x:16,y:12},
        {color:'B',x:2,y:13},{color:'B',x:3,y:13},{color:'B',x:4,y:13},{color:'B',x:11,y:13},{color:'B',x:15,y:13},
        {color:'B',x:0,y:14},{color:'B',x:3,y:14},{color:'B',x:9,y:14},{color:'B',x:11,y:14},{color:'B',x:15,y:14},
        {color:'B',x:0,y:15},{color:'B',x:1,y:15},{color:'B',x:2,y:15},{color:'B',x:9,y:15},{color:'B',x:10,y:15},{color:'B',x:12,y:15},{color:'B',x:14,y:15},
        {color:'B',x:1,y:16},{color:'B',x:3,y:16},{color:'B',x:4,y:16},{color:'B',x:7,y:16},{color:'B',x:8,y:16},{color:'B',x:13,y:16},
        {color:'B',x:3,y:17},{color:'B',x:5,y:17},{color:'B',x:6,y:17},{color:'B',x:12,y:17},{color:'B',x:12,y:18},
      ],
      deadStones:[
        {x:6,y:1},{x:6,y:2},{x:11,y:12},{x:12,y:12},{x:2,y:16},
        {x:11,y:6},{x:10,y:7},{x:10,y:8},{x:10,y:9},
      ],
      blackTerritory:[
        {x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0},{x:5,y:0},{x:6,y:0},{x:7,y:0},{x:8,y:0},{x:9,y:0},{x:10,y:0},{x:11,y:0},{x:12,y:0},{x:13,y:0},{x:14,y:0},{x:15,y:0},{x:16,y:0},{x:17,y:0},{x:18,y:0},
        {x:2,y:1},{x:3,y:1},{x:4,y:1},{x:5,y:1},{x:7,y:1},{x:8,y:1},{x:9,y:1},{x:10,y:1},{x:11,y:1},{x:12,y:1},{x:13,y:1},{x:14,y:1},{x:15,y:1},{x:16,y:1},{x:17,y:1},{x:18,y:1},
        {x:3,y:2},{x:10,y:2},{x:11,y:2},{x:12,y:2},{x:13,y:2},{x:14,y:2},{x:15,y:2},{x:16,y:2},{x:17,y:2},{x:18,y:2},
        {x:3,y:3},{x:16,y:3},
        {x:8,y:11},
        {x:13,y:12},{x:15,y:12},
        {x:12,y:13},{x:13,y:13},{x:14,y:13},
        {x:12,y:14},{x:13,y:14},{x:14,y:14},
        {x:11,y:15},{x:13,y:15},
        {x:0,y:16},{x:9,y:16},{x:10,y:16},{x:11,y:16},{x:12,y:16},
        {x:0,y:17},{x:1,y:17},{x:2,y:17},{x:4,y:17},{x:7,y:17},{x:8,y:17},{x:9,y:17},{x:10,y:17},{x:11,y:17},
        {x:0,y:18},{x:1,y:18},{x:2,y:18},{x:3,y:18},{x:4,y:18},{x:5,y:18},{x:6,y:18},{x:7,y:18},{x:8,y:18},{x:9,y:18},{x:10,y:18},{x:11,y:18},
      ],
      whiteTerritory:[
        {x:0,y:4},
        {x:0,y:5},{x:1,y:5},{x:6,y:5},{x:11,y:5},{x:17,y:5},
        {x:0,y:6},{x:1,y:6},{x:6,y:6},{x:12,y:6},{x:13,y:6},{x:14,y:6},{x:15,y:6},{x:16,y:6},{x:18,y:6},
        {x:0,y:7},{x:11,y:7},{x:14,y:7},{x:15,y:7},{x:16,y:7},{x:17,y:7},{x:18,y:7},
        {x:0,y:8},{x:11,y:8},{x:17,y:8},{x:18,y:8},
        {x:0,y:9},{x:1,y:9},{x:2,y:9},{x:6,y:9},{x:11,y:9},{x:17,y:9},{x:18,y:9},
        {x:0,y:10},{x:1,y:10},{x:2,y:10},{x:17,y:10},{x:18,y:10},
        {x:0,y:11},{x:1,y:11},{x:18,y:11},
        {x:0,y:12},{x:18,y:12},
        {x:17,y:13},{x:18,y:13},
        {x:5,y:14},{x:7,y:14},{x:17,y:14},{x:18,y:14},
        {x:6,y:15},{x:17,y:15},{x:18,y:15},
        {x:16,y:16},{x:17,y:16},{x:18,y:16},
        {x:15,y:17},{x:16,y:17},{x:17,y:17},{x:18,y:17},
        {x:14,y:18},{x:15,y:18},{x:16,y:18},{x:17,y:18},{x:18,y:18},
      ],
      auto:true, size:19, camera:CAM.board19, fb:{t:'Oyun sonu — bölgeler ve esir taşlar sayılıyor.',c:'info'} },
      { text:`<p><span class="term">Yose</span> — oyunun son aşaması. Sınırlar netleşir, her hamle doğrudan puana dönüşür.</p>`, board:[{color:'B',x:0,y:0},{color:'B',x:1,y:0},{color:'B',x:2,y:0},{color:'B',x:0,y:1},{color:'B',x:0,y:2},{color:'B',x:0,y:3},{color:'W',x:5,y:5},{color:'W',x:6,y:5},{color:'W',x:7,y:5},{color:'W',x:8,y:5},{color:'W',x:8,y:6},{color:'W',x:8,y:7},{color:'W',x:8,y:8}], auto:true, size:9, camera:CAM.high, fb:{t:'Oyun sonunda sayılan puanlar kazanan oyuncuyu belirler.',c:'info'} },
      { text:`<p>Önem sırası:<ol><li><strong>Sente endgame</strong> — cevap gerektiren hamleler</li><li><strong>Büyük gote</strong> — en yüksek puanlı serbest hamleler</li><li><strong>Küçük gote</strong> — ince detay hamleler</li></ol></p>`, board:[], auto:true, size:9, fb:{t:'Go öğrenme yolculuğun başlıyor!',c:'info'} },
    ]},
  ]},
];
