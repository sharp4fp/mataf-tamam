// מקדמי קצבה - 18 גופים (9 קרנות מקיפות + 9 כלליות/משלימות)
// הנתונים חולצו מהתקנונים הרשמיים (פנסיה-נט, מלאי 09/2026) ונטענים לפי גוף בלבד (טעינה עצלה).
// אין להציג מספר שלא קיים בטבלה שחולצה.

export const COMPANIES = [
    { key: 'menora', label: 'מנורה מבטחים', manager: 'מנורה', type: 'makifa' },
    { key: 'clal', label: 'כלל', manager: 'כלל', type: 'makifa' },
    { key: 'harel', label: 'הראל', manager: 'הראל', type: 'makifa' },
    { key: 'migdal', label: 'מגדל', manager: 'מגדל', type: 'makifa' },
    { key: 'meitav', label: 'מיטב', manager: 'מיטב', type: 'makifa' },
    { key: 'altshuler', label: 'אלטשולר שחם', manager: 'אלטשולר', type: 'makifa' },
    { key: 'more', label: 'מור', manager: 'מור', type: 'makifa' },
    { key: 'infinity', label: 'אינפיניטי', manager: 'אינפיניטי', type: 'makifa' },
    { key: 'phoenix', label: 'הפניקס', manager: 'הפניקס', type: 'makifa' },
    { key: 'menora_klalit', label: 'מנורה מבטחים', manager: 'מנורה', type: 'klalit' },
    { key: 'clal_klalit', label: 'כלל', manager: 'כלל', type: 'klalit' },
    { key: 'harel_klalit', label: 'הראל', manager: 'הראל', type: 'klalit' },
    { key: 'migdal_klalit', label: 'מגדל', manager: 'מגדל', type: 'klalit' },
    { key: 'meitav_klalit', label: 'מיטב', manager: 'מיטב', type: 'klalit' },
    { key: 'altshuler_klalit', label: 'אלטשולר שחם', manager: 'אלטשולר', type: 'klalit' },
    { key: 'more_klalit', label: 'מור', manager: 'מור', type: 'klalit' },
    { key: 'infinity_klalit', label: 'אינפיניטי', manager: 'אינפיניטי', type: 'klalit' },
    { key: 'phoenix_klalit', label: 'הפניקס', manager: 'הפניקס', type: 'klalit' },
];

export const SCENARIO_LABELS = {
    single: 'ללא בן/בת זוג',
    married: 'עם בן/בת זוג',
    with_spouse: 'עם בן/בת זוג',
    no_spouse: 'ללא בן/בת זוג',
    with_survivors: 'עם קצבת שאירים',
    no_survivors: 'ללא קצבת שאירים',
    spouse30: 'בן/בת זוג - שאירים 30%',
    spouse60: 'בן/בת זוג - שאירים 60%',
    spouse100: 'בן/בת זוג - שאירים 100%',
};

export const GUAR_LABELS = {
    none: 'ללא תקופת הבטחה',
    '60m': 'הבטחת 60 חודשים',
    '120m': 'הבטחת 120 חודשים',
    '180m': 'הבטחת 180 חודשים',
    '240m': 'הבטחת 240 חודשים',
    '60m_max87': 'הבטחת 60 חודשים (לא יאוחר מגיל 87)',
    '120m_max87': 'הבטחת 120 חודשים (לא יאוחר מגיל 87)',
    '180m_max87': 'הבטחת 180 חודשים (לא יאוחר מגיל 87)',
    '240m_max87': 'הבטחת 240 חודשים (לא יאוחר מגיל 87)',
    until87: 'הבטחה עד גיל 87',
    '5y': 'הבטחת 5 שנים',
    '10y': 'הבטחת 10 שנים',
    '15y': 'הבטחת 15 שנים',
    '20y': 'הבטחת 20 שנים',
};

const SPOUSE_SCENARIOS = new Set(['married', 'with_spouse', 'spouse30', 'spouse60', 'spouse100', 'with_survivors']);

const cache = {};

export async function loadCompany(key) {
    if (!COMPANIES.some(c => c.key === key)) throw new Error('גוף לא מוכר: ' + key);
    if (!cache[key]) {
        cache[key] = (await import(`./mekadem/${key}.js`)).default;
    }
    return cache[key];
}

export function scenariosOf(data) {
    return [...new Set(Object.keys(data.grid).map(k => k.split('|')[0]))];
}

export function guaranteesOf(data, scenario) {
    return Object.keys(data.grid).filter(k => k.split('|')[0] === scenario).map(k => k.split('|')[1]);
}

export function hasSpouse(scenario) {
    return SPOUSE_SCENARIOS.has(scenario);
}

