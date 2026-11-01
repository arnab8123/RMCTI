const API = ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '5500')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : '/api';

const Api = {
  csrfHeaders() {
    const csrf=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("csrf_access_token="));
    return csrf ? {"X-CSRF-TOKEN":decodeURIComponent(csrf.slice("csrf_access_token=".length))} : {};
  },
  async req(path, opt = {}) {
    const h = {"Content-Type":"application/json", ...(opt.headers || {})};
    const method=String(opt.method||"GET").toUpperCase();
    if(!["GET","HEAD","OPTIONS"].includes(method))Object.assign(h,this.csrfHeaders());
    const r = await fetch(API + path, {...opt, credentials:"include", headers:h});
    let d = {};
    try { d = await r.json(); } catch {}
    if (r.status === 401) {
      sessionStorage.clear(); localStorage.removeItem("rmcti_user");
      location.href = "../login.html";
      throw Error("Session expired");
    }
    if (!r.ok || d.success === false) throw Error(d.message || "Request failed");
    return d.data;
  },
  get(p, q = {}) {
    const s = new URLSearchParams(Object.entries(q).filter(([,v]) => v !== "" && v != null));
    return this.req(p + (s.toString() ? "?" + s : ""));
  },
  post(p, b) { return this.req(p, {method:"POST", body:JSON.stringify(b)}); },
  upload(p, file, field="photo") {
    const h = this.csrfHeaders();
    const fd = new FormData();
    fd.append(field, file);
    return fetch(API + p, {method:"POST", credentials:"include", headers:h, body:fd}).then(async r => {
      let d = {};
      try { d = await r.json(); } catch {}
      if (r.status === 401) {
        sessionStorage.clear();
        localStorage.removeItem("rmcti_user");
        location.href = "../login.html";
        throw Error("Session expired");
      }
      if (!r.ok || d.success === false) throw Error(d.message || "Upload failed");
      return d.data;
    });
  },
  uploadFields(p, fields = {}) {
    const h = this.csrfHeaders();
    const fd = new FormData();
    Object.entries(fields).forEach(([k,v]) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach(item => { if (item !== undefined && item !== null) fd.append(k,item); });
      else fd.append(k,v);
    });
    return fetch(API + p, {method:"POST", credentials:"include", headers:h, body:fd}).then(async r => {
      let d = {}; try { d = await r.json(); } catch {}
      if (r.status === 401) { sessionStorage.clear(); localStorage.removeItem("rmcti_user"); location.href = "../login.html"; throw Error("Session expired"); }
      if (!r.ok || d.success === false) throw Error(d.message || "Upload failed");
      return d.data;
    });
  },
  put(p, b) { return this.req(p, {method:"PUT", body:JSON.stringify(b)}); },
  del(p) { return this.req(p, {method:"DELETE"}); }
};
