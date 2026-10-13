import { useState, useEffect } from 'react';

const api = async (p, m = 'GET', b) => {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') }, body: b && JSON.stringify(b) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
};
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const TABS = [['Dashboard', 'Dashboard'], ['Contacts', 'Customers'], ['Campaigns', 'Campaigns'], ['Autopilot', 'Autopilot'], ['Setup', 'Setup']];

const Eye = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{on && <path d="M4 4l16 16" />}
  </svg>
);

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={onChange} required minLength={6} />
      <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}><Eye on={show} /></button>
    </div>
  );
}

function Auth({ done }) {
  const resetToken = new URLSearchParams(location.search).get('reset');
  const [m, setM] = useState(resetToken ? 'reset' : 'login'), [f, setF] = useState({}), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const swap = (x) => { setM(x); setErr(''); setMsg(''); };
  const go = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      if (m === 'forgot') { await api('/forgot', 'POST', f); setMsg('If that email has an account, a reset link is on its way. It works for one hour.'); return; }
      const r = await api('/' + m, 'POST', m === 'reset' ? { token: resetToken, password: f.password } : f);
      localStorage.token = r.token;
      if (m === 'reset') history.replaceState({}, '', '/');
      done();
    } catch (x) { setErr(x.message); }
  };
  return (
    <div className="auth">
      <div className="badge"><img src="/logo.png" alt="Arvo Market" /></div>
      <form className="panel" onSubmit={go}>
        <h2>{{ login: 'Log in to your agent', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' }[m]}</h2>
        {m === 'forgot' && <p className="note">Enter your email and we'll send a link to set a new password.</p>}
        {m === 'signup' && <><input placeholder="Your name" onChange={set('name')} required /><input placeholder="Business name" onChange={set('business')} required /></>}
        {m !== 'reset' && <input type="email" placeholder="Email" value={f.email || ''} onChange={set('email')} required />}
        {m !== 'forgot' && <PasswordField placeholder={m === 'reset' ? 'New password (6+ characters)' : 'Password (6+ characters)'} value={f.password || ''} onChange={set('password')} />}
        {err && <p className="err">{err}</p>}
        {msg && <p className="note">{msg}</p>}
        <button className="btn">{{ login: 'Log in', signup: 'Sign up', forgot: 'Send reset link', reset: 'Save new password' }[m]}</button>
        {m === 'login' && <p className="link" onClick={() => swap('forgot')}>Forgot password?</p>}
        {(m === 'login' || m === 'signup') ? <p className="link" onClick={() => swap(m === 'login' ? 'signup' : 'login')}>{m === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}</p> : <p className="link" onClick={() => swap('login')}>Back to log in</p>}
      </form>
    </div>
  );
}

function Countdown({ a }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!a?.on || !a.last) return <b>Off</b>;
  const ms = new Date(a.last).getTime() + a.everyHours * 3600e3 - Date.now();
  if (ms <= 0) return <b>Running</b>;
  const S = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, '0');
  return <b>{p(Math.floor(S / 3600))}:{p(Math.floor(S / 60) % 60)}:{p(S % 60)}</b>;
}

function Dash({ s }) {
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toDateString(); });
  const counts = days.map((d) => s.logs.filter((l) => new Date(l.at).toDateString() === d).length);
  const max = Math.max(...counts, 1);
  const ok = s.logs.filter((l) => !l.status.startsWith('failed')).length;
  return (
    <>
      <div className="stats">
        <div className="stat"><span>Customers</span><b>{s.contacts.length}</b></div>
        <div className="stat"><span>Messages sent</span><b>{s.logs.length}</b></div>
        <div className="stat"><span>Delivery rate</span><b>{s.logs.length ? Math.round((ok / s.logs.length) * 100) : 100}%</b></div>
        <div className="stat"><span>Next agent run</span><Countdown a={s.user.autopilot} /></div>
      </div>
      <div className="grid2">
        <section className="panel">
          <h3>Messages, last 7 days</h3>
          <div className="bars">{counts.map((n, i) => <div key={i} className="bar"><em>{n}</em><i style={{ height: Math.max((n / max) * 100, 3) + '%' }} /><span>{days[i].slice(0, 3)}</span></div>)}</div>
        </section>
        <section className="panel">
          <h3>Agent console</h3>
          <div className="term">
            {[...s.agent].reverse().slice(-12).map((l) => <p key={l.id}><time>{new Date(l.at).toLocaleTimeString([], { hour12: false })}</time> {l.text}</p>)}
            {!s.agent.length && <p className="dim">Idle. Run the agent from Autopilot to watch it work.</p>}
            <p className="cur">&gt; <span /></p>
          </div>
        </section>
      </div>
      <p className="note">Email is <b>{s.mode.email ? 'live' : 'simulated'}</b>, texts are <b>{s.mode.sms ? 'live' : 'simulated'}</b>, copywriting uses <b>{s.mode.ai || 'templates'}</b>. Add keys to .env to go live.</p>
      <h3>Recent activity</h3>
      <table><tbody>{s.logs.slice(0, 15).map((l) => <tr key={l.id}><td>{new Date(l.at).toLocaleString()}</td><td>{l.campaign}</td><td>{l.channel}</td><td>{l.to}</td><td className={l.status.startsWith('failed') ? 'err' : ''}>{l.status}</td></tr>)}</tbody></table>
    </>
  );
}

