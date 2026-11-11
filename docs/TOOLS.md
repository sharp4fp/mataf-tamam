# מדריך כלים ויומן לקחים

המטרה: לדעת בדיוק מה כל רכיב נותן, ולהשתמש בו עם הקלט המדויק שהוא צריך.
**כל טעות נרשמת כאן פעם אחת, עם הפקודה הנכונה, ולא חוזרת.**
המאגר: `sharp4fp/mataf-tamam`. בכל הפקודות `-R sharp4fp/mataf-tamam`.

## 1. מפת הרכיבים

### GitHub Actions (`.github/workflows/`)
| תהליך | מתי רץ | מה עושה |
|---|---|---|
| `mataf-deploy.yml` | push/PR למתה"פ; ידני | 41 חבילות, כרטסות, 2 בדיקות דפדפן ← פריסה (preview אוטומטי; production/demo ידני) ← עשן ← חזרה לאחור בכשל |
| `tamam-deploy.yml` | push/PR לתמ"מ; ידני | בנייה (tsc+vite), 20 בדיקות רגרסיה ← פריסה ← עשן ← חזרה לאחור בכשל |
| `codeql.yml` | push, PR, שבועי | אבטחה ואיכות קוד: JS/TS, Python, Actions |
| `vendored-libs.yml` | שינוי ב-`mataf/site/js`, שבועי | הספריות המועתקות מול OSV |
| `library-deploy.yml` | push/PR לספרייה; ידני | בנייה מהמאגר, בדיקות נתונים ודפדפן ← תצוגה (preview) ← עשן; ייצור ידני ← חזרה לאחור בכשל |
| `library-gate-setup.yml` | ידני | הגדרת שער הספרייה מסוד `LIBRARY_PASSWORD` (inspect/apply); לא מדפיס ערכים |
| `monitor.yml` | כל 3 שעות; ידני | בדיקת האתרים החיים; issue בכשל |
| `cloudflare-status.yml` | ידני | רשימת פרויקטים ופריסות + סביבה (Production/Preview) - קריאה בלבד |
| Dependabot (`.github/dependabot.yml`) | שבועי, יום ראשון | בקשות עדכון ל-npm של תמ"מ ול-Actions |

### Cloudflare Pages (חשבון `5f0bc83596470e930808b33d58a19f95`)
| פרויקט | כתובת | ענף ייצור | מקור |
|---|---|---|---|
| `pension-planner` | pension-planner-2br.pages.dev | `main` | `mataf/site` בלי `demo-site` ו-`CNAME` |
| `pension-planner-preview` | pension-planner-preview.pages.dev | `preview-20261110` | כמו למעלה |
| `pension-planner-demo` | pension-planner-demo.pages.dev | `main` | `mataf/site/demo-site` |
| `tamam-waybill` | tamam-waybill.pages.dev | `main` | `tamam/dist` |
| `mataf-library` | mataf-library.pages.dev | `main` (תצוגה: `preview`) | נבנה מ-`mataf/library-site/build.mjs`; שער כמו מתה"פ |

כל הפרויקטים "העלאה ישירה" (Direct Upload): אי אפשר לחבר אותם ל-Git; פורסים עם
`cloudflare/wrangler-action`. סודות ב-GitHub: `CLOUDFLARE_API_TOKEN` (Pages: Edit
בלבד), `CLOUDFLARE_ACCOUNT_ID`. שער הכניסה של מתה"פ: משתני סביבה ו-D1
(`metap-auth-rate-limit`) - מוגדרים ב-Cloudflare, לא בקוד.

### בדיקות מקומיות
| מה | פקודה (מהתיקייה שבסוגריים) |
|---|---|
| 41 חבילות מתה"פ | `node tests/tests-1032/run-all.mjs site/js` (`mataf/`) |
| מבנה כרטסות | `BUILD=site/js node tests/tests-1032/test-tabs.mjs` (`mataf/`) |
| בדיקות דפדפן | ראו `mataf/tests/tests-1032/RUN-ORDER.txt`; רצות ב-Actions |
| תמ"מ | `npm run build` ואז `vite preview --port 4517` ו-`npm test` - ב-Actions |

