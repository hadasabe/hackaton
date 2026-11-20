'use strict';
if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embed-mode');
const $=id=>document.getElementById(id);
const icon=name=>`<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const places=window.RYADOM_PLACES,geo=window.RyadomGeo;
const recordings=window.RYADOM_AUDIO||{files:{}};
const narratorName=recordings.voiceDisplayName||'Denis';
const find=id=>places.find(p=>p.id===id);
const state={source:'browse',fix:null,heading:null,headingAnchor:null,gpsIssue:'',selected:null,exploring:false,view:'nearby',mode:'cards',near:[],found:new Set(),queue:new geo.NarrationQueue(),demoProgress:0,running:false,follow:true,timer:null};
const voiceState={id:null,engine:null,playing:false,paused:false,loading:false,generation:0,utterance:null,message:'Выберите место или начните прогулку'};
const audio=new Audio();audio.preload='none';
let audioPolicy='auto';try{audioPolicy=localStorage.getItem('ryadom-audio-policy')||'auto';}catch(_e){}
if(!['auto','recordings','local'].includes(audioPolicy))audioPolicy='auto';
if(recordings.provider==='Piper'){try{if(localStorage.getItem('ryadom-neural-default')!=='denis-v1'){audioPolicy='auto';localStorage.setItem('ryadom-audio-policy','auto');localStorage.setItem('ryadom-neural-default','denis-v1');}}catch(_e){audioPolicy='auto';}}
$('audio-policy').value=audioPolicy;
const displayDistance=n=>!Number.isFinite(n)?'':n<1000?`${Math.round(n)} м`:`${(n/1000).toFixed(1).replace('.',',')} км`;
const placeCountLabel=n=>`${n} ${n%10===1&&n%100!==11?'место':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'места':'мест'}`;
const distance=p=>state.fix?geo.meters(state.fix,p):Infinity;
const STENA_STYLES={mural:'Мурал',graffiti:'Граффити',stencil:'Трафарет',sticker:'Стикер',text:'Надпись',other:'Другое'};
const STENA_STATUSES={alive:'На месте',erased:'Стёрто',partial:'Частично закрашено',unknown:'Сохранность не подтверждена'};
const normalizeAddress=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').replace(/\b(улица|ул|проспект|пр|набережная|сквер|район|дом|д)\b/g,' ').replace(/\s+/g,' ').trim();
function findLocationForAddress(address){
 const normalized=normalizeAddress(address),house=normalized.match(/\d+/)?.[0];
 return places.find(p=>{
  if(!geo.validPosition(p))return false;
  const candidate=normalizeAddress(p.address);
  if(candidate===normalized)return true;
  if(!house||!candidate.split(' ').includes(house))return false;
  return normalized.split(' ').some(token=>token.length>3&&!/^\d+$/.test(token)&&candidate.includes(token));
 });
}
async function loadStenaGraffiti(){
 try{
  const response=await fetch('/api/feed',{headers:{Accept:'application/json'}});
  if(!response.ok)return;
  const data=await response.json();
  for(const item of data.items||[]){
   const id=`stena-${item.id}`,matched=findLocationForAddress(item.address);
   if(!item?.id||places.some(p=>p.id===id))continue;
   if(matched?.category==='Стрит-арт')continue;
   places.push({
    id,
    name:`Граффити: ${item.address}`,
    category:'Стрит-арт',
    artType:STENA_STYLES[item.style]||'Граффити',
    address:item.address,
    era:'Архив «Стены»',
    description:item.description||'Работа из архива «Стены».',
    story:item.description||'',
    statusNote:STENA_STATUSES[item.status]||'',
    city:/^москва/i.test(item.address)?'МОСКВА':'САРАТОВ',
    artist:item.author_name&&item.author_name!=='неизвестный художник'?item.author_name:'',
    image:item.image_path,
    lat:matched?.lat,
    lng:matched?.lng,
    glyph:'cards',
    sources:[{title:'Стена — архив граффити',url:'/'}],
    source:'/',
    stena:true
   });
  }
  document.querySelectorAll('.total-places').forEach(el=>el.textContent=String(places.length));
 }catch(_error){}
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
function allowedNarration(){return state.source==='demo'||(state.source==='gps'&&!state.gpsIssue&&geo.reliable(state.fix));}

// The only network map dependency: visible OSM tiles. Library and all text are local.
let map,personMarker,radiusCircle,accuracyCircle,demoLine,tileLayer,plannedRouteLine,plannedRouteCasing,routeStartMarker,routeEndMarker,routeDrawRequest=0;
const markers=new Map();
function initMap(){
 if(!window.L){$('map-alert').hidden=false;$('map-alert').textContent='Не найдена библиотека карты. Проверьте папку vendor.';return;}
 map=L.map('map',{zoomControl:false,attributionControl:true,scrollWheelZoom:true}).setView([51.5305,46.0375],15);
 tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,minZoom:3,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
 tileLayer.on('tileerror',()=>{if(!navigator.onLine)return;const el=$('map-alert');el.hidden=false;el.textContent='Подложка карты не загрузилась. Проверьте интернет; точки и расстояния продолжают работать.';});
 tileLayer.on('tileload',()=>{if($('map-alert').textContent.startsWith('Подложка'))$('map-alert').hidden=true;});
 L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
 for(const p of places){if(!geo.validPosition(p))continue;const marker=L.marker([p.lat,p.lng],{icon:markerIcon(p),title:p.name,alt:p.name,keyboard:true}).addTo(map);marker.bindTooltip(esc(p.name),{direction:'top',offset:[0,-27],className:'poi-tooltip'});marker.on('click',()=>selectPlace(p.id,true));markers.set(p.id,marker);}
 map.on('dragstart',()=>state.follow=false);
 const routePane=map.createPane('routePane');routePane.style.zIndex=800;
 new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('map-region'));
}
function markerIcon(p){const near=state.near.some(n=>n.id===p.id);return L.divIcon({className:`poi-icon photo-poi ${near?'near':''} ${state.selected===p.id?'selected':''}`,html:`<span class="poi-photo">${icon(p.glyph)}${p.image&&!p.photo?.noCrop?`<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">`:''}</span><span class="poi-stem"></span>`,iconSize:[54,62],iconAnchor:[27,59]});}
function clearPlannedRoute(){
 for(const layer of [plannedRouteLine,plannedRouteCasing,routeStartMarker,routeEndMarker])if(layer)layer.remove();
 plannedRouteLine=plannedRouteCasing=routeStartMarker=routeEndMarker=null;
}
function routeEndpoint(label,latlng,kind){
 return L.marker(latlng,{icon:L.divIcon({className:'route-pin',html:`<span class="route-pin-dot ${kind}">${label}</span>`,iconSize:[36,36],iconAnchor:[18,18]}),interactive:false,keyboard:false,zIndexOffset:900,pane:'routePane'}).addTo(map);
}
function drawPlannedRoute(latlngs,dashed=false){
 plannedRouteCasing=L.polyline(latlngs,{color:'#121212',weight:11,opacity:.9,lineJoin:'round',lineCap:'round',interactive:false}).addTo(map);
 plannedRouteLine=L.polyline(latlngs,{color:'#caff00',weight:6,opacity:1,lineJoin:'round',lineCap:'round',dashArray:dashed?'10 8':null,interactive:false}).addTo(map);
}
function userRouteStart(){
 if(state.source!=='gps'||state.gpsIssue||!geo.reliable(state.fix))return null;
 return {lat:state.fix.lat,lng:state.fix.lng};
}
async function showPlannedRoute(ids){
 const routeIds=[...new Set(ids)];
 const start=userRouteStart();
 const points=(start?[start]:[]).concat(routeIds.map(find).filter(p=>p&&geo.validPosition(p)));
 clearPlannedRoute();routeDrawRequest++;
 if(!map||!points.length)return;
 state.follow=false;setTab('map',false);
 if(points.length===1){map.setView([points[0].lat,points[0].lng],17);routeStartMarker=routeEndpoint('A',[points[0].lat,points[0].lng],'start');return;}
 const request=routeDrawRequest,straight=points.map(p=>[p.lat,p.lng]);
 let latlngs=straight,routed=false;
 try{
  const coords=points.map(p=>`${p.lng},${p.lat}`).join(';');
  const response=await fetch(`/api/walk-route?coords=${encodeURIComponent(coords)}`);
  if(!response.ok)throw new Error('route');
  const data=await response.json();
  if(request!==routeDrawRequest)return;
  if(data.geometry?.coordinates?.length){latlngs=data.geometry.coordinates.map(([lng,lat])=>[lat,lng]);routed=true;}
 }catch(_error){if(request!==routeDrawRequest)return;}
 drawPlannedRoute(latlngs,!routed);
 routeStartMarker=routeEndpoint(start?'Я':'A',latlngs[0],'start');
 routeEndMarker=routeEndpoint('Б',latlngs[latlngs.length-1],'end');
 map.fitBounds(L.latLngBounds(latlngs),{padding:[65,95],maxZoom:16});
 if(!routed)toast('Маршрут по дорогам недоступен. Показано направление по прямой.');
}
function acceptHeading(fix){
 state.heading=geo.resolveHeading(state.headingAnchor,fix,state.heading);
 if(geo.reliable(fix)&&(!geo.reliable(state.headingAnchor)||geo.meters(state.headingAnchor,fix)>Math.max(8,state.headingAnchor.accuracy+fix.accuracy)))state.headingAnchor=fix;
}
function updateMap(){
 if(!map)return;
 for(const p of places){const marker=markers.get(p.id);if(!marker)continue;const key=`${state.selected===p.id}-${state.near.some(n=>n.id===p.id)}`;if(marker._ryadomKey!==key){marker.setIcon(markerIcon(p));marker._ryadomKey=key;}}
 if(!state.fix){for(const layer of [personMarker,radiusCircle,accuracyCircle])if(layer)layer.remove();personMarker=radiusCircle=accuracyCircle=null;return;}
 const latlng=[state.fix.lat,state.fix.lng];
 if(!personMarker){radiusCircle=L.circle(latlng,{radius:100,color:'#caff00',weight:1.3,dashArray:'5 6',fillColor:'#caff00',fillOpacity:.1,interactive:false}).addTo(map);personMarker=L.marker(latlng,{icon:L.divIcon({className:'user-arrow-marker',html:'<span class="user-arrow-wrap"><span class="user-arrow"></span></span>',iconSize:[38,38],iconAnchor:[19,19]}),interactive:false,keyboard:false,zIndexOffset:1000}).addTo(map);}else{personMarker.setLatLng(latlng);radiusCircle.setLatLng(latlng);}
 const arrow=personMarker.getElement()?.querySelector('.user-arrow-wrap');if(arrow){arrow.style.transform=`rotate(${state.heading??0}deg)`;arrow.classList.toggle('unknown-heading',!Number.isFinite(state.heading));}
 if(state.source==='gps'&&state.fix.accuracy<5000){if(!accuracyCircle)accuracyCircle=L.circle(latlng,{color:'#8fa1ae',weight:.7,fillColor:'#a9beca',fillOpacity:.07,interactive:false}).addTo(map);accuracyCircle.setLatLng(latlng).setRadius(state.fix.accuracy);}else if(accuracyCircle){accuracyCircle.remove();accuracyCircle=null;}
 if(state.follow)map.panTo(latlng,{animate:!matchMedia('(prefers-reduced-motion:reduce)').matches,duration:.4});
}
function updateLocationUI(){
 const gps=state.source==='gps',demo=state.source==='demo',fix=state.fix;
 const live=gps&&fix&&!state.gpsIssue&&geo.reliable(fix);
 document.body.classList.toggle('has-location',Boolean(fix));
 $('location-dot').className='location-dot'+(live?' live':demo?' demo':'');
 $('accuracy-label').textContent=gps&&fix?`±${Math.round(fix.accuracy)} м`:demo?'Демо':'';
 $('location-title').textContent=demo?'Демонстрационная прогулка':gps?(state.gpsIssue?'GPS требует внимания':fix?'Вы на карте':'Определяем местоположение'):'Начнём с вашего места';
 let message='Разрешите геолокацию, чтобы находить истории рядом. Координаты обрабатываются на устройстве.';
 if(demo)message='Движение имитируется. Расстояния считаются по настоящим координатам, но это не маршрут для навигации.';
 if(gps){message=state.gpsIssue||(fix?geo.reliable(fix)?'Новые истории появляются в радиусе 100 м. Держите приложение открытым во время прогулки.':'Сигнал неточный или устарел. Карточки приблизительны, новые рассказы автоматически не запускаются.':'Разрешите доступ в запросе браузера. Первое измерение может занять несколько секунд.');}
 $('location-message').textContent=message;
 $('gps-button').innerHTML=icon('locate')+`<span>${gps&&locator.active?'Остановить GPS-прогулку':demo?'Перейти к настоящему GPS':'Начать прогулку'}</span>`;
 $('demo-console').hidden=!demo;
}
function picture(p){
 const tags=`<span class="picture-tag">${esc(p.artType||p.category)}</span>${p.photo?.archival?'<span class="archive-tag">Архивный снимок</span>':''}${!p.image?'<span class="photo-placeholder">Фото пока нет</span>':''}<span class="distance-tag" data-distance="${p.id}" ${state.fix?'':'hidden'}>${icon('walk')}<span>${displayDistance(distance(p))} от вас</span></span>`;
 if(p.image&&p.photo?.noCrop)return `<div class="card-picture editorial-picture no-crop-picture"><div class="no-crop-action-space" aria-hidden="true"></div><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async"><div class="no-crop-photo-labels">${tags}</div></div>`;
 return `<div class="card-picture editorial-picture">${icon(p.glyph)}${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:''}${tags}</div>`;
}
function storyParagraphs(story){return String(story||'').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');}
function storySources(p){return (p.sources?.length?p.sources:[{title:'Туристический портал Саратова',url:p.source}]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' · ');}
function photoCredit(p){if(!p.photo)return '';const photo=p.photo;return `<details class="photo-credit" data-memory="photo-${p.id}"><summary>Об этом снимке</summary><p>${photo.title?esc(photo.title)+'.<br>':''}Источник фото: <a href="${esc(photo.source)}" target="_blank" rel="noopener noreferrer">${esc(photo.author.replace(/^Источник:\s*/,''))}</a>.<br><a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license)}</a>. ${esc(photo.modified||'Уменьшено; в интерфейсе кадрировано')}.</p></details>`;}
function placeCard(p){return `<article class="place-card editorial-card" data-place-id="${p.id}">${picture(p)}<div class="card-content"><div class="card-kicker">${esc(p.era||p.category)} · ${esc(p.city||'САРАТОВ')}</div><h3>${esc(p.name)}</h3><div class="outside-label" data-outside="${p.id}" hidden>Вне радиуса · открыто вручную</div><p class="card-description">${esc(p.description)}</p>${p.artist?`<p class="art-credit">Автор: <strong>${esc(p.artist)}</strong></p>`:''}${p.statusNote?`<details class="place-status" data-memory="status-${p.id}"><summary>Актуальность места</summary><p class="place-status-note">${esc(p.statusNote)}</p></details>`:''}<details class="story-details" data-story="${p.id}" data-memory="story-${p.id}"><summary>История места <span aria-hidden="true">+</span></summary><div class="story-text">${storyParagraphs(p.story)}${p.lookFor?`<aside class="look-for"><strong>Присмотритесь</strong><p>${esc(p.lookFor)}</p></aside>`:''}<div class="story-sources"><span>Источники истории</span>${storySources(p)}</div></div></details><div class="card-address">${icon('pin')}${esc(p.address)}</div><div class="card-actions"><button class="listen-story" data-listen="${p.id}">${icon('headphones')}Послушать</button>${geo.validPosition(p)?`<button class="card-map-link" data-place="${p.id}">${icon('map-icon')}На карте</button>`:''}</div>${photoCredit(p)}</div></article>`;}
let cardRenderKey=null,voiceRenderKey=null;
const expandedDetails=new Set();
function rememberDetails(){for(const el of $('place-list').querySelectorAll('details[data-memory]')){if(el.open)expandedDetails.add(el.dataset.memory);else expandedDetails.delete(el.dataset.memory);}}
function refreshCardDistances(){for(const el of $('place-list').querySelectorAll('[data-distance]')){const p=find(el.dataset.distance);el.hidden=!state.fix;el.querySelector('span').textContent=`${displayDistance(distance(p))} от вас`;}for(const el of $('place-list').querySelectorAll('[data-outside]'))el.hidden=!(state.fix&&state.view!=='catalog'&&state.exploring&&state.selected===el.dataset.outside&&distance(find(el.dataset.outside))>100);for(const el of $('place-list').querySelectorAll('[data-place-id]'))el.classList.toggle('selected-card',el.dataset.placeId===state.selected);}
function renderCards(){
 const catalog=state.view==='catalog',query=$('search').value.trim().toLowerCase(),category=$('category-filter').value;
 const inspiration=!catalog&&state.source==='browse'&&!state.fix;
 let list=catalog?places.filter(p=>(!query||`${p.name} ${p.address} ${p.artist||''} ${p.artType||''} ${p.description}`.toLowerCase().includes(query))&&(!category||p.category===category)):inspiration?['art-stolypin-32-courtyard','conservatory','utoli'].map(find).filter(Boolean):state.near;
 if(catalog&&state.fix)list=list.slice().sort((a,b)=>distance(a)-distance(b));else if(catalog)list=list.slice().sort((a,b)=>Number(Boolean(b.image))-Number(Boolean(a.image)));
 const manual=find(state.selected);if(!catalog&&state.exploring&&manual&&!list.some(p=>p.id===manual.id))list=[manual,...list];
 if(!list.some(p=>p.id===state.selected))state.selected=list[0]?.id||null;
 const active=list.find(p=>p.id===state.selected),voiceOnly=state.mode==='voice'&&!catalog;
 document.querySelectorAll('[data-category]').forEach(button=>{const active=button.dataset.category===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 $('list-heading').textContent=catalog?'Саратов в деталях':inspiration?'До начала прогулки':'Истории рядом';$('nearby-count').textContent=String(catalog||inspiration?list.length:state.near.length);$('radius-label').textContent=catalog?'Фотографии и истории':inspiration?'Подборка · без GPS':'В радиусе 100 м';$('catalog-tools').hidden=!catalog;
 $('place-list').hidden=voiceOnly;$('voice-companion').hidden=!voiceOnly;$('empty-state').hidden=!!active||voiceOnly;
 $('empty-message').innerHTML=state.fix?'В радиусе 100 м пока нет мест из каталога.<br>Продолжайте прогулку или откройте список.':catalog?'Попробуйте другое название или категорию.':'Включите GPS, чтобы увидеть, что интересного рядом.<br>Мы покажем места в радиусе 100 метров.';
 if(catalog&&!list.length)$('empty-message').textContent='По вашему запросу ничего не найдено. Попробуйте изменить фильтр.';
 const key=JSON.stringify([catalog,inspiration,query,category,list.map(p=>p.id).sort()]);
 if(key!==cardRenderKey){rememberDetails();const existing=new Map(Array.from($('place-list').querySelectorAll('[data-place-id]'),el=>[el.dataset.placeId,el]));const ids=new Set(list.map(p=>p.id));for(const [id,el] of existing)if(!ids.has(id))el.remove();for(const p of list){let el=existing.get(p.id);if(!el){const template=document.createElement('template');template.innerHTML=placeCard(p);el=template.content.firstElementChild;for(const detail of el.querySelectorAll('details[data-memory]'))detail.open=expandedDetails.has(detail.dataset.memory);}$('place-list').append(el);}cardRenderKey=key;}
 refreshCardDistances();
 const narrator=find(voiceState.id)||active,newVoiceKey=narrator?.id||'empty';
 if(newVoiceKey!==voiceRenderKey){const transcriptOpen=!!$('voice-companion').querySelector('details[open]');$('voice-companion').innerHTML=`<div class="voice-orbit">${icon('headphones')}</div><div class="eyebrow">ИСТОРИИ ВКЛЮЧАЮТСЯ ПО ПУТИ</div><h3>${narrator?esc(narrator.name):'Слушайте город'}</h3><p>${narrator?esc(narrator.description):'Начните прогулку с GPS или выберите место в каталоге.'}</p>${narrator?`<details ${transcriptOpen?'open':''}><summary>Прочитать текст рассказа</summary><div class="story-text">${storyParagraphs(narrator.story)}<div class="story-sources">${storySources(narrator)}</div></div></details>`:''}`;voiceRenderKey=newVoiceKey;}
}
function updateProximity(){state.near=geo.nearby(places,state.fix);if(allowedNarration())state.near.forEach(p=>state.found.add(p.id));if(!state.exploring&&!state.near.some(p=>p.id===state.selected)&&state.view!=='catalog')state.selected=state.near[0]?.id||null;state.queue.discover(state.near.filter(p=>p.historyStatus!=='pending'),allowedNarration());renderCards();updateMap();updateLocationUI();$('discovered').textContent=`${state.found.size} ${state.found.size%10===1&&state.found.size%100!==11?'место':state.found.size%10>=2&&state.found.size%10<=4&&(state.found.size%100<12||state.found.size%100>14)?'места':'мест'}`;maybeNarrate();}
function selectPlace(id,fromMap=false){
 window.dispatchEvent(new CustomEvent('ryadom:place-selected',{detail:{id,fromMap}}));
 if(fromMap&&innerWidth<=760)setTab('nearby',false);
 state.selected=id;state.exploring=true;renderCards();updateMap();
 if(state.mode==='voice')startNarration(id);
 if(fromMap){const card=state.mode==='voice'?$('voice-companion'):$('place-list').querySelector(`[data-place-id="${id}"]`);(card||document.querySelector('.discoveries')).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}
}
function updateSheetHandle(){const handle=$('sheet-handle');if(!handle)return;const peek=document.body.classList.contains('sheet-peek');const icon=peek?'arrow-up-icon':'arrow-down-icon';if(handle.dataset.icon!==icon){handle.innerHTML=`<svg aria-hidden="true"><use href="#${icon}"/></svg>`;handle.dataset.icon=icon;}handle.setAttribute('aria-label',peek?'Развернуть панель':'Свернуть панель');}
function setTab(tab,scroll=true){state.view=tab;document.body.classList.toggle('sheet-peek',tab==='map');document.body.classList.toggle('mobile-catalog',tab==='catalog');updateSheetHandle();if(tab!=='map'){const explorer=$('explorer');if(explorer){explorer.style.transition='';explorer.style.transform='';}}document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===(tab==='nearby'?'map':tab)));if(tab==='nearby'){state.exploring=false;state.selected=state.near[0]?.id||null;}renderCards();updateLocationUI();if(map){map.invalidateSize({pan:false});if(tab==='catalog')map.fitBounds(places.filter(geo.validPosition).map(p=>[p.lat,p.lng]),{padding:[60,60],maxZoom:14});}if(scroll&&innerWidth<=760)window.scrollTo({top:0,behavior:'instant'});}
function initSheetDrag(){
 const handle=$('sheet-handle'),explorer=$('explorer');
 if(!handle||!explorer)return;
 updateSheetHandle();
 let startY=0,delta=0,dragging=false;
 const isPeek=()=>document.body.classList.contains('sheet-peek');
 const collapse=()=>setTab('map',true);
 const restore=()=>setTab('nearby',true);
 const finish=commit=>{
  if(!dragging)return;
  dragging=false;
  const peek=isPeek();
  explorer.style.transition='transform .2s ease';
  if(!commit){
   explorer.style.transform='';
   if(peek)restore();else collapse();
  }else if(peek){
   if(delta<-30){
    explorer.style.transform='translateY(-28px)';
    window.setTimeout(()=>{restore();explorer.style.transition='';explorer.style.transform='';},190);
   }else explorer.style.transform='';
  }else{
   const threshold=Math.min(110,innerHeight*.14);
   if(delta>threshold){
    explorer.style.transform=`translateY(${Math.min(delta,160)}px)`;
    window.setTimeout(()=>{collapse();explorer.style.transition='';explorer.style.transform='';},190);
   }else explorer.style.transform='';
  }
  delta=0;
 };
 handle.addEventListener('pointerdown',event=>{
  if(innerWidth>760)return;
  dragging=true;startY=event.clientY;delta=0;
  explorer.style.transition='none';explorer.style.transform='';
  handle.setPointerCapture?.(event.pointerId);
 });
 handle.addEventListener('pointermove',event=>{
  if(!dragging)return;
  if(isPeek())delta=event.clientY-startY;
  else delta=Math.max(0,event.clientY-startY);
  explorer.style.transform=isPeek()?`translateY(${Math.min(0,delta)}px)`:`translateY(${Math.min(delta,160)}px)`;
 });
 handle.addEventListener('pointerup',()=>{
  if(!dragging)return;
  finish(Math.abs(delta)>=8);
 });
 handle.addEventListener('pointercancel',()=>finish(false));
 handle.addEventListener('click',event=>{if(event.detail===0){if(isPeek())restore();else collapse();}});
}
const locator=geo.locationController({geolocation:navigator.geolocation,secure:window.isSecureContext,
 onStatus:()=>{state.source='gps';state.gpsIssue='';state.fix=null;updateProximity();},
 onFix:fix=>{const first=!state.fix;acceptHeading(fix);state.source='gps';state.fix=fix;state.gpsIssue='';if(first&&map)map.setView([fix.lat,fix.lng],17);updateProximity();window.dispatchEvent(new Event('ryadom:gps-fix'));},
 onError:error=>{if(error.code===1)setTab('nearby',false);state.gpsIssue=error.message;updateLocationUI();toast(error.message);}
});
function stopDemo(){clearInterval(state.timer);state.timer=null;state.running=false;}
function stopSources(){locator.stop();stopDemo();if(demoLine){demoLine.remove();demoLine=null;}}
function beginGPS(){if(state.source==='gps'&&locator.active){stopLocation();return;}stopSources();stopNarration();state.queue.reset();state.found.clear();state.fix=null;state.heading=null;state.headingAnchor=null;state.source='gps';state.exploring=false;state.follow=true;updateProximity();if(locator.start()&&innerWidth<=760)setTab('map',true);}
function stopLocation(){setTab('nearby',false);state.heading=null;state.headingAnchor=null;stopSources();stopNarration();state.source='browse';state.fix=null;state.gpsIssue='';state.near=[];state.queue.reset();state.selected=null;state.exploring=false;updateProximity();}
const demoIds=['conservatory','art-garmoshka','chernyshevsky','utoli','schmidt','art-time-face','lipki','estate','fedin','embankment','trinity','local-history','radishchev'];
const demoPath=demoIds.map(id=>find(id));const segments=demoPath.slice(1).map((p,i)=>geo.meters(demoPath[i],p));const routeLength=segments.reduce((s,n)=>s+n,0);
function beginDemo(){setTab('nearby',false);state.heading=null;state.headingAnchor=null;stopSources();stopNarration();state.queue.reset();state.found.clear();state.source='demo';state.fix=null;state.gpsIssue='';state.selected='conservatory';state.exploring=false;state.follow=true;if(map){demoLine=L.polyline(demoPath.map(p=>[p.lat,p.lng]),{color:'#caff00',weight:3,dashArray:'6 9',opacity:.75,interactive:false}).addTo(map);map.setView([demoPath[0].lat,demoPath[0].lng],17);}moveDemo(0);setRunning(false);}
function moveDemo(value){state.demoProgress=Math.max(0,Math.min(100,Number(value)));let rest=routeLength*state.demoProgress/100;for(let i=0;i<segments.length;i++){if(rest<=segments[i]||i===segments.length-1){const f=Math.min(1,rest/segments[i]);state.heading=geo.bearing(demoPath[i],demoPath[i+1]);state.fix={lat:demoPath[i].lat+(demoPath[i+1].lat-demoPath[i].lat)*f,lng:demoPath[i].lng+(demoPath[i+1].lng-demoPath[i].lng)*f,accuracy:5,timestamp:Date.now()};break;}rest-=segments[i];}$('walk-progress').value=String(state.demoProgress);updateProximity();if(state.demoProgress>=100&&state.running){setRunning(false);toast('Демо завершено. Для настоящей прогулки включите GPS.');}}
function setRunning(running){stopDemo();state.running=running;$('toggle-walk').innerHTML=icon(running?'pause':'play')+`<span>${running?'Приостановить':state.demoProgress>=100?'Пройти ещё раз':'Продолжить демо'}</span>`;if(running){let previous=performance.now();state.timer=setInterval(()=>{const now=performance.now();const elapsed=Math.min(1,Math.max(0,(now-previous)/1000));previous=now;moveDemo(state.demoProgress+1.25*elapsed/routeLength*100);},400);}}
function nextDemo(){setRunning(false);stopNarration();state.queue.finish();state.exploring=false;let length=0;const stops=[0,...segments.map(n=>(length+=n)/routeLength*100)];const next=stops.find(n=>n>state.demoProgress+.1);if(next===undefined){toast('Демо завершено. Можно начать заново.');return;}moveDemo(next);setRunning(false);}

function audioUI(){
 $('audio-dock').hidden=state.mode!=='voice';$('audio-title').textContent=find(voiceState.id)?.name||'Истории по пути';$('audio-status').textContent=voiceState.message;
 $('audio-engine').textContent=voiceState.engine==='recording'?`${narratorName.toUpperCase()} · НЕЙРООЗВУЧКА`:voiceState.engine==='local'?'ЛОКАЛЬНЫЙ ГОЛОС УСТРОЙСТВА':'СПОКОЙНЫЙ ГИД';
 $('waveform').classList.toggle('speaking',voiceState.playing&&!voiceState.paused);$('audio-play').innerHTML=icon(voiceState.playing&&!voiceState.paused?'pause':'play');$('audio-play').disabled=voiceState.loading||(!voiceState.id&&!state.selected&&!state.near.length);
}
function stopNarration(){voiceState.generation++;audio.onended=audio.onerror=audio.onplaying=null;audio.pause();audio.removeAttribute('src');audio.load();if('speechSynthesis'in window)speechSynthesis.cancel();voiceState.utterance=null;voiceState.playing=false;voiceState.paused=false;voiceState.loading=false;state.queue.finish();audioUI();}
function localVoice(){if(!('speechSynthesis'in window))return null;const ru=speechSynthesis.getVoices().filter(v=>v.localService&&/^ru(?:-|_)/i.test(v.lang));return ru.find(v=>/irina|ирина/i.test(v.name))||ru[0]||null;}
async function resolveVoice(){const ready=localVoice();if(ready||!('speechSynthesis'in window))return ready;return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);speechSynthesis.removeEventListener('voiceschanged',done);resolve(localVoice());};speechSynthesis.addEventListener('voiceschanged',done);timer=setTimeout(done,1800);});}
function narrationFinished(generation){if(generation!==voiceState.generation)return;voiceState.playing=false;voiceState.loading=false;voiceState.paused=false;voiceState.message='История закончилась. Продолжайте прогулку.';state.queue.finish();audioUI();maybeNarrate();}
async function speakLocal(p,generation){
 voiceState.engine='local';voiceState.loading=true;voiceState.message='Подбираем локальный русский голос…';audioUI();const voice=await resolveVoice();if(generation!==voiceState.generation)return;
 voiceState.loading=false;if(!voice){voiceState.message='Нет локального русского голоса. Раскройте текст рассказа.';audioUI();return;}
 const utterance=new SpeechSynthesisUtterance(p.story);voiceState.utterance=utterance;utterance.voice=voice;utterance.lang='ru-RU';utterance.rate=.9;utterance.pitch=1;utterance.volume=.9;
 utterance.onstart=()=>{if(generation!==voiceState.generation)return;voiceState.playing=true;voiceState.message=`Спокойный темп · ${voice.name}`;audioUI();};
 utterance.onend=()=>narrationFinished(generation);
 utterance.onerror=e=>{if(generation!==voiceState.generation||e.error==='canceled'||e.error==='interrupted')return;voiceState.playing=false;voiceState.message='Озвучивание недоступно. Нажмите воспроизведение или прочитайте текст.';audioUI();};
 voiceState.message='Подготавливаем рассказ…';audioUI();speechSynthesis.speak(utterance);
}
async function startNarration(id){
 const p=find(id);if(!p)return;stopNarration();if(p.historyStatus==='pending'){voiceState.id=id;voiceState.engine=null;voiceState.message='Исторический рассказ пока уточняется. Доступна карточка места.';audioUI();renderCards();return;}const generation=voiceState.generation;voiceState.id=id;voiceState.engine=null;state.queue.current=id;state.queue.seen.add(id);state.selected=id;renderCards();updateMap();
 const clip=recordings.files?.[id];
 if(audioPolicy!=='local'&&clip){
  voiceState.engine='recording';voiceState.loading=true;voiceState.message='Открываем готовую запись…';audioUI();audio.src=clip.src;
  audio.onended=()=>narrationFinished(generation);audio.onplaying=()=>{if(generation!==voiceState.generation)return;voiceState.loading=false;voiceState.playing=true;voiceState.message=`${narratorName} · спокойная живая подача`;audioUI();};
  audio.onerror=()=>{if(generation!==voiceState.generation)return;voiceState.loading=false;voiceState.playing=false;voiceState.message='Запись недоступна. Попробуйте локальный голос в настройках.';audioUI();};
  try{await audio.play();}catch(error){if(generation!==voiceState.generation)return;voiceState.loading=false;voiceState.playing=false;if(error.name==='NotAllowedError'){voiceState.message='Нажмите воспроизведение, чтобы разрешить звук.';audioUI();return;}if(audioPolicy==='auto'){audio.onended=audio.onerror=audio.onplaying=null;await speakLocal(p,generation);}else{voiceState.message='Не удалось открыть запись. Доступен текст рассказа.';audioUI();}}return;
 }
 if(audioPolicy==='recordings'){voiceState.message='Нейрозапись этого рассказа пока недоступна. Текст можно прочитать в карточке.';audioUI();return;}
 await speakLocal(p,generation);
}
function maybeNarrate(){if(state.mode!=='voice'||document.hidden||!allowedNarration()||voiceState.loading||voiceState.playing||voiceState.paused||state.queue.current)return;const id=state.queue.next(state.near,true);if(id)startNarration(id);}
function setMode(mode){state.mode=mode;document.body.classList.toggle('voice-mode',mode==='voice');$('card-mode').classList.toggle('selected',mode==='cards');$('voice-mode').classList.toggle('selected',mode==='voice');$('card-mode').setAttribute('aria-pressed',mode==='cards');$('voice-mode').setAttribute('aria-pressed',mode==='voice');if(mode==='cards')stopNarration();else{const p=find(state.selected)||state.near[0];if(p)startNarration(p.id);}renderCards();audioUI();}
async function toggleAudio(){
 if(voiceState.loading)return;
 if(voiceState.playing&&!voiceState.paused){if(voiceState.engine==='recording')audio.pause();else if('speechSynthesis'in window)speechSynthesis.pause();voiceState.paused=true;voiceState.message='Рассказ на паузе';audioUI();return;}
 if(voiceState.paused){if(voiceState.engine==='recording'){try{await audio.play();}catch(_e){voiceState.message='Нажмите воспроизведение ещё раз.';audioUI();return;}}else if('speechSynthesis'in window)speechSynthesis.resume();voiceState.paused=false;voiceState.message='Слушайте город. Можно идти дальше.';audioUI();return;}
 const id=voiceState.id||state.selected||state.near[0]?.id;if(id)startNarration(id);
}

