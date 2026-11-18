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

var DG='[0-9OQDUIL|ZSBGT]';
var RE2=new RegExp('([A-Z0-9<]{9})('+DG+')([A-Z<0-9]{3})('+DG+'{6})('+DG+')([MFK<XH])('+DG+'{6})('+DG+')([A-Z0-9<]{0,16})');
function clean(l){return String(l||'').toUpperCase().replace(/[«‹(\[{]/g,'<').replace(/\s+/g,'').replace(/[^A-Z0-9<]/g,'')}
function numfix2(s){return s.replace(/[OQDU]/g,'0').replace(/[IL|T]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/B/g,'8').replace(/G/g,'6')}
/* מוצאים את שורה 2 לפי המבנה שלה (דרכון, ספרת ביקורת, לאום, תאריך לידה, מין, תוקף), גם כשה-OCR מוסיף או משמיט תווים */
function findLines(text){
  var raw=String(text||'').split(/\r?\n/),ls=raw.map(clean).filter(function(l){return l.length>=20});
  var best=null;
  for(var i=0;i<ls.length;i++){
    var m=RE2.exec(ls[i]);if(!m)continue;
    var tail=(m[9]||'');while(tail.length<16)tail+='<';
    var l2=m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]+tail.slice(0,16);
    var l1='';
    for(var j=i-1;j>=Math.max(0,i-3);j--){var c=ls[j];var k=c.search(/P[A-Z<][A-Z<]{3}/);if(k>=0&&c.indexOf('<')>=0){l1=c.slice(k);break}}
    if(!l1&&i>0)l1=ls[i-1];
    var cand={l1:l1,l2:l2};
    var sc=(check(m[1],numfix2(m[2]))?1:0)+(check(numfix2(m[4]),numfix2(m[5]))?1:0)+(check(numfix2(m[7]),numfix2(m[8]))?1:0)+(l1?1:0);
    if(!best||sc>best.sc){best=cand;best.sc=sc}
  }
  if(best)return [best.l1,best.l2];
  var old=ls.filter(function(l){return l.length>=36});
  for(var x=0;x+1<old.length;x++)if(/^P/.test(old[x])&&old[x].indexOf('<')>=0&&old[x+1].length>=40)return [old[x],old[x+1]];
  return null;
}
/* מספר דרכון: אם ספרת הביקורת לא מסתדרת, מנסים להחליף אותיות/ספרות שנראות דומות (O↔0, I↔1, B↔8, S↔5, Z↔2, G↔6) */
var SWAP={'0':'OD','O':'0','D':'0','Q':'0','1':'I','I':'1','L':'1','8':'B','B':'8','5':'S','S':'5','2':'Z','Z':'2','6':'G','G':'6'};
function fixAlnum(s,c){
  if(check(s,c))return s;
  var all=numfix2(s);if(/^\d+<*$/.test(all)&&check(all,c))return all;
  var pos=[];for(var i=0;i<s.length;i++)if(SWAP[s[i]])pos.push(i);
  if(pos.length>10)pos=pos.slice(0,10);
  var n=1<<pos.length;
  for(var mask=1;mask<n;mask++){
    var a=s.split('');
    for(var b=0;b<pos.length;b++)if(mask&(1<<b))a[pos[b]]=SWAP[s[pos[b]]][0];
    var t=a.join('');if(check(t,c))return t;
  }
  return null;
}
function nameClean(s){
  /* בשורת השם יש רק אותיות ו-<. ספרות שנקראו בטעות הופכות לאותיות, ורצף K/L/C/E בסוף הוא בעצם <<< */
  s=alphafix(s).replace(/6/g,'G').replace(/4/g,'A').replace(/7/g,'T').replace(/3/g,'E').replace(/9/g,'P');
  s=s.replace(/(<[<KLCE]{2,}|[KLCE]{5,})$/,function(m){return m.replace(/[^<]/g,'<')});
  return s;
}
function parseLines(a,b){
  var l1=(a||'').slice(0,44);while(l1.length<44)l1+='<';
  var l2=b.slice(0,44);while(l2.length<44)l2+='<';
  var pnc=numfix2(l2.charAt(9));
  var pnFixed=fixAlnum(l2.slice(0,9),pnc);
  var pnRaw=pnFixed||l2.slice(0,9);
  var nat=alphafix(l2.slice(10,13)).replace(/</g,'');
  var dobS=numfix2(l2.slice(13,19)),dobc=numfix2(l2.charAt(19));
  var sex=l2.charAt(20);if(sex==='K'||sex==='X'||sex==='H')sex='<';
  var expS=numfix2(l2.slice(21,27)),expc=numfix2(l2.charAt(27));
  var persRaw=l2.slice(28,42),persC=numfix2(l2.charAt(42));
  var pers=persRaw.replace(/[^<]/g,function(ch){return /[A-Z]/.test(ch)?numfix2(ch):ch});
  var okPn=!!pnFixed,okDob=check(dobS,dobc),okExp=check(expS,expc);
  var comp=pnRaw+pnc+dobS+dobc+expS+expc+pers+persC;
  var okComp=check(comp,numfix2(l2.charAt(43)));
  var nm=nameClean(l1.slice(5));
  var parts=nm.split('<<');
  var sur=(parts[0]||'').replace(/</g,' ').replace(/[^A-Z ]/g,'').trim();
  var giv=(parts.slice(1).join(' ')||'').replace(/</g,' ').replace(/[^A-Z ]/g,'').replace(/\s+/g,' ').trim();
  var score=(okPn?1:0)+(okDob?1:0)+(okExp?1:0);
  var dob=toDate(dobS,'dob'),exp=toDate(expS,'exp');
  return {
    name:(giv+' '+sur).trim(),surname:sur,given:giv,sex:sex,
    personal:pers.replace(/[^0-9]/g,''),
    passportNo:pnRaw.replace(/</g,''),
    nationality:nat,
    dob:okDob||!dob?dob:dob,
    passportExpiry:exp,
    score:score+(okComp?1:0),
    valid:score===3,
    composite:okComp
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
var workers={},workerP={},failed={};
function logger(m){
  if(!progressCb||!m)return;
  var st=String(m.status||'');
  if(st==='recognizing text')progressCb(m.progress||0,attemptLabel||'קורא את התמונה');
  else if(/language/i.test(st))progressCb(m.progress||0,'טוען נתוני שפה');
  else if(st)progressCb(m.progress||0,'טוען את רכיב הקריאה');
}
/* שלושה "מנועים": ocrb – מאומן במיוחד על הגופן של שורות הדרכון; eng – גיבוי; heb+eng – לקריאת השם בעברית ותאריך ההנפקה */
function getWorker(kind){
  kind=kind||'ocrb';
  if(failed[kind]&&kind==='ocrb')kind='eng';
  if(workers[kind])return Promise.resolve(workers[kind]);
  if(workerP[kind])return workerP[kind];
  var say=function(t){if(progressCb)progressCb(null,t)};
  say(kind==='full'?'טוען קריאת עברית':'טוען את רכיב הקריאה');
  workerP[kind]=withTimeout(loadTess(),60000,'load').then(function(){
    var T=root.Tesseract;
    if(kind==='ocrb')return withTimeout(T.createWorker('ocrb',1,{langPath:absUrl('vendor/lang'),gzip:false,logger:logger}),90000,'ocrb');
    if(kind==='eng')return withTimeout(T.createWorker('eng',1,{logger:logger}),90000,'eng');
    return withTimeout(T.createWorker(['heb','eng'],1,{logger:logger}),120000,'full');
  }).then(function(w){
    if(kind==='full')return w.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'}).then(function(){return w});
    return w.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',tessedit_pageseg_mode:'6'}).then(function(){return w});
  }).then(function(w){workers[kind]=w;workerP[kind]=null;return w},function(e){workerP[kind]=null;failed[kind]=1;throw e});
  return workerP[kind];
}
function toCanvas(file){
  var p;
  if(root.createImageBitmap){p=root.createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return root.createImageBitmap(file)})}
  else p=new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im)};im.onerror=rej;im.src=URL.createObjectURL(file)});
  return p.then(function(bmp){
    var w=bmp.width||bmp.naturalWidth,h=bmp.height||bmp.naturalHeight,k=Math.min(1,3000/Math.max(w,h));
    var c=document.createElement('canvas');
    c.width=Math.round(w*k);c.height=Math.round(h*k);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    return c;
  });
}
function rotate(src,deg){
  var c=document.createElement('canvas');
  if(deg===180){c.width=src.width;c.height=src.height}else{c.width=src.height;c.height=src.width}
  var x=c.getContext('2d');
  if(deg===90){x.translate(c.width,0);x.rotate(Math.PI/2)}
  else if(deg===180){x.translate(c.width,c.height);x.rotate(Math.PI)}
  else{x.translate(0,c.height);x.rotate(-Math.PI/2)}
  x.drawImage(src,0,0);
  return c;
}
/* שחור-לבן לפי סף אוטומטי (Otsu) – עוזר בתמונות עם צל, השתקפות או רקע צבעוני */
function binarize(c){
  var x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height),p=d.data,h=new Array(256).fill(0),n=p.length/4,i;
  for(i=0;i<p.length;i+=4){var g=(p[i]*299+p[i+1]*587+p[i+2]*114)/1000|0;p[i]=g;h[g]++}
  var sum=0;for(i=0;i<256;i++)sum+=i*h[i];
  var sB=0,wB=0,max=0,th=128;
  for(i=0;i<256;i++){wB+=h[i];if(!wB)continue;var wF=n-wB;if(!wF)break;sB+=i*h[i];var mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>max){max=v;th=i}}
  for(i=0;i<p.length;i+=4){var o=p[i]>th?255:0;p[i]=p[i+1]=p[i+2]=o}
  x.putImageData(d,0,0);return c;
}
/* מוצאים את פס ה-MRZ: שתי שורות צפופות ורחבות של תווים בחלק התחתון של העמוד */
function findBand(src){
  var W=600,k=W/src.width,H=Math.max(1,Math.round(src.height*k));
  var c=document.createElement('canvas');c.width=W;c.height=H;
  var x=c.getContext('2d');x.drawImage(src,0,0,W,H);
  var d=x.getImageData(0,0,W,H).data,row=new Float32Array(H);
  for(var y=1;y<H;y++){var cnt=0;for(var xx=1;xx<W;xx++){var i=(y*W+xx)*4,j=i-4;var g=d[i]+d[i+1]+d[i+2],g2=d[j]+d[j+1]+d[j+2];if(Math.abs(g-g2)>120)cnt++}row[y]=cnt/W}
  var start=Math.floor(H*0.45),best=null,run=null;
  for(var y2=start;y2<H;y2++){
    if(row[y2]>0.06){if(!run)run={a:y2,b:y2,s:0};run.b=y2;run.s+=row[y2]}
    else if(run){if(y2-run.b>Math.max(3,H*0.012)){if(!best||run.s>best.s)best=run;run=null}}
  }
  if(run&&(!best||run.s>best.s))best=run;
  if(!best||best.b-best.a<H*0.03)return null;
  var pad=(best.b-best.a)*0.35;
  return {from:Math.max(0,(best.a-pad)/H),to:Math.min(1,(best.b+pad)/H)};
}
function crop(src,from,to,bin){
  to=to==null?1:to;
  var sy=Math.floor(src.height*from),sh=Math.max(1,Math.floor(src.height*to)-sy);
  var scale=Math.max(1,Math.min(2.5,1800/src.width));
  if(src.width*scale>2600)scale=2600/src.width;
  var c=document.createElement('canvas');
  c.width=Math.round(src.width*scale);c.height=Math.max(1,Math.round(sh*scale));
  var x=c.getContext('2d');
  x.filter='grayscale(1) contrast(1.5)';
  x.drawImage(src,0,sy,src.width,sh,0,0,c.width,c.height);
  return bin?binarize(c):c;
}
/* ---- האזור הקריא (VIZ): שם בעברית, שם מלא באנגלית ותאריך הנפקה ---- */
var MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
var HMON={'ינו':1,'פבר':2,'מרץ':3,'מרס':3,'אפר':4,'מאי':5,'יונ':6,'יול':7,'אוג':8,'ספט':9,'אוק':10,'נוב':11,'דצמ':12};
function isoOf(y,m,d){if(y<100)y+=y>40?1900:2000;if(m<1||m>12||d<1||d>31)return '';return y+'-'+pad2(m)+'-'+pad2(d)}
function findDates(t){
  var out=[],m,re1=/(\d{1,2})[\s.\-\/]*([A-Z]{3})[A-Z]*[\s.\-\/]*(\d{2,4})/g,re2=/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/g,re3=/(\d{1,2})\s*([א-ת]{3})[א-ת]*\s*(\d{2,4})/g;
  var T=t.toUpperCase();
  while((m=re1.exec(T)))if(MON[m[2]])out.push(isoOf(+m[3],MON[m[2]],+m[1]));
  while((m=re2.exec(t)))out.push(isoOf(+m[3],+m[2],+m[1]));
  while((m=re3.exec(t)))if(HMON[m[2]])out.push(isoOf(+m[3],HMON[m[2]],+m[1]));
  return out.filter(Boolean);
}
var HEB_STOP=/^(שם|משפחה|פרטי|פרטיים|מין|לאום|ישראלי|ישראלית|תאריך|לידה|הנפקה|תוקף|פקיעה|מקום|דרכון|מדינת|ישראל|סוג|קוד|מספר|זהות|רשות|סמל|מנפיקה|ז|נ|עד|ת|ע)$/;
function hebWords(line){return (line.match(/[א-ת'"״׳\-]{2,}/g)||[]).map(function(w){return w.replace(/^['"״׳\-]+|['"״׳\-]+$/g,'')}).filter(function(w){return w.length>=2&&!HEB_STOP.test(w)})}
function readViz(text,mrz){
  var lines=String(text||'').split(/\r?\n/).map(function(l){return l.trim()}).filter(Boolean),r={};
  var U=function(l){return l.toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim()};
  var findLineWith=function(word){if(!word)return -1;var w=word.split(' ')[0];if(w.length<2)return -1;for(var i=0;i<lines.length;i++){if((' '+U(lines[i])+' ').indexOf(' '+w+' ')>=0&&!/<</.test(lines[i]))return i}return -1};
  var hebNear=function(i,labelRe){
    if(i<0)return '';
    var h=hebWords(lines[i]);if(h.length)return h.join(' ');
    for(var j=i-1;j>=Math.max(0,i-2);j--){if(labelRe.test(lines[j]))continue;h=hebWords(lines[j]);if(h.length)return h.join(' ')}
    for(j=i+1;j<=Math.min(lines.length-1,i+1);j++){h=hebWords(lines[j]);if(h.length)return h.join(' ')}
    return '';
  };
  var iS=findLineWith(mrz.surname),iG=findLineWith(mrz.given);
  r.surHe=hebNear(iS,/משפחה/);r.givHe=hebNear(iG,/פרטי/);
  if(r.surHe&&r.givHe&&r.surHe===r.givHe)r.givHe='';
  /* שם מלא באנגלית: ב-MRZ שמות ארוכים נחתכים, באזור הקריא הם מלאים */
  if(iG>=0){var g=U(lines[iG]).split(' ').filter(function(w){return w.length>1});var k=g.indexOf((mrz.given||'').split(' ')[0]);if(k>=0){var full=g.slice(k).join(' ');if(full.length>(mrz.given||'').length&&full.indexOf(mrz.given)===0&&full.length<=40)r.givenFull=full}}
  if(iS>=0){var s2=U(lines[iS]).split(' ').filter(function(w){return w.length>1});var k2=s2.indexOf((mrz.surname||'').split(' ')[0]);if(k2>=0){var fs=s2.slice(k2).join(' ');if(fs.length>(mrz.surname||'').length&&fs.indexOf(mrz.surname)===0&&fs.length<=40&&fs.indexOf((mrz.given||'#').split(' ')[0])<0)r.surnameFull=fs}}
  r.nameHe=[r.givHe,r.surHe].filter(Boolean).join(' ');
  /* תאריך הנפקה: התאריך שאינו הלידה ואינו התוקף, לפני התוקף ואחרי הלידה */
  var ds=findDates(text).filter(function(d){return d!==mrz.dob&&d!==mrz.passportExpiry&&(!mrz.dob||d>mrz.dob)&&(!mrz.passportExpiry||d<mrz.passportExpiry)});
  if(ds.length&&mrz.passportExpiry){
    var ey=+mrz.passportExpiry.slice(0,4),md=mrz.passportExpiry.slice(4);
    ds.sort(function(a,b){var sa=Math.min(Math.abs(+a.slice(0,4)-(ey-10)),Math.abs(+a.slice(0,4)-(ey-5)))+(a.slice(4)===md?0:.5),sb=Math.min(Math.abs(+b.slice(0,4)-(ey-10)),Math.abs(+b.slice(0,4)-(ey-5)))+(b.slice(4)===md?0:.5);return sa-sb});
    r.issue=ds[0];
  }else if(ds.length)r.issue=ds[0];
  /* מספר זהות ישראלי שמודפס בעמוד (אם לא היה ב-MRZ) */
  var ids=(text.match(/\b\d{8,9}\b/g)||[]);r.idCandidates=ids;
  return r;
}

