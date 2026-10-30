// Ders denetim çubuğu (Merdiven, Ağ, Snapback): yardımcı düğmeler (nefesler,
// ipucu/rota, yeni deneme) alt çubuktaki "Yardım" düğmesiyle açılan panelde
// durur; öğrenci önce kendisi dener. Düğmelerin kimlikleri ve metinleri aynen
// kalır, ders denetleyicileri onları yine `#libs`, `#reset` … ile bulur. Panel
// kökün içinde kalır (denetleyiciler düğmeleri kökte arar).
export function mountHelpDrawer(root){
 const help=root.querySelector('.lb-help'),toggle=help.querySelector('.lb-help-toggle'),panel=help.querySelector('.lb-panel');
 const set=open=>{panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open))};
 toggle.onclick=()=>set(panel.hidden);
 // Sonucu tahtada görülen eylemlerden (ipucu, yeni deneme) sonra panel kapanır;
 // aç/kapa düğmeleri (aria-pressed) panel açıkken art arda denenebilsin.
 panel.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.hasAttribute('aria-pressed'))set(false)});
 const onKey=e=>{if(e.key==='Escape'&&!panel.hidden){set(false);toggle.focus()}};
 const onDown=e=>{if(!panel.hidden&&!help.contains(e.target))set(false)};
 document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onDown);
 return {close:()=>set(false),destroy(){document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onDown)}};
}
