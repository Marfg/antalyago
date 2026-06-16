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

      // 0 — Tahta ve tanışma (auto, boardSelector)
      { text:`<p>Go, <strong>19×19'luk</strong> bir tahta üzerinde oynanan iki kişilik bir strateji oyunudur. <strong>9×9</strong> tahta başlangıç için daha uygundur.</p><p>Sıralı bir hamle oyunudur, <strong>siyah</strong> önce oynar.</p>`,
        assistant: [
          { msg: 'Bu 9×9 Go tahtası.', delay: 0 },
          { msg: 'Go taşları karelerin içine değil, çizgilerin kesişim noktalarına konur.', delay: 1400 },
          { msg: '9×9 başlangıç için idealdir. 19×19 ise profesyonel standart boyuttur.', delay: 1800 },
        ],
        ctxButtons: [
          { label: 'İlk taşı koy →', action: 'next_step' },
          { label: '19×19 göster', action: 'board19' },
          { label: 'Tekrar anlat', action: 'replay', muted: true },
        ],
        board:[], auto:true, boardSelector:true, size:9, camera:CAM.overview,
        fb:{t:'Tahta boyutunu seçerek farkı inceleyin.',c:'info'} },

      // 1 — İlk taş: herhangi bir kesişim noktasına tıkla
      { text:`<p>Taşlar karelerin içine değil, <strong>çizgilerin kesişim noktalarına</strong> yerleştirilir.</p><p>Tahtada herhangi bir noktaya siyah taş koy.</p>`,
        board:[], answers:'any', turn:'black', size:9,
        camera:CAM.high,
        fb:{t:'Herhangi bir kesişim noktasına tıkla!',c:'info'},
        fb_ok:'Harika! Go\'da taşlar sırayla konur — şimdi beyazın sırası.' },

      // 2 — Nefes noktası keşfi: herhangi yere taş koy (pedagogy)
      { text:`<p>Her taşın komşu boş noktalarına <strong><span class="term">nefes noktası</span></strong> denir.</p><p>Tahtanın farklı bölgelerine taş koy ve nefes sayısının nasıl değiştiğini gör.</p>`,
        board:[], answers:'any', turn:'black', size:9, pedagogy:true,
        miniQuestion:'liberty',
        camera:CAM.high,
        fb:{t:'Herhangi bir kesişim noktasına tıkla!',c:'info'} },

      // 3 — Köşeye taş koy (pedagogy: corner liberties)
      { text:`<p>Tahtanın dört <strong>köşesindeki</strong> taşların yalnızca <strong>2 nefes noktası</strong> vardır — en savunmasız konum budur.</p><p>Köşelerden birine tıkla ve nefes sayısını gör.</p>`,
        board:[],
        answers:[{x:0,y:0},{x:8,y:0},{x:0,y:8},{x:8,y:8}],
        goalZone:'corner',
        turn:'black', size:9, pedagogy:true,
        miniQuestion:'liberty',
        camera:CAM.corner_tl,
        fb:{t:'Tahtanın dört köşesinden birine tıkla!',c:'info'},
        fb_err:'Bu köşe değil. Tahtanın dört köşesinden birine tıkla.' },

      // 4 — Beyaza bitişik taş koy (pedagogy: orthogonal contact)
      { text:`<p>Go'da taşlar <strong>yatay veya dikey</strong> komşu olduklarında birbirine bağlanır.</p><p>Beyaz taşa yatay veya dikey olarak bitişik bir noktaya siyah taş koy.</p>`,
        board:[{color:'W',x:4,y:4}],
        answers:[{x:4,y:3},{x:4,y:5},{x:3,y:4},{x:5,y:4}],
        goalAdjacent:{x:4,y:4},
        turn:'black', size:9, pedagogy:true,
        miniQuestion:{
          text:"Çapraz komşu (45°) Go'da temas sayılır mı?",
          options:[
            {text:'Sayılmaz', correct:true,  feedback:"Doğru! Go'da yalnızca yatay/dikey bağlantı geçerlidir."},
            {text:'Sayılır',  correct:false, feedback:"Hayır. Go sadece 4 yönü tanır, çapraz değil."},
          ]
        },
        camera:CAM.center,
        fb:{t:'Beyaz taşa bitişik bir noktaya tıkla!',c:'info'},
        fb_err:'Hedef taşa yatay veya dikey olarak bitişik bir noktayı seç.' },

      // 5 — Taşlar hareket etmez (auto)
      { text:`<p>Taşlar bir kez konulduktan sonra <strong>hareket ettirilemez</strong> — sadece yakalanarak kaldırılabilir.</p><div class="highlight-box">Go'da taşlar hareket etmez, sadece eklenir veya kaldırılır.</div>`,
        board:[{color:'W',x:4,y:4}], auto:true, size:9,
        fb:{t:"Bu beyaz taş artık o noktada sabit.",c:'info'},
        mascotHook:"Bu taş artık burada sabit — hareket ettiremezsin, sadece yakalayabilirsin." },
    ]},

    { id:'l2', title:'Nefes Noktaları', steps:[
      { text:`<p>Her taşın komşu boş noktalarına <strong><span class="term">nefes noktası</span></strong> denir.</p><p>Ortadaki bir taşın <strong>4 nefes noktası</strong> vardır (üst, alt, sol, sağ).</p>`, board:[{color:'B',x:4,y:4}], auto:true, showLiberties:true, size:9, camera:CAM.center, fb:{t:'Ortadaki siyah taşın 4 nefes noktası var.',c:'info'} },
      { text:`<p>Kenar noktasındaki taşın <strong>3 nefes noktası</strong>, köşedekinin ise <strong>2 nefes noktası</strong> vardır.</p><div class="highlight-box">Nefes noktası azaldıkça taş tehlikeye girer. Köşe ve kenar taşları daha savunmasızdır.</div>`, board:[{color:'B',x:0,y:0},{color:'W',x:8,y:4}], auto:true, showLiberties:true, size:9, fb:{t:'Köşe: 2 · Kenar: 3 · Orta: 4 nefes noktası',c:'info'} },
      { text:`<p>Yatay veya dikey olarak birbirine bağlı taşlar <strong>grup</strong> oluşturur. Grubun özgürlüğü tüm taşlarının boş komşularının toplamıdır.</p>`, board:[{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:5,y:4}], auto:true, showLiberties:true, size:9, fb:{t:'Bu üç taş bir grup — birlikte 8 nefes noktası var.',c:'info'} },

      // ── Alıştırma ──
      { text:`<p>★ <strong>Alıştırma:</strong> Köşedeki beyaz taşın kaç nefes noktası var?</p>`, board:[{color:'W',x:0,y:0}], auto:true, showLiberties:true, size:9, camera:CAM.corner_tl, miniQuestion:{text:'Bu taşın nefes sayısı?',options:[{text:'2',correct:true,feedback:'Doğru! Köşede yalnızca 2 boş komşu var.'},{text:'3',correct:false,feedback:'Hayır — köşede iki yön duvara çarpıyor.'},{text:'4',correct:false,feedback:'Hayır — köşede sadece 2 açık yön var.'}]}, fb:{t:'Köşe taşının nefes noktalarını say.',c:'info'} },

      { text:`<p>★★ <strong>Alıştırma:</strong> Beyazın yanına siyah geldi — şimdi kaç nefes kaldı?</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4}], auto:true, showLiberties:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyazın kalan nefes sayısı?',options:[{text:'3',correct:true,feedback:'Doğru! Dört nefesten biri siyahla kapandı.'},{text:'4',correct:false,feedback:'Hayır — soldaki nokta artık siyah taşla dolu.'},{text:'2',correct:false,feedback:'Yakın ama hayır — hâlâ 3 boş komşu kaldı.'}]}, fb:{t:'Siyah taş beyazın bir nefesini kapattı.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Beyazın tek bir nefesi kaldı — bu <strong>atari!</strong> Taşı yakala.</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], answer:{x:4,y:5}, turn:'black', size:9, camera:CAM.center, fb:{t:'Son nefes noktasına oyna ve yakala!',c:'info'}, fb_ok:'Mükemmel! Atariyi fark edip taşı yakaladın.', fb_err:'Beyaz taşa dokunan tek boş noktayı bul.' },
    ]},

    { id:'l3', title:'Taş Alma', steps:[
      { text:`<p>Bir taşın <strong>tüm nefes noktaları doldurulursa</strong>, o taş yakalanır ve tahtadan kalkar.</p><p>Beyaz taşın tek boş noktası var — oraya siyah taş koyarak beyazı yakala! <strong>E4 noktasına tıkla.</strong></p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], answer:{x:4,y:5}, turn:'black', size:9, fb:{t:'Beyaz taşın son nefes noktasına tıkla!',c:'info'}, fb_ok:'Yakaladın! Beyaz taş tahtadan kalkar.', fb_err:'Beyaz taşın çevresindeki boş noktayı bul.',
        mascot: {
          sequence: [
            { text: 'Bak, beyaz taş siyahlarla çevrilmiş!', delay: 1400 },
            { text: 'Bu boş noktayı gör?', point: {x:4, y:5}, delay: 1800 },
            { text: 'Oraya siyah taş koyarsan beyaz taş yok olur.', waitForContinue: true },
            { text: 'Şimdi dene — o noktaya tıkla!', waitForTap: true },
          ],
          onCorrect: { text: 'Yakaladın! Beyaz taş tahtadan kalktı.' },
          onIncorrect: { text: 'Neredeyse! Beyaz taşa dokunan boş noktayı bul.' },
        } },
      { text:`<p>Bir <strong>grubu</strong> yakalamak için grubun tüm nefes noktalarını doldurman gerekir.</p><p>İki beyaz taşın son nefes noktasını doldur — <strong>D5 noktasına tıkla.</strong></p>`, board:[{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:3},{color:'B',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'İki beyaz taşın son boş noktasını bul.',c:'info'}, fb_ok:'Grubu yakaladın!', fb_err:'Beyaz grubun son nefes noktasını bul.' },
      { text:`<p>Bir örnek daha! <strong>3 taşlı beyaz grup</strong> siyahlarla çevrilmiş.</p><p>Beyaz grubun tek nefes noktasını bul ve grubu yakala — <strong>E6 noktasına tıkla.</strong></p>`, board:[{color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'B',x:3,y:2},{color:'B',x:6,y:2},{color:'B',x:6,y:3},{color:'B',x:5,y:4},{color:'W',x:4,y:2},{color:'W',x:5,y:2},{color:'W',x:5,y:3}], answer:{x:4,y:3}, turn:'black', size:9, fb:{t:'3 taşlı beyaz grubun tek boş noktasını bul.',c:'info'}, fb_ok:'Mükemmel! Üç beyaz taş birden yakalandı.', fb_err:'E6 noktasına tıkla — beyazın tek boş komşusu.' },

      // ── Alıştırma ──
      { text:`<p>★ <strong>Alıştırma:</strong> Köşedeki beyaz taşı yakala.</p>`, board:[{color:'W',x:0,y:0},{color:'B',x:1,y:0}], answer:{x:0,y:1}, turn:'black', size:9, camera:CAM.corner_tl, fb:{t:'Köşe taşının son nefesini kapat!',c:'info'}, fb_ok:'Yakaladın! Köşe taşı kolay hedeftir.', fb_err:'Beyaz taşa dokunan tek boş noktayı bul.' },

      { text:`<p>★★ <strong>Alıştırma:</strong> Kenar üzerindeki beyaz taşı yakala.</p>`, board:[{color:'W',x:4,y:0},{color:'B',x:3,y:0},{color:'B',x:5,y:0}], answer:{x:4,y:1}, turn:'black', size:9, camera:CAM.high, fb:{t:'Kenar taşının tek boş noktasını kapat!',c:'info'}, fb_ok:'Güzel! Kenar taşını yakaladın.', fb_err:'Beyazın kenarda kalan tek boş noktasını bul.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> İki beyaz taşlı grubu yakala — son nefesi kapat.</p>`, board:[{color:'W',x:4,y:4},{color:'W',x:4,y:5},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:3},{color:'B',x:3,y:5},{color:'B',x:5,y:5}], answer:{x:4,y:6}, turn:'black', size:9, camera:CAM.center, fb:{t:'İki taşlı grubun son nefes noktasını bul!',c:'info'}, fb_ok:'Harika! İki taş birden yakalandı.', fb_err:'Grubun hâlâ boş olan tek komşu noktasını bul.' },

      { text:`<p>★★ <strong>Alıştırma:</strong> Üst kenardaki iki beyazı yakala.</p>`, board:[{color:'B',x:3,y:0},{color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'W',x:4,y:0},{color:'W',x:5,y:0}], answer:{x:6,y:0}, turn:'black', size:9, camera:CAM.corner_tr, capture:[{x:4,y:0},{x:5,y:0}], fb:{t:'İki beyazın ortak tek nefesini kapat!',c:'info'}, fb_ok:'İki taş birden yakalandı!', fb_err:'Beyaz grubun sağ taraftaki tek boş noktasını bul.' },

      { text:`<p>★★ <strong>Alıştırma:</strong> Sağ üst köşedeki iki beyazı yakala.</p>`, board:[{color:'B',x:6,y:0},{color:'B',x:8,y:1},{color:'W',x:7,y:0},{color:'W',x:8,y:0}], answer:{x:7,y:1}, turn:'black', size:9, camera:CAM.corner_tr, capture:[{x:7,y:0},{x:8,y:0}], fb:{t:'İki beyaz taşın tek ortak nefesini kapat!',c:'info'}, fb_ok:'Köşe yakalaması! İki taş birden gitti.', fb_err:'Beyaz grubun tek boş komşusunu bul.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> L-şekil beş taşlı beyaz grubu yakala.</p>`, board:[{color:'B',x:4,y:2},{color:'B',x:5,y:3},{color:'B',x:2,y:4},{color:'B',x:5,y:4},{color:'B',x:2,y:5},{color:'B',x:5,y:5},{color:'B',x:3,y:6},{color:'B',x:4,y:6},{color:'W',x:4,y:3},{color:'W',x:3,y:4},{color:'W',x:4,y:4},{color:'W',x:3,y:5},{color:'W',x:4,y:5}], answer:{x:3,y:3}, turn:'black', size:9, camera:CAM.center, capture:[{x:4,y:3},{x:3,y:4},{x:4,y:4},{x:3,y:5},{x:4,y:5}], fb:{t:'Beş taşlı grubun tek nefes noktasını bul!',c:'info'}, fb_ok:'Beş taş birden yakalandı! Mükemmel.', fb_err:'Beyaz grubun sol üst köşesindeki tek boş noktayı bul.' },
    ]},

    { id:'l4', title:'Yasak Hamleler', steps:[
      { text:`<p>Kendi taşını nefessiz bırakacak bir hamle <strong>yapamazsın</strong> — bu <span class="term">öz-yakalama</span> yasağıdır.</p><p>Bu tahtada <strong>4 farklı yasak nokta</strong> var. X işaretli noktaları fark et — siyah bu noktalara taş koyamaz.</p>`, board:[{color:'W',x:4,y:0},{color:'W',x:6,y:0},{color:'W',x:4,y:1},{color:'W',x:5,y:1},{color:'W',x:6,y:1},{color:'W',x:0,y:3},{color:'W',x:1,y:4},{color:'W',x:4,y:4},{color:'W',x:0,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6},{color:'W',x:8,y:7},{color:'W',x:7,y:8}], auto:true, forbidden:[{x:5,y:0},{x:0,y:4},{x:4,y:5},{x:8,y:8}], size:9, fb:{t:'4 yasak nokta: beyazın sardığı boşluklara taş konamaz.',c:'info'} },
      { text:`<p><strong>İstisna:</strong> İntihar gibi görünen hamle rakip grubu <em>yakalıyorsa</em> geçerlidir.</p><p>Siyah üstte 5 beyazı yakalarken, beyaz altta 5 siyahı yakalar — yakalama istisnasını izle.</p>`, board:[{color:'W',x:3,y:0},{color:'W',x:5,y:0},{color:'W',x:3,y:1},{color:'W',x:4,y:1},{color:'W',x:5,y:1},{color:'W',x:3,y:6},{color:'W',x:4,y:6},{color:'W',x:5,y:6},{color:'W',x:2,y:7},{color:'W',x:6,y:7},{color:'W',x:2,y:8},{color:'W',x:6,y:8},{color:'B',x:2,y:0},{color:'B',x:6,y:0},{color:'B',x:2,y:1},{color:'B',x:6,y:1},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:2},{color:'B',x:3,y:7},{color:'B',x:4,y:7},{color:'B',x:5,y:7},{color:'B',x:3,y:8},{color:'B',x:5,y:8}], moves:[{color:'B',x:4,y:0,capture:[{x:3,y:0},{x:5,y:0},{x:3,y:1},{x:4,y:1},{x:5,y:1}]},{color:'W',x:4,y:8,capture:[{x:3,y:7},{x:4,y:7},{x:5,y:7},{x:3,y:8},{x:5,y:8}]}], size:9, fb:{t:'Yakalama istisnasını izle — iki hamle canlanıyor.',c:'info'} },

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> İşaretli noktaya siyah oynayabilir mi?</p>`, board:[{color:'W',x:3,y:4},{color:'W',x:5,y:4},{color:'W',x:4,y:3},{color:'W',x:4,y:5}], auto:true, size:9, camera:CAM.center, forbidden:[{x:4,y:4}], miniQuestion:{text:'Siyah X noktasına oynayabilir mi?',options:[{text:'Hayır, yasak',correct:true,feedback:'Doğru! Koysa hiç nefesi olmaz ve yakalama da yok.'},{text:'Evet, serbest',correct:false,feedback:'Hayır — tüm komşular dolu, nefes kalmaz.'}]}, fb:{t:'Kırmızı X = bu noktaya oynamak yasak.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Köşe yasak görünüyor — ama beyazları yakalarsan serbest! Nereye oyna?</p>`, board:[{color:'B',x:2,y:0},{color:'B',x:1,y:1},{color:'B',x:0,y:2},{color:'W',x:1,y:0},{color:'W',x:0,y:1}], answer:{x:0,y:0}, turn:'black', size:9, camera:CAM.corner_tl, fb:{t:'Görünüşte yasak — ama yakalama istisnası var!',c:'info'}, fb_ok:'Evet! Beyazları yakalayarak nefes açtın — istisna geçerli.', fb_err:'Köşeye git — beyaz taşları yakalarsın ve nefes kazanırsın.' },
    ]},

    { id:'l5', title:'Ko Kuralı', steps:[
      { text:`<p><span class="term">Ko</span> — aynı pozisyonun sonsuza tekrar etmesini önleyen kuraldır.</p><p>Siyah beyazı yakalar — ama beyaz <strong>hemen geri alamaz</strong>, çünkü tahta önceki pozisyona döner.</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'W',x:4,y:4},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], moves:[{color:'B',x:4,y:5,capture:[{x:4,y:4}]}], moveSpeed:1.4, koPoint:{x:4,y:4}, size:9, camera:CAM.center, fb:{t:'Siyah yakaladı — beyaz hemen aynı noktaya dönemez. Bu Ko!',c:'info'} },
      { text:`<p>Ko savaşında oyuncular <strong>"ko tehdidi"</strong> yaparlar — tahtanın başka yerinde önemli bir hamle. Beyaz önce tehdit eder, siyah yanıtlar, sonra beyaz Ko'yu geri alır.</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], initialKoIndicator:{x:4,y:4,color:'red'}, moves:[{color:'W',x:6,y:2,indicatorAfter:{x:4,y:4,color:'green'}},{color:'B',x:2,y:2,indicatorAfter:{x:4,y:4,color:'green'}},{color:'W',x:4,y:4,capture:[{x:4,y:5}],indicatorAfter:null}], moveSpeed:1.4, size:9, camera:CAM.center, fb:{t:'Kırmızı = Ko yasak. Beyaz tehdit eder → siyah yanıtlar → yeşil = artık serbest!',c:'info'} },

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Siyah beyaz taşı yeni aldı. Beyaz hemen geri alabilir mi?</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], auto:true, size:9, camera:CAM.center, koPoint:{x:4,y:4}, miniQuestion:{text:'Beyaz kırmızı noktaya hemen oynayabilir mi?',options:[{text:'Hayır — ko kuralı',correct:true,feedback:'Doğru! Önce başka bir yere oynamalı, sonra ko\'ya dönebilir.'},{text:'Evet — hemen alır',correct:false,feedback:'Hayır! Bu ko — aynı pozisyona hemen dönemezsin.'}]}, fb:{t:'Ko = hemen geri alınamaz.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Bu pozisyon ko mu, yoksa normal mi?</p>`, board:[{color:'B',x:2,y:2},{color:'B',x:3,y:1},{color:'B',x:4,y:2},{color:'W',x:2,y:1},{color:'W',x:1,y:2},{color:'W',x:2,y:3},{color:'B',x:3,y:3}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Siyah W(2,1)\'i alırsa — ko mu?',options:[{text:'Evet, ko',correct:true,feedback:'Doğru! Beyaz hemen geri alamaz, önce başka hamle yapmalı.'},{text:'Hayır, normal alım',correct:false,feedback:'Ko! Aynı pozisyon tekrar eder — bu ko kuralının devreye girdiği andır.'}]}, fb:{t:'Ko kuralı: aynı pozisyon iki kez olamaz.',c:'info'} },
    ]},

    { id:'l6', title:'Oyun Sonu ve Sayım', steps:[
      { text:`<p>Her iki oyuncu da art arda <strong>pas geçince</strong> oyun biter.</p><p>Kazanan, <strong>daha fazla bölge</strong> çeviren oyuncudur. Bölge = etrafı sarılmış boş noktalar.</p>`, board:[{color:'W',x:3,y:0},{color:'W',x:3,y:1},{color:'W',x:2,y:2},{color:'W',x:3,y:2},{color:'W',x:5,y:2},{color:'W',x:1,y:3},{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'W',x:5,y:3},{color:'W',x:6,y:3},{color:'W',x:1,y:4},{color:'W',x:4,y:4},{color:'W',x:6,y:4},{color:'W',x:2,y:5},{color:'W',x:2,y:6},{color:'W',x:3,y:6},{color:'W',x:3,y:7},{color:'W',x:3,y:8},{color:'W',x:4,y:8},{color:'B',x:4,y:0},{color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'B',x:7,y:1},{color:'B',x:4,y:2},{color:'B',x:6,y:2},{color:'B',x:2,y:3},{color:'B',x:7,y:3},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:7,y:4},{color:'B',x:3,y:5},{color:'B',x:4,y:5},{color:'B',x:5,y:5},{color:'B',x:6,y:5},{color:'B',x:4,y:6},{color:'B',x:4,y:7},{color:'B',x:6,y:7},{color:'B',x:5,y:8}], whiteTerritory:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:2},{x:1,y:2},{x:0,y:3},{x:0,y:4},{x:0,y:5},{x:1,y:5},{x:0,y:6},{x:1,y:6},{x:0,y:7},{x:1,y:7},{x:2,y:7},{x:0,y:8},{x:1,y:8},{x:2,y:8}], blackTerritory:[{x:5,y:0},{x:6,y:0},{x:7,y:0},{x:8,y:0},{x:6,y:1},{x:8,y:1},{x:7,y:2},{x:8,y:2},{x:8,y:3},{x:8,y:4},{x:7,y:5},{x:8,y:5},{x:5,y:6},{x:6,y:6},{x:7,y:6},{x:8,y:6},{x:5,y:7},{x:7,y:7},{x:8,y:7},{x:6,y:8},{x:7,y:8},{x:8,y:8}], auto:true, size:9, camera:CAM.high, fb:{t:'Siyah sol (20 puan) · Beyaz sağ (22 puan) — beyaz önde!',c:'info'} },
      { text:`<p>Puan hesabı: <strong>Bölge</strong> + <strong>Esirler</strong> + <strong>Komi</strong> (beyaza verilen avantaj, genellikle 6.5)</p><div class="highlight-box">Komi, siyahın ilk hamle avantajını dengeler.</div>`, board:[], auto:true, size:9, fb:{t:'Komi genellikle 6.5\'tir.',c:'info'} },

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Siyahın kaç boş bölge noktası var?</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:1,y:2},{color:'B',x:4,y:2},{color:'B',x:1,y:3},{color:'B',x:4,y:3},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'W',x:5,y:5},{color:'W',x:6,y:5},{color:'W',x:7,y:5},{color:'W',x:8,y:5},{color:'W',x:5,y:6},{color:'W',x:8,y:6},{color:'W',x:5,y:7},{color:'W',x:8,y:7},{color:'W',x:5,y:8},{color:'W',x:6,y:8},{color:'W',x:7,y:8},{color:'W',x:8,y:8}], blackTerritory:[{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3}], whiteTerritory:[{x:6,y:6},{x:7,y:6},{x:6,y:7},{x:7,y:7}], auto:true, size:9, camera:CAM.high, miniQuestion:{text:'Siyahın bölgesindeki boş nokta sayısı?',options:[{text:'4',correct:true,feedback:'Doğru! 2×2 = 4 boş nokta siyahın bölgesinde.'},{text:'8',correct:false,feedback:'8 iki bölgenin toplamı — siyahın payı sadece 4.'},{text:'12',correct:false,feedback:'Hayır — yalnızca iç boş noktaları say.'}]}, fb:{t:'Mor = siyah bölgesi · Mavi = beyaz bölgesi.',c:'info'} },
    ]},

    { id:'l1_deg', title:'İlk Tahta Kontrolü ✓', steps:[
      { text:`<p>★ <strong>Soru 1/12</strong> — Köşedeki taşın kaç nefes noktası var?</p>`, board:[{color:'W',x:0,y:0}], auto:true, showLiberties:true, size:9, camera:CAM.corner_tl, miniQuestion:{text:'Nefes sayısı?',options:[{text:'2',correct:true,feedback:'Doğru! Köşede 2 nefes noktası var.'},{text:'3',correct:false,feedback:'Hayır — köşede 2 yön açık.'},{text:'4',correct:false,feedback:'Hayır — ortada değil, köşede.'}]}, fb:{t:'Nefes noktalarını say.',c:'info'} },

      { text:`<p>★ <strong>Soru 2/12</strong> — Beyaz taşı yakala.</p>`, board:[{color:'W',x:0,y:0},{color:'B',x:1,y:0}], answer:{x:0,y:1}, turn:'black', size:9, camera:CAM.corner_tl, fb:{t:'Beyaz taşın son nefesini kapat.',c:'info'}, fb_ok:'Doğru! Yakaladın.', fb_err:'Beyaza dokunan tek boş noktayı bul.' },

      { text:`<p>★ <strong>Soru 3/12</strong> — Kenar taşının kaç nefesi var?</p>`, board:[{color:'W',x:4,y:0}], auto:true, showLiberties:true, size:9, camera:CAM.high, miniQuestion:{text:'Nefes sayısı?',options:[{text:'3',correct:true,feedback:'Evet! Kenarda 3 boş komşu.'},{text:'2',correct:false,feedback:'Hayır — kenar köşe değil, 3 açık yön var.'},{text:'4',correct:false,feedback:'Hayır — bir yön tahtanın dışına çıkıyor.'}]}, fb:{t:'Kenar taşının nefeslerini say.',c:'info'} },

      { text:`<p>★★ <strong>Soru 4/12</strong> — Beyaz atari'de mi?</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], auto:true, showLiberties:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz atari\'de mi (tek nefes)?',options:[{text:'Evet, atari',correct:true,feedback:'Doğru! Yalnızca alt nokta boş — atari.'},{text:'Hayır, güvende',correct:false,feedback:'Hayır — üç komşu dolu, tek boş nokta kaldı.'}]}, fb:{t:'Nefes noktasını say.',c:'info'} },

      { text:`<p>★★ <strong>Soru 5/12</strong> — Atari'deki beyazı yakala.</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], answer:{x:4,y:5}, turn:'black', size:9, camera:CAM.center, fb:{t:'Son nefese oyna!',c:'info'}, fb_ok:'Yakaladın!', fb_err:'Beyaza dokunan tek boş noktayı bul.' },

      { text:`<p>★★ <strong>Soru 6/12</strong> — İşaretli noktaya siyah oynayabilir mi?</p>`, board:[{color:'W',x:3,y:4},{color:'W',x:5,y:4},{color:'W',x:4,y:3},{color:'W',x:4,y:5}], auto:true, size:9, camera:CAM.center, forbidden:[{x:4,y:4}], miniQuestion:{text:'Siyah X noktasına oynayabilir mi?',options:[{text:'Hayır, yasak',correct:true,feedback:'Doğru! Nefessiz kalır ve yakalama yok.'},{text:'Evet, serbest',correct:false,feedback:'Hayır — koysa hiç nefesi olmaz.'}]}, fb:{t:'Kırmızı X = yasak nokta.',c:'info'} },

      { text:`<p>★★ <strong>Soru 7/12</strong> — Beyaz hemen geri alabilir mi?</p>`, board:[{color:'B',x:4,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6}], auto:true, size:9, camera:CAM.center, koPoint:{x:4,y:4}, miniQuestion:{text:'Beyaz kırmızı noktaya hemen oynayabilir mi?',options:[{text:'Hayır — ko',correct:true,feedback:'Doğru! Ko kuralı — önce başka hamle gerekli.'},{text:'Evet',correct:false,feedback:'Hayır! Bu ko — hemen geri dönemezsin.'}]}, fb:{t:'Ko = hemen geri alınamaz.',c:'info'} },

      { text:`<p>★★ <strong>Soru 8/12</strong> — Bu iki taşlı grubun toplam nefes sayısı?</p>`, board:[{color:'B',x:4,y:4},{color:'B',x:5,y:4}], auto:true, showLiberties:true, size:9, camera:CAM.center, miniQuestion:{text:'Grubun toplam nefes sayısı?',options:[{text:'6',correct:true,feedback:'Evet! Her taşın 3 dış nefesi, toplam 6.'},{text:'4',correct:false,feedback:'Hayır — iki taş birbirinden bağımsız nefes kazanır.'},{text:'8',correct:false,feedback:'Hayır — birbirine komşu nokta çift sayılmaz.'}]}, fb:{t:'Bağlı taşların nefesleri birleşir.',c:'info'} },

      { text:`<p>★★★ <strong>Soru 9/12</strong> — İki beyaz taşlı grubu yakala.</p>`, board:[{color:'W',x:4,y:4},{color:'W',x:4,y:5},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:3},{color:'B',x:3,y:5},{color:'B',x:5,y:5}], answer:{x:4,y:6}, turn:'black', size:9, camera:CAM.center, fb:{t:'Grubun son boş noktasını bul!',c:'info'}, fb_ok:'Mükemmel! İki taş birden yakalandı.', fb_err:'Grubun tek boş komşusunu bul.' },

      { text:`<p>★★★★ <strong>Soru 10/12</strong> — Köşe yasak görünüyor ama değil! Beyazları yakala.</p>`, board:[{color:'B',x:2,y:0},{color:'B',x:1,y:1},{color:'B',x:0,y:2},{color:'W',x:1,y:0},{color:'W',x:0,y:1}], answer:{x:0,y:0}, turn:'black', size:9, camera:CAM.corner_tl, fb:{t:'Görünüşte yasak — ama yakalayarak girebilirsin!',c:'info'}, fb_ok:'Harika! İstisna kuralını uyguladın — beyazları yakalayarak nefes açtın.', fb_err:'Köşeye (A9) git — beyaz taşları yakalarsın.' },

      { text:`<p>★★★ <strong>Soru 11/12</strong> — Üst kenardaki üç taşlı grubu yakala.</p>`, board:[{color:'W',x:1,y:0},{color:'W',x:2,y:0},{color:'W',x:3,y:0},{color:'B',x:0,y:0},{color:'B',x:4,y:0},{color:'B',x:2,y:1},{color:'B',x:3,y:1}], answer:{x:1,y:1}, turn:'black', size:9, camera:CAM.high, capture:[{x:1,y:0},{x:2,y:0},{x:3,y:0}], fb:{t:'Üç taşlı kenar grubunun tek nefesini bul!',c:'info'}, fb_ok:'Üç taş birden yakalandı!', fb_err:'Grubun sol alt boş noktasını bul.' },

      { text:`<p>★★★★ <strong>Soru 12/12</strong> — Üst kenardaki dört taşlı grubu yakala.</p>`, board:[{color:'W',x:2,y:0},{color:'W',x:3,y:0},{color:'W',x:4,y:0},{color:'W',x:5,y:0},{color:'B',x:1,y:0},{color:'B',x:6,y:0},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:6,y:1}], answer:{x:5,y:1}, turn:'black', size:9, camera:CAM.high, capture:[{x:2,y:0},{x:3,y:0},{x:4,y:0},{x:5,y:0}], fb:{t:'Dört taşlı grubun tek nefesini bul!',c:'info'}, fb_ok:'Dört taş birden yakalandı! Mükemmel.', fb_err:'Grubun sağ alt boş noktasını bul.' },

      { text:`<p>★★★ — <strong>A</strong> ve <strong>B</strong> ile işaretli iki gruptan hangisi daha fazla nefes noktasına sahip?</p>`, board:[{color:'B',x:6,y:2},{color:'B',x:5,y:3},{color:'B',x:3,y:6},{color:'B',x:5,y:6},{color:'B',x:6,y:5},{color:'B',x:7,y:5},{color:'B',x:7,y:6},{color:'B',x:3,y:7},{color:'B',x:4,y:7},{color:'B',x:5,y:7},{color:'W',x:2,y:6},{color:'W',x:3,y:5},{color:'W',x:4,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:6},{color:'W',x:6,y:6},{color:'W',x:6,y:7},{color:'W',x:7,y:7},{color:'W',x:2,y:7},{color:'W',x:8,y:7}], focusStones:[{x:3,y:6},{x:3,y:7},{x:4,y:7},{x:5,y:6},{x:5,y:7},{x:6,y:6},{x:6,y:7},{x:7,y:7},{x:8,y:7}], stoneLabels:[{x:3,y:7,label:'A'},{x:6,y:7,label:'B'}], showLiberties:true, auto:true, size:9, camera:CAM.overview, miniQuestion:{text:'Hangi grup daha fazla nefes noktasına sahip?',options:[{text:'A grubu (Siyah) daha fazla',correct:false,feedback:'Hayır. A grubu (Siyah) 3 nefes noktasında — B grubu daha fazla.'},{text:'B grubu (Beyaz) daha fazla',correct:true,feedback:'Doğru! B grubu (Beyaz) 4, A grubu (Siyah) 3 nefes noktasına sahip.'},{text:'İkisi eşit',correct:false,feedback:'Hayır. B grubu 4, A grubu 3 nefes noktası — eşit değil.'}]}, fb:{t:'A ve B işaretli grupların nefes noktalarını say.',c:'info'} },
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

      // ── Alıştırma ──
      { text:`<p>★ <strong>Alıştırma:</strong> Bu siyah grup canlı mı, ölü mü?</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:1,y:2},{color:'B',x:3,y:2},{color:'B',x:1,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:3}], groupIndicators:[{x:2,y:2,color:'green'}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Bu grup canlı mı?',options:[{text:'Canlı — iki gözü var',correct:false,feedback:'Hayır — tek bir boş iç nokta var. Tek göz = ölümlü.'},{text:'Ölümlü — tek göz',correct:true,feedback:'Doğru! Tek göz yetmez. Beyaz ortaya oynayıp grubu öldürebilir.'}]}, fb:{t:'Kaç göz var? Say.',c:'info'} },

      { text:`<p>★★ <strong>Alıştırma:</strong> İkinci gözü tamamla — grubu kurtar.</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:1,y:2},{color:'B',x:4,y:2},{color:'B',x:1,y:3},{color:'B',x:4,y:3},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'B',x:4,y:4},{color:'W',x:3,y:3}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'İkinci göz için nereye oyna?',c:'info'}, fb_ok:'İki göz tamamlandı — grup artık ölümsüz!', fb_err:'Grubun içini ikiye böl — iki ayrı boş alan oluştur.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Beyaz bu grubu öldürebilir mi? Kritik noktaya oyna.</p>`, board:[{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:2,y:2},{color:'B',x:4,y:2},{color:'B',x:2,y:3},{color:'B',x:3,y:3},{color:'B',x:4,y:3}], answer:{x:3,y:2}, turn:'white', size:9, camera:CAM.center, fb:{t:'Sahte gözün kritik noktasını bul!',c:'info'}, fb_ok:'Evet! Tek göz yıkıldı — siyah grup ölümlü.', fb_err:'Grubun tek boş iç noktasına oyna.' },

      { text:`<p>★★ <strong>Alıştırma:</strong> Bu siyah grup canlı mı?</p>`, board:[{color:'B',x:0,y:3},{color:'B',x:1,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:3},{color:'B',x:4,y:3},{color:'B',x:0,y:4},{color:'B',x:2,y:4},{color:'B',x:4,y:4},{color:'B',x:0,y:5},{color:'B',x:1,y:5},{color:'B',x:2,y:5},{color:'B',x:3,y:5},{color:'B',x:4,y:5}], groupIndicators:[{x:1,y:4,color:'green'},{x:3,y:4,color:'green'}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Bu siyah grup canlı mı?',options:[{text:'Canlı — iki ayrı göz var',correct:true,feedback:'Doğru! (1,4) ve (3,4) iki ayrı gerçek göz — dört siyah taşla çevrili, ölümsüz.'},{text:'Ölümlü — tek göz',correct:false,feedback:'Hayır — iki ayrı boş iç nokta sayıyoruz; her biri kendi etrafındaki siyahlarla çevrilmiş.'}]}, fb:{t:'Yeşil halkalar = iki ayrı göz noktası.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> İç alanı ikiye bölerek iki göz yap — grubu kurtar.</p>`, board:[{color:'B',x:0,y:4},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:0,y:5},{color:'B',x:4,y:5},{color:'B',x:0,y:6},{color:'B',x:1,y:6},{color:'B',x:2,y:6},{color:'B',x:3,y:6},{color:'B',x:4,y:6}], answer:{x:2,y:5}, turn:'black', size:9, camera:CAM.center, fb:{t:'Ortadaki üç boşluğu ikiye ayır — her parça ayrı göz olsun.',c:'info'}, fb_ok:'İki göz tamamlandı — (1,5) ve (3,5) artık iki ayrı göz. Grup ölümsüz!', fb_err:'Orta noktaya (C6) oyna — iç alanı sola ve sağa böl.' },
    ]},

    { id:'l8', title:'Kesme ve Bağlama', steps:[
      { text:`<p><span class="term">Kesme</span> — rakibin iki taşı arasına girerek bağlantısını koparmak.</p><p>Siyahın iki taşı arasına gir — <strong>E4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answer:{x:4,y:3}, turn:'white', size:9, fb:{t:'Siyahın iki taşı arasına gir!',c:'info'}, fb_ok:'Kestik! Siyah artık iki ayrı grup.', fb_err:'Siyahın iki taşını birbirine bağlayan boşluğu bul.' },
      { text:`<p><span class="term">Bağlama</span> — kendi taşlarının arasını kapatarak grubu güçlendirmek.</p><p>Siyah taşları birleştir — <strong>D4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:3,y:5},{color:'W',x:2,y:4},{color:'W',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'Siyah taşlarını birleştir!',c:'info'}, fb_ok:'Güçlü bağlantı! Artık tek grup.', fb_err:'Siyah taşlar arasındaki boşluğu doldur.' },

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Beyaz nereye keser?</p>`, board:[{color:'B',x:2,y:4},{color:'B',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz hangi noktaya girerek siyahı keser?',options:[{text:'D5 (3,4)',correct:true,feedback:'Doğru! Orta nokta siyahın bağlantısını koparır.'},{text:'C4 (2,3)',correct:false,feedback:'Hayır — bu nokta bağlantıyı kesmez.'},{text:'E5 (4,3)',correct:false,feedback:'Hayır — kesme noktası iki taş arasında olmalı.'}]}, fb:{t:'Siyahın hangi noktası bağlantı boşluğu?',c:'info'} },

      { text:`<p>★★ <strong>Alıştırma:</strong> Siyah taşları birbirine bağla.</p>`, board:[{color:'B',x:2,y:2},{color:'B',x:4,y:4},{color:'W',x:3,y:2},{color:'W',x:2,y:3}], answer:{x:3,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'İki siyah taşı bağlayan noktayı bul.',c:'info'}, fb_ok:'Bağlandı! Artık tek güçlü grup.', fb_err:'İki siyah taş arasındaki köşegen bağlantıyı kapatacak noktayı bul.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Beyaz kesiyor mu yoksa siyah bağlıyor mu — doğru hamleyi seç.</p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answers:[{x:4,y:3}], turn:'black', size:9, camera:CAM.center, fb:{t:'Siyahın bağlantısını kes mi, koru mu?',c:'info'}, fb_ok:'Doğru — siyah bağlantıyı korudu, beyazın kesmesi engellendi.', fb_err:'Siyah taşlar arasındaki boşluğu kapat.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Kaplan ağzını tamamla — içeriyi koru.</p>`, board:[{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:3,y:2},{color:'W',x:5,y:4}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Üç siyah taşın altına oyna — içe giren düşman taşı yakalanır!',c:'info'}, fb_ok:'Kaplan ağzı tamamlandı! Beyaz (3,3) noktasına girerse anında yakalanır — 4 komşusu da siyah.', fb_err:'Üç siyah taşın orta noktasının altına oyna.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Kaplan ağzına girilebilir mi?</p>`, board:[{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:3,y:2},{color:'B',x:3,y:4}], forbidden:[{x:3,y:3}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz kırmızı X noktasına oynayabilir mi?',options:[{text:'Hayır — kaplan ağzı, anında yakalanır',correct:true,feedback:'Doğru! Dört komşusunun tamamı siyah — nefessiz kalır, yasak hamle.'},{text:'Evet — serbest',correct:false,feedback:'Hayır! Dört komşusu da siyah taş — oynarsa hiç nefesi kalmaz.'}]}, fb:{t:'Kaplan ağzı = 4 komşu siyah → düşman için yasak bölge.',c:'info'} },
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

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Çift atari noktasını bul.</p>`, board:[{color:'W',x:3,y:3},{color:'W',x:5,y:5},{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:5,y:4},{color:'B',x:6,y:5},{color:'B',x:4,y:5}], answer:{x:4,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Tek hamleyle iki beyazı atariye al!',c:'info'}, fb_ok:'Çift atari! Beyaz ikisini birden kurtaramaz.', fb_err:'Her iki beyaz taşa da tek hamlede atari kuracak noktayı bul.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Bu pozisyonda çift atari mümkün mü?</p>`, board:[{color:'W',x:2,y:2},{color:'W',x:6,y:6},{color:'B',x:1,y:2},{color:'B',x:3,y:2},{color:'B',x:2,y:1},{color:'B',x:5,y:6},{color:'B',x:7,y:6},{color:'B',x:6,y:5}], auto:true, size:9, camera:CAM.overview, miniQuestion:{text:'Bu pozisyonda çift atari kurmak mümkün mü?',options:[{text:'Hayır — taşlar çok uzak',correct:true,feedback:'Doğru! İki beyaz taş birbirinden kopuk, tek bir nokta her ikisine atari yapamaz.'},{text:'Evet — D4 noktası çalışır',correct:false,feedback:'Hayır — iki taş arasındaki mesafe çok büyük.'}]}, fb:{t:'Çift atari için taşların yakın olması gerekir.',c:'info'} },
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

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Bu pozisyon merdiven mi?</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz bu atariden kaçabilir mi?',options:[{text:'Hayır — merdiven, yakalanır',correct:true,feedback:'Doğru! Kaçtıkça köşeye sürülecek ve yakalanacak.'},{text:'Evet — kurtulur',correct:false,feedback:'Hayır. Her adımda yeniden atariye girer.'}]}, fb:{t:'Merdiven = kaçış yok.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Merdiveni başlat — ilk hamleyi oyna.</p>`, board:[{color:'W',x:5,y:5},{color:'B',x:4,y:4},{color:'B',x:4,y:5},{color:'B',x:6,y:5},{color:'B',x:5,y:6}], answer:{x:5,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyaza atari kur — merdiveni başlat!',c:'info'}, fb_ok:'Merdiven başladı! Beyaz köşeye doğru sürülecek.', fb_err:'Beyazın kaçacağı yönün önünü kes.' },
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

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Beyaz taşı ağa düşür — hangi nokta?</p>`, board:[{color:'W',x:5,y:3},{color:'B',x:4,y:2},{color:'B',x:4,y:3},{color:'B',x:5,y:4},{color:'B',x:6,y:4}], answer:{x:6,y:2}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyazın tüm kaçış yollarını kapatan noktayı bul!',c:'info'}, fb_ok:'Ağ kuruldu! Beyaz nereye kaçarsa yakalanır.', fb_err:'Beyazın sağ üst kaçışını kapatan noktayı bul.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Ağ mı merdiven mi — hangisi daha uygun?</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:4},{color:'B',x:4,y:5},{color:'B',x:5,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Bu pozisyonda doğru yaklaşım hangisi?',options:[{text:'Ağ — F6\'ya oyna',correct:true,feedback:'Doğru! Ağ burada çalışır — beyaz nereye kaçarsa yakalanır.'},{text:'Merdiven — E6\'ya oyna',correct:false,feedback:'Hayır. Merdiven burada çalışmaz, ağ daha etkili.'}]}, fb:{t:'Ağ = etrafı çevirme, merdiven = atari zinciri.',c:'info'} },
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

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Snapback mi, normal yakalama mı?</p>`, board:[{color:'W',x:3,y:3},{color:'W',x:2,y:4},{color:'W',x:4,y:4},{color:'B',x:1,y:3},{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'B',x:4,y:3},{color:'B',x:1,y:4},{color:'B',x:1,y:5},{color:'B',x:2,y:5},{color:'B',x:3,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'D5\'e (3,4) oynamak snapback midir?',options:[{text:'Evet — snapback',correct:true,feedback:'Doğru! Beyaz kurbanı alır, sonra siyah geri alarak daha büyük grubu yakalar.'},{text:'Hayır — normal yakalama',correct:false,feedback:'Bu snapback — kurban veriyorsun, beyaz alıyor, sen geri alıyorsun.'}]}, fb:{t:'Snapback = kurban ver, geri al.',c:'info'} },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Kurban ver ve snapback tamamla.</p>`, board:[{color:'W',x:4,y:2},{color:'W',x:3,y:3},{color:'W',x:5,y:3},{color:'B',x:3,y:2},{color:'B',x:5,y:2},{color:'B',x:2,y:3},{color:'B',x:6,y:3},{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:5,y:4}], answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center, movesAfterAnswer:[{color:'W',x:4,y:3,capture:[{x:4,y:3}]},{color:'B',x:4,y:3,capture:[{x:4,y:2},{x:3,y:3},{x:5,y:3}]}], fb:{t:'Kurbanı ver — snapback!',c:'info'}, fb_ok:'Snapback tamamlandı! Üç beyaz taş geri alındı.', fb_err:'Ortaya (E4) oyna — kurbanı ver.' },
    ]},

    { id:'l2_deg', title:'Canlı mı, Ölü mü? ✓', steps:[
      { text:`<p>★ <strong>Soru 1/12</strong> — Bu grup canlı mı?</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:1,y:2},{color:'B',x:3,y:2},{color:'B',x:1,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:3}], groupIndicators:[{x:2,y:2,color:'red'}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Bu grup canlı mı?',options:[{text:'Hayır — tek göz',correct:true,feedback:'Doğru! Tek göz yetmez, yakalanabilir.'},{text:'Evet — canlı',correct:false,feedback:'Hayır. İki gerçek göz gerekli.'}]}, fb:{t:'Kaç boş iç nokta var?',c:'info'} },

      { text:`<p>★ <strong>Soru 2/12</strong> — İkinci gözü tamamla.</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:1,y:2},{color:'B',x:4,y:2},{color:'B',x:1,y:3},{color:'B',x:4,y:3},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4}], answer:{x:3,y:2}, turn:'black', size:9, camera:CAM.center, fb:{t:'Grubu ikiye böl — iki ayrı göz yap.',c:'info'}, fb_ok:'İki göz! Grup ölümsüz.', fb_err:'İç alanı ikiye bölecek noktayı bul.' },

      { text:`<p>★★ <strong>Soru 3/12</strong> — Beyaz grubu öldür. Kritik noktaya oyna.</p>`, board:[{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:4,y:1},{color:'B',x:2,y:2},{color:'B',x:4,y:2},{color:'B',x:2,y:3},{color:'B',x:3,y:3},{color:'B',x:4,y:3}], answer:{x:3,y:2}, turn:'white', size:9, camera:CAM.center, fb:{t:'Tek gözü de yık!',c:'info'}, fb_ok:'Grup öldü — tek göz beyazla doldu.', fb_err:'Tek boş iç noktaya oyna.' },

      { text:`<p>★★ <strong>Soru 4/12</strong> — Hangi taşlar ölü?</p>`, board:[{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'W',x:3,y:4},{color:'W',x:4,y:4},{color:'B',x:2,y:3},{color:'B',x:5,y:3},{color:'B',x:2,y:4},{color:'B',x:5,y:4},{color:'B',x:3,y:5},{color:'B',x:4,y:5},{color:'B',x:3,y:2},{color:'B',x:4,y:2}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz taşlar canlı mı?',options:[{text:'Hayır — gözsüz, ölü',correct:true,feedback:'Doğru! İç boş nokta yok — iki göz yapamaz.'},{text:'Evet — canlı',correct:false,feedback:'Hayır. Hiç göz yok — beyaz ölü.'}]}, fb:{t:'İç boş nokta sayısını kontrol et.',c:'info'} },

      { text:`<p>★★ <strong>Soru 5/12</strong> — Kesme mi, bağlama mı — doğru hamleyi seç.</p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Siyah bağlantısını koru!',c:'info'}, fb_ok:'Bağlandı — beyazın kesmesi engellendi.', fb_err:'İki siyah taş arasındaki boşluğu kapat.' },

      { text:`<p>★★ <strong>Soru 6/12</strong> — Çift atari noktasını bul.</p>`, board:[{color:'W',x:3,y:3},{color:'W',x:5,y:5},{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:5,y:4},{color:'B',x:6,y:5},{color:'B',x:4,y:5}], answer:{x:4,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Tek hamlede iki beyazı atariye al!',c:'info'}, fb_ok:'Çift atari!', fb_err:'Her iki beyaza da atari yapacak noktayı bul.' },

      { text:`<p>★★ <strong>Soru 7/12</strong> — Ağı kur.</p>`, board:[{color:'W',x:5,y:3},{color:'B',x:4,y:2},{color:'B',x:4,y:3},{color:'B',x:5,y:4},{color:'B',x:6,y:4}], answer:{x:6,y:2}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyazın kaçış yolunu kes!',c:'info'}, fb_ok:'Ağ kuruldu!', fb_err:'Beyazın sağ üst kaçışını kapatan noktayı bul.' },

      { text:`<p>★★★ <strong>Soru 8/12</strong> — Merdiveni başlat.</p>`, board:[{color:'W',x:5,y:5},{color:'B',x:4,y:4},{color:'B',x:4,y:5},{color:'B',x:6,y:5},{color:'B',x:5,y:6}], answer:{x:5,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Atari kur — merdiveni başlat!',c:'info'}, fb_ok:'Merdiven başladı!', fb_err:'Beyazın kaçacağı yönün önünü kes.' },

      { text:`<p>★★★ <strong>Soru 9/12</strong> — Snapback: kurban ver.</p>`, board:[{color:'W',x:3,y:3},{color:'W',x:2,y:4},{color:'W',x:4,y:4},{color:'W',x:4,y:5},{color:'B',x:4,y:3},{color:'B',x:5,y:3},{color:'B',x:5,y:4},{color:'B',x:2,y:5},{color:'B',x:5,y:5},{color:'B',x:3,y:6},{color:'B',x:4,y:6}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.center, movesAfterAnswer:[{color:'W',x:3,y:5,capture:[{x:3,y:4}]},{color:'B',x:3,y:4,capture:[{x:3,y:5},{x:4,y:4},{x:4,y:5}]}], fb:{t:'Kurbanı ver!',c:'info'}, fb_ok:'Snapback! Büyük grup yakalandı.', fb_err:'D5\'e oyna — kurban ver.' },

      { text:`<p>★★★★ <strong>Soru 10/12</strong> — Bu grup canlı mı? Cevapla ve gerekirse kurtar.</p>`, board:[{color:'W',x:2,y:2},{color:'W',x:3,y:2},{color:'W',x:4,y:2},{color:'W',x:2,y:3},{color:'W',x:4,y:3},{color:'W',x:2,y:4},{color:'W',x:3,y:4},{color:'W',x:4,y:4},{color:'B',x:1,y:2},{color:'B',x:5,y:2},{color:'B',x:1,y:3},{color:'B',x:5,y:3},{color:'B',x:1,y:4},{color:'B',x:5,y:4},{color:'B',x:2,y:5},{color:'B',x:3,y:5},{color:'B',x:4,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz grup canlı mı?',options:[{text:'Hayır — tek göz, ölümlü',correct:true,feedback:'Doğru! Tek göz = ölümlü. Siyah ortaya oynayıp öldürebilir.'},{text:'Evet — iki göz var',correct:false,feedback:'Sayalım: yalnızca bir boş iç nokta var.'}]}, fb:{t:'Göz sayısını dikkatlice say.',c:'info'} },

      { text:`<p>★★★ <strong>Soru 11/12</strong> — Kaplan ağzını tamamla.</p>`, board:[{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:3,y:2}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Üç taşın altına oyna — içeriyi koru.',c:'info'}, fb_ok:'Kaplan ağzı tamamlandı! (3,3) noktası artık korumalı — beyaz girerse yakalanır.', fb_err:'Üç siyah taşın orta noktasının altına oyna.' },

      { text:`<p>★★★★ <strong>Soru 12/12</strong> — Kaplan ağzına girilebilir mi?</p>`, board:[{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:3,y:2},{color:'B',x:3,y:4}], forbidden:[{x:3,y:3}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz kırmızı X noktasına oynayabilir mi?',options:[{text:'Hayır — kaplan ağzı, anında yakalanır',correct:true,feedback:'Doğru! Dört komşusunun tamamı siyah — nefessiz kalır, bu yasak bir hamledir.'},{text:'Evet — serbest',correct:false,feedback:'Hayır! Dört komşusu da siyah taş — oynarsa anında yakalanır.'}]}, fb:{t:'Kaplan ağzı = tüm komşular dolu → yasak giriş.',c:'info'} },
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

      // ── Alıştırma ──
      { text:`<p>★★ <strong>Alıştırma:</strong> Siyah için en değerli köşeye oyna.</p>`, board:[], answers:[{x:2,y:2},{x:3,y:3},{x:2,y:3},{x:3,y:2},{x:6,y:2},{x:5,y:3},{x:6,y:3},{x:5,y:2},{x:2,y:5},{x:3,y:5},{x:5,y:5},{x:6,y:5}], turn:'black', size:9, camera:CAM.high, fb:{t:'Köşe → kenar → merkez sırasıyla oyna.',c:'info'}, fb_ok:'Güzel açılış! Köşeyi güvence altına aldın.', fb_err:'Açılışta önce köşeleri hedefle.' },

      { text:`<p>★★★ <strong>Alıştırma:</strong> Siyahın sınırındaki boşluğu kapat — bölgeni savun.</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:1,y:2},{color:'B',x:1,y:3},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'W',x:5,y:2},{color:'W',x:5,y:3},{color:'W',x:5,y:4}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.high, fb:{t:'Sınırdaki boşluğu kapat!',c:'info'}, fb_ok:'Sınır kapatıldı — beyaz giremez.', fb_err:'Siyahın sol alt köşe bölgesinin açık noktasını bul.' },
    ]},

    { id:'l3_deg', title:'İlk Taktik Sınavı ✓', steps:[
      { text:`<p>★ <strong>Soru 1/12</strong> — Siyahın bağlantısını koru.</p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Bağlantı noktasını bul.',c:'info'}, fb_ok:'Bağlandı!', fb_err:'İki siyah taş arasındaki boşluğu kapat.' },

      { text:`<p>★ <strong>Soru 2/12</strong> — Beyaz nereyi keser?</p>`, board:[{color:'B',x:2,y:4},{color:'B',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:5}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Beyaz hangi noktaya girerek siyahı keser?',options:[{text:'D5 (3,4)',correct:true,feedback:'Doğru! Orta nokta siyahın bağlantısını koparır.'},{text:'C4 (2,3)',correct:false,feedback:'Hayır — bu kesme noktası değil.'},{text:'E4 (4,3)',correct:false,feedback:'Hayır — kesme iki taş arasında olmalı.'}]}, fb:{t:'Kesme noktasını göster.',c:'info'} },

      { text:`<p>★ <strong>Soru 3/12</strong> — Atari kur.</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'B',x:3,y:5}], answer:{x:3,y:4}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyaza atari yap!',c:'info'}, fb_ok:'Atari! Beyaz cevap vermek zorunda.', fb_err:'Beyazı tek nefese sokacak noktayı bul.' },

      { text:`<p>★★ <strong>Soru 4/12</strong> — Atariden kaç.</p>`, board:[{color:'B',x:4,y:4},{color:'W',x:3,y:4},{color:'W',x:4,y:3},{color:'W',x:5,y:4}], answers:[{x:4,y:5},{x:4,y:6}], turn:'black', size:9, camera:CAM.center, fb:{t:'Siyah atari\'de — kaç!',c:'info'}, fb_ok:'Kaçtın! Daha fazla nefes açıldı.', fb_err:'Siyahın kaçabileceği tek boş yönü bul.' },

      { text:`<p>★★ <strong>Soru 5/12</strong> — Kesme tehlikeli mi?</p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:5},{color:'W',x:4,y:4},{color:'B',x:2,y:4},{color:'B',x:4,y:2},{color:'B',x:6,y:4},{color:'B',x:4,y:6}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'W(4,4) siyahı kesiyor — bu kesme tehlikeli mi?',options:[{text:'Evet — iki grup ayrıldı',correct:true,feedback:'Doğru! İki siyah taş artık bağlı değil.'},{text:'Hayır — siyah güçlü',correct:false,feedback:'Hayır, kesme gerçek — iki taş birbirinden koptu.'}]}, fb:{t:'Kesilen taşlar ayrı savunmak zorunda.',c:'info'} },

      { text:`<p>★★ <strong>Soru 6/12</strong> — Karşılıklı atari: kim kazanır?</p>`, board:[{color:'B',x:4,y:4},{color:'B',x:4,y:5},{color:'W',x:5,y:4},{color:'W',x:5,y:5},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'W',x:6,y:4},{color:'W',x:5,y:3}], auto:true, size:9, camera:CAM.center, miniQuestion:{text:'Siyahın sırası — siyah mı beyaz mı kazanır?',options:[{text:'Siyah — daha çok nefesi var',correct:true,feedback:'Doğru! Siyah daha fazla nefese sahip, önce beyazı alır.'},{text:'Beyaz — aynı nefes',correct:false,feedback:'Hayır — siyahın daha fazla nefesi var.'}]}, fb:{t:'Nefes say, önce oynayan alır.',c:'info'} },

      { text:`<p>★★ <strong>Soru 7/12</strong> — Merdiveni devam ettir.</p>`, board:[{color:'W',x:5,y:5},{color:'B',x:4,y:4},{color:'B',x:4,y:5},{color:'B',x:5,y:4},{color:'B',x:6,y:5},{color:'W',x:6,y:4}], answer:{x:6,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyaz kaçıyor — takip et!',c:'info'}, fb_ok:'Merdiven devam ediyor!', fb_err:'Beyazın kaçacağı yönün önüne geç.' },

      { text:`<p>★★★ <strong>Soru 8/12</strong> — Ağı kur.</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:3,y:4},{color:'B',x:4,y:5},{color:'B',x:5,y:5}], answer:{x:5,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Beyazın tüm kaçışlarını kapat!',c:'info'}, fb_ok:'Ağ kuruldu!', fb_err:'F6\'ya oyna — beyazın kaçış yolunu kes.' },

      { text:`<p>★★★ <strong>Soru 9/12</strong> — Kaplan ağzı oluştur.</p>`, board:[{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:5}], answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Kaplan ağzını tamamla!',c:'info'}, fb_ok:'Kaplan ağzı tamamlandı — beyaz içine giremez.', fb_err:'Üç taşın ortasındaki boşluğu yukarıdan kapat.' },

      { text:`<p>★★★ <strong>Soru 10/12</strong> — Zayıf taşı hedefle.</p>`, board:[{color:'W',x:7,y:1},{color:'W',x:3,y:5},{color:'B',x:6,y:1},{color:'B',x:8,y:1},{color:'B',x:7,y:0}], answer:{x:7,y:2}, turn:'black', size:9, camera:CAM.high, fb:{t:'Hangi beyaz taş daha zayıf?',c:'info'}, fb_ok:'Doğru hedef! Yalnız taşa atari.', fb_err:'Az nefesi olan, izole taşa saldır.' },

      { text:`<p>★★★ <strong>Soru 11/12</strong> — Tehdit altındaki grubu kurtar.</p>`, board:[{color:'B',x:4,y:4},{color:'B',x:5,y:4},{color:'W',x:3,y:4},{color:'W',x:4,y:3},{color:'W',x:6,y:4},{color:'W',x:5,y:3}], answers:[{x:4,y:5},{x:5,y:5}], turn:'black', size:9, camera:CAM.center, fb:{t:'Siyah grup sıkışıyor — kurtar!',c:'info'}, fb_ok:'Kurtarıldı! Grup nefes aldı.', fb_err:'Grubun nefes açabileceği alt noktaya oyna.' },

      { text:`<p>★★★★ <strong>Soru 12/12</strong> — Çift tehdit kur: rakip ikisini birden savunamaz.</p>`, board:[{color:'W',x:5,y:3},{color:'W',x:4,y:4},{color:'B',x:6,y:3},{color:'B',x:5,y:4},{color:'B',x:4,y:5}], answer:{x:4,y:3}, turn:'black', size:9, camera:CAM.center, fb:{t:'Tek hamlede iki tehdidi aynı anda kur!',c:'info'}, fb_ok:'Mükemmel! Çift tehdit — beyaz ikisini birden savunamaz. Tebrikler, müfredatı tamamladın!', fb_err:'Her iki beyaz taşa da aynı anda atari yapacak noktayı bul.' },
    ]},
  ]},
];