### ספריית המקורות
| מה | פקודה (מ-`mataf/knowledge/sources/mataf-library-20261109/`) |
|---|---|
| חיפוש | `python3 -I search.py "מונח" --limit 10` |
| בנייה מחדש של האינדקס | `python3 -I search.py --build` |
| אימות חתימות | `python3 -I search.py --verify` |

אחרי שינוי ב-`catalog/sources.json` או בנייה מחדש: לעדכן את `catalog/checksums.json`
(הערכים של הקבצים שהשתנו, כולל `search.sqlite`) ולהריץ `--verify`.

### כלים בסביבת העבודה של Claude
| כלי | מתי |
|---|---|
| סוכן משנה (Agent) ברקע | בדיקות ארוכות במקביל (כמו הביקורת העצמאית) |
| Docs / Artifact | מסמך או דף שהבעלים ישמור וישתף |
| WebSearch / WebFetch | מקור רשמי עדכני (לא מהזיכרון) |
| דפדפן (built-in / Chrome) | רק כשאין חיבור ייעודי |

## 2. פקודות נכונות (נבדקו)

| פעולה | פקודה נכונה |
|---|---|
| רשימת PR | `gh api repos/sharp4fp/mataf-tamam/pulls --jq '.[] \| "#\(.number) \(.title)"'` |
| ריצות אחרונות | `gh api "repos/sharp4fp/mataf-tamam/actions/runs?per_page=10" --jq '.workflow_runs[] \| "\(.name) \| \(.conclusion // .status)"'` |
| הפעלת תהליך | `gh workflow run <file>.yml -R sharp4fp/mataf-tamam --ref main` |
| המתנה לריצה | `gh run watch <id> -R sharp4fp/mataf-tamam` |
| יומן ריצה | `gh run view <id> -R sharp4fp/mataf-tamam --log` (או `--log-failed`) |
| מצב פריסות Cloudflare | `gh workflow run cloudflare-status.yml -R sharp4fp/mataf-tamam --ref main` |
| טקסט עברי מ-PDF | `pdftotext -q -layout file.pdf out.txt` (עמודים מופרדים ב-`\f`) |
| בדיקת OCR לעמוד | `pdftoppm -r 200 -gray -f N -l N -png file.pdf p` ואז `tesseract p-N.png - -l heb` |
| בניית תמ"מ בלי רשת | `NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/esbuild src/main.tsx --bundle --outdir=OUT/assets --entry-names=app --loader:.jpg=file --loader:.png=file --public-path=/assets --jsx=automatic --define:process.env.NODE_ENV='"production"'` |
| Playwright מקומי | `chromium.launch({channel:'chrome'})`, `NODE_PATH=/opt/npm-tools/node_modules` |
| commit | מחבר `Sharon Simon <sharp4fp@gmail.com>`, הודעה בעברית, ושורות Co-Authored-By ו-Claude-Session |

## 3. יומן לקחים