// מיפוי שם לפני -> מפתח גוף. החברה המנהלת נקבעת קודם מכול משדה היצרן (השם המשפטי במסלקה);
// שם המסלול/התכנית משמש רק כשאין יצרן מזוהה (למשל שם שורה רשמית בהשוואות), באותם כללים.
// הזיהוי לפי מילה שלמה בלבד: מילים גנריות ("כללי", "כללית", "מורכב") אינן מזהות חברה,
// ושם מסלול לעולם אינו דורס יצרן שזוהה. (תוקן 09/11/2026: בעבר /כלל/ ו-/מור/ נטסו על כל
// המחרוזת המאוחדת - "מגדל...כללי" זוהה ככלל ו"מורכב" כמור.)
export const MANAGER_ALIASES = [
    [/מנורה/, 'menora'], [/(?:^|[\s\-–(])כלל(?=[\s\-–)]|$)/, 'clal'], [/הראל/, 'harel'], [/מגדל/, 'migdal'],
    [/מיטב/, 'meitav'], [/אלטשולר/, 'altshuler'], [/(?:^|[\s\-–(])מור(?=[\s\-–)]|$)|more/i, 'more'],
    [/אינפיניטי/, 'infinity'], [/הפניקס|פניקס/, 'phoenix'],
];

export function inferCompany(yatzran, trackName) {
    if (!yatzran && !trackName) return null;
    const find = (s) => { for (const [re, base] of MANAGER_ALIASES) { if (re.test(s || '')) return base; } return null; };
    const base = find(yatzran) || find(trackName);
    if (!base) return null;
    const hay = `${yatzran || ''} ${trackName || ''}`;
    return /כללית|משלימה/.test(hay) ? base + '_klalit' : base;
}

