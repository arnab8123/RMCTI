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
},esc:x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),money:x=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(x||0)),today:()=>{const p=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),get=k=>p.find(x=>x.type===k)?.value||"00";return `${get("year")}-${get("month")}-${get("day")}`},date:x=>x?new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(x)):"—",datetime:x=>x?`${new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(x))} IST`:"—",toast:(m,type="")=>{let e=document.createElement("div");e.className="toast";e.textContent=m;document.body.appendChild(e);setTimeout(()=>e.remove(),3500)},modal:(title,html)=>{let b=document.createElement("div");b.className="modalbg";b.innerHTML=`<div class="modal"><div class="modalhead"><b>${U.esc(title)}</b><button class="btn secondary" data-close>×</button></div><div class="modalbody">${html}</div></div>`;document.body.appendChild(b);b.onclick=e=>{if(e.target===b||e.target.closest("[data-close]"))b.remove()};return b},confirm:(t,m,fn)=>{let x=U.modal(t,`<p>${U.esc(m)}</p><div class="right" style="justify-content:flex-end"><button class="btn secondary" data-close>Cancel</button><button class="btn danger" data-ok>Confirm</button></div>`);x.querySelector("[data-ok]").onclick=async()=>{x.remove();await fn()}},debounce:(fn,ms=300)=>{let i;return(...a)=>{clearTimeout(i);i=setTimeout(()=>fn(...a),ms)}},downloadElementAsJpeg:async(el,filename="download.jpg")=>{
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
