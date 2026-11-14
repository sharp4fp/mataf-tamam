import React, { useRef, useState } from 'react';
import { TextField, useLocalState } from './components';
import logo from './photos/logo.png';
import fassiBg from './photos/fassi-bg.jpg';
import craneWork1 from './photos/crane-work-1.jpg';
import craneWork2 from './photos/crane-work-2.jpg';
import './wb2.css';

// שטר מטען דיגיטלי - גרסה 2 (14.11.2026): בנוי כמו שטר 2276 הנייר של פיקאס, שורה אחרי שורה,
// עם מילוי אוטומטי ורשימות בחירה כדי שהנהג יקליד כמה שפחות.
// הגרסה הקודמת נשמרת ב-AppV1.tsx ונפתחת בקישור ?layout=v1 (כלל 0.6 בנהלים).
// כללי ההתנהגות המחייבים (tamam/docs/SPEC.md) נשמרו כפי שהם: שעות ריקות בכל פתיחה,
// הגעה רק בכפתור או ידנית (עם סימון), סיום רק מחתימת הלקוח, ניקוי החתימה מוחק את הסיום.

// רשימת לקוחות מאומתת: נקראו בבירור על השטרים ההיסטוריים ותואמים את תיוק הקבצים.
// הבעלים אישר (10.11.26) שהרשימה תופיע בגרסה הפתוחה. שמות לא ודאיים מחוץ לרשימה (APPROVALS.md).
const clients = [
    { value: 'c1', label: 'אהרלה' },
    { value: 'c2', label: 'אייזנברג את שין' },
    { value: 'c3', label: 'אינטגרל' },
    { value: 'c4', label: 'גטראק' },
    { value: 'c5', label: 'יאיר פור' },
    { value: 'c6', label: 'יפעת הובלות' },
    { value: 'c7', label: 'מנופי משה' },
    { value: 'c8', label: 'מנופי עמית' },
    { value: 'c9', label: 'מנופים לשחקים' },
    { value: 'c10', label: 'סמי עובדיה' },
    { value: 'c11', label: 'סקיי' },
    { value: 'c12', label: 'עידו אמוס' },
    { value: 'c13', label: 'עמית קיידר' },
    { value: 'c14', label: 'שיא פתרונות' },
];

// המשאית של פיקאס. המספר כפי שהוא נכתב על השטרות (307-64-001 = 30764001).
const vehicles = [
    { value: '30764001', label: '307-64-001', crane: '115 טון פאסי', driver: 'אופיר אברג׳יל' },
];
const DEFAULT_TRUCK = vehicles[0];

// בנק תשובות לשדה "תיאור העבודה והערות" - לחיצה מוסיפה, לחיצה נוספת מסירה.
// נבנה לפי מה שנכתב בפועל בשטרות 2026 ולפי עבודות נפוצות למנוף העמסה עצמית 115 טון.
export const noteBank = [
    'יום עבודת מנוף',
    'הובלה',
    'חיוב שעתיים ראשונות',
    'הנפה והורדת מזגנים מגג',
    'פריקת חומרי בניין באתר',
    'הנפה והצבת מכולה',
    'הרמה והצבת גנרטור / שנאי',
];
const HAUL_NOTE = 'הובלה';

const emptyForm = {
    client: '',
    newClient: '',
    orderer: '',
    ordererPhone: '',
    craneType: DEFAULT_TRUCK.crane,
    vehicle: DEFAULT_TRUCK.label,
    site: '',
    arrival: '',
    end: '',
    loadPlace: '',
    loadStart: '',
    loadEnd: '',
    unloadPlace: '',
    unloadStart: '',
    unloadEnd: '',
    extraStart: '',
    extraEnd: '',
    description: '',
    driver: DEFAULT_TRUCK.driver,
    arrivalManual: '',
    arrivalEverManual: '',
    hasHaul: '',
    approver: '',
    approverPhone: '',
};
type Form = typeof emptyForm;

