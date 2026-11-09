import { useEffect, useMemo, useState } from 'react';

const initialMonitors = [
  { id: 'm1', name: 'RetailOS API', url: 'https://retailos-server.onrender.com/health', interval: 10, timeout: 10, status: 'up', latency: 284, checked: '2 min ago', uptime: '99.92%', code: 200, enabled: true },
  { id: 'm2', name: 'ENJ0Y Portfolio', url: 'https://enj0y.netlify.app', interval: 10, timeout: 10, status: 'up', latency: 146, checked: '4 min ago', uptime: '99.99%', code: 200, enabled: true },
  { id: 'm3', name: 'Example staging API', url: 'https://staging.example.com/health', interval: 20, timeout: 10, status: 'down', latency: null, checked: '8 min ago', uptime: '98.41%', code: null, enabled: true }
];

const readSaved = () => {
  try {
    const saved = localStorage.getItem('apimon-demo-monitors');
    return saved ? JSON.parse(saved) : initialMonitors;
  } catch {
    return initialMonitors;
  }
};

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function AddMonitorModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [interval, setInterval] = useState('10');
  const [timeout, setTimeoutValue] = useState('10');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    let parsed;
    try { parsed = new URL(url); } catch { setError('Enter a valid URL, including https://'); return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) { setError('Only HTTP and HTTPS URLs are supported.'); return; }
    if (!name.trim()) { setError('Give this monitor a name.'); return; }
    onAdd({ id: crypto.randomUUID(), name: name.trim(), url: parsed.toString(), interval: Number(interval), timeout: Number(timeout), status: 'pending', latency: null, checked: 'Not checked yet', uptime: '—', code: null, enabled: true });
  }

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><span className="eyebrow">NEW MONITOR</span><h2 id="modal-title">Add a monitor</h2><p>Tell APIMON what you want to keep an eye on.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>
      <form onSubmit={submit}>
        <label>Monitor name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production API" /></label>
        <label>Website or API URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.example.com/health" /></label>
        <div className="form-grid">
          <label>Check interval<select value={interval} onChange={e => setInterval(e.target.value)}><option value="5">Every 5 minutes</option><option value="10">Every 10 minutes</option><option value="20">Every 20 minutes</option><option value="30">Every 30 minutes</option></select></label>
          <label>Timeout<select value={timeout} onChange={e => setTimeoutValue(e.target.value)}><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option></select></label>
        </div>
        <div className="form-note"><Icon name="clock"/> APIMON will use HTTP GET and expect HTTP 200 by default.</div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Icon name="plus"/> Add monitor</button></div>
      </form>
    </section>
  </div>;
}

