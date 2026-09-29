/* Ruang Fikir V15: cross-device submission receipts and cloud marking.
   This module requires the Apps Script POST bridge patch supplied with V15.
   Teacher key is used only transiently in POST; it is never persisted. */
(()=>{
'use strict';
const API=window.RUANG_FIKIR_API_URL;
const ORIGIN=location.origin;
const pending=new Map();
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(id,value)=>{if($(id))$(id).textContent=value};
let requestCounter=0;
window.addEventListener('message',event=>{
 if(event.origin!=='https://script.google.com'&&event.origin!=='https://script.googleusercontent.com')return;
 const d=event.data;
 if(!d||d.rfBridge!=='AHLI_FIKIR_V15'||typeof d.requestId!=='string')return;
 const slot=pending.get(d.requestId);
 if(!slot)return;
 clearTimeout(slot.timeout);pending.delete(d.requestId);
 try{slot.popup?.close()}catch(e){}
 slot.resolve(d.result);
});
function post(data){
 return new Promise((resolve,reject)=>{
   if(!API)return reject(new Error('URL Apps Script belum disediakan.'));
   const requestId='rf_'+Date.now()+'_'+(++requestCounter);
   const popup=window.open('about:blank','rf_api_'+requestId);
   if(!popup)return reject(new Error('Pelayar menyekat pop-up. Benarkan pop-up untuk laman ini.'));
   try{popup.document.write('<!doctype html><title>Ruang Fikir</title><p>Memproses rekod. Sila tunggu…</p>');popup.document.close()}catch(e){}
   const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('Belum menerima pengesahan daripada Apps Script. Semak tab resit sebelum cuba semula.'))},22000);
   pending.set(requestId,{resolve,reject,popup,timeout});
   const form=document.createElement('form');form.method='POST';form.action=API;form.target=popup.name;form.hidden=true;
   const input=document.createElement('input');input.name='payload';input.type='hidden';
   input.value=JSON.stringify({...data,clientOrigin:ORIGIN,requestId});
   form.append(input);document.body.append(form);form.submit();form.remove();
 });
}
const receiptsKey='rf-cloud-receipts-v15';
function receipts(){try{return JSON.parse(localStorage.getItem(receiptsKey)||'[]')}catch(e){return []}}
function saveReceipt(r){const arr=receipts();arr.unshift(r);localStorage.setItem(receiptsKey,JSON.stringify(arr.slice(0,100)))}
function init(){
 const cloud=$('cloudSubmit'),box=$('cloudState');
 if(!cloud||!box)return;
 // Capture listener blocks the old handler. Only one POST is made.
 let busy=false;
 cloud.addEventListener('click',async event=>{
   event.stopImmediatePropagation();event.preventDefault();
   if(busy)return;
   const q=$('cloudQuestion')?.value;
   const name=$('cloudName')?.value.trim(),answer=$('cloudAnswer')?.value.trim(),cls=$('cloudClass')?.value;
   if(!q||!name||!answer||!cls){box.textContent='Pilih soalan, kelas, nama panggilan dan isi jawapan dahulu.';return}
   busy=true;cloud.disabled=true;box.textContent='Menghantar jawapan sekali sahaja…';
   try{
     const data=await post({action:'submitAnswer',questionId:q,name,cls,answer});
     if(!data.success||!data.id||!data.receipt)throw Error(data.error||'Resit daripada pelayan tidak lengkap.');
     saveReceipt({id:data.id,receipt:data.receipt,q,name,cls,created:new Date().toISOString()});
     box.textContent='✅ Jawapan disimpan dalam Google Sheets. Resit peribadi tersimpan pada peranti ini. Buka Album Peribadi untuk semak semula.';
     $('cloudAnswer').value='';
     renderReceipts();
   }catch(err){box.textContent='⚠️ '+err.message+' Jika resit Google sudah menunjukkan success:true, jangan tekan hantar sekali lagi.'}
   finally{busy=false;cloud.disabled=false}
 },true);
 const mine=document.createElement('section');mine.className='card';
 mine.innerHTML='<h2>📘 Album Peribadi Awan</h2><p class="muted">Resit peribadi disimpan pada peranti ini. Untuk membuka pada gajet lain, salin ID dan resit secara peribadi. Jangan kongsikan token dengan orang lain.</p><div id="rfReceiptCards"></div><details><summary>Buka rekod menggunakan resit daripada gajet lain</summary><label>ID Jawapan</label><input id="rfManualId"><label>Resit peribadi</label><input id="rfManualToken" type="password"><button id="rfReadManual" class="secondary">Lihat semakan</button></details><div id="rfMineResult" aria-live="polite"></div>';
 cloud.closest('.card').after(mine);
 $('rfReadManual').onclick=()=>readMine($('rfManualId').value.trim(),$('rfManualToken').value.trim());
 renderReceipts();
 function renderReceipts(){
   const holder=$('rfReceiptCards');holder.replaceChildren();
   const data=receipts();
   if(!data.length){holder.textContent='Belum ada resit daripada penghantaran awan pada peranti ini.';return}
   data.forEach(r=>{
     const item=document.createElement('div');item.className='card';item.style.background='#f5f1fd';
     const p=document.createElement('p');p.textContent=r.name+' · '+r.cls+' · '+new Date(r.created).toLocaleString('ms-MY');
     const read=document.createElement('button');read.textContent='Lihat jawapan & semakan';read.className='secondary';read.onclick=()=>readMine(r.id,r.receipt);
     const copy=document.createElement('button');copy.textContent='Salin resit peribadi';copy.className='secondary';copy.onclick=()=>navigator.clipboard.writeText('ID: '+r.id+'\nRECEIPT: '+r.receipt);
     item.append(p,read,' ',copy);holder.append(item);
   })
 }
 async function readMine(id,receipt){
   const holder=$('rfMineResult');holder.textContent='Memuatkan rekod…';
   if(!id||!receipt){holder.textContent='ID dan resit diperlukan.';return}
   try{
     const r=await post({action:'myAnswer',answerId:id,receipt});
     if(!r.success)throw Error(r.error||'Rekod tidak ditemui');
     const x=r.data;holder.replaceChildren();
     const item=document.createElement('div');item.className='card';
     const h=document.createElement('h3');h.textContent=x.question||'Rekod jawapan';
     const a=document.createElement('p');a.textContent=x.answer;
     const score=document.createElement('strong');score.textContent=x.score===null?'Menunggu semakan':x.score+'/'+x.max+' markah';
     const feedback=document.createElement('p');feedback.textContent=x.feedback||'Belum ada komen guru.';
     const paper=document.createElement('div');paper.className='paper albumPaper';const pre=document.createElement('pre');pre.textContent=x.answer||'';const canvas=document.createElement('canvas');paper.append(pre,canvas);
     item.append(h,paper,score,feedback);holder.append(item);renderInk(canvas,x.ink||[]);
   }catch(err){holder.textContent='⚠️ '+err.message}
 }
}
function renderInk(canvas,strokes){
 requestAnimationFrame(()=>{
 const p=canvas.parentElement;canvas.width=p.clientWidth;canvas.height=p.clientHeight;const ctx=canvas.getContext('2d');
 (strokes||[]).forEach(s=>{ctx.beginPath();ctx.strokeStyle=s.color||'#db3344';ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';(s.points||[]).forEach((pt,i)=>{if(!Array.isArray(pt))return;if(i)ctx.lineTo(pt[0]*canvas.width,pt[1]*canvas.height);else ctx.moveTo(pt[0]*canvas.width,pt[1]*canvas.height)});ctx.stroke()});
 });
}
function initTeacher(){
 const gate=$('teacherDesk');if(!gate)return;
 const section=document.createElement('section');section.className='card';
 section.innerHTML='<h2>☁️ Meja Semakan Google Sheets</h2><p class="muted">Ini jawapan sebenar daripada semua gajet. Arkib semakan lama kekal berasingan. Masukkan kunci guru Apps Script secara peribadi untuk setiap tindakan; kunci tidak disimpan.</p><label>Kunci guru Apps Script (bukan PIN demo)</label><input type="password" id="rfCloudKey" autocomplete="off"><button id="rfLoadAnswers">Muat jawapan murid</button><p id="rfTeacherStatus" role="status" class="muted"></p><div id="rfTeacherEntries"></div><div id="rfCloudReview" class="hidden"><h3 id="rfReviewName"></h3><p id="rfReviewQuestion"></p><div class="row"><button type="button" id="rfRed">✎ Pen merah</button><button type="button" id="rfGreen">✓ Pen hijau</button><button type="button" class="secondary" id="rfUndo">↶ Undo</button><button type="button" class="secondary" id="rfClear">Padam dakwat</button></div><div class="paper" id="rfPaper"><pre id="rfReviewText"></pre><canvas id="rfInk"></canvas></div><label>Markah</label><input type="number" id="rfScore" min="0" step="1"><label>Komen guru</label><textarea id="rfFeedback"></textarea><button id="rfSaveCloud">Simpan semakan awan</button><button class="secondary" id="rfPublishCloud">Terbit ke Galeri Bersama</button><p id="rfReviewStatus" role="status"></p></div>';
 gate.insertBefore(section,gate.firstElementChild);
 let answers=[],selected=null,strokes=[],drawing=null,color='#db3344',max=0;
 const ink=$('rfInk'),ctx=ink.getContext('2d');
 const status=x=>text('rfTeacherStatus',x);
 const key=()=>$('rfCloudKey').value.trim();
 $('rfLoadAnswers').onclick=async()=>{
   if(!key()){status('Masukkan kunci guru dahulu.');return}
   status('Memuatkan jawapan daripada Google Sheets…');
   try{
     const r=await post({action:'getTeacherAnswers',teacherKey:key()});if(!r.success)throw Error(r.error||'Gagal membaca jawapan');
     answers=r.data||[];
     const holder=$('rfTeacherEntries');holder.replaceChildren();
     status(answers.length+' jawapan ditemui dalam Google Sheets.');
     if(!answers.length){holder.textContent='Belum ada jawapan awan.';return}
     const questionMap=new Map((window.sharedQuestions||[]).map(q=>[String(q.id),q]));
     answers.forEach(a=>{
       const b=document.createElement('button');b.className='secondary';b.style.margin='5px';b.textContent=a.KOD_MURID+' · '+a.KELAS+' · '+(a.STATUS_SEMAKAN||'BELUM SEMAK');
       b.onclick=()=>{selected=a;const q=questionMap.get(String(a.ID_SOALAN));max=Number(q?.max||100);$('rfReviewName').textContent=a.KOD_MURID+' · '+a.KELAS;$('rfReviewQuestion').textContent=q?.q||'Soalan daripada ID '+a.ID_SOALAN;$('rfReviewText').textContent=a.JAWAPAN;$('rfScore').max=max;$('rfScore').value='';$('rfFeedback').value='';strokes=[];$('rfCloudReview').classList.remove('hidden');requestAnimationFrame(size);text('rfReviewStatus','Beri markah, kemudian Simpan semakan awan.')};holder.append(b)
     })
   }catch(err){status('⚠️ '+err.message)}
 };
 function size(){const p=$('rfPaper');ink.width=p.clientWidth;ink.height=p.clientHeight;draw()}
 function draw(){ctx.clearRect(0,0,ink.width,ink.height);strokes.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p[0]*ink.width,p[1]*ink.height):ctx.moveTo(p[0]*ink.width,p[1]*ink.height));ctx.stroke()})}
 function coord(e){const b=ink.getBoundingClientRect();return [(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height]}
 ink.addEventListener('pointerdown',e=>{if(!selected)return;ink.setPointerCapture(e.pointerId);drawing={color,points:[coord(e)]};strokes.push(drawing);draw()});
 ink.addEventListener('pointermove',e=>{if(!drawing)return;drawing.points.push(coord(e));draw()});
 ink.addEventListener('pointerup',()=>drawing=null);ink.addEventListener('pointercancel',()=>drawing=null);
 $('rfRed').onclick=()=>color='#db3344';$('rfGreen').onclick=()=>color='#158044';$('rfUndo').onclick=()=>{strokes.pop();draw()};$('rfClear').onclick=()=>{strokes=[];draw()};
 let saved=false;
 $('rfSaveCloud').onclick=async()=>{
   if(!selected||!key())return text('rfReviewStatus','Pilih jawapan dan masukkan kunci guru dahulu.');
   const score=Number($('rfScore').value);if($('rfScore').value===''||!Number.isInteger(score)||score<0||score>max)return text('rfReviewStatus','Markah mesti nombor bulat antara 0 hingga '+max);
   text('rfReviewStatus','Menyimpan semakan…');
   try{const r=await post({action:'saveReview',teacherKey:key(),answerId:selected.ID_JAWAPAN,score,feedback:$('rfFeedback').value,ink:strokes});if(!r.success)throw Error(r.error||'Gagal menyimpan');saved=true;text('rfReviewStatus','✅ Semakan disimpan di Google Sheets. Klik Terbit untuk kongsi ke galeri.')}catch(e){text('rfReviewStatus','⚠️ '+e.message)}
 };
 $('rfPublishCloud').onclick=async()=>{
   if(!selected||!saved||!key())return text('rfReviewStatus','Simpan semakan dahulu, kemudian terbitkan.');
   text('rfReviewStatus','Menerbitkan jawapan…');
   try{const r=await post({action:'publishGallery',teacherKey:key(),answerId:selected.ID_JAWAPAN});if(!r.success)throw Error(r.error||'Gagal terbit');text('rfReviewStatus','✅ Diterbitkan ke Galeri Bersama.');if(window.loadSharedGallery)window.loadSharedGallery()}catch(e){text('rfReviewStatus','⚠️ '+e.message)}
 };
 window.addEventListener('resize',()=>{if(selected&&gate.offsetParent)size()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{init();initTeacher()});else{init();initTeacher()}
})();