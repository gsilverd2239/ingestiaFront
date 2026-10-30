'use client';

import { useState, useEffect, useRef } from 'react';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:9015/api`;
  }
  return 'http://localhost:9015/api';
};
const API_BASE = getApiBase();

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('all');
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [alert, setAlert] = useState(null);

  // PostgreSQL Config Data
  const [dbTables, setDbTables] = useState({
    instances: [],
    dbsapList: [],
    empresas: [],
    templateEmpresas: [],
    templateSLList: []
  });
  const [activeDbTab, setActiveDbTab] = useState('instances');

  // Modal State for CRUD
  const [modalState, setModalState] = useState({
    isOpen: false,
    table: 'instances', // instances | dbsap | empresa | templateEmpresa | templateSL
    isEdit: false,
    data: {}
  });

  // Connectivity test results
  const [testResults, setTestResults] = useState({
    pg: null,
    hana: null,
    serviceLayer: null,
    ingestion: null
  });

  // Playground state
  const [simCardCode, setSimCardCode] = useState('CC0102868');
  const [simAction, setSimAction] = useState('U');
  const [simObjectType, setSimObjectType] = useState('2');
  const [simSendToIngest, setSimSendToIngest] = useState(true);
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // New Event Form State
  const [newEvent, setNewEvent] = useState({
    objectType: '2',
    entryKey: 'CC0102868',
    action: 'U'
  });
  const [showNewEventModal, setShowNewEventModal] = useState(false);

  const logsEndRef = useRef(null);

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  // Fetch Status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Backend not responding yet:', err.message);
    }
  };

  // Fetch PostgreSQL All Config Tables
  const fetchDbTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/db/all`);
      if (res.ok) {
        const data = await res.json();
        setDbTables({
          instances: data.instances || [],
          dbsapList: data.dbsapList || [],
          empresas: data.empresas || [],
          templateEmpresas: data.templateEmpresas || [],
          templateSLList: data.templateSLList || []
        });
      }
    } catch (err) {
      console.warn('Backend no disponible para db/all:', err.message);
    }
  };

  // Fetch Events
  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/events?limit=50&filter=${eventFilter}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.warn('Backend no disponible para events:', err.message);
    }
  };

  // Fetch Recent Executions
  const fetchExecutions = async () => {
    try {
      const res = await fetch(`${API_BASE}/recent-executions?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setRecentExecutions(data.records || []);
      }
    } catch (err) {
      console.warn('Backend no disponible para recent-executions:', err.message);
    }
  };

  // Fetch Logs
  const fetchLogs = async () => {
    try {
      const levelQuery = logFilter === 'all' ? '' : `&level=${logFilter}`;
      const res = await fetch(`${API_BASE}/logs?limit=150${levelQuery}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Backend no disponible para logs:', err.message);
    }
  };

  // Initial load & Polling loop
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchDbTables(), fetchEvents(), fetchExecutions(), fetchLogs()]);
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetchStatus();
      if (activeTab === 'dashboard') fetchExecutions();
      if (activeTab === 'events') fetchEvents();
      if (activeTab === 'logs') fetchLogs();
    }, 4000);

    return () => clearInterval(interval);
  }, [activeTab, eventFilter, logFilter]);

  // Engine Start/Stop
  const handleToggleEngine = async () => {
    if (!status) return;
    const isRunning = status.engine?.isRunning;
    const endpoint = isRunning ? 'stop' : 'start';
    setActionLoading(prev => ({ ...prev, engine: true }));
    try {
      const res = await fetch(`${API_BASE}/engine/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert(data.message, 'success');
        fetchStatus();
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, engine: false }));
    }
  };

  // Force Poll Now
  const handlePollNow = async () => {
    setActionLoading(prev => ({ ...prev, pollNow: true }));
    try {
      const res = await fetch(`${API_BASE}/engine/poll-now`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert('Ciclo de ingesta ejecutado exitosamente.', 'success');
        fetchStatus();
        fetchEvents();
        fetchExecutions();
      } else {
        showAlert(`Error en ciclo: ${data.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, pollNow: false }));
    }
  };

  // Connectivity tests
  const testConnectivity = async (service) => {
    setActionLoading(prev => ({ ...prev, [service]: true }));
    try {
      const res = await fetch(`${API_BASE}/test/${service}`, { method: 'POST' });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [service]: data }));
      if (data.success) {
        showAlert(data.message || `Prueba de ${service} exitosa`, 'success');
      } else {
        showAlert(`Fallo en ${service}: ${data.message || 'Error desconocido'}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error al probar ${service}: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, [service]: false }));
    }
  };

  // Reload Engine Config from PostgreSQL
  const handleReloadEngineConfig = async () => {
    setActionLoading(prev => ({ ...prev, reloadConfig: true }));
    try {
      const res = await fetch(`${API_BASE}/db/reload`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert('Configuración recargada desde PostgreSQL y aplicada al motor.', 'success');
        fetchStatus();
        fetchDbTables();
      } else {
        showAlert(`Error: ${data.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error al recargar configuración: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, reloadConfig: false }));
    }
  };

  // Open Create Modal with clean defaults per table
  const handleOpenCreateModal = (table) => {
    let initialData = {};
    if (table === 'templateSL') {
      initialData = {
        CodeInstances: 1,
        MetodoHttpt: 'GET',
        ObjectType: '4',
        ObjectDescr: 'Items',
        EndPoint: "/Items('{EntryKey}')"
      };
    } else if (table === 'templateEmpresa') {
      initialData = {
        IdEmpresa: 2,
        MetodoHttpt: 'POST',
        ObjectType: '4',
        EndPoint: '/socios-negocio/empresas/{IdEmpresa}/tbl_ocrd/',
        BodyTemplate: {}
      };
    } else if (table === 'instances') {
      initialData = { ServerName: '172.19.0.88', ServerType: 'HANA', Version: 10, ServerHanaPort: '30015', ServiceLayer: 'https://172.19.0.88:50000/b1s/v1', HanaUser: 'SYSTEM' };
    } else if (table === 'dbsap') {
      initialData = { CodeInstances: 1, IdEmpresa: 2, CompanyDB: 'FG_DESARROLLO', UserName: 'gualber', TblEventos: 'TBL_COMERCIA_EVENTS' };
    } else if (table === 'empresa') {
      initialData = { IdEmpresa: 2, URLBase: 'https://api.comercia.pro/api/v1/admin', TimeOutMS: 15000, IntervaloPollingS: 10, LoteMaximoCiclo: 25 };
    }
    setModalState({ isOpen: true, table, isEdit: false, data: initialData });
  };

  // CRUD Handler - Submit Form
  const handleSaveModal = async (e) => {
    e.preventDefault();
    const { table, isEdit, data } = modalState;
    setActionLoading(prev => ({ ...prev, modalSave: true }));

    try {
      let url = `${API_BASE}/db`;
      let method = isEdit ? 'PUT' : 'POST';

      if (table === 'instances') {
        url += isEdit ? `/instances/${data.CodeInstances}` : '/instances';
      } else if (table === 'dbsap') {
        url += '/sap';
      } else if (table === 'empresa') {
        url += isEdit ? `/empresa/${data.IdEmpresa}` : '/empresa';
      } else if (table === 'templateEmpresa') {
        url += '/template-empresa';
      } else if (table === 'templateSL') {
        url += '/template-sl';
      }

      const payload = { ...data };
      if (table === 'templateEmpresa') {
        payload.IdEmpresa = Number(payload.IdEmpresa) || 2;
        payload.MetodoHttpt = String(payload.MetodoHttpt || 'POST').toUpperCase();
        payload.ObjectType = String(payload.ObjectType || '2');
      } else if (table === 'templateSL') {
        payload.CodeInstances = Number(payload.CodeInstances) || 1;
        payload.MetodoHttpt = String(payload.MetodoHttpt || 'GET').toUpperCase();
        payload.ObjectType = String(payload.ObjectType || '2');
        payload.ObjectDescr = payload.ObjectDescr || (payload.ObjectType === '4' ? 'Items' : 'Business Partner');
        if (payload.EndPoint && payload.EndPoint.includes("('EntryKey')")) {
          payload.EndPoint = payload.EndPoint.replace("('EntryKey')", "('{EntryKey}')");
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        showAlert(`Registro ${isEdit ? 'actualizado' : 'creado'} en PostgreSQL exitosamente`, 'success');
        setModalState({ isOpen: false, table: 'instances', isEdit: false, data: {} });
        await fetchDbTables();
      } else {
        showAlert(`Error: ${result.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error al guardar: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, modalSave: false }));
    }
  };

  // CRUD Handler - Delete Record
  const handleDeleteRecord = async (table, item) => {
    if (!confirm('¿Confirma que desea eliminar este registro de la base de datos PostgreSQL?')) return;

    try {
      let url = `${API_BASE}/db`;
      if (table === 'instances') {
        url += `/instances/${item.CodeInstances}`;
      } else if (table === 'dbsap') {
        url += `/sap?codeInstances=${item.CodeInstances}&companyDb=${encodeURIComponent(item.CompanyDB)}&idEmpresa=${item.IdEmpresa}`;
      } else if (table === 'empresa') {
        url += `/empresa/${item.IdEmpresa}`;
      } else if (table === 'templateEmpresa') {
        url += `/template-empresa?idEmpresa=${item.IdEmpresa}&metodoHttpt=${encodeURIComponent(item.MetodoHttpt)}&objectType=${encodeURIComponent(item.ObjectType || '')}`;
      } else if (table === 'templateSL') {
        url += `/template-sl?codeInstances=${item.CodeInstances}&metodoHttpt=${encodeURIComponent(item.MetodoHttpt)}&objectType=${encodeURIComponent(item.ObjectType || '')}`;
      }

      const res = await fetch(url, { method: 'DELETE' });
      const result = await res.json();

      if (result.success) {
        showAlert('Registro eliminado de PostgreSQL', 'info');
        await fetchDbTables();
      } else {
        showAlert(`Error al eliminar: ${result.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error al eliminar: ${err.message}`, 'danger');
    }
  };

  // Run Playground Simulation (Supports both Action 'U' and 'A')
  const handleRunSimulation = async (e) => {
    e.preventDefault();
    if (!simCardCode) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/test/simulate-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardCode: simCardCode.trim(),
          action: simAction,
          objectType: simObjectType || '2',
          sendToIngest: simSendToIngest
        })
      });
      const data = await res.json();
      setSimResult(data);
      if (data.success) {
        showAlert(`Simulación para "${simCardCode}" (${simAction}) completada.`, 'success');
      } else {
        showAlert(`Error en simulación: ${data.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Error al ejecutar simulación: ${err.message}`, 'danger');
    } finally {
      setSimLoading(false);
    }
  };

  // Reprocess Event
  const handleReprocessEvent = async (eventId) => {
    setActionLoading(prev => ({ ...prev, [`event_${eventId}`]: true }));
    try {
      const res = await fetch(`${API_BASE}/events/${eventId}/reprocess`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert(data.message, 'success');
        fetchEvents();
        fetchStatus();
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, [`event_${eventId}`]: false }));
    }
  };

  // Create Test Event
  const handleCreateTestEvent = async (e) => {
    e.preventDefault();
    setActionLoading(prev => ({ ...prev, createEvent: true }));
    try {
      const res = await fetch(`${API_BASE}/events/create-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
      const data = await res.json();
      if (data.success) {
        showAlert(data.message, 'success');
        setShowNewEventModal(false);
        fetchEvents();
        fetchStatus();
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`, 'danger');
    } finally {
      setActionLoading(prev => ({ ...prev, createEvent: false }));
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
      setLogs([]);
      showAlert('Logs en memoria eliminados.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const isEngineRunning = status?.engine?.isRunning;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Notification Toast */}
      {alert && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          background: alert.type === 'success' ? '#065f46' : (alert.type === 'danger' ? '#881337' : '#1e3a8a'),
          color: '#ffffff',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.9rem',
          fontWeight: 500,
          animation: 'fadeIn 0.3s ease'
        }}>
          <span>{alert.type === 'success' ? '✓' : (alert.type === 'danger' ? '✕' : 'ℹ')}</span>
          <span>{alert.message}</span>
        </div>
      )}

      {/* Header */}
      <header style={{
        background: 'rgba(10, 14, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '16px 32px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16
        }}>
          {/* Logo & Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.3rem',
              color: '#fff',
              boxShadow: '0 0 20px rgba(37, 99, 235, 0.5)'
            }}>
              IA
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  ingestIA
                </h1>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                  SAP B1 &bull; PostgreSQL Config
                </span>
                {/* <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                  v1.2.0 Enterprise
                </span> */}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Configuración centralizada en PostgreSQL &bull; SAP HANA &bull; Service Layer &bull; API Ingestión
              </p>
            </div>
          </div>

          {/* Engine Controls & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Status Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)'
            }}>
              <span className={`status-dot ${isEngineRunning ? 'active' : 'paused'}`} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {isEngineRunning ? 'MOTOR ACTIVO' : 'MOTOR EN PAUSA'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                ({status?.engine?.pollIntervalSeconds || 10}s)
              </span>
            </div>

            {/* Action Buttons */}
            <button
              onClick={handleToggleEngine}
              disabled={actionLoading.engine}
              className={`btn ${isEngineRunning ? 'btn-warning' : 'btn-success'}`}
              style={{ minWidth: 110 }}
            >
              {isEngineRunning ? '⏸ Pausar' : '▶ Iniciar'}
            </button>

            {/* <button
              onClick={handlePollNow}
              disabled={actionLoading.pollNow}
              className="btn btn-primary"
              title="Disparar ciclo de sincronización inmediatamente"
            >
              ⚡ Sincronizar Ya
            </button> */}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 1400, width: '100%', margin: '0 auto', padding: '24px 32px', flex: 1 }}>
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 2
        }}>
          {[
            { id: 'dashboard', label: '📊 Dashboard & Métricas' },
            { id: 'events', label: `📋 Eventos HANA (${status?.hanaStats?.pending ?? 0} pendientes)` },
            { id: 'playground', label: '🧪 Simulador (OCRD, OITM+ITM1)' },
            { id: 'config', label: '⚙️ Configuración (PostgreSQL)' },
            { id: 'logs', label: '📜 Logs en Vivo' },
            { id: 'windows-service', label: '🖥️ Servicio Windows' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px 8px 0 0',
                background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : 'none',
                color: activeTab === tab.id ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Quick Metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 18,
              marginBottom: 24
            }}>
              <div className="metric-card" style={{ '--card-accent': 'var(--accent-cyan)' }}>
                <span className="metric-label">Eventos en HANA (Total)</span>
                <span className="metric-value">{status?.hanaStats?.total ?? 0}</span>
                <span className="metric-sub">Tabla: TBL_COMERCIA_EVENTS</span>
              </div>

              <div className="metric-card" style={{ '--card-accent': 'var(--accent-emerald)' }}>
                <span className="metric-label">Procesados Exitosamente</span>
                <span className="metric-value" style={{ color: '#34d399' }}>
                  {status?.hanaStats?.processed ?? 0}
                </span>
                <span className="metric-sub">
                  En sesión actual: {status?.engine?.stats?.totalSuccess ?? 0}
                </span>
              </div>

              <div className="metric-card" style={{ '--card-accent': 'var(--accent-amber)' }}>
                <span className="metric-label">Pendientes por Sincronizar</span>
                <span className="metric-value" style={{ color: '#fbbf24' }}>
                  {status?.hanaStats?.pending ?? 0}
                </span>
                <span className="metric-sub">
                  {status?.hanaStats?.pending > 0 ? 'Esperando siguiente ciclo' : 'Al día con SAP'}
                </span>
              </div>

              <div className="metric-card" style={{ '--card-accent': 'var(--accent-rose)' }}>
                <span className="metric-label">Fallos en Sesión</span>
                <span className="metric-value" style={{ color: '#fb7185' }}>
                  {status?.engine?.stats?.totalFailed ?? 0}
                </span>
                <span className="metric-sub">Reintentables automáticamente</span>
              </div>
            </div>

            {/* Pipeline Architecture Diagram with Diagnostics */}
            <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Flujo de Integración & Diagnósticos en Vivo</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Configuración cargada desde PostgreSQL con monitoreo de eventos en HANA y Service Layer
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => testConnectivity('pg')} className="btn btn-secondary btn-sm">
                    {actionLoading.pg ? 'Probando...' : '🐘 Test PostgreSQL'}
                  </button>
                  <button onClick={() => testConnectivity('hana')} className="btn btn-secondary btn-sm">
                    {actionLoading.hana ? 'Probando...' : '🔍 Test HANA'}
                  </button>
                  <button onClick={() => testConnectivity('servicelayer')} className="btn btn-secondary btn-sm">
                    {actionLoading.serviceLayer ? 'Probando...' : '🔍 Test Service Layer'}
                  </button>
                  <button onClick={() => testConnectivity('ingestion')} className="btn btn-secondary btn-sm">
                    {actionLoading.ingestion ? 'Probando...' : '🔍 Test Ingestión'}
                  </button>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                padding: '16px 0'
              }}>
                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>🐘</span>
                    <strong style={{ fontSize: '0.85rem' }}>PostgreSQL (Config)</strong>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Instancias, conexiones, plantillas y parámetros centralizados.
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-purple">172.19.0.232:5432</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>1️⃣</span>
                    <strong style={{ fontSize: '0.85rem' }}>SAP HANA DB</strong>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Lee <code>TBL_COMERCIA_EVENTS</code> buscando <code>Processed=0</code>.
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-info">{status?.config?.hana?.serverNode || '172.19.0.88:30015'}</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>2️⃣</span>
                    <strong style={{ fontSize: '0.85rem' }}>Service Layer GET</strong>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Para <code>ObjectType='2'</code> consulta <code>BusinessPartners('EntryKey')</code>.
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-purple">{status?.config?.sapServiceLayer?.companyDb || 'FG_DESARROLLO'}</span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>3️⃣</span>
                    <strong style={{ fontSize: '0.85rem' }}>Ingestión API</strong>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <code>POST</code> para Acción 'A' y <code>PUT</code> para Acción 'U'.
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-success">Empresa #{status?.config?.ingestion?.empresaId || 2}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Executions in Engine */}
            <div className="glass-panel" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Actividad Reciente del Motor</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Últimas operaciones procesadas por el sincronizador
                  </p>
                </div>
                <button onClick={fetchExecutions} className="btn btn-secondary btn-sm">
                  🔄 Refrescar
                </button>
              </div>

              {recentExecutions.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
                  No hay operaciones recientes registradas en esta sesión. Los eventos procesados aparecerán aquí.
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>EventID</th>
                        <th>Tipo Objeto</th>
                        <th>EntryKey</th>
                        <th>Acción / Método</th>
                        <th>Estado</th>
                        <th>Duración</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentExecutions.map((rec, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                            {new Date(rec.timestamp).toLocaleTimeString()}
                          </td>
                          <td><strong>#{rec.eventId}</strong></td>
                          <td>
                            <span className="badge badge-info">{rec.objectType}</span>
                          </td>
                          <td><code>{rec.entryKey}</code></td>
                          <td>
                            <span className="badge badge-neutral">
                              {rec.action} ({rec.method || (rec.action === 'A' ? 'POST' : 'PUT')})
                            </span>
                            {rec.wasFallback && <span className="badge badge-warning" style={{ marginLeft: 4 }}>Fallback</span>}
                          </td>
                          <td>
                            <span className={`badge ${rec.status === 'SUCCESS' ? 'badge-success' : 'badge-danger'}`}>
                              {rec.status}
                            </span>
                          </td>
                          <td>{rec.durationMs}ms</td>
                          <td style={{ fontSize: '0.8rem', color: rec.error ? '#fb7185' : 'var(--text-muted)' }}>
                            {rec.error || (rec.statusCode ? `HTTP ${rec.statusCode}` : 'OK')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: EVENTS VIEWER */}
        {activeTab === 'events' && (
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Tabla Intermedia: TBL_COMERCIA_EVENTS</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Eventos generados en SAP HANA para sincronización hacia la Ingestión
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Filter buttons */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2 }}>
                  {['all', 'pending', 'processed'].map(f => (
                    <button
                      key={f}
                      onClick={() => setEventFilter(f)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: eventFilter === f ? 'var(--accent-blue)' : 'transparent',
                        color: eventFilter === f ? '#fff' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      {f === 'all' ? 'Todos' : (f === 'pending' ? 'Pendientes' : 'Procesados')}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowNewEventModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  + Crear Evento de Prueba
                </button>

                <button onClick={fetchEvents} className="btn btn-secondary btn-sm">
                  🔄
                </button>
              </div>
            </div>

            {/* Modal to insert test event */}
            {showNewEventModal && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <div className="glass-panel" style={{ width: 440, padding: 24, background: '#0f172a' }}>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Insertar Evento de Prueba en HANA</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Crea un registro con <code>Processed=0</code> en <code>TBL_COMERCIA_EVENTS</code>.
                  </p>

                  <form onSubmit={handleCreateTestEvent}>
                    <div className="form-group">
                      <label className="form-label">ObjectType</label>
                      <input
                        className="form-input"
                        value={newEvent.objectType}
                        onChange={e => setNewEvent({ ...newEvent, objectType: e.target.value })}
                        placeholder="2 (Socios de Negocios)"
                        required
                      />
                      <small style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>'2' = OCRD Socios de Negocios, '4' = OITM Artículos</small>
                    </div>

                    <div className="form-group">
                      <label className="form-label">EntryKey (CardCode)</label>
                      <input
                        className="form-input"
                        value={newEvent.entryKey}
                        onChange={e => setNewEvent({ ...newEvent, entryKey: e.target.value })}
                        placeholder="ej. CC0102868"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Acción</label>
                      <select
                        className="form-input"
                        value={newEvent.action}
                        onChange={e => setNewEvent({ ...newEvent, action: e.target.value })}
                      >
                        <option value="U">U (Update - PUT)</option>
                        <option value="A">A (Add - POST)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                      <button
                        type="button"
                        onClick={() => setShowNewEventModal(false)}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading.createEvent}
                        className="btn btn-success btn-sm"
                      >
                        {actionLoading.createEvent ? 'Insertando...' : 'Crear en HANA'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Events Table */}
            {events.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                No se encontraron eventos en la tabla según el filtro seleccionado.
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>EventID</th>
                      <th>ObjectType</th>
                      <th>EntryKey (Clave)</th>
                      <th>Action</th>
                      <th>Fecha Creación</th>
                      <th>Estado</th>
                      <th>Fecha Procesado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const isProcessed = ev.Processed === 1;
                      const isBP = String(ev.ObjectType).trim() === '2';
                      return (
                        <tr key={ev.EventID}>
                          <td><strong>#{ev.EventID}</strong></td>
                          <td>
                            <span className={`badge ${isBP ? 'badge-info' : 'badge-neutral'}`}>
                              {ev.ObjectType} {isBP ? '(Socios)' : ''}
                            </span>
                          </td>
                          <td>
                            <code style={{ color: 'var(--accent-cyan)' }}>{ev.EntryKey}</code>
                          </td>
                          <td>
                            <span className={`badge ${ev.Action === 'A' ? 'badge-purple' : 'badge-neutral'}`}>
                              {ev.Action === 'U' ? 'Update' : (ev.Action === 'A' ? 'Add' : ev.Action)}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ev.CreatedAt}
                          </td>
                          <td>
                            <span className={`badge ${isProcessed ? 'badge-success' : 'badge-warning'}`}>
                              {isProcessed ? '✓ Procesado' : '⏳ Pendiente'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ev.ProcessedAt || '-'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleReprocessEvent(ev.EventID)}
                                disabled={actionLoading[`event_${ev.EventID}`]}
                                className="btn btn-secondary btn-sm"
                                title="Restablecer Processed=0 y procesar en el siguiente ciclo"
                              >
                                {actionLoading[`event_${ev.EventID}`] ? '...' : '🔄 Reprocesar'}
                              </button>
                              {isBP && (
                                <button
                                  onClick={() => {
                                    setSimCardCode(ev.EntryKey);
                                    setSimAction(ev.Action || 'U');
                                    setActiveTab('playground');
                                  }}
                                  className="btn btn-primary btn-sm"
                                  title="Probar en el Playground"
                                >
                                  🧪 Simular
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PLAYGROUND SIMULATOR (Supports 'U' and 'A') */}
        {activeTab === 'playground' && (
          <div>
            <div className="glass-panel" style={{ padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>
                Simulador de Integración (Socios OCRD, Artículos OITM + Precios ITM1, etc.)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Prueba la consulta directa a SAP B1 Service Layer, la transformación de datos y el envío mediante <strong>PUT (Actualización)</strong> o <strong>POST (Inserción)</strong>. Para <strong>ObjectType 4</strong>, sincroniza simultáneamente la cabecera en <strong>tbl_oitm</strong> y todas las listas de precios en <strong>tbl_itm1</strong>.
              </p>

              <form onSubmit={handleRunSimulation} style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
                  <label className="form-label">ObjectType</label>
                  <input
                    className="form-input"
                    value={simObjectType}
                    onChange={e => setSimObjectType(e.target.value)}
                    placeholder="2 (OCRD) o 4 (OITM)"
                    title="2 = Socios (OCRD), 4 = Artículos (OITM + ITM1)"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                  <label className="form-label">EntryKey / Code</label>
                  <input
                    className="form-input"
                    value={simCardCode}
                    onChange={e => setSimCardCode(e.target.value)}
                    placeholder="Ej: CC0102868 o PV42"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                  <label className="form-label">Acción</label>
                  <select
                    className="form-input"
                    value={simAction}
                    onChange={e => setSimAction(e.target.value)}
                  >
                    <option value="U">U - Update (PUT a Ingestión)</option>
                    <option value="A">A - Add / Insert (POST a Ingestión)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
                  <input
                    type="checkbox"
                    id="sendIngestCheck"
                    checked={simSendToIngest}
                    onChange={e => setSimSendToIngest(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <label htmlFor="sendIngestCheck" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                    Enviar a Ingestión API ({simAction === 'A' ? 'POST' : 'PUT'})
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={simLoading}
                  className="btn btn-primary"
                  style={{ minWidth: 150 }}
                >
                  {simLoading ? 'Consultando SAP...' : '⚡ Ejecutar Prueba'}
                </button>
              </form>
            </div>

            {/* Results Grid */}
            {simResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 20 }}>
                {/* Transformed Payload */}
                <div className="glass-panel" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>
                      Payload Transformado para Ingestión API
                    </h4>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="badge badge-purple">{simAction === 'A' ? 'POST (Add)' : 'PUT (Update)'}</span>
                      <span className="badge badge-info">Objeto {simObjectType}</span>
                    </div>
                  </div>
                  <pre className="code-box" style={{ maxHeight: 420 }}>
                    {JSON.stringify(simResult.transformedPayload, null, 2)}
                  </pre>
                </div>

                {/* Raw Service Layer Data */}
                <div className="glass-panel" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#a78bfa' }}>
                      Datos Crudos desde Service Layer
                    </h4>
                    <span className="badge badge-purple">{simResult.sapDurationMs}ms</span>
                  </div>
                  <pre className="code-box" style={{ maxHeight: 420, color: '#c084fc' }}>
                    {JSON.stringify(simResult.sapRaw, null, 2)}
                  </pre>
                </div>

                {/* Ingestion Response if sent */}
                {simResult.ingestionResult && (
                  <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                        Respuesta Endpoint Ingestión API ({simResult.ingestionResult.method || (simAction === 'A' ? 'POST' : 'PUT')})
                      </h4>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {simResult.ingestionResult.itm1Count !== undefined && (
                          <span className="badge badge-info">
                            tbl_itm1: {simResult.ingestionResult.itm1Count} Listas
                          </span>
                        )}
                        {simResult.ingestionResult.crd1Count !== undefined && (
                          <span className="badge badge-info">
                            tbl_crd1: {simResult.ingestionResult.crd1Count} Direcciones
                          </span>
                        )}
                        {simResult.ingestionResult.wasFallback && (
                          <span className="badge badge-warning">Smart Fallback Aplicado</span>
                        )}
                        <span className={`badge ${simResult.ingestionResult.success ? 'badge-success' : 'badge-danger'}`}>
                          HTTP {simResult.ingestionResult.statusCode || 'ERR'}
                        </span>
                        <span className="badge badge-neutral">
                          {simResult.ingestionResult.durationMs}ms
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Endpoint cabecera probado: <code>{simResult.ingestionResult.url}</code>
                    </div>
                    <pre className="code-box" style={{ maxHeight: 180, color: simResult.ingestionResult.success ? '#34d399' : '#fb7185' }}>
                      {JSON.stringify(simResult.ingestionResult.ocrd || simResult.ingestionResult.oitm || simResult.ingestionResult.responseData || simResult.ingestionResult.error, null, 2)}
                    </pre>

                    {simResult.ingestionResult.itm1Results && simResult.ingestionResult.itm1Results.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                          Detalle de Precios Sincronizados en tbl_itm1 ({simResult.ingestionResult.itm1Results.length}):
                        </div>
                        <pre className="code-box" style={{ maxHeight: 200, fontSize: '0.78rem', color: '#38bdf8' }}>
                          {JSON.stringify(simResult.ingestionResult.itm1Results, null, 2)}
                        </pre>
                      </div>
                    )}

                    {simResult.ingestionResult.crd1Results && simResult.ingestionResult.crd1Results.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                          Detalle de Direcciones Sincronizadas en tbl_crd1 ({simResult.ingestionResult.crd1Results.length}):
                        </div>
                        <pre className="code-box" style={{ maxHeight: 200, fontSize: '0.78rem', color: '#38bdf8' }}>
                          {JSON.stringify(simResult.ingestionResult.crd1Results, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CONFIGURATION (POSTGRESQL CRUDS) */}
        {activeTab === 'config' && (
          <div className="glass-panel" style={{ padding: 24 }}>
            {/* Header Action Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    Administración de Configuración en PostgreSQL
                  </h3>
                  <span className="badge badge-info">Esquema: ingestia</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Host: <code>172.19.0.232:5432</code> &bull; Base de Datos: <code>ingestia</code>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => testConnectivity('pg')}
                  disabled={actionLoading.pg}
                  className="btn btn-secondary btn-sm"
                >
                  {actionLoading.pg ? 'Probando...' : '🐘 Probar PostgreSQL'}
                </button>
                <button
                  onClick={handleReloadEngineConfig}
                  disabled={actionLoading.reloadConfig}
                  className="btn btn-primary btn-sm"
                  title="Recargar la configuración activa en el motor de sincronización"
                >
                  {actionLoading.reloadConfig ? 'Recargando...' : '🔄 Recargar en el Motor'}
                </button>
                <button
                  onClick={() => handleOpenCreateModal(activeDbTab)}
                  className="btn btn-success btn-sm"
                >
                  + Nuevo Registro
                </button>
              </div>
            </div>

            {/* Sub-tabs for the 5 PostgreSQL tables */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { id: 'instances', label: `🖥️ DBINSTANCES (${dbTables.instances.length})` },
                { id: 'dbsap', label: `🗄️ DBSAP (${dbTables.dbsapList.length})` },
                { id: 'empresa', label: `🏢 DBEMPRESA (${dbTables.empresas.length})` },
                { id: 'templateEmpresa', label: `📋 TEMPLATEEMPRESA (${dbTables.templateEmpresas.length})` },
                { id: 'templateSL', label: `⚡ TEMPLATESLSAP (${dbTables.templateSLList.length})` }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveDbTab(sub.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background: activeDbTab === sub.id ? 'var(--accent-blue)' : 'rgba(255,255,255,0.04)',
                    color: activeDbTab === sub.id ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer'
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Sub-tab 1: DBINSTANCES */}
            {activeDbTab === 'instances' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Servidores SAP HANA y endpoints de Service Layer registrados.
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CodeInstances</th>
                        <th>ServerName</th>
                        <th>ServerType</th>
                        <th>Versión</th>
                        <th>ServiceLayer URL</th>
                        <th>Puerto HANA</th>
                        <th>Usuario HANA</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.instances.map((row) => (
                        <tr key={row.CodeInstances}>
                          <td><strong>#{row.CodeInstances}</strong></td>
                          <td><code>{row.ServerName}</code></td>
                          <td><span className="badge badge-info">{row.ServerType}</span></td>
                          <td>{row.Version}</td>
                          <td style={{ fontSize: '0.78rem' }}><code>{row.ServiceLayer}</code></td>
                          <td><code>{row.ServerHanaPort}</code></td>
                          <td><code>{row.HanaUser}</code></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setModalState({ isOpen: true, table: 'instances', isEdit: true, data: { ...row } })}
                                className="btn btn-secondary btn-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteRecord('instances', row)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: DBSAP */}
            {activeDbTab === 'dbsap' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Asociación de base de datos de SAP B1, credenciales de Service Layer y tabla de eventos intermedia.
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CodeInstances</th>
                        <th>CompanyDB</th>
                        <th>Usuario SL</th>
                        <th>Tabla Eventos</th>
                        <th>IdEmpresa</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.dbsapList.map((row) => (
                        <tr key={`${row.CodeInstances}-${row.CompanyDB}-${row.IdEmpresa}`}>
                          <td><strong>#{row.CodeInstances}</strong></td>
                          <td><span className="badge badge-purple">{row.CompanyDB}</span></td>
                          <td><code>{row.UserName}</code></td>
                          <td><code>{row.TblEventos}</code></td>
                          <td><span className="badge badge-info">Empresa #{row.IdEmpresa}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setModalState({ isOpen: true, table: 'dbsap', isEdit: true, data: { ...row } })}
                                className="btn btn-secondary btn-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteRecord('dbsap', row)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 3: DBEMPRESA */}
            {activeDbTab === 'empresa' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Configuración de la API de Ingestión destino, intervalos de sondeo y límites de lote por empresa.
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>IdEmpresa</th>
                        <th>URL Base Ingestión</th>
                        <th>Timeout (ms)</th>
                        <th>Intervalo Polling (s)</th>
                        <th>Lote Máx Ciclo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.empresas.map((row) => (
                        <tr key={row.IdEmpresa}>
                          <td><strong>#{row.IdEmpresa}</strong></td>
                          <td style={{ fontSize: '0.78rem' }}><code>{row.URLBase}</code></td>
                          <td>{row.TimeOutMS}ms</td>
                          <td><span className="badge badge-warning">{row.IntervaloPollingS}s</span></td>
                          <td>{row.LoteMaximoCiclo}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setModalState({ isOpen: true, table: 'empresa', isEdit: true, data: { ...row } })}
                                className="btn btn-secondary btn-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteRecord('empresa', row)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 4: TEMPLATEEMPRESA */}
            {activeDbTab === 'templateEmpresa' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Definición de endpoints y métodos HTTP (POST / PUT) hacia la API de Ingestión según el ObjectType de SAP.
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>IdEmpresa</th>
                        <th>ObjectType</th>
                        <th>Método HTTP</th>
                        <th>Endpoint</th>
                        <th>Body Template</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.templateEmpresas.map((row) => (
                        <tr key={`${row.IdEmpresa}-${row.MetodoHttpt}-${row.ObjectType || '2'}`}>
                          <td><strong>#{row.IdEmpresa}</strong></td>
                          <td>
                            <span className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              {row.ObjectType || '2'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${row.MetodoHttpt === 'POST' ? 'badge-purple' : 'badge-info'}`}>
                              {row.MetodoHttpt}
                            </span>
                          </td>
                          <td><code>{row.EndPoint}</code></td>
                          <td style={{ fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {typeof row.BodyTemplate === 'object' ? JSON.stringify(row.BodyTemplate) : row.BodyTemplate}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setModalState({ isOpen: true, table: 'templateEmpresa', isEdit: true, data: { ...row, originalObjectType: row.ObjectType } })}
                                className="btn btn-secondary btn-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteRecord('templateEmpresa', row)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 5: TEMPLATESLSAP */}
            {activeDbTab === 'templateSL' && (
              <div>
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Plantillas de consulta hacia SAP B1 Service Layer por instancia y ObjectType.
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CodeInstances</th>
                        <th>ObjectType</th>
                        <th>Descripción Objeto</th>
                        <th>Método HTTP</th>
                        <th>Endpoint Service Layer</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.templateSLList.map((row) => (
                        <tr key={`${row.CodeInstances}-${row.MetodoHttpt}-${row.ObjectType || '2'}`}>
                          <td><strong>#{row.CodeInstances}</strong></td>
                          <td>
                            <span className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              {row.ObjectType || '2'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{row.ObjectDescr || 'Business Partner'}</span>
                          </td>
                          <td><span className="badge badge-success">{row.MetodoHttpt}</span></td>
                          <td><code>{row.EndPoint}</code></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setModalState({ isOpen: true, table: 'templateSL', isEdit: true, data: { ...row, originalObjectType: row.ObjectType } })}
                                className="btn btn-secondary btn-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteRecord('templateSL', row)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CRUD MODAL FOR POSTGRESQL TABLES */}
        {modalState.isOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div className="glass-panel" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24, background: '#0d131f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {modalState.isEdit ? 'Editar' : 'Crear'} Registro en {modalState.table.toUpperCase()}
                </h4>
                <button
                  onClick={() => setModalState({ isOpen: false, table: 'instances', isEdit: false, data: {} })}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveModal}>
                {/* 1. DBINSTANCES Fields */}
                {modalState.table === 'instances' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">ServerName (IP o Host HANA)</label>
                      <input
                        className="form-input"
                        value={modalState.data.ServerName || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ServerName: e.target.value } })}
                        placeholder="ej. 172.19.0.88"
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">ServerType</label>
                        <input
                          className="form-input"
                          value={modalState.data.ServerType || 'HANA'}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ServerType: e.target.value } })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Versión</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.Version || 10}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, Version: parseInt(e.target.value, 10) } })}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">ServiceLayer Base URL</label>
                      <input
                        className="form-input"
                        value={modalState.data.ServiceLayer || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ServiceLayer: e.target.value } })}
                        placeholder="https://172.19.0.88:50000/b1s/v1"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Puerto HANA</label>
                      <input
                        className="form-input"
                        value={modalState.data.ServerHanaPort || '30015'}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ServerHanaPort: e.target.value } })}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">HanaUser</label>
                        <input
                          className="form-input"
                          value={modalState.data.HanaUser || ''}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, HanaUser: e.target.value } })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">HanaPassword</label>
                        <input
                          type="password"
                          className="form-input"
                          value={modalState.data.HanaPassword || ''}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, HanaPassword: e.target.value } })}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 2. DBSAP Fields */}
                {modalState.table === 'dbsap' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">CodeInstances</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.CodeInstances || 1}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, CodeInstances: parseInt(e.target.value, 10) } })}
                          disabled={modalState.isEdit}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">IdEmpresa</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.IdEmpresa || 2}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, IdEmpresa: parseInt(e.target.value, 10) } })}
                          disabled={modalState.isEdit}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">CompanyDB</label>
                      <input
                        className="form-input"
                        value={modalState.data.CompanyDB || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, CompanyDB: e.target.value } })}
                        placeholder="FG_DESARROLLO"
                        disabled={modalState.isEdit}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">UserName SAP</label>
                        <input
                          className="form-input"
                          value={modalState.data.UserName || ''}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, UserName: e.target.value } })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Password SAP</label>
                        <input
                          type="password"
                          className="form-input"
                          value={modalState.data.Password || ''}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, Password: e.target.value } })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tabla de Eventos</label>
                      <input
                        className="form-input"
                        value={modalState.data.TblEventos || 'TBL_COMERCIA_EVENTS'}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, TblEventos: e.target.value } })}
                        required
                      />
                    </div>
                  </>
                )}

                {/* 3. DBEMPRESA Fields */}
                {modalState.table === 'empresa' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">IdEmpresa</label>
                      <input
                        type="number"
                        className="form-input"
                        value={modalState.data.IdEmpresa || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, IdEmpresa: parseInt(e.target.value, 10) } })}
                        disabled={modalState.isEdit}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">URLBase Ingestión</label>
                      <input
                        className="form-input"
                        value={modalState.data.URLBase || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, URLBase: e.target.value } })}
                        placeholder="https://api.comercia.pro/api/v1/admin/socios-negocio/empresas"
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Timeout (ms)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.TimeOutMS || 15000}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, TimeOutMS: parseInt(e.target.value, 10) } })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Polling (s)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.IntervaloPollingS || 10}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, IntervaloPollingS: parseInt(e.target.value, 10) } })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Lote Máx</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.LoteMaximoCiclo || 25}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, LoteMaximoCiclo: parseInt(e.target.value, 10) } })}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 4. TEMPLATEEMPRESA Fields */}
                {modalState.table === 'templateEmpresa' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">IdEmpresa</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.IdEmpresa || 2}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, IdEmpresa: parseInt(e.target.value, 10) } })}
                          disabled={modalState.isEdit}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">ObjectType (SAP)</label>
                        <input
                          className="form-input"
                          value={modalState.data.ObjectType !== undefined ? modalState.data.ObjectType : '2'}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ObjectType: e.target.value } })}
                          placeholder="2"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Método HTTP</label>
                        <select
                          className="form-input"
                          value={modalState.data.MetodoHttpt || 'POST'}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, MetodoHttpt: e.target.value } })}
                          disabled={modalState.isEdit}
                        >
                          <option value="POST">POST (Add - Inserción)</option>
                          <option value="PUT">PUT (Update - Actualización)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">EndPoint</label>
                      <input
                        className="form-input"
                        value={modalState.data.EndPoint || ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, EndPoint: e.target.value } })}
                        placeholder="/{IdEmpresa}/tbl_ocrd/"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">BodyTemplate (JSON)</label>
                      <textarea
                        className="form-input"
                        rows={6}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                        value={typeof modalState.data.BodyTemplate === 'object' ? JSON.stringify(modalState.data.BodyTemplate, null, 2) : (modalState.data.BodyTemplate || '')}
                        onChange={e => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setModalState({ ...modalState, data: { ...modalState.data, BodyTemplate: parsed } });
                          } catch (err) {
                            setModalState({ ...modalState, data: { ...modalState.data, BodyTemplate: e.target.value } });
                          }
                        }}
                        placeholder='{"CardCode": "CardCode", ...}'
                        required
                      />
                    </div>
                  </>
                )}

                {/* 5. TEMPLATESLSAP Fields */}
                {modalState.table === 'templateSL' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">CodeInstances</label>
                        <input
                          type="number"
                          className="form-input"
                          value={modalState.data.CodeInstances ?? 1}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, CodeInstances: parseInt(e.target.value, 10) || 1 } })}
                          disabled={modalState.isEdit}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Método HTTP</label>
                        <select
                          className="form-input"
                          value={modalState.data.MetodoHttpt || 'GET'}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, MetodoHttpt: e.target.value } })}
                          disabled={modalState.isEdit}
                        >
                          <option value="GET">GET</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">ObjectType (SAP)</label>
                        <input
                          className="form-input"
                          value={modalState.data.ObjectType ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            let descr = modalState.data.ObjectDescr;
                            let ep = modalState.data.EndPoint;
                            if (!modalState.isEdit) {
                              if (val === '4') { descr = 'Items'; ep = "/Items('{EntryKey}')"; }
                              else if (val === '2') { descr = 'Business Partner'; ep = "/BusinessPartners('{EntryKey}')"; }
                              else if (val === '6') { descr = 'Price List'; ep = "/PriceLists({EntryKey})"; }
                              else if (val === '52') { descr = 'Item Groups'; ep = "/ItemGroups({EntryKey})"; }
                              else if (val.toUpperCase() === 'JCANAL' || val.toUpperCase() === 'JCALES') { descr = 'Canales'; ep = "/JCANAL('{EntryKey}')"; }
                            }
                            setModalState({ ...modalState, data: { ...modalState.data, ObjectType: val, ObjectDescr: descr, EndPoint: ep } });
                          }}
                          placeholder="ej. 2, 4, 6, 52 o JCANAL"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Descripción Objeto (ObjectDescr)</label>
                        <input
                          className="form-input"
                          value={modalState.data.ObjectDescr ?? ''}
                          onChange={e => setModalState({ ...modalState, data: { ...modalState.data, ObjectDescr: e.target.value } })}
                          placeholder="ej. Items"
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">EndPoint Service Layer</label>
                      <input
                        className="form-input"
                        value={modalState.data.EndPoint ?? ''}
                        onChange={e => setModalState({ ...modalState, data: { ...modalState.data, EndPoint: e.target.value } })}
                        placeholder="/Items('{EntryKey}')"
                        required
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                  <button
                    type="button"
                    onClick={() => setModalState({ isOpen: false, table: 'instances', isEdit: false, data: {} })}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading.modalSave}
                    className="btn btn-success btn-sm"
                  >
                    {actionLoading.modalSave ? 'Guardando...' : (modalState.isEdit ? 'Guardar Cambios' : 'Crear Registro')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 5: REALTIME LOGS */}
        {activeTab === 'logs' && (
          <div className="glass-panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Consola de Eventos y Logs en Vivo</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Registro estructurado del servicio ingestIA (Winston logging buffer)
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Level filter */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2 }}>
                  {['all', 'info', 'warn', 'error'].map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: logFilter === lvl ? 'var(--accent-blue)' : 'transparent',
                        color: logFilter === lvl ? '#fff' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <button onClick={fetchLogs} className="btn btn-secondary btn-sm">
                  🔄 Refrescar
                </button>
                <button onClick={handleClearLogs} className="btn btn-danger btn-sm">
                  🗑️ Limpiar
                </button>
              </div>
            </div>

            <div style={{
              background: '#070a12',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: 16,
              height: 480,
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 180 }}>
                  No hay logs en el búfer. Los eventos del servicio se mostrarán aquí en tiempo real.
                </div>
              ) : (
                logs.map((log, idx) => {
                  let color = '#38bdf8';
                  if (log.level === 'warn') color = '#fbbf24';
                  if (log.level === 'error') color = '#fb7185';
                  return (
                    <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span style={{
                        color,
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        minWidth: 50
                      }}>
                        [{log.level}]
                      </span>
                      <span style={{ color: 'var(--text-main)', flex: 1, wordBreak: 'break-word' }}>
                        {log.message}
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <span style={{ color: 'var(--text-dim)', marginLeft: 8, fontSize: '0.75rem' }}>
                            {JSON.stringify(log.meta)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* TAB 6: WINDOWS SERVICE MANAGEMENT */}
        {activeTab === 'windows-service' && (
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}>
                🖥️
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Despliegue como Servicio de Windows (Windows Server 2019)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Ejecución desatendida en segundo plano cargando credenciales y parámetros desde PostgreSQL.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, marginTop: 20 }}>
              {/* Option 1: node-windows */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border-subtle)'
              }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', marginBottom: 10 }}>
                  1. Instalación mediante Node.js
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Abre PowerShell o CMD como <strong>Administrador</strong> en el servidor y ejecuta:
                </p>
                <div className="code-box" style={{ marginBottom: 12 }}>
                  cd D:\Google_AG\ingestIA\ingestIABack<br />
                  npm run service:install
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Registra <strong>ingestIAService</strong> en el panel de <code>services.msc</code> de Windows con inicio automático.
                </p>
              </div>

              {/* Option 2: Batch Scripts */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border-subtle)'
              }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399', marginBottom: 10 }}>
                  2. Ejecución con Doble Clic (Scripts .bat)
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Ubicados en <code>ingestIABack/scripts/</code>:
                </p>
                <ul style={{ fontSize: '0.82rem', color: 'var(--text-muted)', paddingLeft: 20, lineHeight: 1.8 }}>
                  <li><code>install-service.bat</code>: Instala y arranca el servicio</li>
                  <li><code>uninstall-service.bat</code>: Detiene y elimina el servicio</li>
                </ul>
              </div>

              {/* Desinstalación */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border-subtle)'
              }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fb7185', marginBottom: 10 }}>
                  3. Desinstalación Limpia
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Para desinstalar el servicio cuando se requiera mantenimiento:
                </p>
                <div className="code-box">
                  cd D:\Google_AG\ingestIA\ingestIABack<br />
                  npm run service:uninstall
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        background: 'rgba(10, 14, 23, 0.9)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '16px 32px',
        fontSize: '0.78rem',
        color: 'var(--text-dim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <strong>ingestIA</strong> &mdash; SAP Business One Service Layer Ingest Engine | PostgreSQL Managed Config
        </div>
        <div>
          PostgreSQL: <code>172.19.0.232:5432</code> &bull; HANA: <code>172.19.0.88:30015</code> &bull; API Backend: <code>http://localhost:9015</code>
        </div>
      </footer>
    </div>
  );
}
