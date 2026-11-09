import { useEffect, useMemo, useState } from 'react';
import { validateMonitor } from './monitor-validation.js';

const STORAGE_KEY = 'apimon-monitors-v1';
const INTERVALS = [5, 10, 20, 30];
const TIMEOUTS = [5, 10, 15, 30];

function loadMonitors() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Icon({ name }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></>,
    pause: <path d="M8 5v14M16 5v14"/>,
    play: <path d="m7 4 13 8-13 8V4Z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function MonitorModal({ monitor, onClose, onSave }) {
  const [name, setName] = useState(monitor?.name ?? '');
  const [url, setUrl] = useState(monitor?.url ?? '');
  const [interval, setInterval] = useState(String(monitor?.intervalMinutes ?? 10));
  const [timeout, setTimeoutValue] = useState(String(monitor?.timeoutSeconds ?? 10));
  const [expectedStatus, setExpectedStatus] = useState(String(monitor?.expectedStatus ?? 200));
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const values = { name, url, intervalMinutes: Number(interval), timeoutSeconds: Number(timeout), expectedStatus: Number(expectedStatus) };
    const validation = validateMonitor(values);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    onSave({
      ...values,
      url: new URL(url.trim()).toString(),
      id: monitor?.id ?? crypto.randomUUID(),
      enabled: monitor?.enabled ?? true,
      status: 'unknown',
      createdAt: monitor?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head">
        <div><span className="eyebrow">{monitor ? 'EDIT CONFIGURATION' : 'NEW MONITOR'}</span><h2 id="modal-title">{monitor ? 'Edit monitor' : 'Add a monitor'}</h2><p>Configure the endpoint APIMON should monitor.</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button>
      </div>
      <form onSubmit={submit}>
        <label>Monitor name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. RetailOS Backend" maxLength="80" /></label>
        <label>Target URL<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://api.example.com/health" inputMode="url" /></label>
        <div className="form-grid">
          <label>Check interval<select value={interval} onChange={event => setInterval(event.target.value)}>{INTERVALS.map(value => <option key={value} value={value}>Every {value} minutes</option>)}</select></label>
          <label>Timeout<select value={timeout} onChange={event => setTimeoutValue(event.target.value)}>{TIMEOUTS.map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
        </div>
        <label>Expected HTTP status<input type="number" min="100" max="599" step="1" value={expectedStatus} onChange={event => setExpectedStatus(event.target.value)} /></label>
        <div className="form-note"><Icon name="clock"/> APIMON will use HTTP GET. A monitor stays Unknown until a real check is connected.</div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Icon name="check"/>{monitor ? 'Save changes' : 'Add monitor'}</button></div>
      </form>
    </section>
  </div>;
}

export default function App() {
  const [monitors, setMonitors] = useState(loadMonitors);
  const [modalMonitor, setModalMonitor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(monitors)); }, [monitors]);

  const counts = useMemo(() => ({
    total: monitors.length,
    active: monitors.filter(monitor => monitor.enabled).length,
    paused: monitors.filter(monitor => !monitor.enabled).length,
    unchecked: monitors.filter(monitor => monitor.status === 'unknown').length
  }), [monitors]);

  const visible = monitors.filter(monitor => {
    const matchesQuery = (monitor.name + ' ' + monitor.url).toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'active' && monitor.enabled) || (filter === 'paused' && !monitor.enabled);
    return matchesQuery && matchesFilter;
  });

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  }

  function saveMonitor(value) {
    const isEditing = monitors.some(item => item.id === value.id);
    setMonitors(current => isEditing
      ? current.map(item => item.id === value.id ? { ...item, ...value } : item)
      : [value, ...current]);
    setModalOpen(false);
    setModalMonitor(null);
    notify(isEditing ? 'Monitor configuration updated.' : 'Monitor added.');
  }

  function editMonitor(monitor) {
    setModalMonitor(monitor);
    setModalOpen(true);
  }

  function toggleMonitor(id) {
    setMonitors(current => current.map(monitor => monitor.id === id ? { ...monitor, enabled: !monitor.enabled, updatedAt: new Date().toISOString() } : monitor));
    notify('Monitor state updated.');
  }

  function deleteMonitor(id) {
    const monitor = monitors.find(item => item.id === id);
    if (!monitor || !window.confirm('Delete this monitor? Its local configuration will be removed from this browser.')) return;
    setMonitors(current => current.filter(item => item.id !== id));
    notify('Monitor deleted.');
  }

  function openCreateModal() {
    setModalMonitor(null);
    setModalOpen(true);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="APIMON home"><span className="brand-mark">A</span><span>APIMON<span className="brand-dot">.</span><small>STATUS, WITHOUT GUESSWORK.</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><span className="workspace-avatar">E</span><span><b>ENJ0Y Workspace</b><small>Local prototype</small></span></div>
      <div className="nav-label">MONITORING</div>
      <nav className="side-nav"><button className="active" type="button"><Icon name="clock"/>Monitors<span className="nav-count">{counts.total}</span></button></nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">i</span><b>Prototype mode</b><p>Monitor settings are stored in this browser. Scheduled checks are not connected.</p><a href="https://github.com/ENJ0Y-Labs/uptime-monitor" target="_blank" rel="noreferrer">Project repository ↗</a></div><div className="profile-row"><div className="profile-avatar">E</div><span><b>ENJ0Y</b><small>Local workspace</small></span></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Monitors</b></div><div className="top-actions"><span className="demo-pill"><i/> CONFIGURATION PROTOTYPE</span><div className="profile-avatar small-avatar">E</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">APIMON WORKSPACE</span><h1>Monitors</h1><p>Configure the URLs you want APIMON to check.</p></div><button className="button button-primary" onClick={openCreateModal}><Icon name="plus"/> Add monitor</button></div>
        <div className="demo-banner"><span className="demo-banner-icon">i</span><span><b>Configuration prototype only.</b> This page saves settings in this browser. It does not send requests, run schedules, or report live service status.</span></div>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Total monitors</span><span className="stat-icon neutral"><Icon name="clock"/></span></div><strong>{counts.total}</strong><small>Saved in this browser</small></article>
          <article className="stat-card"><div className="stat-top"><span>Active</span><span className="stat-icon green"><Icon name="check"/></span></div><strong>{counts.active}</strong><small>Configured to be monitored later</small></article>
          <article className="stat-card"><div className="stat-top"><span>Paused</span><span className="stat-icon neutral"><Icon name="pause"/></span></div><strong>{counts.paused}</strong><small>Monitoring disabled in configuration</small></article>
          <article className="stat-card"><div className="stat-top"><span>Awaiting first check</span><span className="stat-icon neutral"><Icon name="alert"/></span></div><strong>{counts.unchecked}</strong><small>No live result is available</small></article>
        </section>

        <section className="content-card monitor-card">
          <div className="section-heading"><div><h2>Your monitors</h2><p>Monitor configuration and current check state.</p></div><button className="button button-outline" onClick={openCreateModal}><Icon name="plus"/> New monitor</button></div>
          <div className="table-toolbar"><div className="filter-tabs"><button className={filter === 'all' ? 'chosen' : ''} onClick={() => setFilter('all')}>All <span>{counts.total}</span></button><button className={filter === 'active' ? 'chosen' : ''} onClick={() => setFilter('active')}>Active</button><button className={filter === 'paused' ? 'chosen' : ''} onClick={() => setFilter('paused')}>Paused</button></div><label className="search-box"><Icon name="search"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search monitors..." /></label></div>
          <div className="table-wrap"><table><thead><tr><th>MONITOR</th><th>CONFIGURATION</th><th>STATUS</th><th>LAST CHECK</th><th>ACTIONS</th></tr></thead><tbody>
            {visible.map(monitor => <tr key={monitor.id}>
              <td><div className="monitor-name"><span className="monitor-symbol">↗</span><span><b>{monitor.name}</b><small>{monitor.url}</small></span></div></td>
              <td className="config-cell">{monitor.intervalMinutes} min · {monitor.timeoutSeconds}s timeout · HTTP {monitor.expectedStatus}</td>
              <td>{monitor.enabled ? <span className="status-badge pending-badge"><i/>Unknown</span> : <span className="status-badge paused-badge"><i/>Paused</span>}</td>
              <td className="last-check">—</td>
              <td><div className="row-actions"><button title="Edit monitor" aria-label={'Edit ' + monitor.name} onClick={() => editMonitor(monitor)}><Icon name="edit"/></button><button title={monitor.enabled ? 'Pause monitor' : 'Resume monitor'} aria-label={monitor.enabled ? 'Pause ' + monitor.name : 'Resume ' + monitor.name} onClick={() => toggleMonitor(monitor.id)}>{monitor.enabled ? <Icon name="pause"/> : <Icon name="play"/>}</button><button title="Delete monitor" aria-label={'Delete ' + monitor.name} onClick={() => deleteMonitor(monitor.id)}><Icon name="trash"/></button></div></td>
            </tr>)}
            {visible.length === 0 && <tr><td colSpan="5"><div className="empty-state"><span>⌕</span><b>{monitors.length ? 'No matching monitors' : 'No monitors yet'}</b><p>{monitors.length ? 'Try another search or filter.' : 'Add your RetailOS health endpoint to begin configuring APIMON.'}</p>{monitors.length === 0 && <button className="button button-primary" onClick={openCreateModal}><Icon name="plus"/> Add monitor</button>}</div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>Showing <b>{visible.length}</b> of <b>{monitors.length}</b> monitors</span><span>Results will appear after monitoring is implemented.</span></div>
        </section>
        <footer className="page-footer"><span>© 2026 APIMON <span>·</span> Monitor your services. Know when they fail.</span><span>Phase 2 · Frontend configuration</span></footer>
      </div>
    </main>
    {modalOpen && <MonitorModal monitor={modalMonitor} onClose={() => { setModalOpen(false); setModalMonitor(null); }} onSave={saveMonitor}/>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
