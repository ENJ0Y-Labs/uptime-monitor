import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { buildResponseTimeChart, fetchDashboardSnapshot, readCheckHistoryResponse, readMonitorResponse } from './dashboard-data.js';
import { validateMonitor } from './monitor-validation.js';

const INTERVALS = [1, 5, 10, 20, 30];
const TIMEOUTS = [5, 10, 15, 30];
const API_CONFIGURED = Boolean(import.meta.env?.VITE_APIMON_API_BASE_URL || import.meta.env?.DEV);

function Icon({ name }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>, edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></>, pause: <path d="M8 5v14M16 5v14"/>,
    play: <path d="m7 4 13 8-13 8V4Z"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>, alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-7"/></>, history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function formatLatency(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) + ' ms' : '—';
}
function StatusBadge({ monitor, latest }) {
  if (!monitor.enabled) return <span className="status-badge paused-badge"><i/>Paused</span>;
  if (!latest) return <span className="status-badge pending-badge"><i/>Unknown</span>;
  return latest.status === 'UP'
    ? <span className="status-badge up-badge"><i/>Operational</span>
    : <span className="status-badge down-badge"><i/>Down</span>;
}

function MonitorModal({ monitor, onClose, onSave }) {
  const [name, setName] = useState(monitor?.name ?? '');
  const [url, setUrl] = useState(monitor?.url ?? '');
  const [interval, setInterval] = useState(String(monitor?.intervalMinutes ?? 10));
  const [timeout, setTimeoutValue] = useState(String(monitor?.timeoutSeconds ?? 10));
  const [expectedStatus, setExpectedStatus] = useState(String(monitor?.expectedStatus ?? 200));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const values = { name, url, intervalMinutes: Number(interval), timeoutSeconds: Number(timeout), expectedStatus: Number(expectedStatus) };
    const validation = validateMonitor(values);
    if (!validation.valid) return setError(validation.message);
    setSaving(true);
    setError('');
    try {
      await onSave({ ...values, url: new URL(url.trim()).toString() });
    } catch (saveError) {
      setError(saveError.message || 'Could not save this monitor.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><span className="eyebrow">{monitor ? 'EDIT CONFIGURATION' : 'NEW MONITOR'}</span><h2 id="modal-title">{monitor ? 'Edit monitor' : 'Add a monitor'}</h2><p>Changes are saved to APIMON's monitoring database.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form onSubmit={submit}>
        <label>Monitor name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. RetailOS Backend" maxLength="80" required/></label>
        <label>Target URL<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://api.example.com/health" inputMode="url" required/></label>
        <div className="form-grid"><label>Check interval<select value={interval} onChange={event => setInterval(event.target.value)}>{INTERVALS.map(value => <option key={value} value={value}>Every {value} minutes</option>)}</select></label><label>Timeout<select value={timeout} onChange={event => setTimeoutValue(event.target.value)}>{TIMEOUTS.map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label></div>
        <label>Expected HTTP status<input type="number" min="100" max="599" step="1" value={expectedStatus} onChange={event => setExpectedStatus(event.target.value)} required/></label>
        <div className="form-note"><Icon name="clock"/> Scheduled checks run independently. Saving this form does not trigger a manual check.</div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}><Icon name="check"/>{saving ? 'Saving…' : monitor ? 'Save changes' : 'Add monitor'}</button></div>
      </form>
    </section>
  </div>;
}

function ResponseTimeChart({ results }) {
  const { points, line } = buildResponseTimeChart(results);
  if (!points.length) return <div className="chart-empty"><Icon name="chart"/><b>No response-time data yet</b><span>The chart appears after APIMON records checks with measurable response times.</span></div>;
  return <div className="response-chart-wrap"><div className="chart-summary"><span>Latest recorded response time</span><b>{formatLatency(points[points.length - 1].responseTimeMs)}</b></div>
    <svg className="response-chart" viewBox="0 0 600 155" role="img" aria-label="Response time line chart from persisted check results">
      {[28, 80, 132].map(y => <line key={y} x1="18" y1={y} x2="582" y2={y} className="chart-grid-line"/>)}
      {points.length > 1 && <polyline points={line} className="response-line"/>}
      {points.map((point, index) => <circle key={point.id || index} cx={point.x} cy={point.y} r="4" className="response-point"><title>{formatDate(point.checkedAt) + ' · ' + formatLatency(point.responseTimeMs)}</title></circle>)}
    </svg><div className="chart-axis-labels"><span>{formatDate(points[0].checkedAt)}</span><span>{formatDate(points[points.length - 1].checkedAt)}</span></div>
  </div>;
}

function HistoryModal({ monitor, results, loading, error, onRetry, onClose }) {
  const chronologicalResults = [...results].sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt));
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="modal-head"><div><span className="eyebrow">MONITOR HISTORY</span><h2 id="history-title">{monitor.name}</h2><p>{monitor.url}</p></div><button className="icon-button" onClick={onClose} aria-label="Close history"><Icon name="close"/></button></div>
      {error && <div className="api-banner error-banner" role="alert"><span>{error}</span><button onClick={onRetry} disabled={loading}>Retry</button></div>}
      {loading && <p role="status">Loading check history…</p>}
      <section className="history-chart-section"><div className="history-section-title"><h3>Response time</h3><span>Persisted check results only</span></div><ResponseTimeChart results={results}/></section>
      <section className="history-results"><div className="history-section-title"><h3>Recent checks</h3><span>{results.length} records</span></div>
        {chronologicalResults.length ? <div className="history-table-wrap"><table><thead><tr><th>RESULT</th><th>CHECKED AT</th><th>HTTP</th><th>RESPONSE</th><th>DETAIL</th></tr></thead><tbody>
          {chronologicalResults.map(item => <tr key={item.id}><td><span className={'status-badge ' + (item.status === 'UP' ? 'up-badge' : 'down-badge')}><i/>{item.status}</span></td><td>{formatDate(item.checkedAt)}</td><td>{item.httpStatusCode ?? '—'}</td><td>{formatLatency(item.responseTimeMs)}</td><td>{item.errorMessage || '—'}</td></tr>)}
        </tbody></table></div> : !loading && <div className="history-no-results">No checks have been recorded for this monitor yet.</div>}
      </section><div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

export default function App() {
  const [monitors, setMonitors] = useState([]);
  const [checkData, setCheckData] = useState({});
  const [modalMonitor, setModalMonitor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyMonitor, setHistoryMonitor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!API_CONFIGURED) { setLoading(false); return false; }
    if (!silent) setRefreshing(true);
    try {
      const snapshot = await fetchDashboardSnapshot(api);
      setMonitors(snapshot.monitors);
      setCheckData(snapshot.checkData);
      setLastSyncedAt(new Date());
      setError('');
      return true;
    } catch (refreshError) {
      setError(refreshError.message || 'Could not load APIMON data.');
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh({ silent: true }), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const latestFor = monitor => checkData[monitor.id]?.[0] ?? null;
  const counts = useMemo(() => ({
    total: monitors.length,
    active: monitors.filter(item => item.enabled).length,
    paused: monitors.filter(item => !item.enabled).length,
    up: monitors.filter(item => item.enabled && latestFor(item)?.status === 'UP').length,
    down: monitors.filter(item => item.enabled && latestFor(item)?.status === 'DOWN').length,
    unknown: monitors.filter(item => item.enabled && !latestFor(item)).length
  }), [monitors, checkData]);
  const visible = monitors.filter(item => {
    const matches = (item.name + ' ' + item.url).toLowerCase().includes(query.toLowerCase());
    return matches && (filter === 'all' || (filter === 'active' && item.enabled) || (filter === 'paused' && !item.enabled));
  });

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  }
  async function loadHistory(monitor) {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const results = readCheckHistoryResponse(await api.getChecks(monitor.id, 50));
      setCheckData(current => ({ ...current, [monitor.id]: results }));
    } catch (historyError) {
      setHistoryError(historyError.message || 'Could not load check history.');
    } finally {
      setHistoryLoading(false);
    }
  }
  function openHistory(monitor) {
    setHistoryMonitor(monitor);
    setHistoryError('');
    loadHistory(monitor);
  }
  async function saveMonitor(values) {
    const editing = Boolean(modalMonitor);
    const savedMonitor = readMonitorResponse(editing
      ? await api.updateMonitor(modalMonitor.id, values)
      : await api.createMonitor(values));
    setMonitors(current => editing
      ? current.map(monitor => monitor.id === savedMonitor.id ? savedMonitor : monitor)
      : [savedMonitor, ...current]);
    setModalOpen(false);
    setModalMonitor(null);
    await refresh({ silent: true });
    notify(editing ? 'Monitor configuration saved.' : 'Monitor created.');
  }
  async function runAction(monitor, action, message) {
    setBusyId(monitor.id);
    setError('');
    try {
      const result = await action(monitor.id);
      if (action === api.deleteMonitor) {
        setMonitors(current => current.filter(item => item.id !== monitor.id));
        setCheckData(current => {
          const next = { ...current };
          delete next[monitor.id];
          return next;
        });
        if (historyMonitor?.id === monitor.id) setHistoryMonitor(null);
      } else {
        const updatedMonitor = readMonitorResponse(result);
        setMonitors(current => current.map(item => item.id === updatedMonitor.id ? updatedMonitor : item));
      }
      await refresh({ silent: true });
      notify(message);
    } catch (actionError) {
      setError(actionError.message || 'The monitor action failed.');
    } finally {
      setBusyId('');
    }
  }
  async function deleteMonitor(monitor) {
    if (!window.confirm('Delete ' + monitor.name + '? Its stored check history will also be deleted.')) return;
    await runAction(monitor, api.deleteMonitor, 'Monitor deleted.');
  }
  function openCreateModal() { setModalMonitor(null); setModalOpen(true); }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="APIMON home"><span className="brand-mark">A</span><span>APIMON<span className="brand-dot">.</span><small>STATUS, WITHOUT GUESSWORK.</small></span></a>
      <div className="workspace-label">WORKSPACE</div><div className="workspace-switch"><span className="workspace-avatar">A</span><span><b>APIMON Workspace</b><small>Cloudflare Access protected</small></span></div>
      <div className="nav-label">MONITORING</div><nav className="side-nav"><button className="active" type="button"><Icon name="clock"/>Monitors<span className="nav-count">{counts.total}</span></button></nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">i</span><b>Live monitoring data</b><p>Monitor settings and check history are loaded from the Worker API.</p><a href="https://github.com/ENJ0Y-Labs/uptime-monitor" target="_blank" rel="noreferrer">Project repository ↗</a></div><div className="profile-row"><div className="profile-avatar">A</div><span><b>APIMON</b><small>Protected workspace</small></span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Monitors</b></div><div className="top-actions"><span className="live-pill"><i/> WORKER API</span><div className="profile-avatar small-avatar">A</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">APIMON WORKSPACE</span><h1>Monitors</h1><p>Manage endpoints and review their real monitoring results.</p></div><div className="heading-actions"><button className="button button-outline" onClick={() => refresh()} disabled={refreshing}><Icon name="refresh"/>{refreshing ? 'Refreshing…' : 'Refresh'}</button><button className="button button-primary" onClick={openCreateModal} disabled={!API_CONFIGURED}><Icon name="plus"/> Add monitor</button></div></div>
        {error && <div className="api-banner error-banner" role="alert"><span className="demo-banner-icon">!</span><span><b>API request failed.</b> {error}</span><button onClick={() => refresh()}>Retry</button></div>}
        {!API_CONFIGURED && <div className="api-banner" role="status"><span className="demo-banner-icon">i</span><span><b>API configuration required.</b> Set VITE_APIMON_API_BASE_URL to the deployed Worker API URL and rebuild. Never put the Worker service token in browser variables.</span></div>}
        <section className="stats-grid">
          <article className="stat-card"><div className="stat-top"><span>Total monitors</span><span className="stat-icon neutral"><Icon name="clock"/></span></div><strong>{counts.total}</strong><small>Stored in APIMON D1</small></article>
          <article className="stat-card"><div className="stat-top"><span>Operational</span><span className="stat-icon green"><Icon name="check"/></span></div><strong>{counts.up}</strong><small>Latest recorded check is UP</small></article>
          <article className="stat-card"><div className="stat-top"><span>Down</span><span className="stat-icon red"><Icon name="alert"/></span></div><strong>{counts.down}</strong><small>Latest recorded check is DOWN</small></article>
          <article className="stat-card"><div className="stat-top"><span>Awaiting first check</span><span className="stat-icon neutral"><Icon name="history"/></span></div><strong>{counts.unknown}</strong><small>{counts.paused} paused · {counts.active} active</small></article>
        </section>
        <section className="content-card monitor-card">
          <div className="section-heading"><div><h2>Your monitors</h2><p>Configuration and latest persisted check result.</p></div><button className="button button-outline" onClick={openCreateModal} disabled={!API_CONFIGURED}><Icon name="plus"/> New monitor</button></div>
          <div className="table-toolbar"><div className="filter-tabs"><button className={filter === 'all' ? 'chosen' : ''} onClick={() => setFilter('all')}>All <span>{counts.total}</span></button><button className={filter === 'active' ? 'chosen' : ''} onClick={() => setFilter('active')}>Active</button><button className={filter === 'paused' ? 'chosen' : ''} onClick={() => setFilter('paused')}>Paused</button></div><label className="search-box"><Icon name="search"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search monitors..."/></label></div>
          <div className="table-wrap"><table><thead><tr><th>MONITOR</th><th>CONFIGURATION</th><th>STATUS</th><th>LAST CHECK</th><th>RESPONSE</th><th>ACTIONS</th></tr></thead><tbody>
            {loading && <tr><td colSpan="6"><div className="empty-state"><b>Loading monitors…</b><p>Connecting to the APIMON Worker API.</p></div></td></tr>}
            {!loading && visible.map(monitor => {
              const latest = latestFor(monitor);
              return <tr key={monitor.id}>
                <td><div className="monitor-name"><span className="monitor-symbol">↗</span><span><b>{monitor.name}</b><small>{monitor.url}</small></span></div></td>
                <td className="config-cell">{monitor.intervalMinutes} min · {monitor.timeoutSeconds}s · HTTP {monitor.expectedStatus}</td>
                <td><StatusBadge monitor={monitor} latest={latest}/></td><td className="last-check">{formatDate(latest?.checkedAt || monitor.lastCheckedAt)}</td><td className="latency">{formatLatency(latest?.responseTimeMs)}</td>
                <td><div className="row-actions">
                  <button title="View check history" aria-label={'View history for ' + monitor.name} onClick={() => openHistory(monitor)}><Icon name="history"/></button>
                  <button title="Edit monitor" aria-label={'Edit ' + monitor.name} onClick={() => { setModalMonitor(monitor); setModalOpen(true); }}><Icon name="edit"/></button>
                  <button title={monitor.enabled ? 'Pause monitor' : 'Resume monitor'} aria-label={(monitor.enabled ? 'Pause ' : 'Resume ') + monitor.name} disabled={busyId === monitor.id} onClick={() => runAction(monitor, monitor.enabled ? api.pauseMonitor : api.resumeMonitor, monitor.enabled ? 'Monitor paused.' : 'Monitor resumed.')}>{monitor.enabled ? <Icon name="pause"/> : <Icon name="play"/>}</button>
                  <button title="Delete monitor" aria-label={'Delete ' + monitor.name} disabled={busyId === monitor.id} onClick={() => deleteMonitor(monitor)}><Icon name="trash"/></button>
                </div></td>
              </tr>;
            })}
            {!loading && visible.length === 0 && <tr><td colSpan="6"><div className="empty-state"><span>⌕</span><b>{monitors.length ? 'No matching monitors' : !API_CONFIGURED ? 'API not configured' : error ? 'Monitor data unavailable' : 'No monitors yet'}</b><p>{monitors.length ? 'Try another search or filter.' : !API_CONFIGURED ? 'Configure the Worker API URL to load monitor data.' : error ? 'APIMON could not confirm whether monitors exist. Retry the API request.' : 'Add the RetailOS health endpoint to start monitoring it.'}</p>{monitors.length === 0 && !error && API_CONFIGURED && <button className="button button-primary" onClick={openCreateModal}><Icon name="plus"/> Add monitor</button>}</div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>Showing <b>{visible.length}</b> of <b>{monitors.length}</b> monitors</span><span>{lastSyncedAt ? 'Last synced ' + formatDate(lastSyncedAt.toISOString()) : 'Waiting for API data'} · auto-refresh every 60 seconds</span></div>
        </section>
        <footer className="page-footer"><span>© 2026 APIMON <span>·</span> Monitor your services. Know when they fail.</span><span>Live Worker data · scheduled checks run independently</span></footer>
      </div>
    </main>
    {modalOpen && <MonitorModal monitor={modalMonitor} onClose={() => { setModalOpen(false); setModalMonitor(null); }} onSave={saveMonitor}/>}
    {historyMonitor && <HistoryModal monitor={historyMonitor} results={checkData[historyMonitor.id] ?? []} loading={historyLoading} error={historyError} onRetry={() => loadHistory(historyMonitor)} onClose={() => setHistoryMonitor(null)}/>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}