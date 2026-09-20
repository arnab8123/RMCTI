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
    const clone=el.cloneNode(true);
    const base=document.createElement("div");
    base.style.position="fixed";base.style.left="-100000px";base.style.top="0";base.style.visibility="hidden";base.style.pointerEvents="none";
    base.style.width=(el.getBoundingClientRect().width||800)+"px";
    base.appendChild(clone);
    document.body.appendChild(base);

    const apply=(src,dst)=>{
      const cs=getComputedStyle(src);
      for(const p of cs) dst.style.setProperty(p,cs.getPropertyValue(p),cs.getPropertyPriority(p));
      [...src.children].forEach((child,i)=>{if(dst.children[i]) apply(child,dst.children[i]);});
    };
    apply(el,clone);

    clone.style.width=(el.getBoundingClientRect().width||800)+"px";
    clone.style.height=(el.getBoundingClientRect().height||450)+"px";
    clone.style.maxHeight="none";
    clone.style.overflow="hidden";
    clone.style.background="#fff";

    // Inline same-origin images so the JPEG export is not blocked by CORS.
    const toDataUrl=async(img)=>{
      const src=img.currentSrc||img.src;
      if(!src || src.startsWith("data:")) return;
      try{
        const response=await fetch(src,{credentials:"same-origin",cache:"no-store"});
        if(!response.ok) throw new Error("Image request failed");
        const blob=await response.blob();
        const data=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=reject;
          reader.readAsDataURL(blob);
        });
        img.src=data;
      }catch(err){
        // Keep the original source as a fallback; SVG export can still render it.
        console.warn("Could not inline ID card image:",src,err);
      }
    };
    await Promise.all([...clone.querySelectorAll("img")].map(toDataUrl));

    if(document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...clone.querySelectorAll("img")].map(img=>new Promise(resolve=>{
      if(img.complete) return resolve();
      img.onload=img.onerror=()=>resolve();
    })));

    const width=Math.ceil(clone.getBoundingClientRect().width||800);
    const height=Math.ceil(clone.getBoundingClientRect().height||450);
    const xml=new XMLSerializer().serializeToString(clone);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xml}</div></foreignObject></svg>`;
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      const canvas=document.createElement("canvas");
      const scale=Math.min(2,Math.max(1,1600/width));
      canvas.width=Math.ceil(width*scale);
      canvas.height=Math.ceil(height*scale);
      const ctx=canvas.getContext("2d");
      if(!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const dataUrl=canvas.toDataURL("image/jpeg",0.94);
      const a=document.createElement("a");
      a.href=dataUrl;a.download=filename;
      document.body.appendChild(a);a.click();a.remove();
    }finally{
      URL.revokeObjectURL(url);
      base.remove();
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
