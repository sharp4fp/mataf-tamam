// test-mekadem-infer.mjs - רגרסיה לזיהוי גוף מנהל למקדמים (inferCompany).
// התיקון (09/11/2026): החברה נקבעת קודם מהיצרן (השם המשפטי) ורק אח"כ משם המסלול; זיהוי במילה
// שלמה בלבד כדי שמילים גנריות ("כללי"/"כללית"/"מורכב") לא יזוהו כחברה; שם מסלול אינו דורס יצרן.
const { inferCompany } = await import((process.env.BUILD || new URL('../js/', import.meta.url).pathname) + '/mekadem.js');

let pass = 0, fail = 0; const t = (yatzran, trackName, expected, label) => {
    const got = inferCompany(yatzran, trackName);
    if (got === expected) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}: got ${got}, expected ${expected} [${yatzran} | ${trackName}]`); }
};

// יצרן מזוהה - שם מסלול גנרי אינו דורס
t('מגדל חברה לביטוח בע"מ', 'מגדל מקפת אישית כללי', 'migdal', 'generic-track-no-override');
t('מגדל מקפת פנסיה וגמל בע"מ', 'מסלול כללי', 'migdal', 'generic-word-not-clal');
t('הפניקס חברה לביטוח בע"מ', 'מסלול מורכב', 'phoenix', 'murkav-not-more');
t('אלטשולר שחם גמל ופנסיה בע"מ', 'כללי', 'altshuler', 'klali-only-not-clal');
t('מיטב דש גמל ופנסיה בע"מ', 'מסלול מניות כללי', 'meitav', 'meitav-klali');
// סוג תכנית (מקיפה/כללית/משלימה) נגזר מהשילוב, לא מהחברה
t('הראל פנסיה וגמל בע"מ', 'הראל פנסיה כללית', 'harel_klalit', 'harel-klalit-subtype');
t('הראל פנסיה וגמל בע"מ', 'מסלול לבני 50 עד 60 כללי', 'harel', 'harel-makifa');
t('כלל פנסיה וגמל בע"מ', 'כלל פנסיה משלימה', 'clal_klalit', 'clal-mashlima');
t('מנורה מבטחים פנסיה וגמל בע"מ', 'מנורה מבטחים מקיפה - כללי', 'menora', 'menora-klali-track');
// מור היא חברה; "מורכב" אינו מור
t('מור גמל ופנסיה בע"מ', 'מור פנסיה מקיפה', 'more', 'more-company');
// שם שורה רשמי בלבד (ללא יצרן) - נתיב ההשוואות
t('', 'מנורה מבטחים פנסיה - מסלול מניות', 'menora', 'row-name-only-menora');
t('', 'הפניקס פנסיה מקיפה', 'phoenix', 'row-name-only-phoenix');
t('', 'כלל פנסיה מקיפה - מסלול מניות', 'clal', 'row-name-only-clal');
t('', 'הפניקס פנסיה - מסלול מורכב', 'phoenix', 'row-name-murkav-not-more');
// אין בסיס לזיהוי - null, לא ברירת מחדל
t('אנליסט', 'כללי', null, 'unknown-generic-null');
t('', 'מסלול מורכב', null, 'track-only-murkav-null');
t(null, null, null, 'empty-null');

// סריקת כל שמות המסלולים הרשמיים במאגר (נתיב ההשוואות): החברה המזוהה משם השורה חייבת להיות
// החברה מהיצרן הרשמי של אותה שורה (parentCoName), כולל סיווג מקיפה/כללית.
{
    const { OFFICIAL_PENSION: OP } = await import((process.env.BUILD || new URL('../js/', import.meta.url).pathname) + '/official.js');
    let sweepBad = 0, skipped = [];
    for (const o of Object.values(OP)) {
        const fromName = inferCompany(o.parentCoName || '', o.name);
        const expected = inferCompany('', o.parentCoName + ' ' + (/כללית|משלימה/.test(o.name) ? 'כללית' : ''));
        if (fromName === null) { skipped.push(o.name); continue; } // לא אמור לקרות עם parentCoName; שם גנרי היה מדולג, לא שגוי
        if (fromName !== expected) { sweepBad++; console.log(`FAIL official-sweep "${o.name}" -> ${fromName}, expected ${expected} (parent: ${o.parentCoName})`); fail++; }
        // בדיקה עצמאית מול שדה הסיווג הרשמי (קרנות חדשות = מקיפה, קרנות כלליות = כללית): הסיווג הנגזר
        // מהשם חייב להסכים איתו - אחרת אומדן מקדם של חלופה יילקח מטבלת סוג-מוצר שגויה (ממצא בודק 28/29).
        const clsKlalit = /כלליות/.test(o.cls || '');
        const clsMakifa = /חדשות/.test(o.cls || '');
        if ((clsKlalit && !fromName.endsWith('_klalit')) || (clsMakifa && fromName.endsWith('_klalit'))) {
            sweepBad++; console.log(`FAIL official-cls-mismatch "${o.name}" (parent: ${o.parentCoName}, cls: ${o.cls}) -> ${fromName}`); fail++;
        }
    }
    console.log(`${sweepBad ? 'FAIL' : 'PASS'} official-name-sweep (${Object.keys(OP).length} pension rows: no wrong company, subtype agrees with official cls${skipped.length ? `; ${skipped.length} name-only rows without a company token are skipped, never misassigned: ${skipped.join(' | ')}` : ''})`);
    if (sweepBad) fail++; else pass++;
}
console.log(`test-mekadem-infer: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
