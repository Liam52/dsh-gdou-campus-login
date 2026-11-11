/** 海大校园网自动登录 —— 软件内界面（主面板 / 设置 / 诊断）。 */
window.__ModuleLoader__.load({
  id: '@local/gdou-campus-login',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useCallback } = React;
    const h = React.createElement;

    const API = '/gdou-campus-net/v1';
    const PANEL_ID = 'gdou-campus-net';

    // ---------- 学校视觉元素 ----------
    const OCEAN = { blue: '#0B5FA5', teal: '#12A5A5' };
    const mottoText = '广学明德 · 海纳厚为';

    // ---------- 样式 ----------
    const CSS = `
/* ---- 回退变量：DSH 主题 token 缺失时仍然可读 ---- */
.gd-page{
  --gd-bg:#f4f6f9;      --gd-bg:var(--dsw-alias-bg-layer-2, light-dark(#f4f6f9,#14161a));
  --gd-card:#ffffff;    --gd-card:var(--dsw-alias-bg-layer-1, light-dark(#ffffff,#1c1f26));
  --gd-sub-bg:#eef2f7;  --gd-sub-bg:var(--dsw-alias-bg-layer-2, light-dark(#eef2f7,#22262e));
  --gd-line:#e2e7ee;    --gd-line:var(--dsw-alias-border-l1, light-dark(#e2e7ee,#2c313a));
  --gd-line2:#c9d2de;   --gd-line2:var(--dsw-alias-border-l2, light-dark(#c9d2de,#3a414d));
  --gd-text:#16181d;    --gd-text:var(--dsw-alias-label-primary, light-dark(#16181d,#f2f3f5));
  --gd-sub:#5f6672;     --gd-sub:var(--dsw-alias-label-secondary, light-dark(#5f6672,#a3aab6));
  --gd-ok:#16a34a;      --gd-ok:var(--dsw-alias-state-success-primary, light-dark(#16a34a,#3ddc84));
  --gd-warn:#d97706;    --gd-warn:var(--dsw-alias-state-warn-primary, light-dark(#d97706,#fbbf24));
  --gd-err:#dc2626;     --gd-err:var(--dsw-alias-state-error-primary, light-dark(#dc2626,#f87171));
  --gd-idle:#94a3b8;    --gd-idle:var(--dsw-alias-state-idle-primary, light-dark(#94a3b8,#6b7280));
  color-scheme:light dark;
}

.gd-page{height:100%;overflow:auto;box-sizing:border-box;
  padding:clamp(16px,3vw,40px) clamp(14px,3vw,40px) clamp(24px,4vw,56px);
  background-color:var(--gd-bg);color:var(--gd-text);}
.gd-wrap{width:100%;max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(12px,1.4vw,18px);}

/* ---- 背景 ---- */
.gd-bg-blueprint{
  background-color:light-dark(#eaf2fb,#0a1a2b);
  background-image:
    linear-gradient(light-dark(rgba(11,95,165,.10),rgba(120,180,255,.11)) 1px,transparent 1px),
    linear-gradient(90deg,light-dark(rgba(11,95,165,.10),rgba(120,180,255,.11)) 1px,transparent 1px),
    linear-gradient(light-dark(rgba(11,95,165,.05),rgba(120,180,255,.05)) 1px,transparent 1px),
    linear-gradient(90deg,light-dark(rgba(11,95,165,.05),rgba(120,180,255,.05)) 1px,transparent 1px),
    radial-gradient(1100px 520px at 12% -8%,rgba(18,165,165,.18),transparent 62%),
    radial-gradient(900px 480px at 92% 108%,rgba(11,95,165,.20),transparent 62%);
  background-size:120px 120px,120px 120px,24px 24px,24px 24px,100% 100%,100% 100%;
  background-attachment:fixed;
}
.gd-bg-grid{
  background-image:radial-gradient(light-dark(rgba(11,95,165,.16),rgba(140,190,255,.16)) 1px,transparent 1px);
  background-size:18px 18px;
}
.gd-bg-plain{background-image:none;}
.gd-bg-off{background-image:none;background-color:var(--gd-bg);}

/* ---- 头部 ---- */
.gd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.gd-head-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.gd-brand{display:flex;align-items:center;gap:10px;min-width:0;}
.gd-mark{width:4px;height:22px;border-radius:2px;flex:none;background:linear-gradient(180deg,${OCEAN.blue},${OCEAN.teal});}
.gd-title{font-size:clamp(17px,1.8vw,22px);font-weight:700;margin:0;letter-spacing:-.3px;line-height:1.2;}
.gd-sub{font-size:clamp(11.5px,1vw,12.5px);color:var(--gd-sub);margin:4px 0 0;line-height:1.5;}
.gd-pill{display:inline-flex;align-items:center;gap:7px;flex:none;padding:6px 12px;border-radius:999px;
  border:1px solid var(--gd-line);background:var(--gd-card);
  font-size:clamp(11px,1vw,12.5px);font-weight:600;transition:border-color .2s ease;}
.gd-dot{width:8px;height:8px;border-radius:50%;flex:none;}
.gd-dot--live{animation:gdPulse 2s ease-in-out infinite;}

/* ---- 卡片 ---- */
.gd-card{background:var(--gd-card);border:1px solid var(--gd-line);
  border-radius:clamp(12px,1.4vw,16px);padding:clamp(14px,1.8vw,20px);
  display:flex;flex-direction:column;gap:clamp(10px,1.2vw,14px);
  animation:gdIn .34s ease both;
  transition:border-color .2s ease, box-shadow .2s ease, transform .2s ease;}
.gd-card:hover{border-color:var(--gd-line2);transform:translateY(-1px);box-shadow:0 6px 20px -14px rgba(11,95,165,.5);}
.gd-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.gd-row-tight{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.gd-label{font-size:clamp(13px,1.1vw,14px);font-weight:600;}
.gd-hint{font-size:clamp(11px,1vw,12.5px);color:var(--gd-sub);line-height:1.6;margin:0;}

/* ---- 流量主卡 ---- */
.gd-hero{position:relative;overflow:hidden;background:var(--gd-card);
  border:1px solid var(--gd-line);border-radius:clamp(14px,1.6vw,20px);
  padding:clamp(16px,2.2vw,26px);animation:gdIn .34s ease both;
  transition:border-color .2s ease, box-shadow .25s ease, transform .2s ease;}
.gd-hero:hover{border-color:var(--gd-line2);transform:translateY(-1px);box-shadow:0 10px 30px -20px rgba(11,95,165,.6);}
.gd-tint{position:absolute;inset:0;pointer-events:none;opacity:.09;
  background:linear-gradient(135deg,${OCEAN.blue} 0%,${OCEAN.teal} 100%);}
.gd-wave{position:absolute;left:0;right:0;bottom:0;width:100%;height:clamp(32px,5vw,52px);
  pointer-events:none;display:block;animation:gdFloat 7s ease-in-out infinite;}
.gd-hero-body{position:relative;display:flex;flex-direction:column;gap:clamp(10px,1.2vw,14px);}
.gd-hero-label{font-size:12px;font-weight:600;letter-spacing:.3px;color:var(--gd-sub);}
.gd-hero-value{font-size:clamp(26px,4.2vw,38px);font-weight:750;letter-spacing:-1px;line-height:1.1;
  margin-top:4px;font-variant-numeric:tabular-nums;}
.gd-hero-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  font-size:clamp(11px,1vw,12px);color:var(--gd-sub);}

/* ---- 指标 ---- */
.gd-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(118px,100%),1fr));
  gap:clamp(8px,1vw,12px);padding-top:clamp(10px,1.2vw,14px);border-top:1px solid var(--gd-line);}
.gd-metric{background:var(--gd-sub-bg);border-radius:10px;padding:clamp(8px,1vw,11px) clamp(10px,1.2vw,14px);}
.gd-metric-label{font-size:11px;font-weight:600;color:var(--gd-sub);}
.gd-metric-value{font-size:clamp(13.5px,1.3vw,16px);font-weight:650;margin-top:3px;font-variant-numeric:tabular-nums;}

/* ---- 按钮 ---- */
.gd-btn{font:inherit;cursor:pointer;border-radius:10px;border:1px solid var(--gd-line);
  background:transparent;color:var(--gd-text);
  padding:clamp(6px,.8vw,8px) clamp(11px,1.4vw,16px);
  font-size:clamp(12px,1vw,13px);font-weight:500;white-space:nowrap;
  transition:background .15s ease,border-color .15s ease,transform .1s ease,opacity .15s ease;}
.gd-btn:hover:not(:disabled){background:var(--gd-sub-bg);border-color:var(--gd-line2);}
.gd-btn:active:not(:disabled){transform:scale(.97);}
.gd-btn:disabled{opacity:.45;cursor:not-allowed;}
.gd-btn--primary{background:${OCEAN.blue};border-color:${OCEAN.blue};color:#fff;font-weight:600;}
.gd-btn--primary:hover:not(:disabled){background:#0a5490;border-color:#0a5490;}
.gd-btn--ghost{background:var(--gd-card);}
.gd-btn--sm{padding:4px 9px;font-size:11.5px;border-radius:8px;}
.gd-btn:focus-visible,.gd-chip:focus-visible,.gd-switch:focus-visible{outline:2px solid ${OCEAN.teal};outline-offset:2px;}

/* ---- 表单 ---- */
.gd-input{width:100%;box-sizing:border-box;font:inherit;font-size:clamp(12.5px,1.1vw,13.5px);
  padding:clamp(8px,1vw,10px) clamp(10px,1.2vw,13px);border-radius:10px;
  background:var(--gd-sub-bg);border:1px solid var(--gd-line);color:var(--gd-text);outline:none;
  transition:border-color .15s ease, box-shadow .15s ease;}
.gd-input:focus{border-color:${OCEAN.blue};box-shadow:0 0 0 3px rgba(11,95,165,.16);}
.gd-field{display:flex;flex-direction:column;gap:6px;min-width:0;}
.gd-field-label{font-size:11.5px;font-weight:600;color:var(--gd-sub);}

/* ---- 胶囊 ---- */
.gd-chips{display:flex;gap:8px;flex-wrap:wrap;}
.gd-chip{display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;
  padding:6px 12px;border-radius:999px;border:1px solid var(--gd-line);
  background:var(--gd-card);color:var(--gd-text);
  font-size:clamp(11.5px,1vw,12.5px);font-weight:600;
  transition:background .15s ease,border-color .15s ease,color .15s ease,transform .1s ease;}
.gd-chip:hover:not(:disabled){border-color:${OCEAN.blue};}
.gd-chip:active:not(:disabled){transform:scale(.97);}
.gd-chip:disabled{opacity:.5;cursor:not-allowed;}
.gd-chip--on{background:${OCEAN.blue};border-color:${OCEAN.blue};color:#fff;}

/* ---- 信息 ---- */
.gd-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(118px,100%),1fr));gap:clamp(10px,1.2vw,16px);}
.gd-info-label{font-size:11px;font-weight:600;color:var(--gd-sub);}
.gd-info-value{font-size:clamp(12.5px,1.1vw,13.5px);margin-top:3px;font-variant-numeric:tabular-nums;word-break:break-all;}

/* ---- 开关 ---- */
.gd-switch{width:44px;height:24px;border-radius:12px;border:none;padding:0;cursor:pointer;flex:none;
  position:relative;background:var(--gd-line2);transition:background .18s ease;}
.gd-switch--on{background:${OCEAN.blue};}
.gd-switch:disabled{opacity:.5;cursor:not-allowed;}
.gd-knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;
  transition:transform .18s ease;}
.gd-knob--on{transform:translateX(20px);}

/* ---- 列表/日志 ---- */
.gd-list{display:flex;flex-direction:column;gap:8px;}
.gd-item{background:var(--gd-sub-bg);border-radius:10px;padding:9px 12px;display:flex;align-items:flex-start;gap:10px;}
.gd-ok{color:var(--gd-ok);font-weight:700;flex:none;}
.gd-bad{color:var(--gd-err);font-weight:700;flex:none;}
.gd-log{display:flex;flex-direction:column;gap:5px;max-height:340px;overflow:auto;}
.gd-log-row{display:flex;gap:10px;font-size:11.5px;line-height:1.5;}
.gd-log-time{color:var(--gd-sub);flex:none;font-variant-numeric:tabular-nums;}
.gd-log-dot{width:6px;height:6px;border-radius:50%;flex:none;margin-top:6px;}
.gd-log-text{min-width:0;word-break:break-word;}
.gd-mono{font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  word-break:break-all;margin:0;color:var(--gd-sub);}

/* ---- 公告 ---- */
.gd-notice{display:flex;flex-direction:column;gap:9px;padding:11px 13px;border-radius:11px;
  background:var(--gd-sub-bg);border:1px solid transparent;transition:border-color .2s ease;}
.gd-notice:hover{border-color:var(--gd-line2);}
.gd-notice-title{font-size:13px;font-weight:600;line-height:1.45;}
.gd-range{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;}
.gd-badge{padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;border:1px solid transparent;}
.gd-badge--live{color:#fff;background:${OCEAN.teal};}
.gd-badge--soon{color:#fff;background:${OCEAN.blue};}
.gd-badge--done{color:var(--gd-sub);background:transparent;border-color:var(--gd-line);}
.gd-time{font-variant-numeric:tabular-nums;color:var(--gd-text);}
.gd-count{font-size:11.5px;color:var(--gd-sub);font-variant-numeric:tabular-nums;}

.gd-foot{text-align:center;font-size:11px;letter-spacing:2px;opacity:.6;padding:4px 0 2px;color:var(--gd-sub);user-select:none;}

@keyframes gdIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes gdFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes gdPulse{0%,100%{opacity:1}50%{opacity:.35}}

@media (prefers-reduced-motion: reduce){
  .gd-card,.gd-hero,.gd-wave,.gd-dot--live{animation:none !important;}
  .gd-card,.gd-hero,.gd-btn,.gd-chip{transition:none !important;}
}
@media (max-width:560px){
  .gd-card,.gd-hero{padding:14px;border-radius:13px;}
  .gd-actions{flex-direction:column;align-items:stretch;}
  .gd-actions .gd-btn{width:100%;}
  .gd-head{flex-direction:column;align-items:stretch;}
  .gd-head-right{justify-content:space-between;}
}
`;

    // ---------- 网络 ----------
    async function fetchStatus() {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    async function postAction(action, value) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, value }),
      });
      return res.json();
    }

    // ---------- 侧边栏图标 ----------
    function SidebarIcon(props) {
      const size = props && props.size ? props.size : 20;
      const active = !!(props && props.active);
      const color = active ? OCEAN.blue : 'var(--dsw-alias-label-secondary)';
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M4 9.5a11 11 0 0 1 16 0', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', fill: 'none' }),
        h('path', { d: 'M7 13a7 7 0 0 1 10 0', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', fill: 'none' }),
        h('circle', { cx: 12, cy: 17.5, r: 1.8, fill: color }),
      );
    }

    function statusMeta(s) {
      if (!s || s.online === null || s.online === undefined) {
        return { color: 'var(--dsw-alias-state-idle-primary)', text: '正在检测…' };
      }
      if (s.online === true) return { color: 'var(--dsw-alias-state-success-primary)', text: '已联网' };
      return { color: 'var(--dsw-alias-state-warn-primary)', text: '未认证（断网）' };
    }

    function fmtBytes(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v <= 0) return '—';
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let i = 0;
      let x = v;
      while (x >= 1024 && i < units.length - 1) { x /= 1024; i += 1; }
      return (i === 0 ? String(Math.round(x)) : x.toFixed(x >= 100 ? 1 : 2)) + ' ' + units[i];
    }

    function fmtDuration(sec) {
      const v = Number(sec);
      if (!Number.isFinite(v) || v <= 0) return '—';
      const d = Math.floor(v / 86400);
      const hh = Math.floor((v % 86400) / 3600);
      const m = Math.floor((v % 3600) / 60);
      if (d > 0) return d + ' 天 ' + hh + ' 小时';
      if (hh > 0) return hh + ' 小时 ' + m + ' 分';
      return m + ' 分钟';
    }

    function acidSourceLabel(s) {
      if (!s) return '—';
      if (s.captiveAcid) return '重定向获取 ' + s.captiveAcid;
      if (s.manualAcid) return '手动覆盖 ' + s.manualAcid;
      if (s.lastGoodAcid) return '上次成功 ' + s.lastGoodAcid;
      return '配置值 ' + s.acid;
    }

    function Panel() {
      const [status, setStatus] = useState(null);
      const [busy, setBusy] = useState(false);
      const [view, setView] = useState('main');

      const [user, setUser] = useState('');
      const [pass, setPass] = useState('');
      const [touched, setTouched] = useState(false);
      const [notice, setNotice] = useState(null);

      const [acidInput, setAcidInput] = useState('');
      const [acidTouched, setAcidTouched] = useState(false);
      const [acidNotice, setAcidNotice] = useState(null);

      const [intervalInput, setIntervalInput] = useState('');
      const [intervalTouched, setIntervalTouched] = useState(false);
      const [intervalNotice, setIntervalNotice] = useState(null);

      const [agreeTick, setAgreeTick] = useState(null);
      const [diag, setDiag] = useState(null);
      const [diagBusy, setDiagBusy] = useState(false);
      const [logs, setLogs] = useState([]);
      const [copiedIdx, setCopiedIdx] = useState(-1);

      const load = useCallback(async () => {
        try { setStatus(await fetchStatus()); } catch {}
      }, []);

      useEffect(() => {
        let alive = true;
        const tick = async () => {
          try {
            const s = await fetchStatus();
            if (alive) setStatus(s);
          } catch {}
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => { alive = false; clearInterval(timer); };
      }, []);

      useEffect(() => { if (!touched && status && status.username) setUser(status.username); }, [status, touched]);
      useEffect(() => { if (!acidTouched && status && status.acid) setAcidInput(String(status.acid)); }, [status, acidTouched]);
      useEffect(() => {
        if (!intervalTouched && status && status.intervalSec) setIntervalInput(String(status.intervalSec));
      }, [status, intervalTouched]);

      const act = useCallback(async (action, value, optimistic) => {
        if (busy) return;
        setBusy(true);
        if (optimistic && status) setStatus({ ...status, ...optimistic });
        try { setStatus(await postAction(action, value)); } catch { await load(); }
        finally { setBusy(false); }
      }, [busy, status, load]);

      const submit = useCallback(async (payload, setMessage, touchedSetter, after) => {
        if (busy) return;
        setBusy(true);
        setMessage(null);
        try {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            setMessage({ kind: 'error', text: (data && data.error) || '保存失败' });
          } else {
            setStatus(data);
            if (touchedSetter) touchedSetter(false);
            if (after) after();
            setMessage({ kind: 'ok', text: '已保存' });
          }
        } catch (e) {
          setMessage({ kind: 'error', text: '保存失败：' + (e && e.message ? e.message : e) });
        } finally {
          setBusy(false);
        }
      }, [busy]);

      const saveAccount = useCallback(
        () => submit({ action: 'saveAccount', username: user, password: pass }, setNotice, setTouched, () => setPass('')),
        [submit, user, pass],
      );
      const saveAcid = useCallback(
        () => submit({ action: 'setAcid', value: acidInput.trim() }, setAcidNotice, setAcidTouched),
        [submit, acidInput],
      );
      const saveInterval = useCallback(
        () => submit({ action: 'setInterval', value: intervalInput.trim() }, setIntervalNotice, setIntervalTouched),
        [submit, intervalInput],
      );

      const loadLogs = useCallback(async () => {
        try {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'logs' }),
          });
          const data = await res.json();
          if (data && Array.isArray(data.logs)) setLogs(data.logs);
        } catch {}
      }, []);

      const runDiagnose = useCallback(async () => {
        if (diagBusy) return;
        setDiagBusy(true);
        try {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'diagnose' }),
          });
          const data = await res.json();
          if (data && data.diag) setDiag(data.diag);
        } catch {}
        finally { setDiagBusy(false); loadLogs(); }
      }, [diagBusy, loadLogs]);

      useEffect(() => { if (view === 'diag') loadLogs(); }, [view, loadLogs]);

      /** 复制链接，并短暂显示「已复制」。 */
      const copyNotice = useCallback(async (url, idx) => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiedIdx(idx);
          setTimeout(() => setCopiedIdx(-1), 1800);
        } catch {
          // 剪贴板不可用时退回选中提示
          setCopiedIdx(idx);
          setTimeout(() => setCopiedIdx(-1), 1800);
        }
      }, []);

      /**
       * 打开原文。
       * 面板运行在 DSH 的应用内，直接改 location 会把整个应用导航走；
       * 所以用新窗口打开，打不开时退回复制链接。
       */
      const openNotice = useCallback((url, idx) => {
        let win = null;
        try {
          win = window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          win = null;
        }
        if (!win) copyNotice(url, idx);
      }, [copyNotice]);

      const meta = statusMeta(status);
      const configured = !!(status && status.configured);
      const auto = !!(status && status.autoLogin);
      const last = status && status.lastLogin;
      const agr = status && status.agreement;
      const agreeChecked = agreeTick !== null ? agreeTick : !!(agr && agr.agreed);
      const needAgree = !!(agr && agr.required && !agreeChecked);
      const usage = status && status.usage;
      const usageOk = !!(usage && usage.ok);
      const accounts = (status && status.accounts) || [];
      const speed = status && status.speed;
      const speedBusy = !!(status && status.speedBusy);
      const speedSources = (status && status.speedSources) || [];
      const speedSource = (status && status.speedSource) || (speedSources[0] && speedSources[0].id) || '';
      const notices = (status && status.notices) || { items: [] };
      const noticeItems = notices.items || [];
      const bgClass = 'gd-bg-' + ((status && status.background) || 'blueprint');
      const now = Date.now();

      const styles = h('style', null, CSS);
      const footer = h('div', { className: 'gd-foot' }, mottoText);
      const noticeEl = (n) => (n
        ? h('span', {
            style: { fontSize: 11.5, color: n.kind === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' },
          }, n.text)
        : null);

      // ---------- 诊断页 ----------
      if (view === 'diag') {
        return h('div', { className: 'gd-page ' + bgClass },
          styles,
          h('div', { className: 'gd-wrap' },
            h('div', { className: 'gd-head' },
              h('div', null,
                h('div', { className: 'gd-brand' }, h('span', { className: 'gd-mark' }), h('h1', { className: 'gd-title' }, '诊断')),
                h('p', { className: 'gd-sub' }, '一键检查各环节，或查看运行日志'),
              ),
              h('button', { className: 'gd-btn gd-btn--ghost', onClick: () => setView('settings') }, '返回'),
            ),
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-row' },
                h('div', { className: 'gd-label' }, '检查结果'),
                h('div', { className: 'gd-row-tight' },
                  h('button', { className: 'gd-btn gd-btn--primary', disabled: diagBusy, onClick: runDiagnose },
                    diagBusy ? '检查中…' : '重新检查'),
                  h('button', { className: 'gd-btn gd-btn--ghost', onClick: loadLogs }, '刷新日志'),
                ),
              ),
              diag && diag.steps
                ? h('div', { className: 'gd-list' },
                    ...diag.steps.map((s, i) => h('div', { key: String(i), className: 'gd-item' },
                      h('span', { className: s.ok ? 'gd-ok' : 'gd-bad' }, s.ok ? '✓' : '✕'),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { style: { fontSize: 13, fontWeight: 600 } }, s.name),
                        h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', marginTop: 2, wordBreak: 'break-all' } }, s.detail),
                      ),
                    )),
                  )
                : h('p', { className: 'gd-hint' }, '点击「一键诊断」开始检查。'),
            ),
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '运行日志'),
              logs.length === 0
                ? h('p', { className: 'gd-hint' }, '暂无日志。')
                : h('div', { className: 'gd-log' },
                    ...logs.slice().reverse().map((l, i) => h('div', { key: String(i), className: 'gd-log-row' },
                      h('span', { className: 'gd-log-time' }, new Date(l.t).toLocaleTimeString()),
                      h('span', {
                        className: 'gd-log-dot',
                        style: {
                          background: l.level === 'error'
                            ? 'var(--dsw-alias-state-error-primary)'
                            : l.level === 'warn'
                              ? 'var(--dsw-alias-state-warn-primary)'
                              : 'var(--dsw-alias-state-success-primary)',
                        },
                      }),
                      h('span', { className: 'gd-log-text' }, l.text),
                    )),
                  ),
            ),
            footer,
          ),
        );
      }

      // ---------- 设置页 ----------
      if (view === 'settings') {
        return h('div', { className: 'gd-page ' + bgClass },
          styles,
          h('div', { className: 'gd-wrap' },
            h('div', { className: 'gd-head' },
              h('div', null,
                h('div', { className: 'gd-brand' }, h('span', { className: 'gd-mark' }), h('h1', { className: 'gd-title' }, '设置')),
                h('p', { className: 'gd-sub' }, '账号、接入设备与检测参数'),
              ),
              h('button', { className: 'gd-btn gd-btn--ghost', onClick: () => setView('main') }, '返回'),
            ),

            // 已保存账号
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '已保存账号'),
              accounts.length === 0
                ? h('p', { className: 'gd-hint' }, '还没有账号，请在下方添加。')
                : h('div', { className: 'gd-chips' },
                    ...accounts.map((a) => h('div', { key: a.username, className: 'gd-row-tight' },
                      h('button', {
                        className: 'gd-chip' + (a.active ? ' gd-chip--on' : ''),
                        disabled: busy,
                        onClick: () => { if (!a.active) act('switchAccount', a.username); },
                      }, (a.active ? '● ' : '') + a.username),
                      h('button', {
                        className: 'gd-btn gd-btn--sm',
                        disabled: busy,
                        onClick: () => act('deleteAccount', a.username),
                      }, '删除'),
                    )),
                  ),
            ),

            // 添加/修改账号
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '添加或修改账号'),
              h('div', { className: 'gd-field' },
                h('label', { className: 'gd-field-label', htmlFor: 'gdou-user' }, '校园网账号（学号）'),
                h('input', {
                  id: 'gdou-user', className: 'gd-input', value: user,
                  placeholder: '例如 20240001', autoComplete: 'username', spellCheck: false,
                  onChange: (e) => { setTouched(true); setNotice(null); setUser(e.target.value); },
                }),
              ),
              h('div', { className: 'gd-field' },
                h('label', { className: 'gd-field-label', htmlFor: 'gdou-pass' }, '密码'),
                h('input', {
                  id: 'gdou-pass', className: 'gd-input', type: 'password', value: pass,
                  placeholder: configured ? '留空表示不修改' : '校园网密码', autoComplete: 'current-password',
                  onChange: (e) => { setTouched(true); setNotice(null); setPass(e.target.value); },
                  onKeyDown: (e) => { if (e.key === 'Enter') saveAccount(); },
                }),
              ),
              h('div', { className: 'gd-row' },
                h('span', null, noticeEl(notice)),
                h('button', { className: 'gd-btn gd-btn--primary', disabled: busy || !user.trim(), onClick: saveAccount },
                  busy ? '保存中…' : '保存并切换'),
              ),
            ),

            // ac_id
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '接入设备 ac_id'),
              h('p', { className: 'gd-hint' }, '默认在断网时从门户重定向自动获取，通常无需填写。'),
              h('div', { className: 'gd-field' },
                h('label', { className: 'gd-field-label', htmlFor: 'gdou-acid' }, '手动覆盖（留空则始终自动获取）'),
                h('input', {
                  id: 'gdou-acid', className: 'gd-input', inputMode: 'numeric', value: acidInput,
                  placeholder: status && status.acid ? '当前 ' + status.acid : '自动',
                  onChange: (e) => { setAcidTouched(true); setAcidNotice(null); setAcidInput(e.target.value); },
                  onKeyDown: (e) => { if (e.key === 'Enter') saveAcid(); },
                }),
              ),
              h('div', { className: 'gd-row' },
                h('span', { className: 'gd-hint' }, '当前：' + acidSourceLabel(status)),
                h('div', { className: 'gd-row-tight' },
                  noticeEl(acidNotice),
                  h('button', { className: 'gd-btn gd-btn--primary', disabled: busy, onClick: saveAcid }, '保存'),
                ),
              ),
            ),

            // 背景样式
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '界面背景'),
              h('div', { className: 'gd-chips' },
                ...[
                  ['blueprint', '海洋蓝图'],
                  ['grid', '点阵'],
                  ['plain', '纯色'],
                  ['off', '关闭'],
                ].map(([id, name]) => h('button', {
                  key: id,
                  className: 'gd-chip' + ((status && status.background) === id ? ' gd-chip--on' : ''),
                  disabled: busy,
                  onClick: () => act('setBackground', id),
                }, name)),
              ),
              h('p', { className: 'gd-hint' }, '默认「海洋蓝图」，以校色网格与海风渐变作为衬底，不干扰正文阅读。'),
            ),

            // 选课公告来源
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-row' },
                h('div', { className: 'gd-label' }, '选课公告'),
                h('button', {
                  className: 'gd-btn gd-btn--ghost',
                  disabled: busy,
                  onClick: () => act('refreshNotices'),
                }, '立即刷新'),
              ),
              h('p', { className: 'gd-hint' },
                '自动抓取教务部首页中含「选课 / 预选 / 退改选」的通知，并识别正文中的开始与截止时间。每次登录成功后抓取一次，另外每天中午 12:00 抓取一次。'),
              h('p', { className: 'gd-mono' },
                '来源：' + ((status && status.notices && status.notices.source) || 'https://jwc.gdou.edu.cn/')),
            ),

            // 检测间隔
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-label' }, '检测间隔'),
              h('div', { className: 'gd-field' },
                h('label', { className: 'gd-field-label', htmlFor: 'gdou-interval' }, '联网状态检测间隔（秒）'),
                h('input', {
                  id: 'gdou-interval', className: 'gd-input', inputMode: 'numeric', value: intervalInput,
                  placeholder: status && status.intervalSec ? '当前 ' + status.intervalSec : '例如 1',
                  onChange: (e) => { setIntervalTouched(true); setIntervalNotice(null); setIntervalInput(e.target.value); },
                  onKeyDown: (e) => { if (e.key === 'Enter') saveInterval(); },
                }),
              ),
              h('p', { className: 'gd-hint' }, '范围 1~3600 秒。认证请求另有 8 秒冷却，检测再快也不会触发限流。'),
              h('div', { className: 'gd-row' },
                h('span', null, noticeEl(intervalNotice)),
                h('button', { className: 'gd-btn gd-btn--primary', disabled: busy, onClick: saveInterval }, '保存'),
              ),
            ),

            // 自动认证
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-row' },
                h('div', { style: { minWidth: 0 } },
                  h('div', { className: 'gd-label' }, '断网自动认证'),
                  h('div', { className: 'gd-hint', style: { marginTop: 4 } },
                    auto ? '检测到断网时自动登录校园网' : '不会自动登录，仅手动登录'),
                ),
                h('button', {
                  role: 'switch', 'aria-checked': auto, 'aria-label': '断网自动认证',
                  className: 'gd-switch' + (auto ? ' gd-switch--on' : ''),
                  disabled: busy,
                  onClick: () => act('setAutoLogin', !auto, { autoLogin: !auto }),
                }, h('span', { className: 'gd-knob' + (auto ? ' gd-knob--on' : '') })),
              ),
            ),

            // 上网协议
            (status && agr && agr.required)
              ? h('div', {
                  className: 'gd-card',
                  style: agreeChecked ? undefined : { borderColor: 'var(--dsw-alias-state-warn-primary)' },
                },
                  h('div', { className: 'gd-label' }, '上网协议'),
                  h('div', {
                    className: 'gd-hint',
                    style: { maxHeight: 96, overflow: 'auto', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 10, padding: '9px 11px' },
                  }, agr.title || '本人承诺遵守校园网管理规定。'),
                  h('label', {
                    style: {
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      cursor: agreeChecked ? 'default' : 'pointer',
                      fontSize: 13, lineHeight: 1.5,
                    },
                  },
                    h('input', {
                      type: 'checkbox', checked: agreeChecked,
                      onChange: () => {
                        if (agreeChecked) return;
                        setAgreeTick(true);
                        act('agree').finally(() => setAgreeTick(null));
                      },
                      style: { marginTop: 2, flex: 'none' },
                    }),
                    h('span', null, agreeChecked ? '已同意，可以登录了' : '我已阅读并同意上述协议（勾选后自动绑定）'),
                  ),
                )
              : null,

            // 诊断入口
            h('div', { className: 'gd-card' },
              h('div', { className: 'gd-row' },
                h('div', { className: 'gd-label' }, '诊断'),
                h('div', { className: 'gd-row-tight' },
                  h('button', { className: 'gd-btn gd-btn--primary', disabled: busy || diagBusy, onClick: runDiagnose },
                    diagBusy ? '检查中…' : '一键诊断'),
                  h('button', { className: 'gd-btn gd-btn--ghost', onClick: () => setView('diag') }, '运行日志'),
                ),
              ),
              h('div', { className: 'gd-info' },
                h('div', null, h('div', { className: 'gd-info-label' }, '服务器'),
                  h('div', { className: 'gd-info-value' }, status ? status.server : '—')),
                h('div', null, h('div', { className: 'gd-info-label' }, '校园网环境'),
                  h('div', { className: 'gd-info-value' },
                    status && status.campus === true ? '在校园网'
                      : status && status.campus === false ? '不在校园网' : '未检测')),
                h('div', null, h('div', { className: 'gd-info-label' }, 'ac_id 来源'),
                  h('div', { className: 'gd-info-value' }, acidSourceLabel(status))),
              ),
              status && status.credentialFailed
                ? h('p', { className: 'gd-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } },
                    '账号或密码错误，已暂停自动重试。修改账号或手动登录后恢复。')
                : null,
              status && status.portalEntry && status.portalEntry.url
                ? h('p', { className: 'gd-mono' }, '门户入口：' + status.portalEntry.url)
                : null,
            ),

            footer,
          ),
        );
      }

      // ---------- 主界面 ----------
      return h('div', { className: 'gd-page ' + bgClass },
        styles,
        h('div', { className: 'gd-wrap' },
          h('div', { className: 'gd-head' },
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'gd-brand' }, h('span', { className: 'gd-mark' }), h('h1', { className: 'gd-title' }, '海大校园网')),
              h('p', { className: 'gd-sub' }, '广东海洋大学 · 深澜认证 · 断网自动登录'),
            ),
            h('div', { className: 'gd-head-right' },
              h('div', { className: 'gd-pill' },
                h('span', { className: 'gd-dot', style: { background: meta.color } }),
                h('span', null, meta.text)),
              h('button', { className: 'gd-btn gd-btn--ghost', onClick: () => setView('settings') }, '设置'),
            ),
          ),

          // 账号切换
          accounts.length > 1
            ? h('div', { className: 'gd-card' },
                h('div', { className: 'gd-row' },
                  h('div', { className: 'gd-label' }, '账号'),
                  h('div', { className: 'gd-chips' },
                    ...accounts.map((a) => h('button', {
                      key: a.username,
                      className: 'gd-chip' + (a.active ? ' gd-chip--on' : ''),
                      disabled: busy,
                      onClick: () => { if (!a.active) act('switchAccount', a.username); },
                    }, (a.active ? '● ' : '') + a.username)),
                  ),
                ),
              )
            : null,

          // 流量
          h('div', { className: 'gd-hero' },
            h('div', { className: 'gd-tint' }),
            h('svg', { className: 'gd-wave', viewBox: '0 0 400 46', preserveAspectRatio: 'none', 'aria-hidden': true },
              h('path', {
                d: 'M0,26 C50,6 100,42 150,26 C200,10 250,42 300,26 C350,10 380,30 400,24 L400,46 L0,46 Z',
                fill: OCEAN.blue, opacity: 0.1,
              }),
              h('path', {
                d: 'M0,34 C60,20 110,46 160,34 C210,22 260,46 310,34 C350,24 380,36 400,32 L400,46 L0,46 Z',
                fill: OCEAN.teal, opacity: 0.1,
              }),
            ),
            h('div', { className: 'gd-hero-body' },
              h('div', { className: 'gd-row' },
                h('div', { style: { minWidth: 0 } },
                  h('div', { className: 'gd-hero-label' }, '累计总用量'),
                  h('div', { className: 'gd-hero-value' }, usageOk ? fmtBytes(usage.totalBytes) : '—'),
                ),
                h('button', {
                  className: 'gd-btn gd-btn--ghost',
                  disabled: busy || !configured,
                  onClick: () => act('refreshUsage'),
                }, '刷新'),
              ),
              h('div', { className: 'gd-hero-meta' },
                h('span', null, usageOk ? (usage.product || '已查询') : ((usage && usage.message) || '尚未查询')),
                h('span', null, '·'),
                h('span', null, usageOk ? '更新于 ' + new Date(usage.updatedAt).toLocaleTimeString() : '在线后自动获取'),
              ),
              usageOk
                ? h('div', { className: 'gd-metrics' },
                    h('div', { className: 'gd-metric' },
                      h('div', { className: 'gd-metric-label' }, '累计时长'),
                      h('div', { className: 'gd-metric-value' }, fmtDuration(usage.totalSeconds))),
                    h('div', { className: 'gd-metric' },
                      h('div', { className: 'gd-metric-label' }, '在线设备'),
                      h('div', { className: 'gd-metric-value' },
                        usage.onlineDevices > 0 ? String(usage.onlineDevices) : '—')),
                  )
                : null,
            ),
          ),

          // 选课公告
          h('div', { className: 'gd-card' },
            h('div', { className: 'gd-row' },
              h('div', { className: 'gd-label' }, '选课公告'),
              h('button', {
                className: 'gd-btn gd-btn--ghost gd-btn--sm',
                disabled: busy,
                onClick: () => act('refreshNotices'),
              }, '刷新'),
            ),
            noticeItems.length === 0
              ? h('p', { className: 'gd-hint' },
                  status && status.noticesBusy ? '正在获取…' : '暂无选课通知，可点「刷新」重新获取。')
              : null,
            ...noticeItems.map((it, idx) => h('div', { key: String(idx), className: 'gd-notice' },
                  h('div', { className: 'gd-row', style: { alignItems: 'flex-start' } },
                    h('div', { className: 'gd-notice-title', style: { minWidth: 0 } }, it.title),
                    h('div', { className: 'gd-row-tight' },
                      h('button', {
                        className: 'gd-btn gd-btn--primary gd-btn--sm',
                        onClick: () => openNotice(it.url, idx),
                      }, copiedIdx === idx ? '已复制链接' : '打开原文'),
                      h('button', {
                        className: 'gd-btn gd-btn--sm',
                        onClick: () => copyNotice(it.url, idx),
                      }, copiedIdx === idx ? '已复制' : '复制链接'),
                    ),
                  ),
                  (it.ranges && it.ranges.length > 0)
                    ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                        ...it.ranges.map((r, i) => {
                          const live = now >= r.start && now <= r.end;
                          const soon = now < r.start;
                          const fmt = (t) => {
                            const d = new Date(t);
                            const p = (n) => String(n).padStart(2, '0');
                            return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
                          };
                          let count = '';
                          if (live) {
                            const left = Math.max(0, r.end - now);
                            count = fmtDuration(Math.floor(left / 1000)) + '后截止';
                          } else if (soon) {
                            const left = Math.max(0, r.start - now);
                            count = fmtDuration(Math.floor(left / 1000)) + '后开始';
                          }
                          return h('div', { key: String(i), className: 'gd-range' },
                            h('span', { className: 'gd-badge ' + (live ? 'gd-badge--live' : soon ? 'gd-badge--soon' : 'gd-badge--done') },
                              live ? '进行中' : soon ? '未开始' : '已结束'),
                            r.label ? h('span', { style: { fontWeight: 600 } }, r.label) : null,
                            h('span', { className: 'gd-time' }, fmt(r.start) + ' → ' + fmt(r.end)),
                            count ? h('span', { className: 'gd-count' }, count) : null,
                          );
                        }),
                      )
                    : h('div', { className: 'gd-hint' }, it.error ? ('解析失败：' + it.error) : '未识别到时间段，请点开原文确认'),
                  h('p', { className: 'gd-mono' }, it.url),
            )),
            h('p', { className: 'gd-hint', style: { fontSize: 11, opacity: 0.75 } },
              '时间由通知正文自动识别，仅供参考，以教务部原文为准。'),
          ),

          // 网络测速
          h('div', { className: 'gd-card' },
            h('div', { className: 'gd-row' },
              h('div', { style: { minWidth: 0 } },
                h('div', { className: 'gd-label' }, '网络测速'),
                h('div', { className: 'gd-hint', style: { marginTop: 4 } },
                  speedBusy ? '正在测速…'
                    : speed && speed.measuredAt
                      ? speed.ok
                        ? speed.sourceName + ' · ' + new Date(speed.measuredAt).toLocaleTimeString()
                        : (speed.sourceName || '') + ' · ' + (speed.message || '测速失败')
                      : '选择测速源后点击开始'),
              ),
              h('button', {
                className: 'gd-btn gd-btn--primary',
                disabled: busy || speedBusy || !configured,
                onClick: () => act('speedtest', speedSource),
              }, speedBusy ? '测速中…' : '开始测速'),
            ),
            h('div', { className: 'gd-chips' },
              ...speedSources.map((s) => h('button', {
                key: s.id,
                className: 'gd-chip' + (s.id === speedSource ? ' gd-chip--on' : ''),
                disabled: busy || speedBusy,
                onClick: () => act('speedtest', s.id),
              }, s.name)),
            ),
            speed && speed.measuredAt && speed.ok
              ? h('div', { className: 'gd-metrics' },
                  h('div', { className: 'gd-metric' },
                    h('div', { className: 'gd-metric-label' }, '下载速率'),
                    h('div', { className: 'gd-metric-value' }, speed.mbps.toFixed(1) + ' Mbps')),
                  h('div', { className: 'gd-metric' },
                    h('div', { className: 'gd-metric-label' }, '首字节延迟'),
                    h('div', { className: 'gd-metric-value' }, speed.ttfbMs + ' ms')),
                  h('div', { className: 'gd-metric' },
                    h('div', { className: 'gd-metric-label' }, '下载数据'),
                    h('div', { className: 'gd-metric-value' }, fmtBytes(speed.bytes))),
                )
              : null,
            h('p', { className: 'gd-hint', style: { fontSize: 11, opacity: 0.75 } },
              '测速使用 ' + ((speed && speed.conns) || 8) + ' 条并发连接累加，单连接会被镜像站限速导致偏低。'),
          ),

          // 快捷操作
          h('div', { className: 'gd-card' },
            h('div', { className: 'gd-row' },
              h('div', { style: { minWidth: 0 } },
                h('div', { className: 'gd-label' }, '快捷操作'),
                h('div', { className: 'gd-hint', style: { marginTop: 4 } },
                  !configured ? '请先到设置里添加账号'
                    : needAgree ? '请先到设置里勾选同意上网协议'
                    : '立即登录，或登出当前设备'),
              ),
              h('div', { className: 'gd-actions gd-row-tight' },
                h('button', {
                  className: 'gd-btn gd-btn--primary',
                  disabled: busy || !configured || needAgree,
                  onClick: () => act('login'),
                }, busy ? '处理中…' : '立即登录'),
                h('button', {
                  className: 'gd-btn gd-btn--ghost',
                  disabled: busy || !configured,
                  onClick: () => act('logout'),
                }, '登出'),
                h('button', { className: 'gd-btn gd-btn--ghost', disabled: busy, onClick: () => act('refresh') }, '重新检测'),
              ),
            ),
          ),

          // 账号概览
          configured
            ? h('div', { className: 'gd-card' },
                h('div', { className: 'gd-label' }, '账号'),
                h('div', { className: 'gd-info' },
                  h('div', null, h('div', { className: 'gd-info-label' }, '学号'),
                    h('div', { className: 'gd-info-value' }, status.username)),
                  h('div', null, h('div', { className: 'gd-info-label' }, 'ac_id'),
                    h('div', { className: 'gd-info-value' }, String(status.acid))),
                  h('div', null, h('div', { className: 'gd-info-label' }, '检测间隔'),
                    h('div', { className: 'gd-info-value' }, status.intervalSec + ' 秒')),
                  h('div', null, h('div', { className: 'gd-info-label' }, '自动认证'),
                    h('div', { className: 'gd-info-value' }, auto ? '已开启' : '已关闭')),
                ),
              )
            : null,

          // 最近结果
          (status && (status.lastError || last))
            ? h('div', { className: 'gd-card' },
                h('div', { className: 'gd-label' }, '最近结果'),
                status.lastError
                  ? h('p', { className: 'gd-mono', style: { color: 'var(--dsw-alias-state-error-primary)' } }, '错误：' + status.lastError)
                  : null,
                last
                  ? h('p', {
                      className: 'gd-mono',
                      style: { color: last.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' },
                    },
                      (last.action === 'login' ? '登录' : '登出') + '：' + (last.ok ? '成功' : '失败') +
                      (last.msg ? ' · ' + last.msg : ''))
                  : null,
                last && !last.ok && last.detail
                  ? h('p', { className: 'gd-mono' }, '服务器：' + last.detail)
                  : null,
                status.lastRunAt
                  ? h('p', { className: 'gd-mono' }, '时间：' + new Date(status.lastRunAt).toLocaleString())
                  : null,
              )
            : null,

          footer,
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: -20,
          label: () => '校园网',
        }, SidebarIcon));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, Panel));
      },
    };
  },
});