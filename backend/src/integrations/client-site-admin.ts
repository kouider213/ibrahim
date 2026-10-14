// Page /admin/ de chaque site client FIK (déployée avec le site sur Netlify). Le patron se connecte (e-mail + mot
// de passe) et modifie lui-même ses textes, son offre (menu, prestations, produits…), ses horaires, ses photos et
// ses couleurs, puis « Publier » → l'API Railway (/api/client-sites) regénère et remet le site en ligne.
// Tout le contenu est inséré avec textContent / value (jamais innerHTML) : rien de ce que tape le client ne s'exécute.

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function adminPageHtml(siteId: string, siteName: string, apiBase: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><title>Espace client</title>
<style>
:root{--p:#9a6b1f;--bg:#f4f2ee;--card:#fff;--ink:#22201c;--mut:#77726a;--line:#e4e0d8;--ok:#1f7a4d;--bad:#b3261e}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.45}
header{position:sticky;top:0;z-index:5;height:56px;background:var(--ink);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
header b{font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}header a,header button{color:#fff;font-size:.85rem;background:none;border:1px solid rgba(255,255,255,.35);border-radius:20px;padding:6px 12px;text-decoration:none;white-space:nowrap;cursor:pointer}
main{max-width:760px;margin:0 auto;padding:16px 16px 80px}
.card{background:var(--card);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card h2{margin:0 0 4px;font-size:1.1rem}.hint{color:var(--mut);font-size:.85rem;margin:0 0 12px}
label{display:block;font-size:.82rem;color:var(--mut);margin:10px 0 4px}
input,textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}
textarea{min-height:90px;resize:vertical}input:focus,textarea:focus{outline:2px solid var(--p);border-color:transparent}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:.9rem;padding:9px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}
.btn.main{background:var(--p);border-color:var(--p);color:#fff;font-weight:600}.btn.small{padding:6px 10px;font-size:.8rem}.btn.del{color:var(--bad)}
.btn:disabled{opacity:.5}
.group{border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.item{display:grid;grid-template-columns:1fr 130px auto;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.item .desc{grid-column:1/3}
@media(max-width:520px){.item{grid-template-columns:1fr 112px auto}}
.hours .row{margin-top:6px}.hours span{flex:0 0 92px;text-transform:capitalize;font-size:.9rem}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.ph{position:relative;border-radius:10px;overflow:hidden;background:#ddd;aspect-ratio:4/3}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.ph .tag{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.65);color:#fff;font-size:.7rem;padding:3px 8px;border-radius:10px}
.ph .tools{position:absolute;inset:auto 0 0 0;display:flex;justify-content:space-between;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,.6))}
.ph .tools button{background:rgba(255,255,255,.9);border:0;border-radius:8px;width:34px;height:30px;cursor:pointer;font-size:.9rem}
.colors{display:flex;gap:16px}.colors input{height:46px;padding:4px;width:90px}
.bar{position:sticky;top:56px;z-index:4;background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}
.bar .btn.main{padding:11px 18px;font-size:.95rem;flex:0 0 auto}
#status{font-size:.85rem;color:var(--mut)}
.login{max-width:380px;margin:12vh auto;padding:0 16px}.login .card{padding:22px}
.err{color:var(--bad);font-size:.9rem;margin-top:10px}.ok{color:var(--ok)}
.toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:12px;font-size:.9rem;z-index:9;max-width:90vw}
</style></head>
<body>
<div id="app"></div>
<script>
const SITE=${json(siteId)},NAME=${json(siteName)},API=${json(apiBase)}+'/api/client-sites',TK='fik-admin-'+SITE;
let token=null;try{token=localStorage.getItem(TK)}catch(e){}
let st=null,dirty=false,siteUrl=location.origin+'/';
const DAYS=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const app=document.getElementById('app');

function h(tag,attrs,...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(k==='on')for(const[ev,fn]of Object.entries(v))e.addEventListener(ev,fn);else if(k==='text')e.textContent=v;else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v)}for(const c of kids.flat())if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));return e}
function toast(t){const e=h('div',{class:'toast',text:t});document.body.append(e);setTimeout(()=>e.remove(),3500)}
function touch(){dirty=true;const s=document.getElementById('status');if(s){s.textContent='Modifications non publiées';s.className=''}}
async function api(path,opts={}){const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}});let d={};try{d=await r.json()}catch(e){}if(r.status===401&&path!=='/login'){logout();throw new Error('Session expirée, reconnectez-vous.')}if(!r.ok)throw new Error(d.error||('Erreur '+r.status));return d}
function logout(){if(token)fetch(API+'/logout',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});try{localStorage.removeItem(TK)}catch(e){}token=null;st=null;renderLogin()}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

