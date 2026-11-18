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
    for(var pad=0;pad<=10;pad++){
      /* כשתחילת השורה חתוכה בצילום (אצבע, קצה התמונה) – משלימים משמאל ומזהים לפי המבנה */
      var line=(pad?new Array(pad+1).join('<'):'')+ls[i];
      var m=RE2.exec(line);if(!m)continue;
      if(pad&&m.index>0)continue;
      var tail=(m[9]||'');while(tail.length<16)tail+='<';
      var l2=m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]+tail.slice(0,16);
      var l1='';
      for(var j=i-1;j>=Math.max(0,i-3);j--){if(ls[j].indexOf('<<')>=0||/P[A-Z<][A-Z<]{3}/.test(ls[j])){l1=ls[j];break}}
      if(!l1&&i>0)l1=ls[i-1];
      var okD=check(numfix2(m[4]),numfix2(m[5])),okE=check(numfix2(m[7]),numfix2(m[8]));
      var sc=(check(m[1],numfix2(m[2]))?1.2:0)+(okD?1:0)+(okE?1:0)+(l1?0.5:0)-pad*0.01;
      if(!best||sc>best.sc)best={l1:l1,l2:l2,sc:sc,pad:pad};
      if(okD&&okE)break;
    }
  }
  if(best)return [best.l1,best.l2,best.pad];
  var old=ls.filter(function(l){return l.length>=36});
  for(var x=0;x+1<old.length;x++)if(/^P/.test(old[x])&&old[x].indexOf('<')>=0&&old[x+1].length>=40)return [old[x],old[x+1],0];
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
function nameStart(l1,nat){
  /* שורת השם מתחילה ב-P<ISR. אם תחילתה חתוכה או נקראה לא נכון, מוצאים איפה מתחיל השם */
  var t=l1.replace(/^[^A-Z<]+/,'');
  if(/^P[A-Z<][A-Z<]{3}/.test(t)&&(!nat||t.slice(2,5).replace(/</g,'')===nat||t.charAt(0)==='P'))return t.slice(5);
  var pre='P<'+(nat||'').padEnd(3,'<');
  var k=t.indexOf(nat&&nat.length===3?nat:'@@@');if(k>=0&&k<=4)return t.slice(k+3);
  for(var n=Math.min(4,pre.length);n>=1;n--){if(t.indexOf(pre.slice(pre.length-n))===0)return t.slice(n)}
  return t.length>=42?t.slice(5):t;
}
function parseLines(a,b,pad){
  var l2=b.slice(0,44);while(l2.length<44)l2+='<';
  var pnc=numfix2(l2.charAt(9));
  var pnFixed=fixAlnum(l2.slice(0,9),pnc);
  var pnRaw=pnFixed||l2.slice(0,9);
  var nat=alphafix(l2.slice(10,13)).replace(/</g,'');
  if(nat==='1SR'||nat==='ISA'||nat==='IS'||nat==='SR')nat='ISR';
  var dobS=numfix2(l2.slice(13,19)),dobc=numfix2(l2.charAt(19));
  var sex=l2.charAt(20);if(sex==='K'||sex==='X'||sex==='H')sex='<';
  var expS=numfix2(l2.slice(21,27)),expc=numfix2(l2.charAt(27));
  var persRaw=l2.slice(28,42),persC=numfix2(l2.charAt(42));
  var pers=persRaw.replace(/[^<]/g,function(ch){return /[A-Z]/.test(ch)?numfix2(ch):ch});
  var okPn=!!pnFixed&&!(pad>0&&/^</.test(pnRaw)&&pnRaw.replace(/</g,'').length<7),okDob=check(dobS,dobc),okExp=check(expS,expc);
  var comp=pnRaw+pnc+dobS+dobc+expS+expc+pers+persC;
  var okComp=check(comp,numfix2(l2.charAt(43)));
  var nm=nameClean(nameStart(a||'',nat)).replace(/^([^<]*<<[^<]*(?:<[^<]+)*?)<{3,}.*$/,'$1');
  var parts=nm.split('<<');
  var sur=(parts[0]||'').replace(/</g,' ').replace(/[^A-Z ]/g,'').trim();
  var giv=(parts.slice(1).join(' ')||'').replace(/</g,' ').replace(/[^A-Z ]/g,'').replace(/\s+/g,' ').trim();
  var score=(okPn?1:0)+(okDob?1:0)+(okExp?1:0);
  return {
    name:(giv+' '+sur).trim(),surname:sur,given:giv,sex:sex,
    personal:pers.replace(/[^0-9]/g,''),
    passportNo:okPn?pnRaw.replace(/</g,''):'',
    pnPartial:pnRaw.replace(/</g,''),pnCheck:pnc,
    nationality:nat,
    dob:toDate(dobS,'dob'),
    passportExpiry:toDate(expS,'exp'),
    okDob:okDob,okExp:okExp,okPn:okPn,
    score:score+(okComp?1:0)+(sur?0.5:0),
    valid:score===3,
    composite:okComp
  };
}
function parse(text){
  var ls=findLines(text);
  if(!ls)return null;
  var r=parseLines(ls[0],ls[1],ls[2]);
  if(!r.pnPartial&&!r.dob&&!r.passportExpiry)return null;
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
var HEB_STOP=/^(שם|משפחה|פרטי|פרטיים|מין|לאום|ישראלי|ישראלית|אזרחות|תאריך|לידה|הנפקה|הוצאה|תוקף|פקיעה|פקיעת|מקום|מקזם|דרכון|דרכונים|מדינת|ישראל|ישרא|סוג|קוד|מספר|מס|זהות|זהוח|רשות|סמל|סמכות|ממונה|מנפיקה|המדינה|חתימת|בעל|ז|נ|עד|ת|ע)$/;
/* שמות פרטיים נפוצים: תעתיק אנגלית ← עברית (כשהשם מופיע כאן, לא צריך לנחש מהתמונה) */
var HE_NAMES={"AVRAHAM":"אברהם","ABRAHAM":"אברהם","AVRAM":"אברהם","YITZCHAK":"יצחק","YITZHAK":"יצחק","ITZHAK":"יצחק","YITSHAK":"יצחק","ISAAC":"יצחק","ITZIK":"יצחק","YAAKOV":"יעקב","YAAKOB":"יעקב","YAKOV":"יעקב","JACOB":"יעקב","YAACOV":"יעקב","YACOV":"יעקב","MOSHE":"משה","MOSHEH":"משה","MOSES":"משה","AHARON":"אהרן","AARON":"אהרן","AHRON":"אהרן","DAVID":"דוד","DAVIDE":"דוד","SHLOMO":"שלמה","SHELOMO":"שלמה","SOLOMON":"שלמה","YOSEF":"יוסף","YOSSEF":"יוסף","JOSEPH":"יוסף","YOSEPH":"יוסף","YOSSI":"יוסי","YOSI":"יוסי","SHIMON":"שמעון","SHIMEON":"שמעון","SIMON":"שמעון","SHIMSHON":"שמעון","REUVEN":"ראובן","RUBEN":"ראובן","REUBEN":"ראובן","LEVI":"לוי","YEHUDA":"יהודה","YEHUDAH":"יהודה","JUDAH":"יהודה","YISSACHAR":"יששכר","YISACHAR":"יששכר","ISSACHAR":"יששכר","ZEVULUN":"זבולון","ZVULUN":"זבולון","DAN":"דן","NAFTALI":"נפתלי","NAPHTALI":"נפתלי","GAD":"גד","ASHER":"אשר","BINYAMIN":"בנימין","BENJAMIN":"בנימין","BINIAMIN":"בנימין","MENACHEM":"מנחם","MENAHEM":"מנחם","MENASHE":"מנשה","MENASHEH":"מנשה","EFRAIM":"אפרים","EPHRAIM":"אפרים","EPHRAYIM":"אפרים","NACHMAN":"נחמן","NAHMAN":"נחמן","NATAN":"נתן","NATHAN":"נתן","NETANEL":"נתנאל","NATANEL":"נתנאל","NETHANEL":"נתנאל","ELIYAHU":"אליהו","ELIAHU":"אליהו","ELIJAHU":"אליהו","ELI":"אלי","ELIE":"אלי","ELIEZER":"אליעזר","ELAZAR":"אלעזר","ELEAZAR":"אלעזר","ELCHANAN":"אלחנן","ELHANAN":"אלחנן","ELIMELECH":"אלימלך","ELIMELEKH":"אלימלך","EITAN":"איתן","ETAN":"איתן","EYTAN":"איתן","ARIEL":"אריאל","ARYE":"אריה","ARYEH":"אריה","ARIE":"אריה","ARIEH":"אריה","AVI":"אבי","AVIAD":"אביעד","AVINOAM":"אבינועם","AVNER":"אבנר","AVISHAI":"אבישי","AMIT":"עמית","AMIR":"אמיר","AMOS":"עמוס","ADIEL":"עדיאל","ODED":"עודד","OREN":"אורן","OR":"אור","OFIR":"אופיר","OPHIR":"אופיר","OMER":"עומר","OZ":"עוז","BARUCH":"ברוך","BORUCH":"ברוך","BEZALEL":"בצלאל","BETZALEL":"בצלאל","BEZALEEL":"בצלאל","BOAZ":"בועז","GIDON":"גדעון","GIDEON":"גדעון","GILAD":"גלעד","DANIEL":"דניאל","DOV":"דב","DOVID":"דוד","HILLEL":"הלל","HILEL":"הלל","HERSHEL":"הרשל","HERSHL":"הרשל","ZEEV":"זאב","ZEV":"זאב","ZALMAN":"זלמן","ZECHARIA":"זכריה","ZECHARYA":"זכריה","ZECHARIAH":"זכריה","ZACHARIA":"זכריה","CHAIM":"חיים","HAIM":"חיים","HAYIM":"חיים","CHAYIM":"חיים","CHANANYA":"חנניה","HANANYA":"חנניה","CHANOCH":"חנוך","HANOCH":"חנוך","TUVIA":"טוביה","TUVYA":"טוביה","TOVIA":"טוביה","YAIR":"יאיר","YAEER":"יאיר","YEDIDYA":"ידידיה","YEDIDIA":"ידידיה","YEHOSHUA":"יהושע","JOSHUA":"יהושע","YEHONATAN":"יהונתן","YEHONATHAN":"יהונתן","YONATAN":"יונתן","JONATHAN":"יונתן","YONATHAN":"יונתן","YONAH":"יונה","YONA":"יונה","JONAH":"יונה","YOEL":"יואל","JOEL":"יואל","YOCHANAN":"יוחנן","YOHANAN":"יוחנן","YECHIEL":"יחיאל","YEHIEL":"יחיאל","YECHEZKEL":"יחזקאל","YEHEZKEL":"יחזקאל","EZEKIEL":"יחזקאל","YISRAEL":"ישראל","ISRAEL":"ישראל","YISHAI":"ישי","ISHAI":"ישי","YESHAYAHU":"ישעיהו","YESHAYA":"ישעיהו","ISAIAH":"ישעיהו","YIRMIYAHU":"ירמיהו","YIRMIYAH":"ירמיהו","JEREMIAH":"ירמיהו","KALMAN":"קלמן","LIOR":"ליאור","MEIR":"מאיר","MAIR":"מאיר","MORDECHAI":"מרדכי","MORDECHI":"מרדכי","MORDECAI":"מרדכי","MORDEHAI":"מרדכי","MICHAEL":"מיכאל","MICHOEL":"מיכאל","MATANYA":"מתניה","MATAN":"מתן","MATITYAHU":"מתתיהו","MATTITYAHU":"מתתיהו","NOAM":"נועם","NISIM":"ניסים","NISSIM":"ניסים","NOACH":"נח","NOAH":"נח","NECHEMIA":"נחמיה","NEHEMIA":"נחמיה","NEHEMIAH":"נחמיה","SHMUEL":"שמואל","SHEMUEL":"שמואל","SAMUEL":"שמואל","SHAUL":"שאול","SAUL":"שאול","SHALOM":"שלום","SHAI":"שי","SHAY":"שי","SHMARYA":"שמריה","SHMARIA":"שמריה","SHNEUR":"שניאור","SHNEOR":"שניאור","SHRAGA":"שרגא","SHABTAI":"שבתאי","SHABETAI":"שבתאי","SHACHAR":"שחר","SHAHAR":"שחר","SAAR":"סער","SEGEV":"שגב","PINCHAS":"פנחס","PINHAS":"פנחס","TZVI":"צבי","ZVI":"צבי","TSVI":"צבי","ZVIKA":"צבי","TZION":"ציון","ZION":"ציון","KFIR":"כפיר","REFAEL":"רפאל","RAFAEL":"רפאל","RAPHAEL":"רפאל","RAN":"רן","RONEN":"רונן","RON":"רון","ROEE":"רועי","ROI":"רועי","ROY":"רועי","TAL":"טל","TOMER":"תומר","URI":"אורי","UZIEL":"עוזיאל","EZRA":"עזרא","AKIVA":"עקיבא","ITAMAR":"איתמר","IDO":"עידו","EDO":"עידו","IDAN":"עידן","EVYATAR":"אביתר","EVIATAR":"אביתר","ELYASHIV":"אלישיב","ELIASHIV":"אלישיב","ELISHA":"אלישע","YEHOSEF":"יהוסף","SARA":"שרה","SARAH":"שרה","RIVKA":"רבקה","RIVKAH":"רבקה","REBECCA":"רבקה","RACHEL":"רחל","RAHEL":"רחל","LEAH":"לאה","LEA":"לאה","MIRIAM":"מרים","MIRYAM":"מרים","CHANA":"חנה","HANNA":"חנה","HANA":"חנה","CHANAH":"חנה","HANNAH":"חנה","ESTER":"אסתר","ESTHER":"אסתר","RUT":"רות","RUTH":"רות","NAOMI":"נעמי","NAAMI":"נעמי","DEVORA":"דבורה","DEVORAH":"דבורה","DEBORAH":"דבורה","DVORA":"דבורה","YAEL":"יעל","TAMAR":"תמר","AYALA":"איילה","AVIGAIL":"אביגיל","ABIGAIL":"אביגיל","BATYA":"בתיה","BATIA":"בתיה","BRACHA":"ברכה","CHAYA":"חיה","HAYA":"חיה","CHAIA":"חיה","DINA":"דינה","DINAH":"דינה","EFRAT":"אפרת","EPHRAT":"אפרת","ELISHEVA":"אלישבע","ESTI":"אסתי","GILA":"גילה","HADAS":"הדס","HADASS":"הדס","HADASSA":"הדסה","HADASAH":"הדסה","HADASSAH":"הדסה","ILANA":"אילנה","LIMOR":"לימור","MALKA":"מלכה","MALKAH":"מלכה","MAZAL":"מזל","MICHAL":"מיכל","MORIA":"מוריה","MORIAH":"מוריה","NECHAMA":"נחמה","NEHAMA":"נחמה","NOA":"נועה","OSNAT":"אסנת","ORLY":"אורלי","ORLI":"אורלי","PNINA":"פנינה","SHIRA":"שירה","SHIRI":"שירי","SHIR":"שיר","SHOSHANA":"שושנה","SIMCHA":"שמחה","SIMHA":"שמחה","TOVA":"טובה","TZIPORA":"ציפורה","TZIPPORA":"ציפורה","ZIPORA":"ציפורה","YEHUDIT":"יהודית","YEHUDIS":"יהודית","JUDITH":"יהודית","YOCHEVED":"יוכבד","YOHEVED":"יוכבד","ZAHAVA":"זהבה","HODAYA":"הודיה","HILA":"הילה","HALLEL":"הלל","ODELIA":"אודליה","ODELYA":"אודליה","ORTAL":"אורטל","ORIT":"אורית","ADI":"עדי","EDEN":"עדן","AVITAL":"אביטל","NETA":"נטע","LIRON":"לירון","SAPIR":"ספיר","MAAYAN":"מעיין","RINAT":"רינת","REUT":"רעות","GAL":"גל","LIAT":"ליאת","KEREN":"קרן","ANAT":"ענת","SIGAL":"סיגל"};
function heFromDict(en){var ws=String(en||'').split(' ').filter(Boolean);if(!ws.length)return '';var out=[];for(var i=0;i<ws.length;i++){var h=HE_NAMES[ws[i]];if(!h)return '';out.push(h)}return out.join(' ')}
function lev(a,b){var m=a.length,n=b.length,d=[],i,j;for(i=0;i<=m;i++){d[i]=[i]}for(j=0;j<=n;j++)d[0][j]=j;for(i=1;i<=m;i++)for(j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n]}
function medoid(c){c=c.filter(Boolean);if(!c.length)return '';var best=c[0],bs=1e9;c.forEach(function(x){var t=0;c.forEach(function(y){t+=lev(x,y)});if(t<bs||(t===bs&&x.length>best.length)){bs=t;best=x}});return best}
var FIN={'נ':'ן','מ':'ם','צ':'ץ','פ':'ף','כ':'ך'};
function hebFix(w){w=w.replace(/וו$/,'ון');var l=w.slice(-1);return FIN[l]&&w.length>1?w.slice(0,-1)+FIN[l]:w}
function hebWords(line){return (String(line).match(/[א-ת'"״׳\-]{2,}/g)||[]).map(function(w){return w.replace(/^['"״׳\-]+|['"״׳\-]+$/g,'')}).filter(function(w){return w.length>=2&&!HEB_STOP.test(w)}).map(hebFix)}
/* קריאה ממוקדת של עמודת העברית: אחרי שם המשפחה בעברית מגיע השם הפרטי */
function hebColumn(text,surHe){
  var ls=String(text||'').split(/\r?\n/).map(function(l){return {raw:l,h:hebWords(l)}}).filter(function(x){return x.h.length&&!/\d{3}/.test(x.raw)});
  var r={};
  var i=-1;if(surHe){for(var k=0;k<ls.length;k++)if(ls[k].h.join(' ')===surHe||ls[k].h.indexOf(surHe)>=0){i=k;break}}
  if(i<0&&ls.length){i=0;r.surHe=ls[0].h.join(' ')}
  if(i>=0&&ls[i+1])r.givHe=ls[i+1].h.join(' ');
  return r;
}
function readViz(text,mrz){
  text=String(text||'');
  var lines=text.split(/\r?\n/).map(function(l){return l.trim()}).filter(Boolean),r={};
  var U=function(l){return l.toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim()};
  var words={};lines.forEach(function(l){if(/<</.test(l))return;U(l).split(' ').forEach(function(w){if(w.length>=2)words[w]=1})});
  /* שם משפחה: אם מה שנקרא בשורות התחתונות לא מופיע בעמוד, לוקחים את המילה מהעמוד שהיא סוף שלו (למשל BRMYKOFF ← MYKOFF) */
  var fixName=function(n){if(!n)return n;var f=n.split(' ')[0];if(words[f])return n;for(var k=1;k<f.length-1;k++){var suf=f.slice(k);if(suf.length>=2&&words[suf])return suf+n.slice(f.length)}return n};
  r.surname=fixName(mrz.surname);r.given=fixName(mrz.given);
  var findLineWith=function(word){if(!word)return -1;var w=word.split(' ')[0];if(w.length<2)return -1;for(var i=0;i<lines.length;i++){if((' '+U(lines[i])+' ').indexOf(' '+w+' ')>=0&&!/<</.test(lines[i]))return i}return -1};
  var iS=findLineWith(r.surname),iG=findLineWith(r.given);
  var hebNear=function(i,labelRe,skip){
    if(i<0)return '';
    var h=hebWords(lines[i]);if(h.length)return h.join(' ');
    for(var j=i-1;j>=Math.max(0,i-1);j--){if(j===skip||labelRe.test(lines[j]))continue;h=hebWords(lines[j]);if(h.length&&!/[A-Z]{2,}/.test(lines[j]))return h.join(' ')}
    for(j=i+1;j<=Math.min(lines.length-1,i+1);j++){if(j===skip)continue;h=hebWords(lines[j]);if(h.length&&!/[A-Z]{2,}/.test(lines[j]))return h.join(' ')}
    return '';
  };
  r.surHe=hebNear(iS,/משפחה/,iG);r.givHe=hebNear(iG,/פרטי/,iS);
  if(r.surHe&&r.givHe&&r.surHe===r.givHe)r.givHe='';
  if(iG>=0){var g=U(lines[iG]).split(' ').filter(function(w){return w.length>1});var k=g.indexOf((r.given||'').split(' ')[0]);if(k>=0){var full=g.slice(k).join(' ');if(full.length>(r.given||'').length&&full.indexOf(r.given)===0&&full.length<=40)r.givenFull=full}}
  r.nameHe=[r.givHe,r.surHe].filter(Boolean).join(' ');
  var ds=findDates(text).filter(function(d){return d!==mrz.dob&&d!==mrz.passportExpiry&&(!mrz.dob||d>mrz.dob)&&(!mrz.passportExpiry||d<mrz.passportExpiry)});
  if(ds.length&&mrz.passportExpiry){
    var ey=+mrz.passportExpiry.slice(0,4),md=mrz.passportExpiry.slice(4);
    var sc=function(a){return Math.min(Math.abs(+a.slice(0,4)-(ey-10)),Math.abs(+a.slice(0,4)-(ey-5)))+(Math.abs(+a.slice(8)-+md.slice(4))<=2&&a.slice(5,7)===md.slice(1,3)?0:.5)};
    ds.sort(function(a,b){return sc(a)-sc(b)});r.issue=ds[0];
  }else if(ds.length)r.issue=ds[0];
  /* מספר דרכון: אם תחילת השורה התחתונה חתוכה, לוקחים מהעמוד מספר שמסתיים כמו מה שנקרא ועובר את ספרת הביקורת */
  if(!mrz.passportNo){
    var nums=(text.replace(/[Oo]/g,'0').match(/\b[A-Z0-9]{7,9}\b/g)||[]).filter(function(x){return /\d{5}/.test(x)});
    var part=(mrz.pnPartial||'').replace(/[^0-9A-Z]/g,'');
    var ok=nums.filter(function(x){return check((x+'<<<<<<<<<').slice(0,9),mrz.pnCheck)});
    var pick=ok.find(function(x){return part&&x.slice(-Math.min(4,part.length))===part.slice(-Math.min(4,part.length))})||(ok.length===1?ok[0]:'');
    if(pick)r.passportNo=pick;
  }
  var ids=(text.match(/\b\d{8,9}\b|\b\d-?\d{7}-?\d\b/g)||[]).map(function(x){return x.replace(/-/g,'')});r.idCandidates=ids;
  return r;
}