function Contacts({ s, load }) {
  const [t, setT] = useState('');
  return (
    <>
      <h3>Add customers</h3>
      <textarea rows={4} value={t} onChange={(e) => setT(e.target.value)} placeholder={'One per line: name, email, phone, tag (optional)\nJane Doe, jane@email.com, +15551234567, vip'} />
      <button className="btn" onClick={async () => { await api('/contacts', 'POST', { lines: t }); setT(''); load(); }}>Add customers</button>
      <h3>Your customers ({s.contacts.length})</h3>
      <table><tbody>{s.contacts.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{c.phone}</td><td>{c.tag && <span className="tag">{c.tag}</span>}{c.optOut && ' opted out'}</td><td><a className="x" onClick={async () => { await api('/contacts/' + c.id, 'DELETE'); load(); }}>Remove</a></td></tr>)}</tbody></table>
    </>
  );
}

function Campaigns({ s, load }) {
  const blank = { name: '', goal: '', subject: '', email: '', sms: '', scheduleAt: '' };
  const [f, setF] = useState({ ...blank, tag: '', tone: 'warm and friendly', channels: ['email', 'sms'] }), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const gen = async () => { setBusy(true); try { setF({ ...f, ...(await api('/generate', 'POST', f)) }); } finally { setBusy(false); } };
  const go = async (now) => { try { await api('/campaigns', 'POST', { ...f, now }); setF({ ...f, ...blank }); setErr(''); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      <h3>New campaign</h3>
      <div className="panel form">
        <input placeholder="Campaign name" value={f.name} onChange={set('name')} />
        <input placeholder="Goal, e.g. Promote our weekend 20% off sale" value={f.goal} onChange={set('goal')} />
        <div className="row"><input placeholder="Tone" value={f.tone} onChange={set('tone')} /><input placeholder="Audience tag (blank = everyone)" value={f.tag} onChange={set('tag')} /></div>
        <button className="btn alt" onClick={gen} disabled={busy || !f.goal}>{busy ? 'Writing...' : 'Have the agent write it'}</button>
        <input placeholder="Email subject" value={f.subject} onChange={set('subject')} />
        <textarea rows={5} placeholder="Email body. Use {{name}} for the customer's first name." value={f.email} onChange={set('email')} />
        <textarea rows={2} placeholder="Text message. Use {{name}}." value={f.sms} onChange={set('sms')} />
        <div className="row">
          {['email', 'sms'].map((c) => <label key={c}><input type="checkbox" checked={f.channels.includes(c)} onChange={() => setF({ ...f, channels: toggle(f.channels, c) })} /> {c === 'sms' ? 'Text' : 'Email'}</label>)}
          <input type="datetime-local" value={f.scheduleAt} onChange={set('scheduleAt')} />
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="btn" onClick={() => go(true)}>Send now</button>
          <button className="btn alt" disabled={!f.scheduleAt} onClick={() => go(false)}>Schedule</button>
        </div>
      </div>
      <h3>History</h3>
      <table><tbody>{s.campaigns.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.channels.join(' + ')}</td><td>{c.tag && <span className="tag">{c.tag}</span>}</td><td>{c.status}{c.status === 'scheduled' ? ' for ' + new Date(c.scheduleAt).toLocaleString() : ''}</td><td>{c.recipients ?? ''}</td></tr>)}</tbody></table>
    </>
  );
}

function Autopilot({ s, load }) {
  const a = s.user.autopilot || {};
  const [f, setF] = useState({ on: false, goal: '', tone: 'warm and friendly', everyHours: 24, channels: ['email'], ...a }), [err, setErr] = useState('');
  const save = async (o) => { const n = { ...f, ...o }; setF(n); try { await api('/autopilot', 'PUT', n); setErr(''); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      <h3>Autonomous agent</h3>
      <p className="note">When autopilot is on, the agent writes a fresh campaign toward your goal and sends it to opted-in customers on your schedule. Watch it work in the console on the Dashboard.</p>
      <div className="panel form">
        <input placeholder="Standing goal, e.g. Bring customers back and promote new arrivals" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        <input placeholder="Tone" value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} />
        <div className="row">
          <label>Run every <input type="number" min="0.02" step="any" value={f.everyHours} onChange={(e) => setF({ ...f, everyHours: +e.target.value })} /> hours</label>
          {['email', 'sms'].map((c) => <label key={c}><input type="checkbox" checked={f.channels.includes(c)} onChange={() => setF({ ...f, channels: toggle(f.channels, c) })} /> {c === 'sms' ? 'Text' : 'Email'}</label>)}
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="btn" onClick={() => save({ on: !f.on })}>{f.on ? 'Turn autopilot off' : 'Turn autopilot on'}</button>
          <button className="btn alt" onClick={async () => { await save({}); try { await api('/autopilot/run', 'POST'); load(); } catch (e) { setErr(e.message); } }}>Run the agent now</button>
        </div>
        {a.on && <p className="note">Next run in <Countdown a={a} /></p>}
      </div>
    </>
  );
}

