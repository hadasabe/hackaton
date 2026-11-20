/* Pure geographic and proximity logic, shared with Node tests. */
(function(root){
 'use strict';
 const RADIUS=100;
 function validPosition(p){return !!p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;}
 function meters(a,b){if(!validPosition(a)||!validPosition(b))return Infinity;const rad=n=>n*Math.PI/180;const lat=rad(b.lat-a.lat),lng=rad(b.lng-a.lng);const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lng/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
 function nearby(places,position,radius=RADIUS){if(!validPosition(position))return [];return places.map(p=>({...p,distance:meters(position,p)})).filter(p=>p.distance<=radius).sort((a,b)=>a.distance-b.distance);}
 // Heading is travel direction, clockwise from true north; it is not a phone compass.
 function bearing(a,b){
  if(!validPosition(a)||!validPosition(b)||meters(a,b)<1)return null;
  const rad=n=>n*Math.PI/180,d=rad(b.lng-a.lng);
  const x=Math.sin(d)*Math.cos(rad(b.lat));
  const y=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(d);
  return (Math.atan2(x,y)*180/Math.PI+360)%360;
 }
 function resolveHeading(previous,fix,last=null,now=Date.now()){
  const retained=Number.isFinite(last)&&last>=0&&last<360?last:null;
  if(!reliable(fix,now))return retained;
  if(Number.isFinite(fix.heading)&&fix.heading>=0&&fix.heading<360&&Number.isFinite(fix.speed)&&fix.speed>=.5)return fix.heading;
  if(reliable(previous,now)&&fix.timestamp>previous.timestamp&&meters(previous,fix)>Math.max(8,previous.accuracy+fix.accuracy))return bearing(previous,fix);
  return retained;
 }
 function reliable(fix,now=Date.now()){return validPosition(fix)&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=60&&Number.isFinite(fix.timestamp)&&now-fix.timestamp<=20000&&now>=fix.timestamp-5000;}
 class NarrationQueue {
  constructor(){this.seen=new Set();this.pending=[];this.current=null;}
  discover(near,allowed=true){const ids=new Set(near.map(p=>p.id));this.pending=this.pending.filter(id=>ids.has(id));if(allowed)for(const p of near)if(!this.seen.has(p.id)&&!this.pending.includes(p.id)&&this.current!==p.id)this.pending.push(p.id);}
  next(near,allowed=true){if(!allowed||this.current)return null;const ids=new Set(near.map(p=>p.id));this.pending=this.pending.filter(id=>ids.has(id));this.current=this.pending.shift()||null;if(this.current)this.seen.add(this.current);return this.current;}
  finish(){this.current=null;}
  reset(){this.seen.clear();this.pending=[];this.current=null;}
 }
 function locationController({geolocation,secure,onFix,onError,onStatus,now=Date.now}){
  let watch=null,generation=0;
  function stop(){generation++;if(watch!==null&&geolocation)geolocation.clearWatch(watch);watch=null;}
  function start(){stop();if(!secure){onError({code:'insecure',message:'На телефоне геолокация работает по HTTPS. На компьютере откройте localhost.'});return false;}if(!geolocation){onError({code:'unsupported',message:'Этот браузер не поддерживает геолокацию.'});return false;}const run=generation;onStatus('waiting');
   watch=geolocation.watchPosition(position=>{if(run!==generation)return;const fix={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp,heading:Number.isFinite(position.coords.heading)&&position.coords.heading>=0&&position.coords.heading<360?position.coords.heading:null,speed:Number.isFinite(position.coords.speed)&&position.coords.speed>=0?position.coords.speed:null};if(!validPosition(fix)||!Number.isFinite(fix.accuracy)||fix.accuracy<0){onError({code:'invalid',message:'Получены некорректные координаты. Подождите следующего измерения.'});return;}if(!Number.isFinite(fix.timestamp)||now()-fix.timestamp>20000||fix.timestamp>now()+5000){onError({code:'stale',message:'Получено устаревшее местоположение. Ожидаем новое измерение.'});return;}onFix(fix);},error=>{if(run!==generation)return;const messages={1:'Доступ к местоположению запрещён. Разрешите его в настройках этого сайта и попробуйте снова.',2:'Местоположение недоступно. Выйдите на открытое место и включите определение геопозиции.',3:'GPS отвечает медленно. Попробуйте ещё раз.'};if(error.code===1)stop();onError({code:error.code,message:messages[error.code]||'Не удалось определить местоположение.'});},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});return true;
  }
  return {start,stop,get active(){return watch!==null;}};
 }
 const api={RADIUS,validPosition,meters,nearby,reliable,bearing,resolveHeading,NarrationQueue,locationController};if(typeof module==='object'&&module.exports)module.exports=api;else root.RyadomGeo=api;
})(typeof globalThis!=='undefined'?globalThis:this);
