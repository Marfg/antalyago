/* ══════════════════════════════════════════════
   MÜFREDAт
══════════════════════════════════════════════ */
const CURRICULUM = [

  /* ─── BÖLÜM 1 ─── */
  { id:'c1', title:'Temel Kurallar', lessons:[

    { id:'l1', title:'Tahta ve Taşlar', steps:[
      { text:`<p>Go, <strong>19×19'luk</strong> bir tahta üzerinde oynanan iki kişilik bir strateji oyunudur. Yeni başlayanlar için <strong>9×9</strong> daha uygundur.</p><p>İki oyuncu vardır: biri <strong>siyah</strong>, diğeri <strong>beyaz</strong>. <em>Siyah her zaman önce oynar.</em></p>`, board:[], auto:true, size:9, fb:{t:'Taşlar çizgilerin kesişim noktalarına yerleştirilir.',c:'info'} },
      { text:`<p>Taşlar karelerin içine değil, <strong>çizgilerin kesişim noktalarına</strong> yerleştirilir.</p><p>Aşağıdaki tahtaya herhangi bir noktaya tıklayarak <strong>siyah taş koy.</strong></p>`, board:[], answers:'any', turn:'black', size:9, fb:{t:'Herhangi bir noktaya tıkla!',c:'info'}, fb_ok:'Mükemmel! Taşı doğru noktaya koydun.' },
      { text:`<p>Taşlar bir kez konulduktan sonra <strong>hareket ettirilemez</strong> — sadece yakalanarak kaldırılabilir.</p><div class="highlight">Go\'da taşlar hareket etmez, sadece eklenir veya kaldırılır.</div>`, board:[{color:'W',x:4,y:4}], auto:true, size:9, fb:{t:'Bu beyaz taş artık o noktada sabit.',c:'info'} },
    ]},

    { id:'l2', title:'Nefes Noktaları (Liberty)', steps:[
      { text:`<p>Her taşın komşu boş noktalarına <strong class="term">nefes noktası</strong> (liberty) denir.</p><p>Ortadaki bir taşın <strong>4 nefes noktası</strong> vardır (üst, alt, sol, sağ).</p>`, board:[{color:'B',x:4,y:4}], markers:[{x:4,y:3},{x:3,y:4},{x:5,y:4},{x:4,y:5}], auto:true, size:9, fb:{t:'Ortadaki siyah taşın 4 nefes noktası var.',c:'info'} },
      { text:`<p>Kenar noktasındaki taşın <strong>3 nefes noktası</strong>, köşedekinin ise <strong>2 nefes noktası</strong> vardır.</p><div class="highlight">Nefes noktası azaldıkça taş tehlikeye girer. Köşe ve kenar taşları daha savunmasızdır.</div>`, board:[{color:'B',x:0,y:0},{color:'W',x:8,y:4}], markers:[{x:1,y:0},{x:0,y:1},{x:8,y:3},{x:7,y:4},{x:8,y:5}], auto:true, size:9, fb:{t:'Köşe: 2 nefes noktası · Kenar: 3 nefes noktası · Orta: 4 nefes noktası',c:'info'} },
      { text:`<p>Yatay veya dikey olarak birbirine bağlı taşlar <strong>grup</strong> oluşturur. Grubun özgürlüğü tüm taşlarının boş komşularının toplamıdır.</p>`, board:[{color:'B',x:3,y:4},{color:'B',x:4,y:4},{color:'B',x:5,y:4}], markers:[{x:3,y:3},{x:2,y:4},{x:3,y:5},{x:4,y:3},{x:4,y:5},{x:5,y:3},{x:6,y:4},{x:5,y:5}], auto:true, size:9, fb:{t:'Bu üç taş bir grup — birlikte 8 nefes noktası var.',c:'info'} },
    ]},

    { id:'l3', title:'Taş Alma', steps:[
      { text:`<p>Bir taşın <strong>tüm nefes noktaları doldurulursa</strong>, o taş yakalanır ve tahtadan kalkar.</p><p>Beyaz taşın tek boş noktası var — oraya siyah taş koyarak beyazı yakala! <strong>E6 noktasına tıkla.</strong></p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4}], answer:{x:4,y:5}, turn:'black', size:9, fb:{t:'Beyaz taşın son nefes noktasına tıkla!',c:'info'}, fb_ok:'Yakaladın! Beyaz taş tahtadan kalkar.', fb_err:'Beyaz taşın çevresindeki boş noktayı bul.', capture:[{x:4,y:4}] },
      { text:`<p>Bir <strong>grubu</strong> yakalamak için grubun tüm nefes noktalarıni doldurman gerekir.</p><p>İki beyaz taşın son nefes noktasını doldur — <strong>D5 noktasına tıkla.</strong></p>`, board:[{color:'W',x:3,y:3},{color:'W',x:4,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:3},{color:'B',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'İki beyaz taşın son boş noktasını bul.',c:'info'}, fb_ok:'Grubu yakaladın! İkisi birden kalkar.', fb_err:'Beyaz grubun son nefes noktasını bul.', capture:[{x:3,y:3},{x:4,y:3}] },
      { text:`<p>Bir örnek daha! <strong>3 taşlı beyaz grup</strong> siyahlarla çevrilmiş.</p><p>Beyaz grubun tek nefes noktasını bul ve grubu yakala — <strong>E6 noktasına tıkla.</strong></p>`,
        formation:'formations/b1-temel-kurallar/l3-tas-alma/adim-3.json',
        board:[
          {color:'B',x:4,y:1},{color:'B',x:5,y:1},{color:'B',x:3,y:2},
          {color:'B',x:6,y:2},{color:'B',x:6,y:3},{color:'B',x:5,y:4},
          {color:'W',x:4,y:2},{color:'W',x:5,y:2},{color:'W',x:5,y:3}
        ],
        answer:{x:4,y:3}, capture:[{x:4,y:2},{x:5,y:2},{x:5,y:3}],
        turn:'black', size:9,
        fb:{t:'3 taşlı beyaz grubun tek boş noktasını bul.',c:'info'},
        fb_ok:'Mükemmel! Üç beyaz taş birden yakalandı.',
        fb_err:'E6 noktasına tıkla — beyazın tek boş komşusu.'
      },
      { text:`<p>Yakalanan taşlar <strong>esir</strong> sayılır ve oyun sonunda skora eklenir.</p><div class="highlight">Ne kadar çok taş yakalarsan skor avantajın o kadar artar.</div>`, board:[{color:'B',x:2,y:2},{color:'B',x:6,y:6}], auto:true, size:9, fb:{t:'Her yakalanan taş 1 puan kazandırır.',c:'info'} },
    ]},

    { id:'l4', title:'Yasak Hamleler', steps:[
      { text:`<p>Kendi taşını nefessiz bırakacak bir hamle <strong>yapamazsın</strong> — bu <span class="term">öz-yakalama</span> yasağıdır.</p><p>Tahtada dört farklı bölgede yasak nokta işaretli. Her biri çevresi beyaz taşlarla sarılmış — oraya siyah taş konulamaz.</p>`,
        formation:'formations/b1-temel-kurallar/l4-yasak-hamleler/adim-1.json',
        board:[
          {color:'W',x:4,y:0},{color:'W',x:6,y:0},
          {color:'W',x:4,y:1},{color:'W',x:5,y:1},{color:'W',x:6,y:1},
          {color:'W',x:0,y:3},{color:'W',x:1,y:4},{color:'W',x:4,y:4},
          {color:'W',x:0,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},
          {color:'W',x:4,y:6},{color:'W',x:8,y:7},{color:'W',x:7,y:8}
        ],
        forbidden:[{x:5,y:0},{x:0,y:4},{x:4,y:5},{x:8,y:8}],
        auto:true, size:9, fb:{t:'İşaretli dört nokta öz-yakalama yasağından dolayı yasak.',c:'info'} },
      { text:`<p><strong>İstisna:</strong> O noktaya koyduğunda rakip taşı <em>yakalıyorsan</em> hamle geçerlidir. Yakalama, öz-yakalama yasağından önce gelir.</p><p>Aşağıda iki örnek izle — siyah üstte 5 beyazı alıyor, beyaz altta 5 siyahı alıyor.</p>`,
        formation:'formations/b1-temel-kurallar/l4-yasak-hamleler/adim-2.json',
        board:[
          {color:'W',x:3,y:0},{color:'W',x:5,y:0},{color:'W',x:3,y:1},{color:'W',x:4,y:1},{color:'W',x:5,y:1},
          {color:'W',x:3,y:6},{color:'W',x:4,y:6},{color:'W',x:5,y:6},
          {color:'W',x:2,y:7},{color:'W',x:6,y:7},{color:'W',x:2,y:8},{color:'W',x:6,y:8},
          {color:'B',x:2,y:0},{color:'B',x:6,y:0},{color:'B',x:2,y:1},{color:'B',x:6,y:1},
          {color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:5,y:2},
          {color:'B',x:3,y:7},{color:'B',x:4,y:7},{color:'B',x:5,y:7},
          {color:'B',x:3,y:8},{color:'B',x:5,y:8}
        ],
        moves:[
          {color:'B',x:4,y:0,capture:[{x:3,y:0},{x:5,y:0},{x:3,y:1},{x:4,y:1},{x:5,y:1}]},
          {color:'W',x:4,y:8,capture:[{x:3,y:7},{x:4,y:7},{x:5,y:7},{x:3,y:8},{x:5,y:8}]}
        ],
        auto:true, size:9, fb:{t:'Yakalama hamlesi öz-yakalama sayılmaz — her iki renkten örnek.',c:'info'} },
    ]},

    { id:'l5', title:'Ko Kuralı', steps:[
      { text:`<p><span class="term">Ko</span> — aynı pozisyonun sonsuza tekrar etmesini önleyen kuraldır.</p><p>Bir hamle tahtayı <em>önceki pozisyona</em> döndürüyorsa, o hamle <strong>yapılamaz.</strong> Önce başka bir yerde oynamak gerekir.</p>`, board:[{color:'B',x:3,y:4},{color:'B',x:4,y:3},{color:'B',x:5,y:4},{color:'W',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5},{color:'W',x:4,y:4}], auto:true, size:9, fb:{t:'Bu tipik bir Ko pozisyonu — döngü kuralı devreye girer.',c:'info'} },
      { text:`<p>Ko savaşında oyuncular <strong>"ko tehdidi"</strong> yaparlar — tahtanın başka yerinde önemli bir hamle. Rakip cevap vermek zorundaysa ko durumu değişir.</p><div class="highlight">Ko, Go\'nun en dramatik ve stratejik kavramlarından biridir.</div>`, board:[{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:4,y:3},{color:'W',x:4,y:5},{color:'W',x:3,y:5},{color:'W',x:5,y:5}], auto:true, size:9, fb:{t:'Ko pozisyonunu iyi tanıyın — sıkça karşılaşacaksınız.',c:'info'} },
    ]},

    { id:'l6', title:'Oyun Sonu ve Sayım', steps:[
      { text:`<p>Her iki oyuncu da art arda <strong>pas geçince</strong> oyun biter.</p><p>Kazanan, <strong>daha fazla bölge (territory)</strong> çeviren oyuncudur. Bölge = etrafı sarılmış boş noktalar.</p>`, board:[{color:'B',x:1,y:1},{color:'B',x:2,y:1},{color:'B',x:3,y:1},{color:'B',x:1,y:2},{color:'B',x:3,y:2},{color:'B',x:1,y:3},{color:'B',x:2,y:3},{color:'B',x:3,y:3},{color:'W',x:5,y:5},{color:'W',x:6,y:5},{color:'W',x:7,y:5},{color:'W',x:5,y:6},{color:'W',x:7,y:6},{color:'W',x:5,y:7},{color:'W',x:6,y:7},{color:'W',x:7,y:7}], auto:true, size:9, fb:{t:'Siyah sol üstte, Beyaz sağ altta bölge sardı.',c:'info'} },
      { text:`<p>Puan hesabı:</p><ul><li><strong>Bölge puanı</strong> — çevrelenen boş noktalar</li><li><strong>Esir puanı</strong> — yakalanan taşlar</li><li><strong>Komi</strong> — beyaza verilen avantaj (genellikle 6.5)</li></ul><div class="highlight">Komi, siyahın ilk hamle avantajını dengeler. Beyaz 6.5 puan önden başlar.</div>`, board:[], auto:true, size:9, fb:{t:'Komi genellikle 6.5\'tir.',c:'info'} },
    ]},

  ]},

  /* ─── BÖLÜM 2 ─── */
  { id:'c2', title:'Temel Teknikler', lessons:[

    { id:'l7', title:'Canlı Gruplar (İki Göz)', steps:[
      { text:`<p>Bir grup <strong>iki göze</strong> sahipse asla yakalanamaz — <em>ölümsüzdür.</em></p><p><span class="term">Göz</span> = grubun içindeki, rakibin hiçbir zaman dolduramayacağı boş nokta.</p>`, board:[{color:'B',x:0,y:0},{color:'B',x:1,y:0},{color:'B',x:2,y:0},{color:'B',x:3,y:0},{color:'B',x:4,y:0},{color:'B',x:0,y:1},{color:'B',x:4,y:1},{color:'B',x:0,y:2},{color:'B',x:2,y:2},{color:'B',x:4,y:2},{color:'B',x:0,y:3},{color:'B',x:4,y:3},{color:'B',x:0,y:4},{color:'B',x:1,y:4},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4}], auto:true, size:9, fb:{t:'Bu grubun iki gözü var (B2 ve D2) — ölümsüz!',c:'info'} },
      { text:`<p><strong>Sahte göz</strong> — rakip tarafından doldurulabilecek nokta gerçek göz değildir.</p><div class="highlight">İki gerçek göz = ölümsüz grup. Go\'nun en temel kavramlarından biridir.</div>`, board:[{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:2,y:3},{color:'B',x:4,y:3},{color:'B',x:2,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:4}], auto:true, size:9, fb:{t:'Bu grubun tek gözü var (D4) — ölümsüz değil!',c:'info'} },
    ]},

    { id:'l8', title:'Kesme ve Bağlama', steps:[
      { text:`<p><span class="term">Kesme</span> — rakibin iki taşı arasına girerek bağlantısını koparmak.</p><p>Siyahın iki taşı arasına gir — <strong>E4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'W',x:4,y:2},{color:'W',x:4,y:4}], answer:{x:4,y:3}, turn:'white', size:9, fb:{t:'Siyahın iki taşı arasına gir!',c:'info'}, fb_ok:'Kestik! Siyah artık iki ayrı grup.', fb_err:'Siyahın iki taşını birbirine bağlayan boşluğu bul.' },
      { text:`<p><span class="term">Bağlama</span> — kendi taşlarının arasını kapatarak grubu güçlendirmek.</p><p>Siyah taşları birleştir — <strong>D4 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:3,y:5},{color:'W',x:2,y:4},{color:'W',x:4,y:4}], answer:{x:3,y:4}, turn:'black', size:9, fb:{t:'Siyah taşlarını birleştir!',c:'info'}, fb_ok:'Güçlü bağlantı! Artık tek grup.', fb_err:'Siyah taşlar arasındaki boşluğu doldur.' },
    ]},

    { id:'l9', title:'Çift Atari', steps:[
      { text:`<p><span class="term">Atari</span> — bir taşın son nefes noktası tehdit altında. <span class="term">Çift atari</span> ise tek hamleyle iki farklı grubu aynı anda tehdit etmek.</p><p>Rakip ikisini birden kurtaramaz!</p>`, board:[{color:'W',x:2,y:3},{color:'W',x:4,y:3},{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:1,y:3},{color:'B',x:2,y:4},{color:'B',x:4,y:4}], auto:true, size:9, fb:{t:'Doğru hamleyle iki beyaz gruba aynı anda atari yapılabilir.',c:'info'} },
      { text:`<p>Çift atari hamlesini bul! <strong>D4 noktasına tıkla.</strong></p>`, board:[{color:'W',x:2,y:3},{color:'W',x:4,y:3},{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'B',x:4,y:2},{color:'B',x:1,y:3},{color:'B',x:2,y:4},{color:'B',x:4,y:4}], answer:{x:3,y:3}, turn:'black', size:9, fb:{t:'Tek hamleyle iki grubu tehdit et!',c:'info'}, fb_ok:'Mükemmel çift atari! Beyaz ikisini birden kurtaramaz.', fb_err:'Her iki beyaz gruba da atari yapacak noktayı bul.' },
    ]},

    { id:'l10', title:'Merdiven (Shicho)', steps:[
      { text:`<p><span class="term">Merdiven</span> (Japonca: <em>shicho</em>) — bir taşı sürekli atari yaparak köşeye sürme tekniği. Kaçan taş çapraz hareket eder ve tahtadan çıkamaz.</p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:4},{color:'B',x:4,y:3}], auto:true, size:9, fb:{t:'Beyaz kaçmaya çalışır ama her adımda yakalanır.',c:'info'} },
      { text:`<p>Merdiven işe yarası için tahtada <strong>merdiveni kıran taş</strong> olmamalıdır. Eğer kaçan taşın yolunda kendi rengi bir taş varsa merdiven çalışmaz!</p><div class="highlight">Merdivene başlamadan önce tüm tahtayı kontrol et.</div>`, board:[{color:'W',x:4,y:4},{color:'W',x:7,y:1},{color:'B',x:3,y:4},{color:'B',x:4,y:3}], auto:true, size:9, fb:{t:'H2\'deki beyaz taş merdiveni kırıyor!',c:'info'} },
    ]},

    { id:'l11', title:'Ağ (Geta)', steps:[
      { text:`<p><span class="term">Ağ</span> (Japonca: <em>geta</em>) — bir taşı atari yapmadan, kaçış yollarını keserek tuzağa düşürmek. Merdivenin aksine taş atari durumunda değildir ama kaçacak yer yoktur.</p><p>Beyazın kaçış yolunu kesen noktayı bul — <strong>F6 noktasına tıkla.</strong></p>`, board:[{color:'W',x:4,y:4},{color:'B',x:3,y:3},{color:'B',x:5,y:3},{color:'B',x:6,y:4},{color:'B',x:6,y:5}], answer:{x:5,y:5}, turn:'black', size:9, fb:{t:'Beyazın tüm kaçış yollarını kapat!',c:'info'}, fb_ok:'Ağ kuruldu! Beyaz kaçamaz.', fb_err:'Beyazın kaçış yollarını kapatan noktayı bul.' },
    ]},

    { id:'l12', title:'Snapback', steps:[
      { text:`<p><span class="term">Snapback</span> — rakibe taş kurban vererek daha büyük bir grubu yakalama tekniği. Rakip kurbanı alınca yeni bir atari doğar ve büyük grubu kaybeder.</p><p>Snapback başlat — <strong>E7 noktasına tıkla.</strong></p>`, board:[{color:'B',x:3,y:3},{color:'B',x:4,y:3},{color:'B',x:5,y:3},{color:'B',x:3,y:4},{color:'B',x:5,y:4},{color:'B',x:3,y:5},{color:'B',x:4,y:5},{color:'W',x:4,y:4}], answer:{x:4,y:6}, turn:'black', size:9, fb:{t:'Snapback\'i başlatacak noktayı bul!',c:'info'}, fb_ok:'Snapback! Beyaz kurbanı alsa bile büyük grubu kaybeder.', fb_err:'Doğru noktayı bul — kurbanı ver.' },
    ]},

  ]},

  /* ─── BÖLÜM 3 ─── */
  { id:'c3', title:'Strateji', lessons:[

    { id:'l13', title:'Açılış (Fuseki)', steps:[
      { text:`<p><span class="term">Fuseki</span> — Go\'nun açılış aşaması. İlk 10-20 hamle tahtanın genel yapısını belirler.</p><p>Temel strateji: <strong>köşe → kenar → merkez</strong> sırasıyla bölge kurmak. Köşeler en az taşla en çok bölge sağlar.</p>`, board:[], auto:true, size:9, fb:{t:'Köşeler en değerli bölgelerdir.',c:'info'} },
      { text:`<p>Standart açılış noktaları:<ul><li><strong>Hoshi (4-4)</strong> — dengeli, esnek</li><li><strong>Komoku (3-4)</strong> — bölge odaklı</li><li><strong>San-san (3-3)</strong> — köşe kesin, az etki</li></ul>Bir köşe noktasına tıkla.</p>`, board:[], answers:[{x:2,y:2},{x:3,y:3},{x:2,y:3},{x:3,y:2}], turn:'black', size:9, fb:{t:'Köşe noktalarından birini seç.',c:'info'}, fb_ok:'İyi seçim! Köşeden açıldın.' },
      { text:`<p><strong>Yüksek (4. çizgi)</strong> hamleler etki alanı, <strong>alçak (3. çizgi)</strong> hamleler bölge kontrolü sağlar.</p><div class="highlight">Açılışta ne kadar çok köşe alırsan başlangıç avantajın o kadar artar.</div>`, board:[{color:'B',x:2,y:2},{color:'W',x:6,y:2},{color:'B',x:6,y:6},{color:'W',x:2,y:6}], auto:true, size:9, fb:{t:'Dört köşe de alındı — denge.',c:'info'} },
    ]},

    { id:'l14', title:'Orta Oyun', steps:[
      { text:`<p>Orta oyunda gruplar şekillenir, savaşlar başlar. Temel hedefler:</p><ul><li>Zayıf grupları <strong>güçlendir</strong></li><li>Rakibin zayıf gruplarına <strong>saldır</strong></li><li>Bölge sınırlarını <strong>netleştir</strong></li></ul>`, board:[{color:'B',x:2,y:2},{color:'B',x:3,y:2},{color:'W',x:6,y:2},{color:'W',x:6,y:3},{color:'B',x:4,y:6},{color:'B',x:5,y:6},{color:'W',x:2,y:6},{color:'W',x:2,y:5}], auto:true, size:9, fb:{t:'Her iki taraf da bölge oluşturuyor.',c:'info'} },
      { text:`<p><span class="term">Sente</span> — rakibin cevap vermek zorunda kaldığı hamle (inisiyatif sende).</p><p><span class="term">Gote</span> — inisiyatifi rakibe bırakan hamle.</p><div class="highlight">Mümkün olduğunca sente hamleler yap — inisiyatifi elden bırakma.</div>`, board:[], auto:true, size:9, fb:{t:'Sente = taarruz · Gote = savunma',c:'info'} },
    ]},

    { id:'l15', title:'Son Oyun (Yose)', steps:[
      { text:`<p><span class="term">Yose</span> — oyunun son aşaması. Sınırlar netleşir, her hamle doğrudan puana dönüşür.</p><p>Yose\'de en büyük hamleyi bulmak kritik önem taşır!</p>`, board:[{color:'B',x:0,y:0},{color:'B',x:1,y:0},{color:'B',x:2,y:0},{color:'B',x:0,y:1},{color:'B',x:0,y:2},{color:'B',x:0,y:3},{color:'W',x:5,y:5},{color:'W',x:6,y:5},{color:'W',x:7,y:5},{color:'W',x:8,y:5},{color:'W',x:8,y:6},{color:'W',x:8,y:7},{color:'W',x:8,y:8}], auto:true, size:9, fb:{t:'Sınırları tamamlamak son oyunun özüdür.',c:'info'} },
      { text:`<p>Önem sırası:</p><ol><li><strong>Sente endgame</strong> — cevap gerektiren hamleler</li><li><strong>Büyük gote</strong> — en yüksek puanlı serbest hamleler</li><li><strong>Küçük gote</strong> — ince detay hamleler</li></ol><div class="highlight">🎉 Tebrikler! Temel Go bilgisini tamamladın. Artık oynayabilirsin!</div>`, board:[], auto:true, size:9, fb:{t:'Go öğrenme yolculuğun başlıyor!',c:'info'} },
    ]},

  ]},
];

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const LTRS = 'ABCDEFGHJKLMNOPQRST';
const inB  = (x,y,s)=>x>=0&&y>=0&&x<s&&y<s;
const opp  = c=>c==='black'?'white':'black';