// מה שהוזן בעבר במכשיר הזה (נשאר במכשיר בלבד) - מוצע ברשימה בפעם הבאה.
const emptyRecent = { sites: [] as string[], orderers: [] as string[], phones: [] as string[], approvers: [] as string[] };
type Recent = typeof emptyRecent;

function nowIsrael(): string {
    return new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function todayIsrael(): string {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date());
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${g('day')}.${g('month')}.${g('year')}`;
}

function parseTime(t: string): number | null {
    const m = t.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

function durationLabel(arrival: string, end: string): string {
    const a = parseTime(arrival);
    const b = parseTime(end);
    if (a === null || b === null || b <= a) return '';
    const diff = b - a;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} שעות`);
    if (mins > 0) parts.push(`${mins} דקות`);
    return parts.join(' ו-');
}

const noteLines = (d: string) => d.split('\n').map((s) => s.trim()).filter(Boolean);

function remember(list: string[], value: string): string[] {
    const v = value.trim();
    if (!v) return list;
    return [v, ...list.filter((x) => x !== v)].slice(0, 8);
}

function Picker({ label, placeholder, options, value, onPick, extra }: {
    label: string; placeholder: string; options: { value: string; label: string }[];
    value: string; onPick: (v: string) => void; extra?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.value === value)?.label;
    return <div className="wb-field">
        <div className="field-label">{label}</div>
        <div className="client-row">
            <button type="button" className={`client-toggle${selected ? ' is-set' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
                <span>{selected ?? placeholder}</span>
                <span aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
            {extra}
        </div>
        {open && <div className="client-list" role="listbox" aria-label={label}>
            {options.map((o) => (
                <button key={o.value} type="button" role="option" aria-selected={value === o.value} className="client-option"
                    onClick={() => { onPick(o.value); setOpen(false); }}>{o.label}</button>
            ))}
        </div>}
    </div>;
}

function SignaturePad({ label, onSigned }: { label: string; onSigned: (signed: boolean) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [signed, setSigned] = useState(false);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    };
    const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const ctx = canvasRef.current!.getContext('2d')!;
        const p = point(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        drawing.current = true;
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        e.preventDefault();
        const ctx = canvasRef.current!.getContext('2d')!;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1d3a8a';
        const p = point(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (!signed) { setSigned(true); onSigned(true); }
    };
    const stop = () => { drawing.current = false; };
    const clear = () => {
        const canvas = canvasRef.current!;
        canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        setSigned(false);
        onSigned(false);
    };
    return <div className="sig-wrap">
        <div className="sig-head">
            <span className="sig-label">{label}</span>
            <button type="button" className="wb-ghost" onClick={clear}>נקה</button>
        </div>
        <canvas ref={canvasRef} width={900} height={260} className="sig-canvas"
            onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerLeave={stop} />
        <div className="sig-hint">{signed ? 'נחתם ✓' : 'חתום כאן באצבע'}</div>
    </div>;
}

function StampCapture({ stamp, setStamp }: { stamp: string; setStamp: (dataUrl: string) => void }) {
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setStamp(String(reader.result));
        reader.readAsDataURL(file);
    };
    return <div className="stamp-wrap">
        <label className="stamp-button">
            📷 {stamp ? 'החלף צילום חותמת' : 'צלם חותמת (לא חובה)'}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {stamp && <img src={stamp} className="stamp-preview" alt="צילום החותמת שצורף" />}
    </div>;
}

function Datalist({ id, items }: { id: string; items: string[] }) {
    return <datalist id={id}>{items.map((s) => <option key={s} value={s} />)}</datalist>;
}

export function App() {
    const [form, setForm, saved] = useLocalState<Form>('tamam-waybill.v2', emptyForm);
    const [recent, setRecent] = useLocalState<Recent>('tamam-recent.v1', emptyRecent);
    // התאריך לא נשמר: בכל פתיחה הוא היום (שעון ישראל), ואפשר לתקן.
    const [date, setDate] = useState(todayIsrael());
    const [driverSigned, setDriverSigned] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [approverSigned, setApproverSigned] = useState(false);
    const [stamp, setStamp] = useState('');

    const set = (key: keyof Form) => (value: string) => {
        if (saved.ready) setForm({ ...form, [key]: value });
    };
    const rememberIn = (key: keyof Recent, value: string) => () => setRecent({ ...recent, [key]: remember(recent[key], value) });

    const autoDriver = useRef(DEFAULT_TRUCK.driver);
    React.useEffect(() => {
        if (saved.ready && form.driver.trim() === '') setForm({ ...form, driver: DEFAULT_TRUCK.driver });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved.ready, form.driver]);

    // --- שעות: אותו היגיון בדיוק כמו בגרסה 1 (SPEC, "היגיון מצב") ---
    const arrivalTouched = useRef(false);
    const [localArrival, setLocalArrival] = useState<{ v: string; manual: string; ever: string } | null>(null);
    const endTouched = useRef(false);
    const [localEnd, setLocalEnd] = useState<string | null>(null);
    const effArrival = saved.ready ? form.arrival : (localArrival?.v ?? '');
    const effArrivalManual = saved.ready ? form.arrivalManual : (localArrival?.manual ?? '');
    const effArrivalEver = saved.ready ? form.arrivalEverManual : (localArrival?.ever ?? '');
    const effEnd = saved.ready ? form.end : (localEnd ?? '');
    React.useLayoutEffect(() => {
        if (saved.ready && (localArrival || localEnd !== null)) {
            setForm({
                ...form,
                ...(localArrival ? { arrival: localArrival.v, arrivalManual: localArrival.manual, arrivalEverManual: localArrival.ever } : {}),
                ...(localEnd !== null ? { end: localEnd } : {}),
            });
            if (localArrival) setLocalArrival(null);
            if (localEnd !== null) setLocalEnd(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved.ready, localArrival, localEnd]);
    React.useLayoutEffect(() => {
        if (!saved.ready) return;
        const clearArrival = !arrivalTouched.current && (form.arrival || form.arrivalManual || form.arrivalEverManual);
        const clearEnd = !endTouched.current && form.end;
        if (clearArrival || clearEnd) {
            setForm({
                ...form,
                ...(clearArrival ? { arrival: '', arrivalManual: '', arrivalEverManual: '' } : {}),
                ...(clearEnd ? { end: '' } : {}),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved.ready, form.arrival, form.end]);

    const setVehicle = (value: string) => {
        if (!saved.ready) return;
        const truck = vehicles.find((v) => v.value === value);
        const keepDriver = form.driver.trim() !== '' && form.driver !== autoDriver.current;
        setForm({
            ...form,
            vehicle: truck?.label ?? '',
            ...(truck ? { craneType: truck.crane } : {}),
            ...(truck && !keepDriver ? { driver: truck.driver } : {}),
        });
        if (truck) autoDriver.current = truck.driver;
    };
    const stampStart = () => {
        arrivalTouched.current = true;
        const t = nowIsrael();
        if (saved.ready) setForm({ ...form, arrival: t, arrivalManual: '' });
        else setLocalArrival({ v: t, manual: '', ever: localArrival?.ever ?? '' });
    };
    const setArrivalManual = (value: string) => {
        arrivalTouched.current = true;
        if (saved.ready) setForm({ ...form, arrival: value, arrivalManual: value.trim() ? 'yes' : '', ...(value.trim() ? { arrivalEverManual: 'yes' } : {}) });
        else setLocalArrival({ v: value, manual: value.trim() ? 'yes' : '', ever: value.trim() ? 'yes' : (localArrival?.ever ?? '') });
    };
    const onApproverSigned = (signed: boolean) => {
        setApproverSigned(signed);
        endTouched.current = true;
        const t = signed ? nowIsrael() : '';
        if (saved.ready) setForm({ ...form, end: t });
        else setLocalEnd(t);
    };
    const setEndManual = (value: string) => {
        endTouched.current = true;
        if (saved.ready) setForm({ ...form, end: value });
        else setLocalEnd(value);
    };

    // בנק התשובות: לחיצה מוסיפה שורה לתיאור, לחיצה נוספת מסירה. "הובלה" פותחת גם את פרטי ההובלה.
    const lines = noteLines(form.description);
    const toggleNote = (note: string) => {
        if (!saved.ready) return;
        const has = lines.includes(note);
        const next = has ? lines.filter((l) => l !== note) : [...lines, note];
        setForm({
            ...form,
            description: next.join('\n'),
            ...(note === HAUL_NOTE ? { hasHaul: has ? '' : 'yes' } : {}),
        });
    };

    const clientName = form.client === '__new' ? form.newClient : (clients.find((c) => c.value === form.client)?.label ?? '');
    const duration = durationLabel(effArrival, effEnd);
    const dash = (v: string) => (v.trim() ? v : '—');
    const done = [clientName, form.site, effArrival, effEnd].filter((v) => v.trim()).length;

    return <main lang="he" dir="rtl" className="wb2">
        <div className="bg-crane wb-bg-page" style={{ backgroundImage: `url(${craneWork2})` }} />

        <header className="wb-hero">
            <div className="bg-crane wb-hero-photo" style={{ backgroundImage: `url(${fassiBg})` }} />
            <div className="wb-hero-shade" />
            <div className="wb-hero-text">
                <img src={logo} className="wb-hero-logo" alt="לוגו פיקאס" />
                <div>
                    <div className="wb-hero-brand">פיקאס בע״מ</div>
                    <h1 className="wb-hero-title">שטר מטען / אישור עבודת מנוף</h1>
                    <div className="wb-hero-sub">מנוף העמסה עצמית 115 טון פאסי · מילוי מהטלפון בשטח</div>
                </div>
            </div>
        </header>

        <div className="wb-progress" aria-live="polite">
            <span className="wb-progress-bar" style={{ width: `${done * 25}%` }} />
            <span className="wb-progress-text">{done === 4 ? 'הפרטים העיקריים מולאו ✓' : `מולאו ${done} מתוך 4 פרטים עיקריים`}</span>
        </div>

        <section className="wb-paper">
            <div className="wb-paper-head">
                <div className="wb-paper-company">
                    <img src={logo} alt="" className="wb-paper-logo" />
                    <div>
                        <div className="wb-paper-name">פיקאס בע״מ</div>
                        <div className="wb-paper-id">ח.פ. 516313251</div>
                    </div>
                </div>
                <div className="wb-paper-no">
                    <span>מס׳</span>
                    <strong>הדגמה</strong>
                </div>
            </div>

            <div className="wb-step"><span className="wb-step-no">1</span> הלקוח</div>
            <Picker label="שם חברה" placeholder="בחר לקוח מהרשימה" options={clients} value={form.client}
                onPick={set('client')}
                extra={<button type="button" className="client-add" onClick={() => set('client')('__new')}>+ חדש</button>} />
            {form.client === '__new' && <TextField label="שם הלקוח החדש" value={form.newClient} onChange={set('newClient')} />}
            <div className="wb-grid2">
                <TextField label="תאריך" value={date} onChange={setDate} inputMode="numeric" />
                <Picker label="מס׳ רכב" placeholder="בחר רכב" options={vehicles.map((v) => ({ value: v.value, label: v.label }))}
                    value={vehicles.find((v) => v.label === form.vehicle)?.value ?? ''} onPick={setVehicle} />
            </div>
            <div className="wb-grid2">
                <TextField label="שם המזמין" value={form.orderer} onChange={set('orderer')} list="dl-orderers" onBlur={rememberIn('orderers', form.orderer)} />
                <TextField label="טלפון המזמין" value={form.ordererPhone} onChange={set('ordererPhone')} inputMode="tel" list="dl-phones" onBlur={rememberIn('phones', form.ordererPhone)} />
            </div>

            <div className="wb-step"><span className="wb-step-no">2</span> העבודה</div>
            <TextField label="כתובת אתר" value={form.site} onChange={set('site')} list="dl-sites" onBlur={rememberIn('sites', form.site)} placeholder="רחוב, מספר, עיר" />
            <TextField label="סוג מנוף (לפי הרכב)" value={form.craneType} onChange={set('craneType')} className="wb-locked" />

            <div className="wb-times">
                <div className="wb-time">
                    <button type="button" className="wb-big" onClick={stampStart}>⏱ הגעתי עכשיו</button>
                    <TextField label="שעת הגעה לאתר" value={effArrival} onChange={setArrivalManual} inputMode="numeric" placeholder="נקבעת בכפתור" />
                    {effArrivalManual === 'yes' && effArrival.trim() !== '' && <div className="wb-flag">מולאה ידנית - יסומן בשטר</div>}
                </div>
                <div className="wb-time">
                    <div className="wb-auto-note">✍ נקבעת בחתימת הלקוח</div>
                    <TextField label="שעת סיום העבודה" value={effEnd} onChange={setEndManual} inputMode="numeric" placeholder="אוטומטית" />
                </div>
            </div>
            <div className="wb-hours">שעות עבודת מנוף: <strong>{duration || '—'}</strong></div>

            <div className="wb-step"><span className="wb-step-no">3</span> תיאור העבודה והערות</div>
            <div className="wb-chips" role="group" aria-label="בנק תשובות">
                {noteBank.map((n) => (
                    <button key={n} type="button" className="wb-chip" aria-pressed={lines.includes(n)} onClick={() => toggleNote(n)}>
                        {lines.includes(n) ? '✓ ' : '+ '}{n}
                    </button>
                ))}
            </div>
            <label className="file-control">
                <span className="file-control-label">תיאור העבודה והערות</span>
                <textarea className="file-input wb-textarea" rows={3} value={form.description}
                    onChange={(e) => set('description')(e.target.value)} placeholder="בחר מהבנק למעלה או כתוב חופשי" />
            </label>

            <label className="haul-toggle"><input type="checkbox" checked={form.hasHaul === 'yes'}
                onChange={(e) => saved.ready && setForm({ ...form, hasHaul: e.target.checked ? 'yes' : '' })} /> בוצעה הובלה - פרטי טעינה ופריקה</label>
            {form.hasHaul === 'yes' && <div className="wb-haul">
                <div className="wb-grid2">
                    <TextField label="מקום טעינה" value={form.loadPlace} onChange={set('loadPlace')} list="dl-sites" />
                    <TextField label="מקום פריקה" value={form.unloadPlace} onChange={set('unloadPlace')} list="dl-sites" />
                </div>
                <div className="wb-grid2">
                    <TextField label="שעת התחלת טעינה" value={form.loadStart} onChange={set('loadStart')} inputMode="numeric" />
                    <TextField label="שעת סיום טעינה" value={form.loadEnd} onChange={set('loadEnd')} inputMode="numeric" />
                </div>
                <div className="wb-grid2">
                    <TextField label="שעת התחלת פריקה" value={form.unloadStart} onChange={set('unloadStart')} inputMode="numeric" />
                    <TextField label="שעת סיום פריקה" value={form.unloadEnd} onChange={set('unloadEnd')} inputMode="numeric" />
                </div>
                <div className="wb-grid2">
                    <TextField label="תחילת עבודת מנוף נוספת באתר" value={form.extraStart} onChange={set('extraStart')} inputMode="numeric" />
                    <TextField label="סיום עבודת מנוף נוספת באתר" value={form.extraEnd} onChange={set('extraEnd')} inputMode="numeric" />
                </div>
            </div>}

            <div className="wb-step"><span className="wb-step-no">4</span> חתימות</div>
            <TextField label="שם הנהג" value={form.driver} onChange={set('driver')} />
            <SignaturePad label="חתימת הנהג" onSigned={setDriverSigned} />
            <div className="wb-approve">
                <div className="wb-approve-title">אישור העבודה (הלקוח)</div>
                <div className="wb-grid2">
                    <TextField label="שם המאשר" value={form.approver} onChange={set('approver')} list="dl-approvers" onBlur={rememberIn('approvers', form.approver)} />
                    <TextField label="טלפון המאשר" value={form.approverPhone} onChange={set('approverPhone')} inputMode="tel" list="dl-phones" />
                </div>
                <SignaturePad label="חתימת הלקוח - קובעת את שעת הסיום" onSigned={onApproverSigned} />
                <StampCapture stamp={stamp} setStamp={setStamp} />
            </div>
        </section>

        <Datalist id="dl-sites" items={recent.sites} />
        <Datalist id="dl-orderers" items={recent.orderers} />
        <Datalist id="dl-phones" items={recent.phones} />
        <Datalist id="dl-approvers" items={recent.approvers} />

        <div className="summary-toggle-wrap">
            <button type="button" className="summary-toggle" onClick={() => setShowSummary((v) => !v)}>
                {showSummary ? 'הסתר פרטי שטר דיגיטלי' : 'הצג פרטי שטר דיגיטלי'}
            </button>
        </div>

        {showSummary && <section className="wb-sheet">
            <h2 className="wb-sheet-title">כך השטר הדיגיטלי ייראה</h2>
            <div className="wb-sheet-top">
                <div><strong>פיקאס בע״מ</strong> · ח.פ. 516313251</div>
                <div className="wb-sheet-no">שטר מטען / אישור עבודת מנוף מס׳ <span>הדגמה</span></div>
            </div>
            <dl className="rows wb-sheet-rows">
                {([
                    ['תאריך', dash(date)],
                    ['שם חברה', dash(clientName)],
                    ['שם המזמין', dash(form.orderer) + (form.ordererPhone.trim() ? ` · ${form.ordererPhone}` : '')],
                    ['סוג מנוף', dash(form.craneType)],
                    ['מס׳ רכב', dash(form.vehicle)],
                    ['כתובת אתר', dash(form.site)],
                    ['שעת הגעה לאתר', dash(effArrival) + (effArrivalManual === 'yes' && effArrival.trim() ? ' (הגעה מולאה ידנית)' : (effArrivalEver === 'yes' ? ' (הגעה תוקנה ידנית בעבר)' : ''))],
                    ['שעת סיום העבודה', dash(effEnd)],
                    ['שעות עבודת מנוף', duration || '—'],
                    ...(form.hasHaul === 'yes' ? [
                        ['טעינה', `${dash(form.loadPlace)} · ${dash(form.loadStart)}-${dash(form.loadEnd)}`],
                        ['פריקה', `${dash(form.unloadPlace)} · ${dash(form.unloadStart)}-${dash(form.unloadEnd)}`],
                    ] : []),
                    ['תיאור העבודה והערות', lines.length ? lines.join(' · ') : '—'],
                    ['שם הנהג', `${dash(form.driver)}${driverSigned ? ' · נחתם' : ''}`],
                    ['אישור העבודה', `${dash(form.approver)}${form.approverPhone.trim() ? ` · ${form.approverPhone}` : ''}${approverSigned ? ' · נחתם' : ''}${stamp ? ' · חותמת צורפה' : ''}`],
                ] as [string, string][]).map(([k, v]) => <div className="row" key={k}><dt className="row-name">{k}</dt><dd className="row-value row-value-known">{v}</dd></div>)}
            </dl>
            <div className="wb-demo-note">סימולציה: הטופס עדיין לא שולח דבר. המילוי נשאר בטלפון הזה בלבד.</div>
        </section>}

        <div className="bg-crane wb-strip" style={{ backgroundImage: `url(${craneWork1})` }} />
        <footer className="wb-footer">
            <div>{saved.message}</div>
            <div>פיקאס בע״מ, ח.פ. 516313251</div>
            <div className="wb-credits">תמונות: Alex Blokha, Kolforn / Wikimedia Commons, CC BY-SA 4.0 · Retired electrician / Wikimedia Commons, CC0</div>
        </footer>
    </main>;
}
