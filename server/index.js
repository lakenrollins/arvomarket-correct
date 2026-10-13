import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DIR = process.env.DATA_DIR || 'server';
fs.mkdirSync(DIR, { recursive: true });
const DB = DIR + '/data.json';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('Set JWT_SECRET before running in production');
let db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : { users: [], contacts: [], campaigns: [], logs: [] };
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 2));
const id = () => crypto.randomUUID();
const E = process.env;

// ---------- Channels (simulated until keys are added) ----------
const mail = E.SMTP_HOST ? nodemailer.createTransport({ host: E.SMTP_HOST, port: +E.SMTP_PORT || 587, auth: { user: E.SMTP_USER, pass: E.SMTP_PASS } }) : null;
const sendEmail = async (to, subject, text) => {
  if (!mail) return 'simulated';
  await mail.sendMail({ from: E.MAIL_FROM || E.SMTP_USER, to, subject, text });
  return 'sent';
};
const sendSMS = async (to, body) => {
  if (!E.TWILIO_SID) return 'simulated';
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${E.TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(E.TWILIO_SID + ':' + E.TWILIO_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: E.TWILIO_FROM, Body: body }),
  });
  if (!r.ok) throw new Error('Twilio: ' + ((await r.json().catch(() => ({}))).message || r.status));
  return 'sent';
};

// ---------- AI agent ----------
const generate = async ({ goal, business, tone }) => {
  const b = business || 'our shop';
  const fallback = {
    subject: `${goal} | ${b}`,
    email: `Hi {{name}},\n\n${goal}.\n\nWe'd love to see you soon.\n\nWarmly,\n${b}`,
    sms: `Hi {{name}}! ${goal}. - ${b}`.slice(0, 140),
  };
  if (!E.ANTHROPIC_API_KEY) return fallback;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: E.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: `You are the marketing agent for "${b}". Goal: ${goal}. Tone: ${tone || 'friendly'}. Return ONLY JSON: {"subject":"","email":"","sms":""}. Use {{name}} for the customer's first name. Email: plain text, under 120 words. SMS: under 140 characters. No placeholders other than {{name}}.` }],
      }),
    });
    const j = await r.json();
    return JSON.parse(j.content[0].text.replace(/```json|```/g, '').trim());
  } catch { return fallback; }
};

// ---------- Sending ----------
db.agent ||= [];
const say = (uid, text) => { db.agent.unshift({ id: id(), userId: uid, text, at: new Date().toISOString() }); db.agent = db.agent.slice(0, 300); };

const run = async (c) => {
  const people = db.contacts.filter((x) => x.userId === c.userId && !x.optOut && (!c.tag || x.tag === c.tag));
  const fill = (s, p) => (s || '').replaceAll('{{name}}', p.name.split(' ')[0]);
  const jobs = people.flatMap((p) => c.channels.map((ch) => ({ p, ch, to: ch === 'email' ? p.email : p.phone })).filter((j) => j.to));
  say(c.userId, `Audience locked: ${people.length} opted-in customers${c.tag ? ` tagged "${c.tag}"` : ''}, ${jobs.length} messages queued`);
  let failed = 0;
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(jobs.slice(i, i + 10).map(async ({ p, ch, to }) => {
      let status;
      try {
        status = ch === 'email'
          ? await sendEmail(to, fill(c.subject, p), fill(c.email, p) + '\n\n--\nReply STOP to unsubscribe.')
          : await sendSMS(to, fill(c.sms, p) + ' Reply STOP to opt out');
      } catch (e) { status = 'failed: ' + e.message; failed++; }
      db.logs.unshift({ id: id(), userId: c.userId, campaignId: c.id, campaign: c.name, channel: ch, to, status, at: new Date().toISOString() });
    }));
  }
  c.status = 'sent'; c.sentAt = new Date().toISOString(); c.recipients = people.length;
  db.logs = db.logs.slice(0, 3000);
  say(c.userId, `Done: ${jobs.length - failed}/${jobs.length} delivered for "${c.name}"`);
  save();
};

const autoRun = async (u) => {
  const a = u.autopilot;
  if (!a?.goal) throw new Error('Set a standing goal first');
  a.last = new Date().toISOString();
  say(u.id, `Agent woke up. Goal: ${a.goal}`);
  say(u.id, 'Writing fresh email and text copy...');
  const g = await generate({ goal: a.goal, business: u.business, tone: a.tone });
  say(u.id, `Drafted subject: "${g.subject}"`);
  const c = { id: id(), userId: u.id, name: 'Autopilot ' + new Date().toLocaleDateString(), goal: a.goal, ...g, channels: a.channels?.length ? a.channels : ['email'], status: 'sending', auto: true, createdAt: a.last };
  db.campaigns.unshift(c);
  await run(c);
};

// Scheduler: sends scheduled campaigns and runs autopilot agents
setInterval(async () => {
  const now = Date.now();
  for (const c of db.campaigns) if (c.status === 'scheduled' && new Date(c.scheduleAt) <= now) { c.status = 'sending'; await run(c); }
  for (const u of db.users) {
    const a = u.autopilot;
    if (a?.on && a.last && now - new Date(a.last) >= a.everyHours * 3600e3) { try { await autoRun(u); } catch (e) { console.log('autopilot:', e.message); } }
  }
}, 15000);