let CUR_LESSON  = null;
let CUR_STEP    = 0;
let boardGrid   = [];
let boardSize   = 9;
let stepDone    = false;

const ALL_LESSONS   = CURRICULUM.flatMap(c=>c.lessons);
const TOTAL_LESSONS = ALL_LESSONS.length;
let doneLessons = new Set(JSON.parse(localStorage.getItem('go_done')||'[]'));

/* ══════════════════════════════════════════════
   CANVAS
══════════════════════════════════════════════ */
function met(s,sz){ const m=s*.065,st=(s-m*2)/(sz-1); return{m,st}; }

function initCanvas(sz){
  boardSize=sz||9;
  boardGrid=Array.from({length:boardSize},()=>Array(boardSize).fill(null));
  const cv=document.getElementById('goban');
  const fit=()=>{const r=cv.parentElement.getBoundingClientRect();cv.width=r.width||360;cv.height=r.height||360;drawBoard();};
  setTimeout(fit,30);
  window.removeEventListener('resize',fit);
  window.addEventListener('resize',fit);
}

function drawBoard(){
  const cv=document.getElementById('goban'),ctx=cv.getContext('2d');
  const s=cv.width,{m,st}=met(s,boardSize);
  ctx.fillStyle='#dcb468';ctx.fillRect(0,0,s,s);
  const g=ctx.createLinearGradient(0,0,s,s);
  g.addColorStop(0,'rgba(255,220,120,.18)');g.addColorStop(1,'rgba(140,80,0,.10)');
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
  ctx.strokeStyle='#7a5010';ctx.lineWidth=1;
  for(let i=0;i<boardSize;i++){const px=m+i*st,py=m+i*st;ctx.beginPath();ctx.moveTo(px,m);ctx.lineTo(px,m+(boardSize-1)*st);ctx.stroke();ctx.beginPath();ctx.moveTo(m,py);ctx.lineTo(m+(boardSize-1)*st,py);ctx.stroke();}
  ctx.fillStyle='#7a5010';
  for(const[sx,sy]of stars(boardSize)){ctx.beginPath();ctx.arc(m+sx*st,m+sy*st,st*.09,0,Math.PI*2);ctx.fill();}
  ctx.font=`${Math.max(8,st*.28)}px 'JetBrains Mono',monospace`;ctx.fillStyle='#7a5010';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<boardSize;i++){const px=m+i*st;ctx.fillText(LTRS[i],px,m*.38);ctx.fillText(LTRS[i],px,s-m*.38);ctx.fillText(String(boardSize-i),m*.38,m+i*st);ctx.fillText(String(boardSize-i),s-m*.38,m+i*st);}
  for(let y=0;y<boardSize;y++)for(let x=0;x<boardSize;x++)if(boardGrid[y][x])drawStone(ctx,m+x*st,m+y*st,st*.46,boardGrid[y][x]);

  // Nefes noktası işaretleri (kırmızı çarpı)
  const step = window._curStep||CUR_LESSON?.steps[CUR_STEP];
  if(step?.markers){
    step.markers.forEach(mk=>{
      if(!inB(mk.x,mk.y,boardSize)) return;
      const cx=m+mk.x*st, cy=m+mk.y*st;
      const r=st*.22;
      ctx.save();
      ctx.strokeStyle='#e03030';
      ctx.lineWidth=st*.08;
      ctx.lineCap='round';
      // Çarpı çizgisi 1
      ctx.beginPath(); ctx.moveTo(cx-r,cy-r); ctx.lineTo(cx+r,cy+r); ctx.stroke();
      // Çarpı çizgisi 2
      ctx.beginPath(); ctx.moveTo(cx+r,cy-r); ctx.lineTo(cx-r,cy+r); ctx.stroke();
      ctx.restore();
    });
  }
  // Yasak nokta işaretleri (kırmızı daire + çarpı)
  if(step?.forbidden){
    step.forbidden.forEach(mk=>{
      if(!inB(mk.x,mk.y,boardSize))return;
      const cx=m+mk.x*st,cy=m+mk.y*st,r=st*.20;
      ctx.save();
      ctx.strokeStyle='#c0392b';ctx.lineWidth=st*.09;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
      const d=r*.65;ctx.lineWidth=st*.065;
      ctx.beginPath();ctx.moveTo(cx-d,cy-d);ctx.lineTo(cx+d,cy+d);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+d,cy-d);ctx.lineTo(cx-d,cy+d);ctx.stroke();
      ctx.restore();
    });
  }
}

