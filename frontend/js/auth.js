const Notifications = (() => {
  const map = {
    admin: { complaints: 'complaints.html', fees: 'fee-payment.html', enquiries: 'enquiries.html' },
    student: { homework: 'homework.html', complaints: 'complaints.html' }
  };
  const key = (role, type) => `rmcti_notif_seen_${role}_${type}`;
  const currentPageMatches = target => location.pathname.endsWith(`/${target}`) || location.pathname.endsWith(target);
  const valueFor = (type, data) => type === 'fees' ? JSON.stringify(data.fees || {}) : String((data[type] || {}).latest || '');
  async function refresh(role) {
    const data = await Api.get('/notifications');
    Object.entries(map[role] || {}).forEach(([type, target]) => {
      const link = [...document.querySelectorAll('.nav a')].find(a => a.getAttribute('href') === target);
      if (!link) return;
      const current = currentPageMatches(target);
      const currentValue = valueFor(type, data);
      const seenKey = key(role, type);
      if (current) localStorage.setItem(seenKey, currentValue);
      const shouldShow = !current && currentValue && localStorage.getItem(seenKey) !== currentValue;
      let dot = link.querySelector('[data-notification-dot]');
      if (shouldShow && !dot) {
        dot = document.createElement('span');
        dot.dataset.notificationDot='1';
        dot.className='notification-dot';
        dot.setAttribute('aria-label','New notification');
        link.appendChild(dot);
      } else if (!shouldShow && dot) dot.remove();
    });
  }
  return { refresh };
})();

const Auth = {
  async role(role) {
    if (!sessionStorage.getItem('token')) {
      location.href = '../login.html';
      return null;
    }
    try {
      const user = await Api.get('/auth/me');
      if (user.role !== role) {
        location.href = '../login.html';
        return null;
      }
      sessionStorage.setItem('user', JSON.stringify(user));
      document.querySelectorAll('[data-user]').forEach((el) => { el.textContent = user.name || user.username || ''; });

      const logout = document.querySelector('[data-logout]');
      if (logout) {
        logout.type = 'button';
        logout.addEventListener('click', (event) => {
          event.preventDefault(); event.stopPropagation(); sessionStorage.clear(); location.href = '../login.html';
        }, { once: true });
      }

      const menu = document.querySelector('[data-menu]');
      const side = document.querySelector('.side');
      if (menu && side && !menu.dataset.menuBound) {
        menu.type = 'button'; menu.dataset.menuBound='1';
        const closeMenu=()=>side.classList.remove('open');
        menu.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();side.classList.toggle('open');});
        document.addEventListener('click',(event)=>{if(!side.classList.contains('open'))return;if(!side.contains(event.target)&&!menu.contains(event.target))closeMenu();});
        document.addEventListener('touchstart',(event)=>{if(!side.classList.contains('open'))return;if(!side.contains(event.target)&&!menu.contains(event.target))closeMenu();},{passive:true});
        document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu();});
        window.addEventListener('resize',()=>{if(window.innerWidth>800)closeMenu();});
        side.querySelectorAll('a, button').forEach((item)=>item.addEventListener('click',closeMenu));
      }

      try {
        await Notifications.refresh(role);
        clearInterval(window.__rmctiNotifTimer);
        window.__rmctiNotifTimer=setInterval(()=>Notifications.refresh(role).catch(()=>{}),60000);
      } catch (notificationError) { console.warn('Notification refresh failed', notificationError); }
      return user;
    } catch (error) { console.error(error); return null; }
  }
};