function Sparkline({ down = false }) {
  return <svg className="sparkline" viewBox="0 0 112 32" preserveAspectRatio="none" aria-label="Illustrative response time trend"><path d={down ? 'M1 7 L12 10 L23 8 L34 14 L45 12 L56 26 L67 21 L78 24 L89 29 L111 28' : 'M1 22 L12 18 L23 20 L34 13 L45 16 L56 10 L67 14 L78 8 L89 12 L100 5 L111 8'} fill="none" stroke={down ? '#dc7770' : '#399a79'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function App() {
  const [monitors, setMonitors] = useState(readSaved);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [activeNav, setActiveNav] = useState('Overview');
  const [toast, setToast] = useState('');

  useEffect(() => { localStorage.setItem('apimon-demo-monitors', JSON.stringify(monitors)); }, [monitors]);

  const counts = useMemo(() => ({
    total: monitors.length,
    up: monitors.filter(m => m.enabled && m.status === 'up').length,
    down: monitors.filter(m => m.enabled && m.status === 'down').length,
    paused: monitors.filter(m => !m.enabled).length
  }), [monitors]);

  const visible = monitors.filter(m => {
    const matchesQuery = (m.name + ' ' + m.url).toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'up' && m.status === 'up' && m.enabled) || (filter === 'down' && m.status === 'down' && m.enabled) || (filter === 'paused' && !m.enabled);
    return matchesQuery && matchesFilter;
  });

  function notify(message) { setToast(message); window.setTimeout(() => setToast(''), 2600); }
  function addMonitor(monitor) { setMonitors(current => [monitor, ...current]); setModalOpen(false); notify('Monitor added to this demo.'); }
  function toggleMonitor(id) { setMonitors(current => current.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m)); notify('Monitor setting updated.'); }
  function removeMonitor(id) { setMonitors(current => current.filter(m => m.id !== id)); notify('Monitor removed.'); }
  function simulateCheck(id) {
    setMonitors(current => current.map(m => m.id === id ? { ...m, checked: 'Just now' } : m));
    notify('Demo only: live checks are not connected yet.');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="APIMON home"><span className="brand-mark">A</span><span>APIMON<span className="brand-dot">.</span><small>STATUS, WITHOUT GUESSWORK.</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <button className={'workspace-switch ' + (activeNav === 'Overview' ? 'selected' : '')} onClick={() => setActiveNav('Overview')}><span className="workspace-avatar">E</span><span><b>ENJ0Y Workspace</b><small>Free workspace</small></span><span className="chevron">⌄</span></button>
      <div className="nav-label">MONITORING</div>
      <nav className="side-nav">
        <button className={activeNav === 'Overview' ? 'active' : ''} onClick={() => setActiveNav('Overview')}><Icon name="grid"/>Overview</button>
        <button className={activeNav === 'Monitors' ? 'active' : ''} onClick={() => {setActiveNav('Monitors');setFilter('all')}}><Icon name="activity"/>Monitors<span className="nav-count">{counts.total}</span></button>
        <button className={activeNav === 'Incidents' ? 'active' : ''} onClick={() => setActiveNav('Incidents')}><Icon name="alert"/>Incidents{counts.down > 0 && <span className="nav-count alert-count">{counts.down}</span>}</button>
      </nav>
      <div className="nav-label">PREFERENCES</div>
      <nav className="side-nav"><button className={activeNav === 'Notifications' ? 'active' : ''} onClick={() => setActiveNav('Notifications')}><Icon name="bell"/>Notifications</button><button className={activeNav === 'Settings' ? 'active' : ''} onClick={() => setActiveNav('Settings')}><Icon name="settings"/>Settings</button></nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><b>Need a hand?</b><p>Monitoring should be the easy part.</p><a href="https://github.com/ENJ0Y-Labs/uptime-monitor" target="_blank" rel="noreferrer">Project documentation <Icon name="external"/></a></div><div className="profile-row"><div className="profile-avatar">E</div><span><b>ENJ0Y</b><small>Workspace owner</small></span><Icon name="more"/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{activeNav}</b></div><div className="top-actions"><span className="demo-pill"><i/> DEMO MODE</span><button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell"/><i/></button><div className="profile-avatar small-avatar">E</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">MONITORING WORKSPACE</span><h1>{activeNav === 'Overview' || activeNav === 'Monitors' ? 'Good afternoon.' : activeNav}</h1><p>{activeNav === 'Overview' || activeNav === 'Monitors' ? 'Here’s what’s happening with your services.' : 'This section is a preview in the APIMON interface prototype.'}</p></div><button className="button button-primary" onClick={() => setModalOpen(true)}><Icon name="plus"/> Add monitor</button></div>

        <div className="demo-banner"><span className="demo-banner-icon">i</span><span><b>You’re exploring a frontend prototype.</b> Monitor data is saved in this browser only. Scheduled checks and live API results will be connected later.</span><button onClick={() => setModalOpen(true)}>Add your first URL <span>→</span></button></div>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Total monitors</span><span className="stat-icon neutral"><Icon name="activity"/></span></div><strong>{counts.total.toString().padStart(2,'0')}</strong><small>Across this workspace</small></article>
          <article className="stat-card"><div className="stat-top"><span>Operational</span><span className="stat-icon green"><Icon name="check"/></span></div><strong>{counts.up.toString().padStart(2,'0')}</strong><small><i className="status-dot up-dot"/> Responding normally</small></article>
          <article className="stat-card"><div className="stat-top"><span>Needs attention</span><span className="stat-icon red"><Icon name="alert"/></span></div><strong>{counts.down.toString().padStart(2,'0')}</strong><small><i className="status-dot down-dot"/> Currently marked down</small></article>
          <article className="stat-card"><div className="stat-top"><span>Paused</span><span className="stat-icon neutral"><Icon name="clock"/></span></div><strong>{counts.paused.toString().padStart(2,'0')}</strong><small>Checks temporarily stopped</small></article>
        </section>

        <section className="content-card monitor-card">
          <div className="section-heading"><div><h2>Your monitors</h2><p>Keep track of every endpoint in one place.</p></div><button className="button button-outline" onClick={() => setModalOpen(true)}><Icon name="plus"/> New monitor</button></div>
          <div className="table-toolbar"><div className="filter-tabs"><button className={filter==='all'?'chosen':''} onClick={()=>setFilter('all')}>All <span>{counts.total}</span></button><button className={filter==='up'?'chosen':''} onClick={()=>setFilter('up')}>Up</button><button className={filter==='down'?'chosen':''} onClick={()=>setFilter('down')}>Down</button><button className={filter==='paused'?'chosen':''} onClick={()=>setFilter('paused')}>Paused</button></div><label className="search-box"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search monitors..." /></label></div>
          <div className="table-wrap"><table><thead><tr><th>MONITOR</th><th>STATUS</th><th>RESPONSE TIME</th><th>UPTIME</th><th>LAST CHECK</th><th></th></tr></thead><tbody>
            {visible.map(m=><tr key={m.id}><td><div className="monitor-name"><span className={'monitor-symbol '+(m.enabled?'':'muted-symbol')}>{m.url.startsWith('https:')?'↗':'◉'}</span><span><b>{m.name}</b><small>{m.url}</small></span></div></td><td>{!m.enabled?<span className="status-badge paused-badge"><i/>Paused</span>:m.status==='up'?<span className="status-badge up-badge"><i/>Operational</span>:m.status==='down'?<span className="status-badge down-badge"><i/>Down</span>:<span className="status-badge pending-badge"><i/>Pending</span>}</td><td><b className="latency">{m.latency == null ? '—' : m.latency+' ms'}</b><Sparkline down={m.status==='down'}/></td><td className="uptime-cell">{m.uptime}</td><td className="last-check">{m.checked}</td><td><div className="row-actions"><button title="Run demo check" onClick={()=>simulateCheck(m.id)}><Icon name="activity"/></button><button title={m.enabled?'Pause monitor':'Resume monitor'} onClick={()=>toggleMonitor(m.id)}>{m.enabled?'Ⅱ':'▶'}</button><button title="Delete monitor" onClick={()=>removeMonitor(m.id)}><Icon name="more"/></button></div></td></tr>)}
            {visible.length===0&&<tr><td colSpan="6"><div className="empty-state"><span>⌕</span><b>No monitors found</b><p>Try another search or add a monitor.</p><button className="button button-primary" onClick={()=>setModalOpen(true)}>Add monitor</button></div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>Showing <b>{visible.length}</b> of <b>{monitors.length}</b> monitors</span><span>Last updated just now <i className="status-dot up-dot"/></span></div>
        </section>

        <section className="lower-grid"><article className="content-card uptime-card"><div className="section-heading"><div><h2>Response time</h2><p>Average response time across monitored services.</p></div><select aria-label="Chart period"><option>Last 24 hours</option><option>Last 7 days</option></select></div><div className="chart-placeholder"><div className="chart-y"><span>600 ms</span><span>400 ms</span><span>200 ms</span><span>0 ms</span></div><svg viewBox="0 0 640 170" preserveAspectRatio="none" role="img" aria-label="Illustrative response time line chart"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e68a3d" stopOpacity=".18"/><stop offset="1" stopColor="#e68a3d" stopOpacity="0"/></linearGradient></defs><path d="M0 112 L45 102 L90 108 L135 83 L180 92 L225 70 L270 78 L315 57 L360 73 L405 48 L450 63 L495 42 L540 54 L585 30 L640 39 L640 170 L0 170Z" fill="url(#area)"/><path d="M0 112 L45 102 L90 108 L135 83 L180 92 L225 70 L270 78 L315 57 L360 73 L405 48 L450 63 L495 42 L540 54 L585 30 L640 39" fill="none" stroke="#d98237" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x"><span>12 AM</span><span>4 AM</span><span>8 AM</span><span>12 PM</span><span>4 PM</span><span>8 PM</span></div></div><div className="chart-footnote"><span><i className="legend-dot"/> Average response time</span><span>Illustrative demo data</span></div></article>
          <article className="content-card incidents-card"><div className="section-heading"><div><h2>Recent activity</h2><p>Latest monitor events.</p></div><button className="text-button" onClick={()=>setActiveNav('Incidents')}>View all →</button></div><div className="activity-list"><div className="activity-item"><span className="activity-icon success"><Icon name="check"/></span><div><b>ENJ0Y Portfolio is operational</b><small>HTTP 200 · 146 ms</small></div><time>4m ago</time></div><div className="activity-item"><span className="activity-icon danger"><Icon name="alert"/></span><div><b>Example staging API is down</b><small>Connection timed out</small></div><time>8m ago</time></div><div className="activity-item"><span className="activity-icon success"><Icon name="check"/></span><div><b>RetailOS API check passed</b><small>HTTP 200 · 284 ms</small></div><time>2m ago</time></div></div></article></section>
        <footer className="page-footer"><span>© 2026 APIMON <span>·</span> Built to keep you in the loop.</span><span>Prototype v0.1 <span>·</span> <a href="https://github.com/ENJ0Y-Labs/uptime-monitor" target="_blank" rel="noreferrer">GitHub <Icon name="external"/></a></span></footer>
      </div>
    </main>
    {modalOpen && <AddMonitorModal onClose={()=>setModalOpen(false)} onAdd={addMonitor}/>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}