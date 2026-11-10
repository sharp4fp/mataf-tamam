# אתר ספריית המקורות

נבנה מהמאגר ב-10.11.2026 (בקשת הבעלים 20:04), במקום האתר המוצפן הקודם.
כתובת: https://mataf-library.pages.dev · תצוגה: https://preview.mataf-library.pages.dev

- **מקור הנתונים:** `../knowledge/sources/mataf-library-20261109/catalog/sources.json`, אינדקס המקצוע 1.3,
  ו-`../knowledge/LIBRARY-MAP-HE.md`. מסמך שנוסף לקטלוג מופיע באתר בבנייה הבאה - אין עבודה ידנית.
- **בנייה:** `node mataf/library-site/build.mjs <פלט>` (Node 20+, tar; בלי תלויות).
- **בדיקות:** `node mataf/library-site/test.mjs <פלט>` ו-`node mataf/library-site/browser-test.mjs <כתובת>`.
- **פריסה:** `.github/workflows/library-deploy.yml` - כל שמירה: תצוגה; ייצור: ידני באישור הבעלים.
- **כניסה:** אותו שער של מתה"פ (`mataf/site/gate/_middleware.js`), אותו שם משתמש וסיסמה.
  הסיסמה בסוד GitHub `LIBRARY_PASSWORD`; החלפה: לעדכן את הסוד ולהריץ `library-gate-setup.yml` במצב apply.
- **מסכים:** חיפוש בכל העמודים (עם סיווג לכל תוצאה וקישור לעמוד ב-PDF), רשימת מקורות, קריאה עמוד-עמוד,
  מפת המקצוע (תחומים, נושאים, תור עדיפויות), מפת הספרייה.
