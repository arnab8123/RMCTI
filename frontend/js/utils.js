const U={photoUrl:x=>{
  const isStaticFrontend=(window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')&&window.location.port==='5500';
  const frontendOrigin=location.origin;
  const apiOrigin=isStaticFrontend?'http://127.0.0.1:5000':location.origin;
  const fallback=`${frontendOrigin}/asset/image.jpeg`;
  if(!x)return fallback;
  const raw=String(x).trim().replace(/\\/g,'/').replace(/^\/+/, '');
  if(!raw)return fallback;
  if(/^https?:\/\//i.test(raw)||/^data:image\//i.test(raw)||/^blob:/i.test(raw))return raw;
  if(raw==='asset/image.jpeg'||raw.startsWith('asset/'))return frontendOrigin+'/'+raw;
  if(raw.startsWith('backend/uploads/photos/'))return apiOrigin+'/'+raw.replace(/^backend\//,'');
  if(raw.startsWith('uploads/photos/'))return apiOrigin+'/'+raw;
  if(raw.startsWith('uploads/'))return apiOrigin+'/'+raw;
  return apiOrigin+'/uploads/photos/'+raw;
},esc:x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),money:x=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(x||0)),today:()=>{const p=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),get=k=>p.find(x=>x.type===k)?.value||"00";return `${get("year")}-${get("month")}-${get("day")}`},date:x=>x?new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(x)):"—",time:x=>{if(!x)return "—";const m=String(x).match(/^(\d{1,2}):(\d{2})/);if(m){let h=Number(m[1]);const mm=m[2];const ap=h>=12?"PM":"AM";h=h%12||12;return `${h}:${mm} ${ap}`;}const d=new Date(x);return Number.isNaN(d.getTime())?String(x):new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true}).format(d);},datetime:x=>x?`${new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(x))} · ${new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(x))}`:"—",toast:(m,type="")=>{const kind=String(type||"success").toLowerCase();const icon=kind==="error"?"✕":kind==="warning"?"⚠":"✓";const wrap=document.createElement("div");wrap.className=`toast toast-${kind}`;wrap.setAttribute("role","status");wrap.innerHTML=`<span class="toast-icon">${icon}</span><span class="toast-copy">${U.esc(m)}</span><button type="button" class="toast-close" aria-label="Dismiss">×</button><i class="toast-progress"></i>`;document.body.appendChild(wrap);const close=()=>{if(wrap.isConnected)wrap.classList.add("toast-out");setTimeout(()=>wrap.remove(),180)};wrap.querySelector(".toast-close")?.addEventListener("click",close);setTimeout(close,4200)},modal:(title,html)=>{let b=document.createElement("div");b.className="modalbg";b.innerHTML=`<div class="modal"><div class="modalhead"><b>${U.esc(title)}</b><button class="btn secondary" data-close>×</button></div><div class="modalbody">${html}</div></div>`;document.body.appendChild(b);b.onclick=e=>{if(e.target===b||e.target.closest("[data-close]"))b.remove()};return b},confirm:(t,m,fn)=>{let x=document.createElement("div");x.className="confirmbg";x.innerHTML=`<div class="confirmbox" role="dialog" aria-modal="true"><div class="confirmicon">?</div><div class="confirmcopy"><b>${U.esc(t)}</b><p>${U.esc(m)}</p></div><div class="confirmactions"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok>Confirm</button></div></div>`;document.body.appendChild(x);const close=()=>x.remove();x.querySelector("[data-close]").onclick=close;x.addEventListener("click",e=>{if(e.target===x)close()});x.querySelector("[data-ok]").onclick=async()=>{x.remove();try{await fn()}catch(e){U.toast(e.message||"Action failed","error")}}},debounce:(fn,ms=300)=>{let i;return(...a)=>{clearTimeout(i);i=setTimeout(()=>fn(...a),ms)}},downloadElementAsJpeg:async(el,filename="download.jpg")=>{
    if(!el) throw new Error("ID card element not found");

    // Prefer html2canvas for reliable browser-side JPEG rendering.
    // It is loaded only when the download button is used.
    const loadHtml2Canvas=()=>new Promise((resolve,reject)=>{
      if(window.html2canvas) return resolve(window.html2canvas);
      const existing=document.querySelector('script[data-rmcti-html2canvas]');
      if(existing){
        existing.addEventListener('load',()=>resolve(window.html2canvas),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Could not load JPEG renderer')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.async=true;
      script.dataset.rmctiHtml2canvas='1';
      script.onload=()=>window.html2canvas?resolve(window.html2canvas):reject(new Error('JPEG renderer unavailable'));
      script.onerror=()=>reject(new Error('Could not load JPEG renderer'));
      document.head.appendChild(script);
    });

    const clone=el.cloneNode(true);
    const rect=el.getBoundingClientRect();
    const width=Math.max(320,Math.ceil(rect.width||800));
    const height=Math.max(180,Math.ceil(rect.height||450));

    const stage=document.createElement('div');
    stage.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;background:#fff;z-index:-1;`;
    clone.style.width='100%';
    clone.style.height='100%';
    clone.style.maxWidth='none';
    clone.style.maxHeight='none';
    clone.style.margin='0';
    clone.style.background='#fff';
    stage.appendChild(clone);
    document.body.appendChild(stage);

    try{
      // Make image URLs absolute and wait for them before rendering.
      [...clone.querySelectorAll('img')].forEach(img=>{
        if(img.getAttribute('src') && !/^data:|^blob:|^https?:/i.test(img.getAttribute('src'))){
          img.src=new URL(img.getAttribute('src'),location.href).href;
        }
        img.crossOrigin='anonymous';
      });
      if(document.fonts?.ready) await document.fonts.ready;
      await Promise.all([...clone.querySelectorAll('img')].map(img=>new Promise(resolve=>{
        if(img.complete) return resolve();
        img.onload=img.onerror=()=>resolve();
      })));

      const html2canvas=await loadHtml2Canvas();
      const canvas=await html2canvas(clone,{
        backgroundColor:'#ffffff',
        useCORS:true,
        allowTaint:false,
        scale:Math.min(3,Math.max(2,1800/width)),
        logging:false,
        imageTimeout:10000
      });
      const dataUrl=canvas.toDataURL('image/jpeg',0.95);
      const a=document.createElement('a');
      a.href=dataUrl;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }finally{
      stage.remove();
    }
  },
  openPrintWindow:(title,html)=>{
    const w=window.open("","_blank","width=920,height=800");
    if(!w){U.toast("Please allow pop-ups to print the receipt.","error");return false;}
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${U.esc(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:#f1f5f9;color:#111827;font-family:Arial,Helvetica,sans-serif}.muted{color:#64748b}.print-shell{max-width:800px;margin:0 auto;background:#fff}.receipt-doc{width:100%}.print-actions{display:flex;justify-content:center;gap:10px;margin-bottom:16px}.print-actions button{padding:10px 16px;border:0;border-radius:8px;background:#0f3d5e;color:#fff;font-weight:700;cursor:pointer}.print-actions button:last-child{background:#64748b}@media print{body{background:#fff;padding:0}.print-actions{display:none}.print-shell{max-width:none}.receipt-doc{border:0!important;box-shadow:none!important}}
    </style></head><body><div class="print-actions"><button onclick="window.print()">Print Receipt</button><button onclick="window.close()">Close</button></div><div class="print-shell">${html}</div></body></html>`);
    w.document.close();
    setTimeout(()=>{try{w.focus()}catch{}},50);
    return true;
  }};
