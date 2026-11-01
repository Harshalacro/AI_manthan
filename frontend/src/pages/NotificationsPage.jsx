import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roleName, scopeName } from '../lib/auth';

/**
 * Notification settings: where this official receives alerts for their area.
 *
 * IRIS posts each alert to the automation webhook (viaSocket), which sends
 * the email / WhatsApp / SMS / call. Red alerts ask for a voice call; everything
 * says it comes from a research prototype.
 */

const CHANNELS = [
  ['email', 'Email', 'ईमेल'],
  ['whatsapp', 'WhatsApp', 'व्हाट्सऐप'],
  ['sms', 'SMS', 'SMS'],
  ['call', 'Voice call (Red only)', 'वॉइस कॉल (केवल लाल)'],
];
const STATUS = {
  sent: ['Delivered to automation', 'ऑटोमेशन को भेजा', '#0B8A3D'],
  failed: ['Failed', 'विफल', '#C1121F'],
  no_webhook: ['Webhook not set', 'वेबहुक सेट नहीं', '#C99700'],
  received: ['Received', 'प्राप्त', '#1B5FA8'],
};
const EVENT = {
  alert: ['Alert', 'चेतावनी'],
  escalation: ['Red escalation', 'लाल आपात'],
  all_clear: ['All clear', 'सब सामान्य'],
  daily_brief: ['Daily brief', 'दैनिक सारांश'],
  test: ['Test', 'परीक्षण'],
  ack: ['Acknowledged', 'स्वीकार किया'],
};

// The Wi-Fi alert point (wifi-alert/wifi_alert.py) runs on the laptop whose
// hotspot it switches, so the button calls that laptop, not the API server.
// Nothing is sent to it until the button is pressed.
const WIFI_ALERT = (import.meta.env.VITE_WIFI_ALERT_URL ?? 'http://localhost:8091').replace(/\/+$/, '');