function renderLogin(msg){
  app.replaceChildren();
  const email=h('input',{type:'email',autocomplete:'username',required:true});
  const pw=h('input',{type:'password',autocomplete:'current-password',required:true});
  const err=h('div',{class:'err',text:msg||''});const btn=h('button',{class:'btn main',type:'submit',style:'width:100%;margin-top:16px'},'Se connecter');
  const f=h('form',{class:'card',on:{submit:async e=>{e.preventDefault();btn.disabled=true;err.textContent='';try{const d=await api('/login',{method:'POST',body:JSON.stringify({site:SITE,email:email.value,password:pw.value})});token=d.token;try{localStorage.setItem(TK,token)}catch(e){}await load()}catch(x){err.textContent=x.message}btn.disabled=false}}},
    h('h2',{text:NAME}),h('p',{class:'hint',text:'Espace client — modifiez votre site vous-même.'}),
    h('label',{text:'E-mail'}),email,h('label',{text:'Mot de passe'}),pw,btn,err);
  app.append(h('div',{class:'login'},f,h('p',{class:'hint',style:'text-align:center',text:'Mot de passe oublié ? Contactez FIK Conciergerie.'})));
}

async function load(){try{const d=await api('/me');st=d.site;siteUrl=d.url||siteUrl;dirty=false;render()}catch(x){renderLogin(x.message)}}

function field(label,obj,key,opts={}){const el=h(opts.area?'textarea':'input',{placeholder:opts.ph||''});el.value=obj[key]||'';el.addEventListener('input',()=>{obj[key]=el.value;touch()});return[h('label',{text:label}),el]}

function card(title,hint,...body){return h('section',{class:'card'},h('h2',{text:title}),hint?h('p',{class:'hint',text:hint}):null,...body)}