export async function mekademEstimate(params) {
    const { company, scenario, guarantee, gender, birthYear, age, spouseBirthYear } = params;
    const data = await loadCompany(company);
    const vk = `${scenario}|${guarantee}`;
    const variant = data.grid[vk];
    if (!variant) return { error: 'השילוב שנבחר (מסלול שאירים + תקופת הבטחה) לא קיים בטבלאות שחולצו לגוף זה.' };
    const g = gender === 'f' ? 'F' : 'M';
    const rows = variant[g];
    if (!rows) return { error: 'אין טבלה למין שנבחר בגרסה זו.' };
    const row = rows[String(age)];
    if (!row) {
        const ages = Object.keys(rows).map(Number).sort((a, b) => a - b);
        return { error: `הטבלה מכסה גילאי פרישה ${ages[0]}-${ages[ages.length - 1]} בלבד (הוזן ${age}).` };
    }
    const bys = Object.keys(row).map(Number).sort((a, b) => a - b);
    if (!row[String(birthYear)]) {
        if (birthYear < bys[0] || birthYear > bys[bys.length - 1]) {
            return { error: `הטבלה מכסה שנות לידה ${bys[0]}-${bys[bys.length - 1]} לגיל זה (הוזנה ${birthYear}).` };
        }
        const lower = [...bys].reverse().find(y => y < birthYear);
        const upper = bys.find(y => y > birthYear);
        return { error: `שנת הלידה ${birthYear} אינה עמודה בטבלה זו (קטגוריות של ${upper - lower} שנים). הערכים התוחמים בטבלה: ${lower} ← ${row[String(lower)]}, ${upper} ← ${row[String(upper)]}. המקדם המדויק נקבע בקרן לפי תאריך הלידה המלא.` };
    }
    let k = row[String(birthYear)];
    if (!Number.isFinite(k) || k <= 0) {
        return { error: 'ערך המקדם בטבלה שחולצה עבור השילוב שנבחר אינו ערך חוקי; לא מוצג חישוב.' };
    }
    let adjNote = '';
    const notes = [];
    // baseOnly = true כשיש בן/בת זוג אך לא הופעלה התאמה מאומתת: הערך המוחזר הוא מקדם הבסיס בלבד
    // (הנחת הפרש הגילאים הבסיסית בנספח) ואין להציגו כקצבה בפועל עבור הגילאים שנבחרו - לא בממשק, לא בדוח ולא בהשוואת חלופות.
    let baseOnly = false;
    if (hasSpouse(scenario) && !spouseBirthYear) {
        // נבחר מסלול שאירים אך לא הוזנה שנת לידת בן/בת זוג: מקדם הבסיס מניח הפרש גילאים בסיסי
        // (בדרך כלל 3 שנים) ואין להציגו כקצבה בפועל - נדרש קלט מפורש, לא הנחה שקטה.
        notes.push('נבחר מסלול עם שאירים אך לא הוזנה שנת לידת בן/בת הזוג. מקדם הבסיס מניח הפרש גילאים בסיסי בלבד ואין להציגו כקצבה בפועל; הזינו שנת לידת בן/בת זוג לקבלת אומדן מותאם.');
        baseOnly = true;
    }
    if (hasSpouse(scenario) && spouseBirthYear) {
        // מפתח ההתאמה בנספחים: הפרש גילאים = שנת לידת המבוטח פחות שנת לידת בן/בת הזוג
        // (חיובי = בן/בת הזוג מבוגר/ת מהמבוטח, שלילי = צעיר/ה; בסיס הטבלאות בדרך כלל 3- = בן/בת זוג צעיר/ה ב-3)
        const gap = birthYear - spouseBirthYear;
        const at = data.adj && data.adj[vk];
        if (data.meta.adjVerified !== true) {
            // ברירת מחדל: דחייה. התאמה מופעלת רק כשהטבלה סומנה מפורשות כמאומתת מול התקנון (true).
            // חסר/לא מאומת (undefined/false): אין להפעיל התאמה שלא אומתה, ומקדם הבסיס אינו הקצבה בפועל לגילאים שנבחרו
            notes.push('טבלת ההתאמה להפרש גילאי בני הזוג של גוף זה טרם אומתה מול התקנון ולכן אינה מופעלת. אין להציג את מקדם הבסיס כקצבה בפועל עבור הגילאים שנבחרו.');
            baseOnly = true;
        } else if (at && at[g]) {
            const gaps = Object.keys(at[g]).map(Number);
            const lo = Math.min(...gaps), hi = Math.max(...gaps);
            if (gap < lo || gap > hi) {
                // מחוץ לטווח הטבלה בנספח אין התאמה מבוססת-מקור; אין להקרב לקצה הטבלה
                notes.push(`הפרש הגילאים (${gap > 0 ? '+' : ''}${gap} שנים) מחוץ לטווח טבלת ההתאמה שחולצה מהנספח (${lo} עד ${hi}), ולכן לא הופעלה התאמה. אין להציג את מקדם הבסיס כקצבה בפועל עבור הגילאים שנבחרו.`);
                baseOnly = true;
            } else {
                // רק מפתחות מודפסים בנספח מפעילים התאמה. מפתח בטווח שהנספח מדלג עליו: אין
                // אינטרפולציה והקרבה למפתח מודפס אחר (ערך שאין לו מקור) - מוצגים תחומי הטבלה בלבד.
                const pct = at[g][String(gap)];
                if (pct === undefined) {
                    const lower = [...gaps].reverse().find(y => y < gap);
                    const upper = gaps.find(y => y > gap);
                    notes.push(`הפרש הגילאים (${gap > 0 ? '+' : ''}${gap} שנים) אינו מפתח מודפס בטבלת ההתאמה שחולצה מהנספח. הערכים התוחמים המודפסים: ${lower > 0 ? '+' : ''}${lower} ← ${at[g][String(lower)]}%, ${upper > 0 ? '+' : ''}${upper} ← ${at[g][String(upper)]}%. אין לגזור ערך ביניים בלי מקור, ולכן לא הופעלה התאמה. אין להציג את מקדם הבסיס כקצבה בפועל עבור הגילאים שנבחרו.`);
                    baseOnly = true;
                } else {
                    if (!Number.isFinite(pct) || pct <= 0) {
                        return { error: 'ערך ההתאמה בטבלה שחולצה אינו ערך חוקי; לא מוצג חישוב.' };
                    }
                    k = Math.round(k * (pct / 100) * 100) / 100;
                    if (!Number.isFinite(k) || k <= 0) {
                        return { error: 'תוצאת ההתאמה אינה ערך חוקי; לא מוצג חישוב.' };
                    }
                    const who = gap > 0 ? 'בן/בת זוג מבוגר/ת' : gap < 0 ? 'בן/בת זוג צעיר/ה' : 'בן/בת זוג באותו גיל';
                    adjNote = `הותאם להפרש גילאים ${gap > 0 ? '+' : ''}${gap} שנים (${pct}%) - ${who}`;
                }
            }
        } else {
            notes.push('בנספח שחולץ לגוף זה לא נמצאה טבלת התאמה להפרש גילאי בני הזוג; ההתאמה המדויקת מתבצעת בקרן. אין להציג את מקדם הבסיס כקצבה בפועל עבור הגילאים שנבחרו.');
            baseOnly = true;
        }
    }
    return { k, adjNote, notes, caveats: data.meta.caveats || [], meta: data.meta, baseOnly };
}
