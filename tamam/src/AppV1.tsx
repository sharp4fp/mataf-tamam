import React, { useRef, useState } from 'react';
// גרסה קודמת (10.11.2026) - נשמרת לפי כלל 0.6 בנהלים; נפתחת רק בקישור ישיר ?layout=v1.
import { Callout, Caption, Closing, FileButton, FileCard, Group, Header, Row, Rows, TextField, useLocalState } from './components';
import logo from './photos/logo.png';
import fassiBg from './photos/fassi-bg.jpg';
import craneWork1 from './photos/crane-work-1.jpg';
import craneWork2 from './photos/crane-work-2.jpg';

// רשימת לקוחות מאומתת: נקראו בבירור על השטרים ההיסטוריים ותואמים את תיוק הקבצים של שרון.
// שרון אישר (10.11.26) שהרשימה האמיתית תופיע בגרסה הפתוחה. 33 שמות לא ודאיים מחוץ לרשימה.
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

// מפתח 1:1 רכב -> מנוף, כפי שאושר על ידי שרון. מיפויים נוספים יילמדו משטרות היסטוריים.
const vehicles = [
    { value: '30764001', label: '307-640-01', crane: '115 טון פאסי', driver: 'אופיר אברג׳יל' },
];

const emptyForm = {
    date: '10.11.2026',
    client: '',
    newClient: '',
    orderer: '',
    ordererPhone: '',
    craneType: '',
    vehicle: '',
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
    driver: 'אופיר אברג׳יל',
    arrivalManual: '',
    arrivalEverManual: '',
    hasHaul: '',
    approver: '',
    approverPhone: '',
};

type Form = typeof emptyForm;