function render(){
  const p=st.place,c=st.content;
  app.replaceChildren(
    h('header',{},h('b',{text:p.name}),h('div',{class:'row',style:'flex:0 0 auto'},h('a',{href:siteUrl,target:'_blank',rel:'noopener'},'Voir mon site'),h('button',{on:{click:logout}},'Quitter'))),
    h('div',{class:'bar'},h('span',{id:'status',text:'Tout est publié'}),h('button',{class:'btn main',id:'pub',on:{click:publish}},'Publier')),
    h('main',{},
      card('Informations','Ce qui s\\'affiche en haut du site et dans le pied de page.',
        ...field('Nom du commerce',p,'name'),...field('Phrase d\\'accroche',c,'tagline'),...field('Téléphone',p,'phone',{ph:'+213 …'}),...field('Adresse',p,'address')),
      hoursCard(),
      aboutCard(),
      offerCard(),
      card('Points forts','Un par ligne (ex. « Terrasse », « Wi-Fi gratuit »).',linesArea(c,'highlights')),
      photosCard(),
      card('Couleurs',null,h('div',{class:'colors'},color('Couleur principale','primary'),color('Couleur d\\'accent','accent'))),
      passwordCard()));
}

function linesArea(obj,key){const t=h('textarea');t.value=(obj[key]||[]).join('\\n');t.addEventListener('input',()=>{obj[key]=t.value.split('\\n').map(s=>s.trim()).filter(Boolean);touch()});return t}

function color(label,key){const i=h('input',{type:'color'});i.value=st.content.palette[key];i.addEventListener('input',()=>{st.content.palette[key]=i.value;touch()});return h('div',{},h('label',{text:label}),i)}

function hoursCard(){
  const map={};for(const line of st.place.hours||[]){const i=line.indexOf(':');if(i>0)map[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim()}
  const sync=()=>{st.place.hours=DAYS.map(d=>d+': '+(map[d]||'Fermé'));touch()};
  return card('Horaires','Exemples : « 09:00 – 18:00 », « 11:00 – 15:00, 18:00 – 23:00 », « Fermé ».',
    h('div',{class:'hours'},DAYS.map(d=>{const i=h('input',{placeholder:'Fermé'});i.value=map[d]||'';i.addEventListener('input',()=>{map[d]=i.value.trim();sync()});return h('div',{class:'row'},h('span',{text:d}),i)})));
}

function aboutCard(){
  const box=h('div');
  const draw=()=>{box.replaceChildren(...st.content.about.map((t,i)=>{const a=h('textarea');a.value=t;a.addEventListener('input',()=>{st.content.about[i]=a.value;touch()});
    return h('div',{style:'margin-top:8px'},a,h('button',{class:'btn small del',on:{click:()=>{st.content.about.splice(i,1);touch();draw()}}},'Supprimer ce paragraphe'))}),
    h('button',{class:'btn small',style:'margin-top:10px',on:{click:()=>{st.content.about.push('');touch();draw()}}},'+ Ajouter un paragraphe'))};
  draw();return card('Présentation','Le texte « Bienvenue » qui présente votre commerce.',box);
}

function offerCard(){
  const c=st.content,box=h('div');
  const draw=()=>{box.replaceChildren(
    ...field('Titre de la rubrique',c,'offerTitle',{ph:'Notre carte, Nos prestations…'}),...field('Phrase d\\'introduction',c,'offerIntro'),
    ...c.offer.map((g,gi)=>{
      const items=g.items.map((it,ii)=>{const n=h('input',{placeholder:'Nom'}),pr=h('input',{placeholder:'Prix'}),d=h('input',{placeholder:'Description (facultatif)',class:'desc'});
        n.value=it.name||'';pr.value=it.price||'';d.value=it.description||'';
        n.addEventListener('input',()=>{it.name=n.value;touch()});pr.addEventListener('input',()=>{it.price=pr.value;touch()});d.addEventListener('input',()=>{it.description=d.value;touch()});
        return h('div',{class:'item'},n,pr,h('button',{class:'btn small del',title:'Supprimer',on:{click:()=>{g.items.splice(ii,1);touch();draw()}}},'✕'),d)});
      const gn=h('input',{placeholder:'Nom de la catégorie'});gn.value=g.group||'';gn.addEventListener('input',()=>{g.group=gn.value;touch()});
      return h('div',{class:'group'},h('div',{class:'row'},gn,h('button',{class:'btn small del',style:'flex:0 0 auto',on:{click:()=>{if(confirm('Supprimer la catégorie « '+(g.group||'')+' » et son contenu ?')){c.offer.splice(gi,1);touch();draw()}}}},'Supprimer')),
        ...items,h('button',{class:'btn small',style:'margin-top:10px',on:{click:()=>{g.items.push({name:'',description:'',price:''});touch();draw()}}},'+ Ajouter un élément'))}),
    h('button',{class:'btn',style:'margin-top:12px',on:{click:()=>{c.offer.push({group:'',items:[{name:'',description:'',price:''}]});touch();draw()}}},'+ Ajouter une catégorie'))};
  draw();return card(c.offerTitle||'Votre offre','Votre menu, vos prestations ou vos produits, avec les prix.',box);
}

function photosCard(){
  const grid=h('div',{class:'photos'}),inp=h('input',{type:'file',accept:'image/*',multiple:true,style:'display:none'}),info=h('p',{class:'hint'});
  const move=(i,j)=>{const a=st.photos;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];touch();draw()};
  const draw=()=>{grid.replaceChildren(...st.photos.map((u,i)=>h('div',{class:'ph'},h('img',{src:u,alt:'',loading:'lazy'}),i===0?h('span',{class:'tag',text:'Grande photo du haut'}):i===1?h('span',{class:'tag',text:'Photo « Bienvenue »'}):null,
    h('div',{class:'tools'},h('button',{title:'Avancer',on:{click:()=>move(i,i-1)}},'←'),h('button',{title:'Supprimer',on:{click:()=>{if(confirm('Retirer cette photo du site ?')){st.photos.splice(i,1);touch();draw()}}}},'🗑'),h('button',{title:'Reculer',on:{click:()=>move(i,i+1)}},'→')))))};
  inp.addEventListener('change',async()=>{for(const f of inp.files){info.textContent='Envoi de la photo…';try{const data=await shrink(f);const d=await api('/me/photo',{method:'POST',body:JSON.stringify({data})});st.photos.push(d.url);touch();draw();info.textContent=''}catch(x){info.textContent=x.message;break}}inp.value=''});
  draw();
  return card('Photos','La 1re photo est la grande image du haut, la 2e accompagne la présentation, les autres forment la galerie. Flèches pour changer l\\'ordre.',grid,info,
    h('button',{class:'btn',style:'margin-top:12px',on:{click:()=>inp.click()}},'+ Ajouter des photos'),inp);
}

function shrink(file){return new Promise((ok,ko)=>{const img=new Image(),u=URL.createObjectURL(file);img.onload=()=>{const k=Math.min(1,1800/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(u);ok(cv.toDataURL('image/jpeg',.85))};img.onerror=()=>ko(new Error('Image illisible : '+file.name));img.src=u})}

function passwordCard(){
  const o=h('input',{type:'password',autocomplete:'current-password'}),n=h('input',{type:'password',autocomplete:'new-password'}),m=h('div',{class:'err'});
  return card('Mot de passe',null,h('label',{text:'Mot de passe actuel'}),o,h('label',{text:'Nouveau mot de passe (8 caractères minimum)'}),n,
    h('button',{class:'btn',style:'margin-top:12px',on:{click:async()=>{m.textContent='';m.className='err';try{await api('/me/password',{method:'POST',body:JSON.stringify({old:o.value,new:n.value})});o.value=n.value='';m.className='err ok';m.textContent='Mot de passe changé.'}catch(x){m.textContent=x.message}}}},'Changer le mot de passe'),m);
}

async function publish(){
  const b=document.getElementById('pub'),s=document.getElementById('status');b.disabled=true;b.textContent='Publication…';
  try{const d=await api('/me',{method:'PUT',body:JSON.stringify({place:st.place,content:st.content,photos:st.photos})});st=d.site;siteUrl=d.url||siteUrl;dirty=false;s.textContent='Site à jour ✓';s.className='ok';toast('Votre site est à jour. Il peut falloir recharger la page du site.')}
  catch(x){s.textContent=x.message;s.className='err'}
  b.disabled=false;b.textContent='Publier';
}

token?load():renderLogin();
</script>
</body></html>`;
}