function Setup({ s }) {
  const [to, setTo] = useState({ email: '', sms: '' }), [res, setRes] = useState({});
  const put = (ch, v) => setRes((r) => ({ ...r, [ch]: v }));
  const test = async (ch) => {
    put(ch, 'Sending...');
    try { const r = await api('/test', 'POST', { channel: ch, to: to[ch] }); put(ch, r.status === 'simulated' ? 'Simulated. Add your keys to .env and restart the app to send for real.' : 'Sent. Check your ' + (ch === 'sms' ? 'phone.' : 'inbox.')); } catch (e) { put(ch, 'Failed: ' + e.message); }
  };
  return (
    <>
      <h3>Connections</h3>
      <p className="note">Add your keys to the .env file, restart the app, then test each connection here. Copywriting: <b>{s.mode.ai ? 'connected to ' + s.mode.ai : 'using templates'}</b>.</p>
      {[['email', 'Email', s.mode.email], ['sms', 'Texts', s.mode.sms]].map(([ch, n, on]) => (
        <div key={ch} className="panel form">
          <b>{n}: {on ? 'connected' : 'not connected (simulated)'}</b>
          <div className="row">
            <input placeholder={ch === 'sms' ? 'Your phone, e.g. +15551234567' : 'Your email'} value={to[ch]} onChange={(e) => setTo({ ...to, [ch]: e.target.value })} />
            <button className="btn alt" onClick={() => test(ch)}>Send test</button>
          </div>
          {res[ch] && <p className={res[ch].startsWith('Failed') ? 'err' : 'note'}>{res[ch]}</p>}
        </div>
      ))}
    </>
  );
}

function Palette({ go, close, run }) {
  const [q, setQ] = useState('');
  const items = [...TABS.map(([id, n]) => ({ t: 'Go to ' + n, f: () => go(id) })), { t: 'Run the agent now', f: run }].filter((i) => i.t.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="veil" onClick={close}>
      <div className="pal" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Type a command" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && items[0]) { items[0].f(); close(); } if (e.key === 'Escape') close(); }} />
        {items.map((i) => <a key={i.t} onClick={() => { i.f(); close(); }}>{i.t}</a>)}
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.token && !new URLSearchParams(location.search).get('reset')), [s, setS] = useState(null), [tab, setTab] = useState('Dashboard'), [pal, setPal] = useState(false);
  const load = () => api('/state').then(setS).catch(() => { localStorage.removeItem('token'); setAuthed(false); });
  useEffect(() => { if (!authed) return; load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [authed]);
  useEffect(() => { const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPal(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (!authed) return <Auth done={() => setAuthed(true)} />;
  if (!s) return <p className="auth">Loading...</p>;
  const P = { s, load };
  const runAgent = () => api('/autopilot/run', 'POST').then(() => { setTab('Dashboard'); load(); }).catch((e) => alert(e.message));
  return (
    <div className="app">
      <aside>
        <h1 className="brand">Arvo Market</h1>
        {TABS.map(([id, n]) => <a key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{n}</a>)}
        <a onClick={() => setPal(true)} className="kbd">Commands <kbd>Cmd K</kbd></a>
        <div className="status"><i className={s.user.autopilot?.on ? 'live' : ''} />{s.user.autopilot?.on ? 'Agent on autopilot' : 'Agent idle'}</div>
        <a className="out" onClick={() => { localStorage.removeItem('token'); setAuthed(false); }}>Log out</a>
      </aside>
      <main>
        <p className="hi">{s.user.business}, signed in as {s.user.name}</p>
        {tab === 'Dashboard' && <Dash {...P} />}
        {tab === 'Contacts' && <Contacts {...P} />}
        {tab === 'Campaigns' && <Campaigns {...P} />}
        {tab === 'Autopilot' && <Autopilot {...P} />}
        {tab === 'Setup' && <Setup {...P} />}
      </main>
      {pal && <Palette go={setTab} close={() => setPal(false)} run={runAgent} />}
    </div>
  );
}