// ---------- API ----------
const app = express();
app.use(cors(), express.json(), express.urlencoded({ extended: false }));
const h = (f) => (q, s) => Promise.resolve(f(q, s)).catch((e) => s.status(400).json({ error: e.message }));
const auth = (q, s, n) => { try { q.uid = jwt.verify((q.headers.authorization || '').slice(7), SECRET).uid; n(); } catch { s.status(401).json({ error: 'Please log in' }); } };
const user = (q) => db.users.find((u) => u.id === q.uid);
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, business: u.business, autopilot: u.autopilot });
const token = (u) => ({ token: jwt.sign({ uid: u.id }, SECRET, { expiresIn: '30d' }), user: pub(u) });

app.post('/api/signup', h(async (q, s) => {
  const { name, email, password, business } = q.body;
  if (db.users.some((u) => u.email === email.toLowerCase())) throw new Error('That email already has an account');
  const u = { id: id(), name, business, email: email.toLowerCase(), hash: await bcrypt.hash(password, 10), autopilot: null };
  db.users.push(u); save(); s.json(token(u));
}));
app.post('/api/login', h(async (q, s) => {
  const u = db.users.find((x) => x.email === (q.body.email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(q.body.password, u.hash))) throw new Error('Wrong email or password');
  s.json(token(u));
}));

app.post('/api/forgot', h(async (q, s) => {
  const u = db.users.find((x) => x.email === (q.body.email || '').toLowerCase());
  if (u) {
    const raw = crypto.randomBytes(32).toString('hex');
    u.reset = { hash: crypto.createHash('sha256').update(raw).digest('hex'), exp: Date.now() + 3600e3 };
    save();
    const link = `${E.APP_URL || 'http://localhost:5173'}/?reset=${raw}`;
    try {
      if (mail) await sendEmail(u.email, 'Reset your Arvo Market password', `Hi ${u.name},\n\nUse this link to choose a new password. It works for one hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`);
      else console.log(`\n[Password reset: email not configured] Link for ${u.email}:\n${link}\n`);
    } catch (e) { console.log('Reset email failed:', e.message); }
  }
  s.json({ ok: true });
}));
app.post('/api/reset', h(async (q, s) => {
  const { token: t, password } = q.body;
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
  const hash = crypto.createHash('sha256').update(t || '').digest('hex');
  const u = db.users.find((x) => x.reset && x.reset.hash === hash && x.reset.exp > Date.now());
  if (!u) throw new Error('This reset link is invalid or has expired');
  u.hash = await bcrypt.hash(password, 10); delete u.reset; save(); s.json(token(u));
}));

app.get('/api/state', auth, h((q, s) => s.json({
  user: pub(user(q)),
  contacts: db.contacts.filter((x) => x.userId === q.uid),
  campaigns: db.campaigns.filter((x) => x.userId === q.uid),
  logs: db.logs.filter((x) => x.userId === q.uid).slice(0, 200),
  agent: db.agent.filter((x) => x.userId === q.uid).slice(0, 40),
  mode: { email: !!mail, sms: !!E.TWILIO_SID, ai: !!E.ANTHROPIC_API_KEY },
})));

app.post('/api/contacts', auth, h((q, s) => {
  const rows = (q.body.lines || '').split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((p) => p[0] && (p[1] || p[2]));
  rows.forEach(([name, email, phone, tag]) => db.contacts.push({ id: id(), userId: q.uid, name, email, phone, tag: tag || '', optOut: false }));
  save(); s.json({ added: rows.length });
}));
app.delete('/api/contacts/:id', auth, h((q, s) => { db.contacts = db.contacts.filter((c) => !(c.id === q.params.id && c.userId === q.uid)); save(); s.json({}); }));

app.post('/api/generate', auth, h(async (q, s) => s.json(await generate({ ...q.body, business: user(q).business }))));

app.post('/api/test', auth, h(async (q, s) => {
  const { channel, to } = q.body;
  if (!to) throw new Error('Enter where to send the test');
  const status = channel === 'sms' ? await sendSMS(to, 'Test from Arvo Market. Your texting is connected.') : await sendEmail(to, 'Arvo Market test', 'Your email sending is connected.');
  s.json({ status });
}));

app.post('/api/campaigns', auth, h(async (q, s) => {
  const { name, goal, subject, email, sms, channels, scheduleAt, now, tag } = q.body;
  const c = { id: id(), userId: q.uid, name: name || 'Untitled campaign', goal, subject, email, sms, channels, tag, createdAt: new Date().toISOString(), status: now ? 'sending' : 'scheduled', scheduleAt };
  db.campaigns.unshift(c);
  if (now) await run(c); else save();
  s.json(c);
}));

app.put('/api/autopilot', auth, h((q, s) => {
  const u = user(q), was = u.autopilot;
  u.autopilot = { ...q.body, last: q.body.on && !was?.on ? new Date().toISOString() : was?.last };
  save(); s.json({});
}));
app.post('/api/autopilot/run', auth, h(async (q, s) => { await autoRun(user(q)); s.json({}); }));

// Twilio inbound webhook: point Twilio at POST /api/twilio/inbound to honor STOP replies
app.post('/api/twilio/inbound', (q, s) => {
  if (/^\s*stop/i.test(q.body.Body || '')) { db.contacts.filter((c) => c.phone === q.body.From).forEach((c) => (c.optOut = true)); save(); }
  s.type('text/xml').send('<Response/>');
});

// Production: serve the built website from the same server
if (fs.existsSync('dist')) {
  app.use(express.static('dist'));
  app.get('*', (q, s) => s.sendFile(path.resolve('dist/index.html')));
}
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('Arvo running on :' + PORT));
