import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setApiToken } from './api.js';
import { buildResponseTimeChart, fetchDashboardSnapshot, readCheckHistoryResponse, readMonitorResponse } from './dashboard-data.js';
import { validateMonitor } from './monitor-validation.js';

const INTERVALS = [1, 5, 10, 20, 30];
const TIMEOUTS = [5, 10, 15, 30];
const API_CONFIGURED = Boolean(import.meta.env?.VITE_APIMON_API_BASE_URL || import.meta.env?.DEV);

function Icon({ name }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>, sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>, moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>, eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>, eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.7 14.7 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/></>, lock: <><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v5m0-8h.01"/></>, edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
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


function useDialogAccessibility(dialogRef, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previous = document.activeElement;
    const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog.querySelectorAll(selector)).filter(element => !element.hasAttribute('hidden'));
    (focusables()[0] || dialog).focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
    dialog.addEventListener('keydown', handleKeyDown);
    return () => { dialog.removeEventListener('keydown', handleKeyDown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
}

function MonitorModal({ monitor, onClose, onSave }) {
  const [name, setName] = useState(monitor?.name ?? '');
  const [url, setUrl] = useState(monitor?.url ?? '');
  const [interval, setInterval] = useState(String(monitor?.intervalMinutes ?? 10));
  const [timeout, setTimeoutValue] = useState(String(monitor?.timeoutSeconds ?? 10));
  const [expectedStatus, setExpectedStatus] = useState(String(monitor?.expectedStatus ?? 200));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  useDialogAccessibility(dialogRef, onClose);

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
    <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex="-1">
      <div className="modal-head"><div><span className="eyebrow">{monitor ? 'EDIT CONFIGURATION' : 'NEW MONITOR'}</span><h2 id="modal-title">{monitor ? 'Edit monitor' : 'Add a monitor'}</h2><p>Changes are saved to APIMON's monitoring database.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form onSubmit={submit}>
        <label>Monitor name<input id="monitor-name" name="name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. RetailOS Backend" maxLength="80" required/></label>
        <label>Target URL<input id="monitor-url" name="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://api.example.com/health" inputMode="url" required/></label>
        <div className="form-grid"><label>Check interval<select id="monitor-interval" name="intervalMinutes" value={interval} onChange={event => setInterval(event.target.value)}>{INTERVALS.map(value => <option key={value} value={value}>Every {value} minutes</option>)}</select></label><label>Timeout<select id="monitor-timeout" name="timeoutSeconds" value={timeout} onChange={event => setTimeoutValue(event.target.value)}>{TIMEOUTS.map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label></div>
        <label>Expected HTTP status<input id="monitor-expected-status" name="expectedStatus" type="number" min="100" max="599" step="1" value={expectedStatus} onChange={event => setExpectedStatus(event.target.value)} required/></label>
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


function HistoryModal({ monitor, results, loading, error, onRetry, onClose, onEdit, onToggle, onDelete, busyId }) {
  const dialogRef = useRef(null);
  useDialogAccessibility(dialogRef, onClose);
  const chronologicalResults = [...results].sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt));
  const latest = results[0] ?? null;
  return <div className="modal-backdrop monitor-details-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="monitor-frame-animate monitor-frame">
      <section ref={dialogRef} className="monitor-inner-screen" role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex="-1">
        <div className="screen-scanlines" aria-hidden="true"/>
        <div className="monitor-screen-content">
          <header className="details-header"><div className="details-identity"><span className="details-symbol" aria-hidden="true">↗</span><div className="details-heading-copy">
            <div className="details-title-line"><h2 id="history-title">{monitor.name}</h2><span className="method-badge">HTTP</span><StatusBadge monitor={monitor} latest={latest}/></div>
            <a className="details-url" href={monitor.url} target="_blank" rel="noreferrer">{monitor.url}</a>
          </div></div><button className="icon-button details-close" onClick={onClose} aria-label="Close monitor details"><Icon name="close"/></button></header>
          <section className="details-metrics" aria-label="Monitor configuration and latest result">
            <article className="details-metric"><span>Check interval</span><strong>{monitor.intervalMinutes} min</strong></article>
            <article className="details-metric"><span>Timeout</span><strong>{monitor.timeoutSeconds}s</strong></article>
            <article className="details-metric"><span>Expected status</span><strong>HTTP {monitor.expectedStatus}</strong></article>
            <article className="details-metric"><span>Latest response</span><strong>{formatLatency(latest?.responseTimeMs)}</strong><small>{latest ? formatDate(latest.checkedAt) : 'No check recorded'}</small></article>
          </section>
          <section className="history-chart-section details-history-section">
            <div className="history-section-title"><h3><Icon name="history"/> Recent check history</h3><span>Persisted check results only</span></div>
            {error && <div className="api-banner error-banner" role="alert"><span>{error}</span><button onClick={onRetry} disabled={loading}>Retry</button></div>}
            {loading && <p className="details-loading" role="status">Loading check history…</p>}
            <ResponseTimeChart results={results}/>
          </section>
          <section className="history-results details-results"><div className="history-section-title"><h3>Recent checks</h3><span>{results.length} records</span></div>
            {chronologicalResults.length ? <div className="history-table-wrap"><table><thead><tr><th>RESULT</th><th>CHECKED AT</th><th>HTTP</th><th>RESPONSE</th><th>DETAIL</th></tr></thead><tbody>
              {chronologicalResults.map(item => <tr key={item.id}><td><span className={'status-badge ' + (item.status === 'UP' ? 'up-badge' : 'down-badge')}><i/>{item.status}</span></td><td>{formatDate(item.checkedAt)}</td><td>{item.httpStatusCode ?? '—'}</td><td>{formatLatency(item.responseTimeMs)}</td><td>{item.errorMessage || '—'}</td></tr>)}
            </tbody></table></div> : !loading && <div className="history-no-results">No checks have been recorded for this monitor yet.</div>}
          </section>
          <footer className="details-actions"><div className="details-action-group">
            <button className="button button-outline" onClick={onEdit}><Icon name="edit"/> Edit monitor</button>
            <button className="button button-outline" disabled={busyId === monitor.id} onClick={onToggle}><Icon name={monitor.enabled ? 'pause' : 'play'}/>{monitor.enabled ? 'Pause' : 'Resume'}</button>
            <button className="button button-danger-quiet" disabled={busyId === monitor.id} onClick={onDelete}><Icon name="trash"/> Delete</button>
          </div><button className="button button-primary" onClick={onClose}>Close</button></footer>
        </div>
      </section>
      <div className="monitor-chin" aria-hidden="true"><span>APIMON</span><i/></div><div className="monitor-stand" aria-hidden="true"><span/></div>
    </div>
  </div>;
}

function DeleteDialog({ monitor, onCancel, onConfirm, busy }) {
  const dialogRef = useRef(null);
  useDialogAccessibility(dialogRef, onCancel);
  if (!monitor) return null;
  return <div className="modal-backdrop delete-backdrop" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
    <section ref={dialogRef} className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" tabIndex="-1">
      <div className="delete-dialog-icon"><Icon name="alert"/></div>
      <div className="delete-dialog-copy"><span className="eyebrow">PERMANENT ACTION</span><h2 id="delete-title">Delete monitor?</h2><p id="delete-description">Delete <strong>{monitor.name}</strong>? Its stored check history will also be deleted. This action cannot be undone.</p></div>
      <div className="modal-actions"><button className="button button-quiet" onClick={onCancel} disabled={busy}>Cancel</button><button className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete monitor'}</button></div>
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
  const [authenticated, setAuthenticated] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('apimon_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
    catch { return 'dark'; }
  });
  const savedTrigger = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('apimon_theme', theme); } catch { /* Theme preference is optional. */ }
    document.documentElement.dataset.theme = theme;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute('content', theme === 'dark' ? '#0b1326' : '#f8fafc');
  }, [theme]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.activeElement;
    const closeOnEscape = event => { if (event.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    document.body.classList.add('drawer-open');
    document.querySelector('.sidebar a, .sidebar button')?.focus();
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.classList.remove('drawer-open'); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [drawerOpen]);

  useEffect(() => {
    if (busyId || !savedTrigger.current) return;
    const trigger = savedTrigger.current;
    savedTrigger.current = null;
    const target = Array.from(document.querySelectorAll('[data-trigger]')).find(element => element.dataset.trigger === trigger);
    target?.focus();
  }, [busyId, monitors]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!authenticated) return false;
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
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return undefined;
    refresh();
    const timer = window.setInterval(() => refresh({ silent: true }), 60000);
    return () => window.clearInterval(timer);
  }, [authenticated, refresh]);

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
  async function deleteMonitor(monitor) { setDeleteTarget(monitor); }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await runAction(target, api.deleteMonitor, 'Monitor deleted.');
  }
  function openCreateModal() { setModalMonitor(null); setModalOpen(true); }

  async function authenticate(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setApiToken(tokenInput);
    try {
      const snapshot = await fetchDashboardSnapshot(api);
      setMonitors(snapshot.monitors);
      setCheckData(snapshot.checkData);
      setLastSyncedAt(new Date());
      setAuthenticated(true);
      setTokenInput('');
    } catch (authFailure) {
      setApiToken('');
      setAuthError(authFailure.message || 'APIMON could not verify this API token.');
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    setApiToken('');
    setAuthenticated(false);
    setMonitors([]);
    setCheckData({});
    setError('');
    setAuthError('');
    setLastSyncedAt(null);
  }

  if (!API_CONFIGURED) {
    return <main className="auth-screen" data-theme={theme}><section className="auth-card"><span className="brand-mark">A</span><span className="eyebrow">APIMON SETUP</span><h1>API configuration required</h1><p>Set VITE_APIMON_API_BASE_URL to the deployed Worker API origin and rebuild the dashboard.</p></section></main>;
  }

  if (!authenticated) {
    return <main className="auth-screen" data-theme={theme}>
      <div className="auth-ambient" aria-hidden="true"/>
      <div className="auth-grid-pattern" aria-hidden="true"/>
      <header className="auth-header">
        <a className="auth-brand" href="#" aria-label="APIMON home"><span className="brand-mark">A</span><span>APIMON</span></a>
        <div className="auth-header-actions">
          <span className="worker-status-pill" title="Worker API status: Unknown"><i aria-hidden="true"/> Worker API · Unknown</span>
          <button className="theme-toggle-btn" type="button" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={theme === 'dark'} title="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'}/></button>
        </div>
      </header>
      <div className="auth-main">
        <div className="auth-card-container">
          <section className="auth-card" aria-labelledby="auth-heading">
            <div className="auth-card-eyebrow"><span className="eyebrow">APIMON WORKSPACE</span><span className="connection-security-badge" title="Token is kept in memory only"><Icon name="lock"/> In-Memory</span></div>
            <h1 id="auth-heading">Connect to APIMON</h1>
            <p className="auth-description">Enter the API token configured as <code>APIMON_API_TOKEN</code> on your Cloudflare Worker. The token stays in this tab's memory and is cleared when you refresh or sign out.</p>
            <form className="auth-form" onSubmit={authenticate}>
              <div className="auth-field-group">
                <div className="auth-field-header"><label htmlFor="apimon-api-token">API token</label><details className="token-hint-details"><summary className="token-hint-summary"><Icon name="info"/>Where to find</summary><div className="token-hint-content">Use the value of <code>APIMON_API_TOKEN</code> configured as a secret on your Cloudflare Worker.</div></details></div>
                <div className="token-input-wrapper">
                  <Icon name="lock"/>
                  <input id="apimon-api-token" name="api_token" type={showToken ? 'text' : 'password'} value={tokenInput} onChange={event => setTokenInput(event.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" required placeholder="Paste your APIMON API token" aria-describedby={authError ? 'token-requirements token-error' : 'token-requirements'}/>
                  <button className="toggle-visibility-btn" type="button" onClick={() => setShowToken(value => !value)} aria-label={showToken ? 'Hide API token' : 'Show API token in plain text'} title="Toggle visibility"><Icon name={showToken ? 'eyeOff' : 'eye'}/></button>
                </div>
                <span id="token-requirements" className="sr-only">Must match the secret token configured on your Cloudflare Worker.</span>
                {authError && <p id="token-error" className="token-error-alert" role="alert" aria-live="assertive">{authError}</p>}
              </div>
              <button className="button button-primary" type="submit" disabled={authLoading || !tokenInput.trim()}>{authLoading ? <><span className="auth-spinner"/>Connecting…</> : <>Connect securely <span aria-hidden="true">→</span></>}</button>
            </form>
            <small className="auth-footnote"><Icon name="lock"/>Requests use <code>Authorization: Bearer</code>. No Cloudflare Access email identity or browser cookies are required by the Worker API.</small>
          </section>
          <div className="feature-strip" aria-label="APIMON capabilities">
            <div className="feature-item"><Icon name="clock"/><span>Scheduled Monitoring</span></div>
            <div className="feature-item"><Icon name="refresh"/><span>Fast Checks</span></div>
            <div className="feature-item"><Icon name="lock"/><span>Stateless Auth</span></div>
          </div>
        </div>
      </div>
    </main>;
  }


  return <div className="app-shell" data-theme={theme}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="ambient-bg" aria-hidden="true"/><div className="grid-pattern" aria-hidden="true"/>
    {drawerOpen && <button className="drawer-backdrop" type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}/>}
    <aside className={'sidebar' + (drawerOpen ? ' sidebar-open' : '')} aria-label="APIMON navigation">
      <div className="sidebar-top"><a className="brand" href="#main-content" aria-label="APIMON home"><span className="brand-mark">A</span><span>APIMON<span className="brand-dot">.</span><small>STATUS, NO GUESSWORK.</small></span></a><button className="icon-button drawer-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
      <div className="workspace-label">WORKSPACE</div><div className="workspace-switch"><span className="workspace-avatar">A</span><span><b>APIMON Workspace</b><small>Bearer token protected</small></span></div>
      <div className="nav-label">MONITORING</div><nav className="side-nav" aria-label="Main navigation"><button className="active" type="button" aria-current="page" onClick={() => setDrawerOpen(false)}><Icon name="clock"/>Monitors<span className="nav-count">{counts.total}</span></button></nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">i</span><b>Live monitoring data</b><p>Monitor settings and check history are loaded from the Worker API.</p><a href="https://github.com/ENJ0Y-Labs/uptime-monitor" target="_blank" rel="noreferrer">Project repository ↗</a></div><div className="profile-row"><div className="profile-avatar">A</div><span><b>APIMON</b><small>Token-authenticated workspace</small></span></div></div>
    </aside>
    <main className="main-area" id="main-content" tabIndex="-1">
      <header className="topbar"><div className="topbar-leading"><button className="icon-button menu-toggle" type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}><span className="menu-glyph">☰</span></button><div className="breadcrumb">Workspace <span>/</span> <b>Monitors</b></div></div>
        <div className="top-actions"><span className="worker-status-pill" title="Worker API status: Unknown"><i aria-hidden="true"/> Worker API · Unknown</span><button className="theme-toggle-btn dashboard-theme-toggle" type="button" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={theme === 'dark'} title="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'}/></button><button className="button button-quiet sign-out-button" onClick={logout}>Sign out</button><div className="profile-avatar small-avatar">A</div></div>
      </header>
      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">APIMON WORKSPACE</span><h1>Monitors</h1><p>Manage endpoints and review their real monitoring results.</p></div><div className="heading-actions"><button className="button button-outline" onClick={() => refresh()} disabled={refreshing}><Icon name="refresh"/>{refreshing ? 'Refreshing…' : 'Refresh'}</button><button className="button button-primary" onClick={openCreateModal} disabled={!API_CONFIGURED}><Icon name="plus"/> Add monitor</button></div></div>
        {error && <div className="api-banner error-banner" role="alert"><span className="demo-banner-icon">!</span><span><b>API request failed.</b> {error}</span><button onClick={() => refresh()}>Retry</button></div>}
        {!API_CONFIGURED && <div className="api-banner" role="status"><span className="demo-banner-icon">i</span><span><b>API configuration required.</b> Set VITE_APIMON_API_BASE_URL to the deployed Worker API URL and rebuild. Enter the API token when connecting; it is not bundled into the app.</span></div>}
        <section className="stats-grid" aria-label="Monitor summary">
          <article className="stat-card"><div className="stat-top"><span>Total monitors</span><span className="stat-icon neutral"><Icon name="clock"/></span></div><strong>{counts.total}</strong><small>Stored in APIMON D1</small></article>
          <article className="stat-card"><div className="stat-top"><span>Operational</span><span className="stat-icon green"><Icon name="check"/></span></div><strong>{counts.up}</strong><small>Latest recorded check is UP</small></article>
          <article className="stat-card"><div className="stat-top"><span>Down</span><span className="stat-icon red"><Icon name="alert"/></span></div><strong>{counts.down}</strong><small>Latest recorded check is DOWN</small></article>
          <article className="stat-card"><div className="stat-top"><span>Awaiting first check</span><span className="stat-icon neutral"><Icon name="history"/></span></div><strong>{counts.unknown}</strong><small>{counts.paused} paused · {counts.active} active</small></article>
        </section>
        <section className="content-card monitor-card" aria-labelledby="monitor-list-title">
          <div className="section-heading"><div><h2 id="monitor-list-title">Your monitors</h2><p>Configuration and latest persisted check result.</p></div><button className="button button-outline" onClick={openCreateModal} disabled={!API_CONFIGURED}><Icon name="plus"/> New monitor</button></div>
          <div className="table-toolbar"><div className="filter-tabs" role="group" aria-label="Filter monitors"><button type="button" className={filter === 'all' ? 'chosen' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span>{counts.total}</span></button><button type="button" className={filter === 'active' ? 'chosen' : ''} aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Active <span>{counts.active}</span></button><button type="button" className={filter === 'paused' ? 'chosen' : ''} aria-pressed={filter === 'paused'} onClick={() => setFilter('paused')}>Paused <span>{counts.paused}</span></button></div><label className="search-box" htmlFor="monitor-search"><Icon name="search"/><input id="monitor-search" name="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search monitors..."/></label></div>
          <div className="table-wrap" data-state={loading ? 'loading' : error ? 'error' : 'ready'}><table className="responsive-table"><thead><tr><th scope="col">MONITOR</th><th scope="col">CONFIGURATION</th><th scope="col">STATUS</th><th scope="col">LAST CHECK</th><th scope="col">RESPONSE</th><th scope="col">ACTIONS</th></tr></thead><tbody>
            {loading && <tr className="state-loading"><td colSpan="6"><div className="empty-state"><span className="loading-spinner"/><b>Loading monitors…</b><p>Connecting to the APIMON Worker API.</p></div></td></tr>}
            {!loading && visible.map(monitor => { const latest = latestFor(monitor); return <tr key={monitor.id}>
              <td data-label="Monitor"><div className="monitor-name"><span className="monitor-symbol">↗</span><span><b>{monitor.name}</b><small>{monitor.url}</small></span></div></td>
              <td data-label="Configuration" className="config-cell"><span className="config-value">{monitor.intervalMinutes} min · {monitor.timeoutSeconds}s · HTTP {monitor.expectedStatus}</span></td>
              <td data-label="Status"><StatusBadge monitor={monitor} latest={latest}/></td><td data-label="Last check" className="last-check">{formatDate(latest?.checkedAt || monitor.lastCheckedAt)}</td><td data-label="Response" className="latency">{formatLatency(latest?.responseTimeMs)}</td>
              <td data-label="Actions"><div className="row-actions">
                <button data-trigger={monitor.id + ':history'} title="View monitor details and check history" aria-label={'View details for ' + monitor.name} onClick={() => openHistory(monitor)} className="btn-open-details"><Icon name="history"/></button>
                <button data-trigger={monitor.id + ':edit'} title="Edit monitor" aria-label={'Edit ' + monitor.name} onClick={() => { setModalMonitor(monitor); setModalOpen(true); }}><Icon name="edit"/></button>
                <button data-trigger={monitor.id + ':toggle'} title={monitor.enabled ? 'Pause monitor' : 'Resume monitor'} aria-label={(monitor.enabled ? 'Pause ' : 'Resume ') + monitor.name} disabled={busyId === monitor.id} onClick={() => { savedTrigger.current = monitor.id + ':toggle'; runAction(monitor, monitor.enabled ? api.pauseMonitor : api.resumeMonitor, monitor.enabled ? 'Monitor paused.' : 'Monitor resumed.'); }}>{monitor.enabled ? <Icon name="pause"/> : <Icon name="play"/>}</button>
                <button data-trigger={monitor.id + ':delete'} title="Delete monitor" aria-label={'Delete ' + monitor.name} disabled={busyId === monitor.id} onClick={() => deleteMonitor(monitor)}><Icon name="trash"/></button>
              </div></td>
            </tr>; })}
            {!loading && visible.length === 0 && <tr className="state-ready"><td colSpan="6"><div className="empty-state"><span className="empty-state-icon">⌕</span><b>{monitors.length ? 'No matching monitors' : !API_CONFIGURED ? 'API not configured' : error ? 'Monitor data unavailable' : 'No monitors yet'}</b><p>{monitors.length ? 'Try another search or filter.' : !API_CONFIGURED ? 'Configure the Worker API URL to load monitor data.' : error ? 'APIMON could not confirm whether monitors exist. Retry the API request.' : 'Add a health endpoint to start monitoring it.'}</p>{monitors.length === 0 && !error && API_CONFIGURED && <button className="button button-primary" onClick={openCreateModal}><Icon name="plus"/> Add monitor</button>}</div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>Showing <b>{visible.length}</b> of <b>{monitors.length}</b> monitors</span><span>{lastSyncedAt ? 'Last synced ' + formatDate(lastSyncedAt.toISOString()) : 'Waiting for API data'} · auto-refresh every 60 seconds</span></div>
        </section>
        <footer className="page-footer"><span>© 2026 APIMON <span>·</span> Monitor your services. Know when they fail.</span><span>Live Worker data · scheduled checks run independently</span></footer>
      </div>
    </main>
    {modalOpen && <MonitorModal monitor={modalMonitor} onClose={() => { setModalOpen(false); setModalMonitor(null); }} onSave={saveMonitor}/>}
    {historyMonitor && <HistoryModal monitor={historyMonitor} results={checkData[historyMonitor.id] ?? []} loading={historyLoading} error={historyError} onRetry={() => loadHistory(historyMonitor)} onClose={() => setHistoryMonitor(null)} onEdit={() => { const selected = historyMonitor; setHistoryMonitor(null); setModalMonitor(selected); setModalOpen(true); }} onToggle={() => runAction(historyMonitor, historyMonitor.enabled ? api.pauseMonitor : api.resumeMonitor, historyMonitor.enabled ? 'Monitor paused.' : 'Monitor resumed.')} onDelete={() => { setHistoryMonitor(null); deleteMonitor(historyMonitor); }} busyId={busyId}/>}
    <DeleteDialog monitor={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} busy={Boolean(deleteTarget && busyId === deleteTarget.id)}/>
    {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check"/>{toast}</div>}
  </div>;
}
