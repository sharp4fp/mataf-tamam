// test-tonum.mjs - נרמול מספרים מטקסט: פסיק/נקודה כאלפים או עשרוני לפי תבנית, ערכים מעוותים -> null.
const { toNum } = await import((process.env.BUILD || new URL('../js/', import.meta.url).pathname) + '/analysis.js');
let pass = 0, fail = 0;
const t = (input, expected, label) => {
    const got = toNum(input);
    if (got === expected) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}: got ${got}, expected ${expected} [${input}]`); }
};
t('6,5', 6.5, 'decimal comma work years');
t('1,234', 1234, 'thousands comma');
t('6,500', 6500, 'thousands 3-digit group');
t('1,50', 1.5, 'decimal comma money');
t('1,234.56', 1234.56, 'US both separators');
t('1.234,56', 1234.56, 'EU both separators');
t('₪ 12,500', 12500, 'currency + thousands');
t('12,5%', 12.5, 'percent keeps value, unit is the field');
t('-500', -500, 'sign kept');
t('(500)', -500, 'accounting parentheses negative');
t('12 345', 12345, 'space thousands');
t('100,000.5', 100000.5, 'thousands + decimal dot');
t('12.500', null, 'ambiguous dot+3 digits rejected');
t('1.234', null, 'ambiguous dot thousands rejected');
t('1,2,3', null, 'illegal comma placement rejected');
t('12/5', null, 'fraction not a number');
t('1e3', null, 'exponent notation rejected');
t('5 שנים', null, 'letters rejected');
t('٣٤٥', null, 'arabic-indic digits rejected');
t('', null, 'empty');
// שנות עבודה - שדה בפורמט ידוע: נקודה עשרונית עד 3 ספרות מהחילוץ, פסיק/שנים ידניים, שגוי -> null
{
    const { parseWorkYears } = await import((process.env.BUILD || new URL('../js/', import.meta.url).pathname) + '/analysis.js');
    const cases = [['27.5', 27.5], ['12.583', 12.583], ['6.500', 6.5], ['27.000', 27], ['7.25', 7.25], ['27', 27], ['6,5', 6.5], ['5 שנים', 5], ['27 שנים', 27], ['abc', null], ['1,2,3', null], ['200', null], ['12/5', null]];
    for (const [inp, exp] of cases) {
        const got = parseWorkYears(inp);
        if (got === exp) { pass++; console.log(`PASS workYears "${inp}" -> ${exp}`); } else { fail++; console.log(`FAIL workYears "${inp}": got ${got} expected ${exp}`); }
    }
}
console.log(`test-tonum: ${pass} pass, ${fail} fail`); if (fail) process.exit(1);