function drawStone(ctx,cx,cy,r,col){
  ctx.save();
  if(col==='black'||col==='B'){const g=ctx.createRadialGradient(cx-r*.3,cy-r*.3,r*.05,cx,cy,r);g.addColorStop(0,'#555');g.addColorStop(1,'#111');ctx.fillStyle=g;ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=4;ctx.shadowOffsetX=2;ctx.shadowOffsetY=2;}
  else{const g=ctx.createRadialGradient(cx-r*.3,cy-r*.3,r*.05,cx,cy,r);g.addColorStop(0,'#fff');g.addColorStop(1,'#ccc');ctx.fillStyle=g;ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=3;ctx.shadowOffsetX=1;ctx.shadowOffsetY=2;}
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  if(col==='white'||col==='W'){ctx.strokeStyle='#aaa';ctx.lineWidth=.5;ctx.stroke();}
  ctx.restore();
}

function stars(sz){
  if(sz===19)return[[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
  if(sz===13)return[[3,3],[9,3],[3,9],[9,9],[6,6]];
  return[[2,2],[6,2],[4,4],[2,6],[6,6]];
}

/* ══════════════════════════════════════════════
   DERS YÜKLEMEsİ
══════════════════════════════════════════════ */
function loadLesson(lesson){
  CUR_LESSON=lesson; CUR_STEP=0;
  loadStep(0); updateSidebar(); updateProgress();
}

async function loadStep(idx){
  const _s=CUR_LESSON.steps[idx];
  if(!_s)return;
  const step={..._s};
  CUR_STEP=idx; stepDone=false;

  if(step.formation){
    try{
      const res=await fetch(step.formation);
      const data=await res.json();
      if(data.board!==undefined)step.board=data.board;
      if(data.answer!==undefined)step.answer=data.answer;
      if(data.capture!==undefined)step.capture=data.capture;
      if(data.forbidden!==undefined)step.forbidden=data.forbidden;
      if(data.moves!==undefined)step.moves=data.moves;
    }catch(e){console.warn('Formation yüklenemedi:',step.formation,e);}
  }
  window._curStep=step;

  const chap=CURRICULUM.find(c=>c.lessons.some(l=>l.id===CUR_LESSON.id));
  document.getElementById('chapter-tag').textContent=chap?.title||'';
  document.getElementById('lesson-title').textContent=CUR_LESSON.title;
  document.getElementById('lesson-body').innerHTML=step.text;
  renderDots();

  document.getElementById('step-counter').textContent=`Adım ${idx+1} / ${CUR_LESSON.steps.length}`;
  document.getElementById('btn-prev').disabled=idx===0;

  // Tahta
  initCanvas(step.size||9);
  (step.board||[]).forEach(s=>{ if(inB(s.x,s.y,boardSize)) boardGrid[s.y][s.x]=s.color==='B'?'black':'white'; });
  drawBoard();

  // Feedback
  setFb(step.fb?.t||'Tahtayı inceleyin.',step.fb?.c||'info');

  // Marker'ları global'e kaydet
  window._curMarkers = step.markers || [];
  drawBoard();

  // Click
  const cv=document.getElementById('goban');
  cv.onclick=null;

  if(step.answer||step.answers){
    cv.onclick=e=>onClick(e,step);
  }

  if(step.auto){ stepDone=true; }
  if(step.moves?.length){ stepDone=true; playMoves(step.moves); }
  updateNextBtn(step);
}

function playMoves(moves){
  let i=0;
  function next(){
    if(i>=moves.length)return;
    const mv=moves[i++];
    if(inB(mv.x,mv.y,boardSize)){boardGrid[mv.y][mv.x]=mv.color==='B'?'black':'white';drawBoard();}
    setTimeout(()=>{
      if(mv.capture){mv.capture.forEach(c=>{if(inB(c.x,c.y,boardSize))boardGrid[c.y][c.x]=null;});drawBoard();}
      setTimeout(next,900);
    },700);
  }
  setTimeout(next,500);
}

function onClick(e,step){
  if(stepDone)return;
  const cv=document.getElementById('goban');
  const rect=cv.getBoundingClientRect();
  const sx=cv.width/rect.width,sy=cv.height/rect.height;
  const cx=(e.clientX-rect.left)*sx,cy=(e.clientY-rect.top)*sy;
  const{m,st}=met(cv.width,boardSize);
  const xi=Math.round((cx-m)/st),yi=Math.round((cy-m)/st);
  if(!inB(xi,yi,boardSize)||boardGrid[yi][xi])return;

  let ok=false;
  if(step.answers==='any') ok=true;
  else if(Array.isArray(step.answers)) ok=step.answers.some(a=>a.x===xi&&a.y===yi);
  else if(step.answer) ok=step.answer.x===xi&&step.answer.y===yi;

  const turn=step.turn||'black';
  boardGrid[yi][xi]=turn;
  drawBoard();

  if(ok){
    setFb(step.fb_ok||'Doğru!','correct');
    stepDone=true;
    if(step.capture){ setTimeout(()=>{ step.capture.forEach(c=>{if(inB(c.x,c.y,boardSize))boardGrid[c.y][c.x]=null;}); drawBoard(); },350); }
    updateNextBtn(step);
  } else {
    setFb(step.fb_err||'Yanlış, tekrar dene.','wrong');
    const fb=document.getElementById('feedback');
    fb.classList.add('shake');
    setTimeout(()=>{ fb.classList.remove('shake'); boardGrid[yi][xi]=null; drawBoard(); },400);
  }
}

/* ══════════════════════════════════════════════
   NAVİGASYON
══════════════════════════════════════════════ */
function nextStep(){
  if(!CUR_LESSON)return;
  if(CUR_STEP<CUR_LESSON.steps.length-1){ loadStep(CUR_STEP+1); return; }
  // Ders bitti
  doneLessons.add(CUR_LESSON.id);
  localStorage.setItem('go_done',JSON.stringify([...doneLessons]));
  updateSidebar(); updateProgress();

  const chap=CURRICULUM.find(c=>c.lessons.some(l=>l.id===CUR_LESSON.id));
  if(chap&&chap.lessons.every(l=>doneLessons.has(l.id))){
    document.getElementById('complete-msg').textContent=`"${chap.title}" bölümünü tamamladın! 🎊`;
    document.getElementById('complete-screen').classList.add('show');
    return;
  }
  const idx=ALL_LESSONS.findIndex(l=>l.id===CUR_LESSON.id);
  if(idx<ALL_LESSONS.length-1) loadLesson(ALL_LESSONS[idx+1]);
}

function prevStep(){ if(CUR_STEP>0)loadStep(CUR_STEP-1); }

function closeComplete(){
  document.getElementById('complete-screen').classList.remove('show');
  const idx=ALL_LESSONS.findIndex(l=>l.id===CUR_LESSON.id);
  if(idx<ALL_LESSONS.length-1)loadLesson(ALL_LESSONS[idx+1]);
}

function updateNextBtn(step){
  const btn=document.getElementById('btn-next');
  const isLast=CUR_STEP===CUR_LESSON.steps.length-1;
  btn.disabled=!(step.auto||stepDone);
  btn.textContent=isLast?'Dersi Bitir ✓':'İleri →';
}

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function buildSidebar(){
  const el=document.getElementById('curriculum');
  el.innerHTML='';
  CURRICULUM.forEach((chap,ci)=>{
    const chapEl=document.createElement('div');
    chapEl.className='chapter';
    const title=document.createElement('div');
    title.className='chapter-title open';
    title.innerHTML=`<div class="ch-left"><span class="ch-num">${ci+1}</span><span>${chap.title}</span></div><span class="ch-arrow">▶</span>`;
    title.onclick=()=>{ title.classList.toggle('open'); list.classList.toggle('open'); };
    chapEl.appendChild(title);
    const list=document.createElement('div');
    list.className='lesson-list open';
    chap.lessons.forEach((lesson,li)=>{
      const item=document.createElement('div');
      item.className='lesson-item'+(CUR_LESSON?.id===lesson.id?' active':'')+(doneLessons.has(lesson.id)?' done':'');
      item.dataset.id=lesson.id;
      item.innerHTML=`<span class="li-check">✓</span><span class="li-num">${ci+1}.${li+1}</span>${lesson.title}`;
      item.onclick=()=>loadLesson(lesson);
      list.appendChild(item);
    });
    chapEl.appendChild(list);
    el.appendChild(chapEl);
  });
}

function updateSidebar(){
  document.querySelectorAll('.lesson-item').forEach(el=>{
    const id=el.dataset.id;
    el.classList.toggle('active',CUR_LESSON?.id===id);
    el.classList.toggle('done',doneLessons.has(id));
  });
}

function updateProgress(){
  const done=doneLessons.size;
  const pct=TOTAL_LESSONS>0?Math.round(done/TOTAL_LESSONS*100):0;
  document.getElementById('prog-text').textContent=`${done} / ${TOTAL_LESSONS}`;
  document.getElementById('prog-fill').style.width=pct+'%';
}

function setFb(text,type){
  const box=document.getElementById('feedback');
  const icon=box.querySelector('.fb-icon');
  box.className='feedback-box '+type;
  document.getElementById('fb-text').textContent=text;
  icon.textContent=type==='correct'?'✓':type==='wrong'?'✗':'💡';
}

function renderDots(){
  const el=document.getElementById('step-dots');
  el.innerHTML='';
  if(!CUR_LESSON)return;
  CUR_LESSON.steps.forEach((_,i)=>{
    const d=document.createElement('div');
    d.className='sdot'+(i===CUR_STEP?' active':i<CUR_STEP?' done':'');
    d.onclick=()=>{ if(i<CUR_STEP)loadStep(i); };
    el.appendChild(d);
  });
}

/* ══════════════════════════════════════════════
   BAŞLAT
══════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',()=>{
  buildSidebar(); updateProgress();
  const first=ALL_LESSONS.find(l=>!doneLessons.has(l.id))||ALL_LESSONS[0];
  loadLesson(first);
});