| # | תאריך | הטעות | הנכון |
|---|---|---|---|
| L01 | 10.11 | ענו לבעלים באנגלית (שלוש פעמים - גם אחרי שנרשם!) | **בדיקה אחרונה לפני כל שליחה: התשובה בעברית?** תמיד עברית, גם כשהבעלים כותב באנגלית ובהודעות ביניים |
| L02 | 10.11 | `gh pr list` / `gh workflow run` בלי `--ref` נכשלו (GraphQL חסום בסביבה) | `gh api repos/...` ל-REST; `gh workflow run ... --ref main` |
| L03 | 10.11 | המתנה עם `sleep` בשרשור - נחסם | `gh run watch <id>` |
| L04 | 10.11 | `curl` לאתרי `*.pages.dev` מהסביבה - נחסם | בדיקות עשן רק בתוך Actions; מצב פריסות דרך `cloudflare-status.yml` |
| L05 | 10.11 | פריסה לפרויקט הבדיקה עם `--branch=main` הפכה ל-Preview בלי משתני השער (שגיאה 500) | `--branch` = ענף הייצור של הפרויקט (טבלה בסעיף 1) |
| L06 | 10.11 | תכנון לחבר את Cloudflare ל-Git | פרויקט Direct Upload לא ניתן לחיבור; wrangler-action |
| L07 | 10.11 | ניסיון לשנות הגדרות מאגר/התראות דרך API (403) | הבעלים מבצע בממשק; Claude מנחה צעד-צעד |
| L08 | 10.11 | `add_repo` נכשל אחרי "Authorize" בלבד | צריך Installed GitHub Apps ← Claude ← Configure ← לבחור את המאגר |
| L09 | 10.11 | עבודה על עותק ישן - כלי אחר עשה force-push (17:08) | `git fetch origin main` לפני כל עבודה ולפני push |
| L10 | 10.11 | `npm install` נחסם בסביבה | בנייה מקומית עם esbuild הגלובלי; בנייה מלאה ב-Actions |
| L11 | 10.11 | בדיקת OSV מקומית נכשלה (אין רשת) | הבדיקה רצה ב-Actions (`vendored-libs.yml`) |
| L12 | 10.11 | קריאת קובץ גדול מ-25 אלף טוקנים נכשלה | `Read` עם `offset` ו-`limit` |
| L13 | 10.11 | סוכן משנה לא הצליח לכתוב קובץ דוח | הסוכן מחזיר את התוכן בהודעה; Claude שומר את הקובץ |
| L14 | 10.11 | `--log-failed` מחזיר פקודות ולא פלט | `--log`, ולסנן שורות `[36;1m` |
| L15 | 10.11 | `fetch(url,{method:'HEAD'})` ל-gov.il החזיר 404 על קבצים קיימים | הורדה מ-gov.il: `fetch(url)` רגיל (GET) מתוך דף gov.il פתוח בדפדפן המובנה |
| L16 | 10.11 | - (נוהל) | הורדת קובץ רשמי: אישור הבעלים לכל קובץ ← הורדה בדפדפן המובנה עם SHA-256 ← `device_request_folder_access` לתיקיית ההורדות ← `device_stage_files` רק לקבצים שאושרו ← השוואת SHA-256 |
| L17 | 10.11 | הבעלים שלח סיסמה בצ'אט | לא משתמשים בסיסמאות שנשלחות בצ'אט; ממליצים להחליף ופותחים פריט בבקלוג |
| L18 | 10.11 | ניסיון להעתיק ערכי סיסמה בין פרויקטי Cloudflare (secret_text לא קריא ב-API) | הבעלים שומר סיסמה כסוד GitHub; Actions מחשב hash ומגדיר דרך ה-API, בלי להדפיס |
| L19 | 10.11 | `curl` ל-raw.githubusercontent.com נחסם (403) | `git clone --depth 1 --filter=blob:none --sparse` ו-`git sparse-checkout set <dir>` |
| L20 | 10.11 | `element.replaceChildren(array)` הדפיס "[object ...]" | לפזר מערכים (`...arr`); בדיקת דפדפן מחפשת "[object" בכל מסך |
| L21 | 11.11 | `import ... from 'playwright'` בקובץ `.mjs` נכשל גם עם `NODE_PATH` (ESM מתעלם ממנו) | `import { createRequire } from 'module'; const require = createRequire('/opt/npm-tools/node_modules/'); const { chromium } = require('playwright');` |
| L22 | 11.11 | היפוך מחרוזת עברית ידנית לפני ציור ב-Pillow הפך את הטקסט פעמיים | Pillow עם raqm מטפל בכיווניות: `d.text(..., direction='rtl')` בלי היפוך |
| L23 | 11.11 | טופס 161 ריק או בלי ת"ז תואמת מועבר ל"ממתין" ותמונת הטופס לא מוצגת | לבדיקות ממשק: PDF סינתטי (`docs/proposals/2026-11-11-retirement-simplification/fixtures/mk161.py`), עברית נשמרת בסדר חזותי כמו בטופס הרשמי |
| L24 | 11.11 | נחשב שקובץ בל"ל `Laws1/00_0001_000001.pdf` הוא "עדכון" של החוק | בל"ל מפרסם חוקים גם לפי פרקים (`..._000000` = מלא, `..._0000NN` = פרק); לזהות לפי התוכן (השוואת טקסט לנוסח המלא) לפני סיווג |
| L25 | 11.11 | חיפוש ב"מדיניות ונהלים" של gov.il עם `?q=` - הפרמטר מתעלם ומחזיר הכול | לאיתור חוזר: WebSearch עם המספר והשם, או דפוס הכתובת `BlobFolder/policy/<slug>/he/...` מדף שכבר ידוע |
| L26 | 11.11 | תקנות יסוד (ניוד 2008) לא היו בספרייה אף שסומנו "נדרש איסוף" באינדקס - והבעלים גילה בזמן שאלה מקצועית | לפני פיתוח פיצ'ר מקצועי: לבדוק באינדקס שהמקורות שלו קיימים; פריטי "נדרש איסוף" ברמת חקיקת יסוד = עדיפות קריטית, לא "אחר כך" |
| L27 | 11.11 | הורדה מהדפדפן: שם הקובץ השני נשמר כ-",.pdf" והשלישי נתקע כ-tmp | לאמת לפי גודל ו-SHA-256 (לא לפי שם), ולא לפרוס שוב את כל תיקיית ההורדות - רק את הקבצים שזוהו |
| L28 | 11.11 | כ-100 הורדות `<a download>` ברצף: חלק נשמרו כ-`.tmp`, הבעלים קיבל חלון לכל קובץ ולחץ Cancel בחלק, ואחר כך מחק את התיקייה לפני ההעברה | לארוז בדפדפן קובץ tar אחד לכל אתר (בניית כותרת ustar ב-JS, SHA-256 לכל קובץ לפני האריזה), להוריד חבילה אחת, `device_stage_files` מיד, לפרוק בקונטיינר ולהשוות SHA לכל קובץ. לרשום את שמות הקבצים שהורדו לדוח "אפשר למחוק" |
| L29 | 11.11 | קישור לגיליון רשומות בויקיטקסט (תיבת המקורות) הוביל לגיליון אחר (ק"ת 6829 במקום תקנות קופה בניהול אישי) | לפני רישום בקטלוג: לחפש בטקסט הגיליון את שם התקנות ולבדוק עמוד בתמונה; קישור מויקיטקסט הוא רמז לאיתור, לא אימות |
| L30 | 11.11 | רשומת קטלוג בלי `pdf_path` (נוסח ויקיטקסט) הפילה את בדיקת אתר הספרייה ("PDF קיים") | לכל נוסח מויקיטקסט לשמור גם הדפסת PDF: `fetch('/api/rest_v1/page/pdf/'+encodeURIComponent(title))` מתוך דף ויקיטקסט (בקצב איטי - 429 בעומס); לפני push להריץ `node mataf/library-site/build.mjs DIR && node mataf/library-site/test.mjs DIR` |
| L31 | 11.11 | כותרת ומפרסם נכתבו מהזיכרון ולא מהמסמך: מדריך פרישה יוחס לרשות שוק ההון (בפועל נציבות שירות המדינה); תקנות "ניכוי תשלומים בעד תגמולים" סווגו כניכוי במקור (בפועל ניכוי מוגדל 47(ב)) | כותרת, מפרסם ותאריך - רק מעמוד השער או מהכותרת בקוד הדף (`{{ח:כותרת}}`), אחרי בדיקה בתמונה |
| L32 | 11.11 | push של מנת ספרייה (4770dfe) בלי לחכות לריצת "ספרייה - בנייה, בדיקות ופריסה" - היא נכשלה (נוסח משולב בלי PDF) ודווח לבעלים שהכול נשמר | אחרי **כל** push: לולאה על כל הריצות של ה-sha (`gh api .../runs?head_sha=`), לא רק על מתה"פ. מקור בקטלוג חייב pdf_path - נוסח מוויקיטקסט נשמר גם כהדפסת PDF |
| L33 | 11.11 | מיזוג רשימות URL ממקורות שונים ב-`sort -u` ובחירת "העמודה האחרונה" הצמיד ללוח הניכויים 2023 את הכתובת של חוזר 2/2013. בנוסף, תוכן תיקון 21 לחוק קופות גמל נוחש מהזיכרון ("קרנות נבחרות") - בפועל זו משיכת פיצויים בידי המעביד | מפת קובץ←URL נבנית מכל tsv לפי מבנה העמודות שלו, ובודקים התנגשויות. תחולה של חוק או תיקון נכתבת רק אחרי קריאת הטקסט |

## 4. איך מוסיפים לקח

1. מוסיפים שורה לטבלה בסעיף 3: מספר רץ, תאריך, הטעות, הנכון.
2. אם יש פקודה חדשה - מוסיפים גם לסעיף 2.
3. נשמר באותו commit של העבודה שבה הטעות קרתה.