$('gps-button').addEventListener('click',beginGPS);initSheetDrag();
$('toggle-walk').addEventListener('click',()=>{if(state.demoProgress>=100)beginDemo();setRunning(!state.running);});
$('next-place').addEventListener('click',nextDemo);$('reset-demo').addEventListener('click',beginDemo);
$('walk-progress').addEventListener('input',e=>{setRunning(false);stopNarration();state.queue.pending=[];state.exploring=false;moveDemo(e.target.value);setRunning(false);});
$('card-mode').addEventListener('click',()=>setMode('cards'));$('voice-mode').addEventListener('click',()=>setMode('voice'));
$('audio-play').addEventListener('click',toggleAudio);$('audio-close').addEventListener('click',()=>setMode('cards'));
$('place-list').addEventListener('click',e=>{const listen=e.target.closest('[data-listen]');if(listen){state.selected=listen.dataset.listen;setMode('voice');return;}const card=e.target.closest('[data-place]');if(card){selectPlace(card.dataset.place);if(map){state.follow=false;const p=find(card.dataset.place);map.setView([p.lat,p.lng],17);}setTab('map',false);}});
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{const tab=button.dataset.tab;if(tab==='map'&&document.body.classList.contains('sheet-peek')){setTab('nearby');return;}setTab(tab);});
for(const chip of document.querySelectorAll('[data-category]'))chip.addEventListener('click',()=>{$('category-filter').value=chip.dataset.category;renderCards();});
$('open-catalog').addEventListener('click',()=>setTab('catalog'));$('search').addEventListener('input',renderCards);$('category-filter').addEventListener('change',renderCards);
$('zoom-in').addEventListener('click',()=>map?.zoomIn());$('zoom-out').addEventListener('click',()=>map?.zoomOut());$('center-map').addEventListener('click',()=>{state.follow=true;if(map){if(state.fix)map.setView([state.fix.lat,state.fix.lng],17);else{map.setView([51.5305,46.0375],15);toast('Включите GPS, чтобы показать ваше положение.');}}});
$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
$('audio-policy').addEventListener('change',e=>{audioPolicy=e.target.value;try{localStorage.setItem('ryadom-audio-policy',audioPolicy);}catch(_e){}stopNarration();voiceState.message='Настройка озвучки изменена. Нажмите воспроизведение.';audioUI();});
function networkStatus(){$('network-note').hidden=navigator.onLine;}
window.addEventListener('online',networkStatus);window.addEventListener('offline',networkStatus);
window.addEventListener('pagehide',()=>{stopSources();stopNarration();});
window.addEventListener('pageshow',event=>{if(event.persisted&&state.source==='gps'){state.gpsIssue='GPS остановлен после возвращения на страницу. Нажмите кнопку, чтобы продолжить.';updateLocationUI();}});
let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-button').hidden=false;});
$('install-button').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install-button').hidden=true;}});
window.addEventListener('appinstalled',()=>{$('install-button').hidden=true;toast('Приложение добавлено на главный экран.');});
if('serviceWorker'in navigator&&window.isSecureContext&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
if('speechSynthesis'in window)speechSynthesis.getVoices();
for(const el of document.querySelectorAll('.total-places'))el.textContent=String(places.length);
const clipCount=Object.keys(recordings.files||{}).length;$('recordings-status').textContent=clipCount?`Готово нейрозаписей: ${clipCount}. Голос ${narratorName}.`:'Готовые записи ещё не добавлены.';
$('voice-summary').textContent=clipCount?`Голос ${narratorName} · готовая нейроозвучка`:'Нейрозаписи готовятся · доступен резервный голос';
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&(event.target.closest('.editorial-picture')||event.target.closest('.poi-photo')))event.target.hidden=true;},true);
setInterval(()=>{if(state.source==='gps'&&state.fix){updateLocationUI();maybeNarrate();}},5000);

// Public UI bridge: saved walks contain public place IDs, never location history.
window.RyadomApp={
 places,
 getState:()=>({source:state.source,selected:state.selected,nearIds:state.near.map(p=>p.id)}),
 selectPlace:(id,fromMap=true)=>{if(find(id))selectPlace(id,fromMap);},
 setTab,setMode,
 beginGPS:()=>{if(state.source==='gps'&&locator.active){state.follow=true;updateMap();}else beginGPS();},
 toast,
 showRoute:ids=>showPlannedRoute(ids),
 clearRoute:()=>{routeDrawRequest++;clearPlannedRoute();},
 userPosition:()=>userRouteStart()
};
loadStenaGraffiti().finally(()=>{
 initMap();networkStatus();updateProximity();
 window.dispatchEvent(new Event('ryadom:ready'));
});
