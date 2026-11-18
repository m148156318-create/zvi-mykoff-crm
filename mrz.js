/* קריאת דרכון מתמונה: מוצאים את שתי שורות ה-MRZ בתחתית עמוד הפרטים, ומפענחים לפי תקן ICAO 9303 (TD3). */
(function(root){
var W=[7,3,1];
var TESS_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function pad2(n){return (n<10?'0':'')+n}
function val(ch){
  if(ch==='<')return 0;
  if(ch>='0'&&ch<='9')return ch.charCodeAt(0)-48;
  if(ch>='A'&&ch<='Z')return ch.charCodeAt(0)-55;
  return 0;
}
function check(s,c){var t=0;for(var i=0;i<s.length;i++)t+=val(s[i])*W[i%3];return String(t%10)===c}
function numfix(s){return s.replace(/[OQD]/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/B/g,'8')}
function alphafix(s){return s.replace(/0/g,'O').replace(/1/g,'I').replace(/5/g,'S').replace(/8/g,'B').replace(/2/g,'Z')}
function toDate(s,kind){
  if(!/^\d{6}$/.test(s))return '';
  var yy=+s.slice(0,2),mm=+s.slice(2,4),dd=+s.slice(4,6);
  if(mm<1||mm>12||dd<1||dd>31)return '';
  var cur=new Date().getFullYear()%100;
  var yyyy=kind==='dob'?(yy>cur?1900+yy:2000+yy):2000+yy;
  return yyyy+'-'+pad2(mm)+'-'+pad2(dd);
}

function findLines(text){
  var ls=String(text||'').split(/\r?\n/).map(function(l){return l.replace(/[^A-Za-z0-9<]/g,'').toUpperCase()}).filter(function(l){return l.length>=36});
  for(var i=0;i+1<ls.length;i++){
    if(/^P/.test(ls[i])&&ls[i].indexOf('<')>=0&&ls[i+1].length>=40)return [ls[i],ls[i+1]];
  }
  if(ls.length>=2)return ls.slice(-2);
  return null;
}

function parseLines(a,b){
  var l1=a.slice(0,44);while(l1.length<44)l1+='<';
  /* filler at the end of the name line is sometimes read as K/L */
  l1=l1.slice(0,5)+l1.slice(5).replace(/[<KL]{5,}$/,function(m){return m.replace(/[KL]/g,'<')});
  var l2=b.slice(0,44);while(l2.length<44)l2+='<';
  var pnRaw=l2.slice(0,9),pnc=numfix(l2.charAt(9));
  var nat=alphafix(l2.slice(10,13)).replace(/</g,'');
  var dobS=numfix(l2.slice(13,19)),dobc=numfix(l2.charAt(19));
  var expS=numfix(l2.slice(21,27)),expc=numfix(l2.charAt(27));
  var okPn=check(pnRaw,pnc),okDob=check(dobS,dobc),okExp=check(expS,expc);
  var parts=alphafix(l1.slice(5)).split('<<');
  var sur=(parts[0]||'').replace(/</g,' ').trim();
  var giv=(parts.slice(1).join(' ')||'').replace(/</g,' ').replace(/\s+/g,' ').trim();
  var score=(okPn?1:0)+(okDob?1:0)+(okExp?1:0);
  return {
    name:(giv+' '+sur).trim(),
    surname:sur,
    given:giv,
    sex:l2.charAt(20),
    personal:numfix(l2.slice(28,42)).replace(/[^0-9]/g,''),
    passportNo:pnRaw.replace(/</g,''),
    nationality:nat,
    dob:toDate(dobS,'dob'),
    passportExpiry:toDate(expS,'exp'),
    score:score,
    valid:score===3
  };
}

function parse(text){
  var ls=findLines(text);
  if(!ls)return null;
  var r=parseLines(ls[0],ls[1]);
  if(!r.passportNo&&!r.dob&&!r.passportExpiry)return null;
  return r;
}

/* ---- הקריאה מתמונה (דורשת דפדפן ו-tesseract.js) ---- */
var worker=null,progressCb=null,tessPromise=null;

var tessLocal=false;
function absUrl(p){try{return new URL(p,document.baseURI).href}catch(e){return p}}
function addScript(src){
  return new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src=src;
    s.onload=function(){res()};
    s.onerror=function(){rej(new Error('tesseract-load'))};
    document.head.appendChild(s);
  });
}
/* קודם הקובץ שארוז באפליקציה (עובד בלי אינטרנט), ואם אין, מהרשת */
function loadTess(){
  if(root.Tesseract)return Promise.resolve();
  if(tessPromise)return tessPromise;
  /* קודם מהרשת (הדרך הרגילה), ואם אין אינטרנט, הקובץ שארוז באפליקציה */
  tessPromise=addScript(TESS_SRC).catch(function(){return addScript('vendor/tesseract.min.js').then(function(){tessLocal=true})}).catch(function(e){tessPromise=null;throw e});
  return tessPromise;
}
function withTimeout(p,ms,label){
  return new Promise(function(res,rej){
    var t=setTimeout(function(){rej(new Error('timeout:'+label))},ms);
    p.then(function(v){clearTimeout(t);res(v)},function(e){clearTimeout(t);rej(e)});
  });
}
var attemptLabel='';
function getWorker(){
  if(worker)return Promise.resolve(worker);
  var say=function(t,p){if(progressCb)progressCb(p==null?null:p,t)};
  say('טוען את רכיב הקריאה');
  return withTimeout(loadTess(),60000,'load').then(function(){
    var logger=function(m){
      if(!progressCb||!m)return;
      var st=String(m.status||'');
      if(st==='recognizing text')progressCb(m.progress||0,attemptLabel||'קורא את התמונה');
      else if(/language/i.test(st))progressCb(m.progress||0,'טוען נתוני שפה');
      else if(st)progressCb(m.progress||0,'טוען את רכיב הקריאה');
    };
    var remote=function(){
      say('טוען את רכיב הקריאה מהאינטרנט');
      return withTimeout(root.Tesseract.createWorker('eng',1,{logger:logger}),90000,'remote');
    };
    if(!tessLocal)return remote();
    return withTimeout(root.Tesseract.createWorker('eng',1,{workerPath:absUrl('vendor/worker.min.js'),corePath:absUrl('vendor/'),langPath:absUrl('vendor/lang'),logger:logger}),25000,'local').catch(remote);
  }).then(function(w){
    return w.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',tessedit_pageseg_mode:'6'}).then(function(){worker=w;return w});
  });
}
function toCanvas(file){
  var p;
  if(root.createImageBitmap){p=root.createImageBitmap(file)}
  else p=new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im)};im.onerror=rej;im.src=URL.createObjectURL(file)});
  return p.then(function(bmp){
    var c=document.createElement('canvas');
    c.width=bmp.width||bmp.naturalWidth;c.height=bmp.height||bmp.naturalHeight;
    c.getContext('2d').drawImage(bmp,0,0);
    return c;
  });
}
function rotate(src,deg){
  var c=document.createElement('canvas');c.width=src.height;c.height=src.width;
  var x=c.getContext('2d');
  if(deg===90){x.translate(c.width,0);x.rotate(Math.PI/2)}else{x.translate(0,c.height);x.rotate(-Math.PI/2)}
  x.drawImage(src,0,0);
  return c;
}
function crop(src,from){
  var sy=Math.floor(src.height*from),sh=src.height-sy;
  var scale=Math.max(1,Math.min(2,1600/src.width));
  if(src.width>2400)scale=2400/src.width;
  var c=document.createElement('canvas');
  c.width=Math.round(src.width*scale);c.height=Math.max(1,Math.round(sh*scale));
  var x=c.getContext('2d');
  x.filter='grayscale(1) contrast(1.4)';
  x.drawImage(src,0,sy,src.width,sh,0,0,c.width,c.height);
  return c;
}
function scan(file,onProgress){
  progressCb=onProgress||null;
  var best=null;
  return Promise.all([getWorker(),toCanvas(file)]).then(function(r){
    var w=r[0],src=r[1];
    var views=[src,null,null];
    var tries=[];
    [0,1,2].forEach(function(v){[0.6,0.4,0].forEach(function(f){tries.push([v,f])})});
    var i=0;
    function next(){
      if(i>=tries.length)return best;
      var t=tries[i++],v=t[0];attemptLabel='קורא את התמונה (ניסיון '+i+' מתוך '+tries.length+')';if(progressCb)progressCb(0,attemptLabel);
      if(!views[v])views[v]=rotate(src,v===1?90:270);
      return w.recognize(crop(views[v],t[1])).then(function(res){
        var p=parse(res.data&&res.data.text);
        if(p&&(!best||p.score>best.score))best=p;
        if(best&&best.valid)return best;
        if(t[1]===0&&best&&best.score>=2)return best;
        return next();
      });
    }
    return next();
  });
}

var api={parse:parse,check:check,scan:scan};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MRZ=api;
})(typeof window!=='undefined'?window:globalThis);