export default function NotificationsPage({ lang, user }) {
  const L = (en, hi) => (lang === 'hi' ? hi : en);
  const hiFont = lang === 'hi' ? 'font-devanagari' : '';
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', phone: '', channels: ['email', 'whatsapp'], min_level: 'orange', daily_brief: true, enabled: true });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () =>
    api
      .notifySettings()
      .then((d) => {
        setData(d);
        if (d.prefs) setForm({ ...d.prefs, name: d.prefs.name ?? '', email: d.prefs.email ?? '', whatsapp: d.prefs.whatsapp ?? '', phone: d.prefs.phone ?? '' });
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (c) => set('channels', form.channels.includes(c) ? form.channels.filter((x) => x !== c) : [...form.channels, c]);

  const save = async () => {
    setBusy('save');
    setMsg(null);
    try {
      await api.saveNotify(form);
      await load();
      setMsg({ ok: true, text: L('Saved. New alerts for your area will be sent automatically.', 'सहेजा गया। आपके क्षेत्र की नई चेतावनियाँ अपने-आप भेजी जाएँगी।') });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setMsg(null);
    try {
      const r = await api.testNotify();
      setData((d) => ({ ...d, log: r.log }));
      setMsg(
        r.status === 'sent'
          ? { ok: true, text: L('Test sent to the automation webhook — check your email / WhatsApp.', 'परीक्षण ऑटोमेशन वेबहुक को भेजा गया — अपना ईमेल / व्हाट्सऐप देखें।') }
          : r.status === 'no_webhook'
            ? { ok: false, text: L('The automation webhook is not configured on the server yet (JALDRISHTI_NOTIFY_WEBHOOK).', 'सर्वर पर ऑटोमेशन वेबहुक अभी सेट नहीं है (JALDRISHTI_NOTIFY_WEBHOOK)।') }
            : { ok: false, text: L('The webhook did not accept the test — see the log below.', 'वेबहुक ने परीक्षण स्वीकार नहीं किया — नीचे लॉग देखें।') },
      );
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const [wifi, setWifi] = useState({ live: false, busy: false, text: null, ok: true });
  const broadcast = async () => {
    const action = wifi.live ? 'stop' : 'broadcast';
    setWifi((w) => ({ ...w, busy: true, text: null }));
    try {
      const r = await fetch(`${WIFI_ALERT}/api/${action}`, { method: 'POST', signal: AbortSignal.timeout(100000) });
      const s = await r.json();
      if (r.status === 403) throw new Error(s.error);
      if (s.error) setWifi({ live: s.broadcasting, busy: false, ok: false, text: s.error });
      else
        setWifi({
          live: s.broadcasting,
          busy: false,
          ok: true,
          text: s.broadcasting
            ? s.mode === 'drill'
              ? L(`Broadcasting a drill for ${s.place} as “${s.ssid}”. Phones that join see the alert.`, `${s.place} के लिए अभ्यास “${s.ssid}” के रूप में प्रसारित। जुड़ने वाले फ़ोन चेतावनी देखेंगे।`)
              : s.warnings
                ? L(`Broadcasting ${s.warnings} live warning(s) for ${s.place} as “${s.ssid}”. Phones that join see the alert.`, `${s.place} की ${s.warnings} लाइव चेतावनी “${s.ssid}” के रूप में प्रसारित। जुड़ने वाले फ़ोन चेतावनी देखेंगे।`)
                : L(`No Red or Orange warning for ${s.place} right now. Broadcasting that as “${s.ssid}”.`, `अभी ${s.place} के लिए कोई लाल या नारंगी चेतावनी नहीं। यह “${s.ssid}” के रूप में प्रसारित।`)
            : L('Stopped. The hotspot is back to normal.', 'रोका गया। हॉटस्पॉट सामान्य हो गया।'),
        });
    } catch (e) {
      setWifi((w) => ({
        ...w,
        busy: false,
        ok: false,
        text:
          e instanceof TypeError || e.name === 'TimeoutError'
            ? L('No Wi-Fi alert point on this computer. Start it first: python wifi-alert/wifi_alert.py', 'इस कंप्यूटर पर वाई-फ़ाई अलर्ट पॉइंट नहीं चल रहा। पहले चलाएँ: python wifi-alert/wifi_alert.py')
            : e.message,
      }));
    }
  };

  const input = 'w-full rounded-lg border border-ink-700 bg-white px-3 py-2.5 text-[14px] focus:border-chakra-500 focus:outline-none focus:ring-2 focus:ring-chakra-500/15';

  return (
    <div id="main-content" className={`mx-auto w-full max-w-[1100px] space-y-5 px-4 py-5 ${hiFont}`}>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-500">{roleName(user, lang)} · {scopeName(user, lang)}</div>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-chakra-500">{L('Alert notifications', 'चेतावनी सूचनाएँ')}</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-ink-400">
          {L(
            'Get your area’s alerts automatically by email, WhatsApp, SMS or a phone call — sent the moment they appear, plus a daily brief each morning. You can switch it off any time.',
            'अपने क्षेत्र की चेतावनियाँ ईमेल, व्हाट्सऐप, SMS या फ़ोन कॉल से अपने-आप पाएँ — जैसे ही वे आएँ, और हर सुबह दैनिक सारांश। कभी भी बंद कर सकते हैं।',
          )}
        </p>
      </div>

      {data && !data.webhook_configured && (
        <div className="rounded-xl border border-risk-yellow/50 bg-risk-yellow/10 px-4 py-3 text-[13px] text-ink-200">
          <b>{L('Automation not connected yet.', 'ऑटोमेशन अभी जुड़ा नहीं।')}</b>{' '}
          {L(
            'You can save your settings now; messages start flowing once the server’s viaSocket webhook is set.',
            'आप अभी सेटिंग सहेज सकते हैं; सर्वर पर viaSocket वेबहुक सेट होते ही संदेश जाने लगेंगे।',
          )}
        </div>
      )}
      {msg && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] ${msg.ok ? 'border-indiagreen-500/40 bg-indiagreen-500/[0.07] text-indiagreen-300' : 'border-risk-red/40 bg-risk-red/5 text-risk-red'}`}>{msg.text}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border border-ink-700 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-bold text-ink-300">{L('Your name', 'आपका नाम')}</span>
              <input className={input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={L('e.g. Duty officer, DEOC', 'जैसे ड्यूटी अधिकारी, DEOC')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-bold text-ink-300">{L('Email', 'ईमेल')}</span>
              <input className={input} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="officer@example.gov.in" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-bold text-ink-300">{L('WhatsApp number', 'व्हाट्सऐप नंबर')}</span>
              <input className={input} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+91 98xxxxxxxx" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-bold text-ink-300">{L('Phone for SMS / calls', 'SMS / कॉल हेतु फ़ोन')}</span>
              <input className={input} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98xxxxxxxx" />
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[12.5px] font-bold text-ink-300">{L('Send me alerts by', 'मुझे चेतावनी भेजें')}</div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(([k, en, hi]) => {
                const on = form.channels.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(k)}
                    aria-pressed={on}
                    className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition ${on ? 'border-chakra-500 bg-chakra-500 text-white' : 'border-ink-700 bg-white text-ink-300 hover:border-chakra-500'}`}
                  >
                    {on ? '✓ ' : ''}{L(en, hi)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            <label className="flex items-center gap-2.5 text-[13.5px] text-ink-200">
              <input type="checkbox" checked={form.daily_brief} onChange={(e) => set('daily_brief', e.target.checked)} className="h-4 w-4 accent-chakra-500" />
              {L('Send me the daily brief every morning', 'हर सुबह दैनिक सारांश भेजें')}
            </label>
            <label className="flex items-center gap-2.5 text-[13.5px] text-ink-200">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} className="h-4 w-4 accent-chakra-500" />
              {L('Notifications on', 'सूचनाएँ चालू')}
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
            <button type="button" onClick={save} disabled={!!busy} className="btn border-chakra-500 bg-chakra-500 px-4 py-2 text-[13.5px] text-white hover:bg-[#174A70] hover:text-white">
              {busy === 'save' ? L('Saving…', 'सहेजा जा रहा है…') : L('Save settings', 'सेटिंग सहेजें')}
            </button>
            <button type="button" onClick={test} disabled={!!busy || !data?.prefs} className="btn px-4 py-2 text-[13.5px]">
              {busy === 'test' ? L('Sending…', 'भेजा जा रहा है…') : L('Send a test message', 'परीक्षण संदेश भेजें')}
            </button>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-ink-700 bg-white p-5 shadow-sm">
            <h2 className="text-[14px] font-extrabold text-chakra-500">{L('Wi-Fi alert broadcast', 'वाई-फ़ाई चेतावनी प्रसारण')}</h2>
            <p className="mt-2 text-[13px] text-ink-300">
              {L(
                'Finds where this laptop is and sends that area’s live flood warnings from its Wi-Fi hotspot to phones nearby — no app or internet needed. Everyone around sees the alert as the network name; anyone who joins gets the full alert on screen. Needs the Wi-Fi alert point running on this laptop (wifi-alert/wifi_alert.py).',
                'यह लैपटॉप कहाँ है, यह पता करके उस क्षेत्र की लाइव बाढ़ चेतावनी इसके वाई-फ़ाई हॉटस्पॉट से आस-पास के फ़ोन पर भेजता है — किसी ऐप या इंटरनेट की ज़रूरत नहीं। आस-पास सभी को नेटवर्क नाम में चेतावनी दिखती है; जुड़ने वाले को पूरी चेतावनी स्क्रीन पर मिलती है। इस लैपटॉप पर वाई-फ़ाई अलर्ट पॉइंट (wifi-alert/wifi_alert.py) चलना चाहिए।',
              )}
            </p>
            <button type="button" onClick={broadcast} disabled={wifi.busy} className="btn mt-4 border-chakra-500 bg-chakra-500 px-4 py-2 text-[13.5px] text-white hover:bg-[#174A70] hover:text-white">
              {wifi.busy ? L('Working…', 'हो रहा है…') : wifi.live ? L('Stop broadcast', 'प्रसारण रोकें') : L('Broadcast alert', 'चेतावनी प्रसारित करें')}
            </button>
            {wifi.text && <p className={`mt-3 text-[12px] ${wifi.ok ? 'text-indiagreen-300' : 'text-risk-red'}`}>{wifi.text}</p>}
          </section>

          <section className="rounded-2xl border border-ink-700 bg-white shadow-sm">
            <h2 className="border-b border-ink-800 px-5 py-3 text-[14px] font-extrabold text-chakra-500">{L('Recent deliveries', 'हाल की डिलीवरी')}</h2>
            {!data?.log?.length ? (
              <p className="px-5 py-4 text-[13px] text-ink-400">{L('Nothing sent yet.', 'अभी तक कुछ नहीं भेजा गया।')}</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {data.log.map((r) => {
                  const s = STATUS[r.status] ?? [r.status, r.status, '#6E7C8D'];
                  return (
                    <li key={r.id} className="px-5 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="font-bold text-ink-100">{L(EVENT[r.event]?.[0] ?? r.event, EVENT[r.event]?.[1] ?? r.event)}</span>
                        <span className="font-semibold" style={{ color: s[2] }}>{L(s[0], s[1])}</span>
                      </div>
                      <div className="truncate text-[12px] text-ink-400">{r.title}</div>
                      <div className="text-[11px] text-ink-500">
                        {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                        {r.channels?.length ? ` · ${r.channels.join(', ')}` : ''}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