function scan(file,onProgress,opts){
  opts=opts||{};
  progressCb=onProgress||null;
  var best=null,bestView=null;
  return Promise.all([getWorker('ocrb').catch(function(){return null}),toCanvas(file)]).then(function(r){
    var src=r[1];
    var views={0:src};
    var portrait=src.height>src.width*1.15;
    var order=portrait?[270,90,0,180]:[0,180,270,90];
    var tries=[];
    order.forEach(function(v,n){
      if(!views[v])views[v]=v?rotate(src,v):src;
      var band=findBand(views[v]);
      if(band)tries.push(['ocrb',v,band.from,band.to,false],['eng',v,band.from,band.to,true]);
      tries.push(['ocrb',v,0.5,1,false],['eng',v,0.5,1,true]);
      if(n<2)tries.push(['ocrb',v,0.3,1,true]);
    });
    var i=0;
    function next(){
      if(i>=tries.length)return best;
      var t=tries[i++],v=t[1];attemptLabel='קורא את שורות הדרכון (ניסיון '+i+')';if(progressCb)progressCb(0,attemptLabel);
      return getWorker(t[0]).then(function(w){return w.recognize(crop(views[v],t[2],t[3],t[4]))}).then(function(res){
        var p=parse(res.data&&res.data.text);
        if(p&&(!best||p.score>best.score)){best=p;bestView=v}
        if(best&&best.valid&&best.composite)return best;
        if(best&&best.valid&&i>=2)return best;
        if(best&&best.okDob&&best.okExp&&best.surname&&best.score>=2.5&&p===best)return best;
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
        if(v.surname)m.surname=v.surname;if(v.given)m.given=v.given;if(v.givenFull)m.given=v.givenFull;
        if(!m.passportNo&&v.passportNo){m.passportNo=v.passportNo;m.valid=m.okDob&&m.okExp}
        m.idCandidates=v.idCandidates;
        if(m.nationality!=='ISR')return m;
        var dgv=heFromDict(m.given);if(dgv)m.givHe=dgv;
        if(m.surHe&&m.givHe){m.nameHe=[m.givHe,m.surHe].filter(Boolean).join(' ');return m}
        /* השם בעברית מודפס באותה שורה כמו השם באנגלית, בעמודה הימנית. חותכים בדיוק את האזור הזה ומגדילים */
        var words=(res.data&&res.data.words)||[];
        var findW=function(n){var f=(n||'').split(' ')[0];if(f.length<2)return null;return words.find(function(w){return String(w.text||'').toUpperCase().replace(/[^A-Z]/g,'')===f})};
        var jobs=[];
        if(!m.givHe){var dg=heFromDict(m.given);if(dg)m.givHe=dg;else{var wg=findW(m.given);if(wg)jobs.push(['givHe',wg])}}
        if(!m.surHe){var ds2=heFromDict(m.surname);if(ds2)m.surHe=ds2;else{var ws=findW(m.surname);if(ws)jobs.push(['surHe',ws])}}
        if(!jobs.length){m.nameHe=[m.givHe,m.surHe].filter(Boolean).join(' ');return m}
        attemptLabel='משלים את השם בעברית';if(progressCb)progressCb(0,attemptLabel);
        var fw;
        return getWorker('full').then(function(w){fw=w;return w.setParameters({tessedit_pageseg_mode:'7'})}).then(function(){
          return jobs.reduce(function(pr,j){
            var cands=[];
            return [0.2,0.4,0.6].reduce(function(p2,mg){return p2.then(function(){
              var b=j[1].bbox,h=b.y1-b.y0,y0=Math.max(0,b.y0-h*mg),y1=Math.min(c.height,b.y1+h*mg),x0=Math.min(c.width-1,b.x1+h*1.2),x1=c.width;
              var sc2=3,P=30,hc=document.createElement('canvas');hc.width=Math.round((x1-x0)*sc2)+2*P;hc.height=Math.max(1,Math.round((y1-y0)*sc2))+2*P;
              var hx=hc.getContext('2d');hx.fillStyle='#fff';hx.fillRect(0,0,hc.width,hc.height);hx.filter='contrast(1.3)';hx.drawImage(c,x0,y0,x1-x0,y1-y0,P,P,hc.width-2*P,hc.height-2*P);
              return withTimeout(fw.recognize(hc),30000,'heb').then(function(r2){
                var hw=[];String(r2.data&&r2.data.text||'').split(/\r?\n/).forEach(function(l){hw=hw.concat(hebWords(l))});
                hw=hw.filter(function(x){return x.length>=2&&x!==m.surHe&&x!==m.givHe});
                if(hw.length)cands.push(hw.sort(function(a,b){return b.length-a.length})[0]);
              },function(){});
            })},pr).then(function(){var md=medoid(cands);if(md)m[j[0]]=md});
          },Promise.resolve());
        }).then(function(){
          m.nameHe=[m.givHe,m.surHe].filter(Boolean).join(' ');
          return fw.setParameters({tessedit_pageseg_mode:'3'}).then(function(){return m});
        }).catch(function(){if(fw)fw.setParameters({tessedit_pageseg_mode:'3'}).catch(function(){});return m});
      },function(){return m});
    });
  });
}

var api={parse:parse,check:check,scan:scan,readViz:readViz,findDates:findDates,hebColumn:hebColumn};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MRZ=api;
})(typeof window!=='undefined'?window:globalThis);