function scan(file,onProgress,opts){
  opts=opts||{};
  progressCb=onProgress||null;
  var best=null,bestView=null;
  return Promise.all([getWorker('ocrb').catch(function(){return null}),toCanvas(file)]).then(function(r){
    var src=r[1];
    var views={0:src};
    var band=findBand(src);
    var tries=[];
    if(band)tries.push(['ocrb',0,band.from,band.to,false],['ocrb',0,band.from,band.to,true],['eng',0,band.from,band.to,false]);
    tries.push(['ocrb',0,0.55,1,false],['eng',0,0.55,1,true],['ocrb',0,0.35,1,true],['eng',0,0,1,false]);
    [90,270,180].forEach(function(v){tries.push(['ocrb',v,0.5,1,false],['eng',v,0.5,1,true],['eng',v,0,1,false])});
    var i=0;
    function next(){
      if(i>=tries.length)return best;
      var t=tries[i++],v=t[1];attemptLabel='קורא את שורות הדרכון (ניסיון '+i+')';if(progressCb)progressCb(0,attemptLabel);
      if(!views[v])views[v]=rotate(src,v);
      return getWorker(t[0]).then(function(w){return w.recognize(crop(views[v],t[2],t[3],t[4]))}).then(function(res){
        var p=parse(res.data&&res.data.text);
        if(p&&(!best||p.score>best.score)){best=p;bestView=v}
        if(best&&best.valid&&best.composite)return best;
        if(best&&best.valid&&i>=3)return best;
        return next();
      },function(){return next()});
    }
    return Promise.resolve(next()).then(function(m){
      if(!m||opts.noViz)return m;
      /* קריאה שנייה של כל העמוד בעברית ואנגלית */
      attemptLabel='קורא את השם בעברית';if(progressCb)progressCb(0,attemptLabel);
      var view=views[bestView||0],k=Math.min(1,1800/view.width),c=document.createElement('canvas');
      c.width=Math.round(view.width*k);c.height=Math.round(view.height*k);
      var x=c.getContext('2d');x.filter='grayscale(1) contrast(1.3)';x.drawImage(view,0,0,c.width,c.height);
      return getWorker('full').then(function(w){return withTimeout(w.recognize(c),90000,'viz')}).then(function(res){
        var v=readViz(res.data&&res.data.text,m);
        m.nameHe=v.nameHe||'';m.surHe=v.surHe||'';m.givHe=v.givHe||'';m.issue=v.issue||'';
        if(v.givenFull)m.given=v.givenFull;if(v.surnameFull)m.surname=v.surnameFull;
        if(!m.personal&&m.nationality==='ISR')m.idCandidates=v.idCandidates;
        return m;
      },function(){return m});
    });
  });
}

var api={parse:parse,check:check,scan:scan,readViz:readViz,findDates:findDates};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MRZ=api;
})(typeof window!=='undefined'?window:globalThis);