function nowIsrael(): string {
    return new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
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

function ClientPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const selected = clients.find((c) => c.value === value)?.label;
    return <div>
        <div className="field-label">שם חברה (לקוח)</div>
        <div className="client-row">
            <button type="button" className="client-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                <span>{value === '__new' ? (selected ?? 'לקוח חדש') : (selected ?? 'בחר לקוח מהרשימה')}</span>
                <span aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
            <button type="button" className="client-add" onClick={() => { onChange('__new'); setOpen(false); }}>+ לקוח חדש</button>
        </div>
        {open && <div className="client-list" role="listbox" aria-label="שם חברה (לקוח)">
            {clients.map((c) => (
                <button
                    key={c.value}
                    type="button"
                    role="option"
                    aria-selected={value === c.value}
                    className="client-option"
                    onClick={() => { onChange(c.value); setOpen(false); }}
                >{c.label}</button>
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
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
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
        ctx.strokeStyle = '#251f21';
        const p = point(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (!signed) {
            setSigned(true);
            onSigned(true);
        }
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
            <FileButton variant="ghost" compact onClick={clear}>נקה</FileButton>
        </div>
        <canvas
            ref={canvasRef}
            width={900}
            height={280}
            className="sig-canvas"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerLeave={stop}
        />
        <div className="sig-hint">{signed ? 'נחתם' : 'חתום כאן באצבע או בעכבר'}</div>
    </div>;
}

function VehiclePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const selected = vehicles.find((v) => v.label === value)?.label;
    return <div>
        <div className="field-label">רכב (מספר רישוי)</div>
        <div className="client-row">
            <button type="button" className="client-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                <span>{selected ?? 'בחר רכב מהרשימה'}</span>
                <span aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>
        </div>
        {open && <div className="client-list" role="listbox" aria-label="רכב (מספר רישוי)">
            {vehicles.map((v) => (
                <button
                    key={v.value}
                    type="button"
                    role="option"
                    aria-selected={value === v.label}
                    className="client-option"
                    onClick={() => { onChange(v.value); setOpen(false); }}
                >{v.label}</button>
            ))}
        </div>}
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
            {stamp ? 'החלף צילום חותמת' : 'צלם או צרף חותמת'}
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {stamp && <img src={stamp} className="stamp-preview" alt="צילום החותם שצורף" />}
    </div>;
}

export function AppV1() {
    const [form, setForm, saved] = useLocalState<Form>('tamam-pod-demo.v3', emptyForm);
    const [driverSigned, setDriverSigned] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [approverSigned, setApproverSigned] = useState(false);
    const [stamp, setStamp] = useState('');

    const set = (key: keyof Form) => (value: string) => {
        if (saved.ready) setForm({ ...form, [key]: value });
    };
    const autoDriver = useRef('אופיר אברג׳יל');
    React.useEffect(() => {
        if (saved.ready && (form.driver === 'נהג הדגמה' || form.driver.trim() === '')) {
            setForm({ ...form, driver: 'אופיר אברג׳יל' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved.ready, form.driver]);
    // שעת ההגעה מתאפסת בכל פתיחה של הטופס: כל ערך שלא הוזן במהלך הפתיחה הנוכחית נמחק, גם אם נשמר ממילוי קודם.
    const arrivalTouched = useRef(false);
    // ערכים מקומיים לשעות ההגעה/הסיום כשהאחסון עוד לא מוכן (saved.ready=false) - כדי שהכפתור, החתימה והעריכה הידנית יעבדו תמיד.
    const [localArrival, setLocalArrival] = useState<{ v: string; manual: string; ever: string } | null>(null);
    const endTouched = useRef(false);
    const [localEnd, setLocalEnd] = useState<string | null>(null);
    const effArrival = saved.ready ? form.arrival : (localArrival?.v ?? '');
    const effArrivalManual = saved.ready ? form.arrivalManual : (localArrival?.manual ?? '');
    const effArrivalEver = saved.ready ? form.arrivalEverManual : (localArrival?.ever ?? '');
    const effEnd = saved.ready ? form.end : (localEnd ?? '');
    // כשהאחסון הופך זמין, ערכים שהוזנו לפני כן ממוזגים פנימה בכתיבה אחת (useLayoutEffect: לפני הציור, בלי הבהוב).
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
    // שעת ההגעה ושעת הסיום מתאפסות בכל פתיחה של הטופס: כל ערך שלא הוזן במהלך הפתיחה הנוכחית נמחק, גם אם נשמר ממילוי קודם.
    // האיפוס מחושב ונכתב ב-setForm אחד, כדי שהקלל של שני השדות לא ידרוס זה את זה.
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
        // שם הנהג מתמלא בברירת מחדל לפי המשאית, אבל שם שהוזן ידנית לא נדרס.
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
    // חתימת הלקוח (אישור העבודה) קובעת את שעת הסיום אוטומטית, לפי שעון ישראל.
    const onApproverSigned = (signed: boolean) => {
        setApproverSigned(signed);
        endTouched.current = true;
        if (signed) {
            const t = nowIsrael();
            if (saved.ready) setForm({ ...form, end: t });
            else setLocalEnd(t);
        } else {
            // ניקוי חתימת הלקוח מוחק גם את חותמת שעת הסיום ומשאיר את השדה ריק.
            if (saved.ready) setForm({ ...form, end: '' });
            else setLocalEnd('');
        }
    };
    const setEndManual = (value: string) => {
        endTouched.current = true;
        if (saved.ready) setForm({ ...form, end: value });
        else setLocalEnd(value);
    };

    const clientName = form.client === '__new'
        ? form.newClient
        : (clients.find((c) => c.value === form.client)?.label ?? '');
    const duration = durationLabel(effArrival, effEnd);
    const dash = (v: string) => (v.trim() ? v : '—');

    return <FileCard lang="he">
        <div className="bg-crane" style={{ backgroundImage: `url(${fassiBg})` }} />
        <div className="bg-crane bg-mid" style={{ backgroundImage: `url(${craneWork1})` }} />
        <div className="bg-crane bg-low" style={{ backgroundImage: `url(${craneWork2})` }} />
        <div className="brand-bar">
            <span className="brand-side">
                <img src={logo} className="brand-logo" alt="לוגו פיקאס" />
                <span className="brand">פיקאס בע״מ</span>
            </span>
            <span className="greeting">שטר מטען / אישור עבודת מנוף · מופעל על ידי תמ״מ</span>
        </div>
        <Header
            title="מילוי שטר מטען מהשטח"
            fact="גרסת פיתוח פתוחה"
            factKnown
            intro="כך הנהג ימלא שטר מטען דיגיטלי מהאתר, מהטלפון. רשימת הלקוחות נלמדה מהשטרים שהועלו. הגרסה בפיתוח - מילוי כאן עדיין לא שולח שטר אמיתי."
        />
        <Caption>{saved.message}</Caption>

        <Group label="שלב 1" heading="פרטי הלקוח">
            <ClientPicker value={form.client} onChange={set('client')} />
            {form.client === '__new' && <TextField label="שם הלקוח החדש" value={form.newClient} onChange={set('newClient')} />}
            <div className="grid2">
                <TextField label="שם המזמין" value={form.orderer} onChange={set('orderer')} />
                <TextField label="טלפון המזמין" value={form.ordererPhone} onChange={set('ordererPhone')} />
            </div>
        </Group>

        <Group label="שלב 2" heading="פרטי העבודה">
            <div className="grid2">
                <TextField label="תאריך" value={form.date} onChange={set('date')} />
                <VehiclePicker value={form.vehicle} onChange={setVehicle} />
            </div>
            <TextField label="סוג מנוף" value={form.craneType} onChange={set('craneType')} />
            <TextField label="כתובת אתר" value={form.site} onChange={set('site')} />
            <div className="time-row">
                <div className="time-field"><TextField label="שעת הגעה לאתר (מתמלאת רק בלחיצה)" value={effArrival} onChange={setArrivalManual} /></div>
                <FileButton compact onClick={stampStart}>הגעתי עכשיו</FileButton>
            </div>
            {effArrivalManual === 'yes' && effArrival.trim() !== '' && <Caption>שעת ההגעה מולאה או תוקנה ידנית - הסימון יופיע לשרון בשטר.</Caption>}
            <TextField label="שעת סיום העבודה (אוטומטית בחתימת הלקוח)" value={effEnd} onChange={setEndManual} />
        </Group>

        <Group label="אם בוצעה הובלה" heading="הובלה">
            <label className="haul-toggle"><input type="checkbox" checked={form.hasHaul === 'yes'} onChange={(e) => setForm({ ...form, hasHaul: e.target.checked ? 'yes' : '' })} /> בוצעה הובלה</label>
            {form.hasHaul === 'yes' && <>
                <div className="grid2">
                    <TextField label="מקום טעינה" value={form.loadPlace} onChange={set('loadPlace')} />
                    <TextField label="מקום פריקה" value={form.unloadPlace} onChange={set('unloadPlace')} />
                </div>
                <div className="grid2">
                    <TextField label="שעת התחלת טעינה" value={form.loadStart} onChange={set('loadStart')} />
                    <TextField label="שעת סיום טעינה" value={form.loadEnd} onChange={set('loadEnd')} />
                </div>
                <div className="grid2">
                    <TextField label="שעת התחלת פריקה" value={form.unloadStart} onChange={set('unloadStart')} />
                    <TextField label="שעת סיום פריקה" value={form.unloadEnd} onChange={set('unloadEnd')} />
                </div>
                <div className="grid2">
                    <TextField label="תחילת עבודת מנוף נוספת" value={form.extraStart} onChange={set('extraStart')} />
                    <TextField label="סיום עבודת מנוף נוספת" value={form.extraEnd} onChange={set('extraEnd')} />
                </div>
            </>}
        </Group>

        <Group label="פסקה חופשית" heading="תיאור העבודה והערות">
            <TextField label="תיאור העבודה והערות" value={form.description} onChange={set('description')} />
        </Group>

        <Group label="שלב 3" heading="חתימות">
            <TextField label="שם הנהג" value={form.driver} onChange={set('driver')} />
            <SignaturePad label="חתימת הנהג" onSigned={setDriverSigned} />
            <div className="grid2">
                <TextField label="שם המאשר (הלקוח)" value={form.approver} onChange={set('approver')} />
                <TextField label="טלפון המאשר" value={form.approverPhone} onChange={set('approverPhone')} />
            </div>
            <SignaturePad label="חתימת הלקוח (אישור העבודה) - קובעת את שעת הסיום" onSigned={onApproverSigned} />
            <StampCapture stamp={stamp} setStamp={setStamp} />
        </Group>

        <div className="summary-toggle-wrap">
            <button type="button" className="summary-toggle" onClick={() => setShowSummary((v) => !v)}>
                {showSummary ? 'הסתר פרטי שטר דיגיטלי' : 'הצג פרטי שטר דיגיטלי'}
            </button>
        </div>

        {showSummary && (
        <Group label="מתעדכן תוך כדי מילוי" heading="כך השטר הדיגיטלי ייראה">
            <Rows>
                <Row name="מספר שטר" value="הדגמה" valueKnown />
                <Row name="תאריך" value={dash(form.date)} valueKnown={!!form.date.trim()} />
                <Row name="לקוח" value={dash(clientName)} valueKnown={!!clientName.trim()} />
                <Row name="שם המזמין" detail={form.ordererPhone.trim() ? `טלפון: ${form.ordererPhone}` : undefined} value={dash(form.orderer)} valueKnown={!!form.orderer.trim()} />
                <Row name="רכב" value={dash(form.vehicle)} valueKnown={!!form.vehicle.trim()} />
                <Row name="סוג מנוף" value={dash(form.craneType)} valueKnown={!!form.craneType.trim()} />
                <Row name="כתובת אתר" value={dash(form.site)} valueKnown={!!form.site.trim()} />
                <Row name="שעות עבודה" detail={`${dash(effArrival)} עד ${dash(effEnd)}${effArrivalManual === 'yes' && effArrival.trim() ? ' · הגעה מולאה ידנית' : (effArrivalEver === 'yes' ? ' · הגעה תוקנה ידנית בעבר' : '')}`} value={duration || '—'} valueKnown={!!duration} />
                <Row name="חתימת הנהג" detail={dash(form.driver)} value={driverSigned ? 'נחתם' : '—'} valueKnown={driverSigned} />
                <Row name="אישור העבודה" detail={dash(form.approver)} value={approverSigned ? 'נחתם' : '—'} valueKnown={approverSigned} />
                <Row name="חותמת" value={stamp ? 'צורפה' : '—'} valueKnown={!!stamp} />
            </Rows>
            <Callout title="סימולציה בלבד" tone="warning">הטופס לא שולח דבר: המילוי נשאר במכשיר שלך בלבד. החתימה והחותמת כאן להמחשה, ואין כאן אישור חיוב, חשבון או שליחה ללקוח.</Callout>
        </Group>
        )}

        <Caption>תמונות רקע: Alex Blokha, Kolforn / Wikimedia Commons, CC BY-SA 4.0 · Retired electrician / Wikimedia Commons, CC0</Caption>
        {/* במראה הפומבי ב-GitHub הושמטו פרטי הקשר (כתובת/טלפון/דוא"ל). בגרסה החיה הם מופיעים בשורה זו. */}
        <div className="contact-footer">פיקאס בע״מ, ח.פ. 516313251</div>
        <Closing>גרסת פיתוח של תמ״מ - תוכנת משאיות מנוף, 10 בנובמבר 2026.</Closing>
    </FileCard>;
}
