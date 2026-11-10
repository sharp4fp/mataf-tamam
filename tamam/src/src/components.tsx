import React, { useEffect, useState } from 'react';

// רכיבי ממשק מקומיים של הטופס - React סטנדרטי, בלי תלות חיצונית.
// מימוש פשוט של מעטפת העמוד, הכותרת, קבוצות השדות, שדות הטקסט,
// הכפתורים, שורות הסיכום והאחסון המקומי.

type Children = { children?: React.ReactNode };

export function FileCard({ lang, children }: Children & { lang?: string }) {
    return <main lang={lang} dir="rtl" className="file-card">{children}</main>;
}

export function Header({ title, fact, factKnown, intro }: { title: string; fact?: string; factKnown?: boolean; intro?: string }) {
    return <header className="file-header">
        <div className="file-title-row">
            <h1 className="file-title">{title}</h1>
            {fact && <span className={`file-fact${factKnown ? ' file-fact-known' : ''}`}>{fact}</span>}
        </div>
        {intro && <p className="file-intro">{intro}</p>}
    </header>;
}

export function Caption({ children }: Children) {
    if (!children) return null;
    return <p className="file-caption">{children}</p>;
}

export function Closing({ children }: Children) {
    return <footer className="file-closing">{children}</footer>;
}

export function Group({ label, heading, children }: Children & { label?: string; heading?: string }) {
    return <section className="file-group">
        {(label || heading) && <hgroup className="file-group-head">
            {label && <span className="file-group-label">{label}</span>}
            {heading && <h2 className="file-group-heading">{heading}</h2>}
        </hgroup>}
        {children}
    </section>;
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return <label className="file-control">
        <span className="file-control-label">{label}</span>
        <input className="file-input" type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>;
}

export function FileButton({ variant, compact, onClick, children }: Children & { variant?: string; compact?: boolean; onClick?: () => void }) {
    const cls = ['file-button'];
    if (variant === 'ghost') cls.push('file-button-ghost');
    if (compact) cls.push('file-button-compact');
    return <button type="button" className={cls.join(' ')} onClick={onClick}>{children}</button>;
}

export function Rows({ children }: Children) {
    return <dl className="rows">{children}</dl>;
}

export function Row({ name, value, detail, valueKnown }: { name: string; value?: React.ReactNode; detail?: string; valueKnown?: boolean }) {
    return <div className="row">
        <dt className="row-name">{name}</dt>
        <dd className={`row-value${valueKnown ? ' row-value-known' : ''}`}>
            {value}
            {detail && <span className="row-detail">{detail}</span>}
        </dd>
    </div>;
}

export function Callout({ title, tone, children }: Children & { title?: string; tone?: string }) {
    return <div className={`callout${tone ? ` callout-${tone}` : ''}`}>
        {title && <strong className="callout-title">{title}</strong>}
        <p className="callout-body">{children}</p>
    </div>;
}

export type LocalStateStatus = { ready: boolean; message: string };

// כמו useState, אבל עם שמירה מקומית ב-localStorage של הדפדפן.
// ready=false עד שהאחסון נטען; עריכות צריכות להמתין ל-ready=true
// (הטופס שומר לחיצות מוקדמות במשתנים מקומיים וממזג בכתיבה אחת).
export function useLocalState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>, LocalStateStatus] {
    const [state, setState] = useState<T>(initial);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                setState({ ...(initial as object), ...(parsed as object) } as T);
            }
        } catch {
            // אחסון לא זמין או תוכן פגום - ממשיכים עם ערכי ברירת המחדל.
        }
        setReady(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        if (!ready) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(state));
        } catch {
            // נכשל בשקט (מצב פרטי וכד') - הטופס ממשיך לעבוד בזיכרון.
        }
    }, [key, ready, state]);

    const message = ready ? 'המילוי נשמר מקומית במכשיר שלך בלבד.' : 'טוען שמירה מקומית...';
    return [state, setState, { ready, message }];
}
