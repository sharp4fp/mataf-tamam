/* ספריית המקורות של מתה״פ — client-side encrypted static library.
   All corpus assets ship encrypted (AES-256-GCM, PBKDF2-SHA256 key derivation).
   The server only ever sees ciphertext. */
(function(){
"use strict";

var FILES = {
  data: "data.enc",
  zip: "mataf-library-2026-11-09-v3.zip.enc",
  pdf: {
    "tax-161d-2026": "sources/tax-161d-2026.pdf.enc",
    "tax-booklet-2026": "sources/tax-booklet-2026.pdf.enc",
    "tax-161c-official-retained-20261109": "sources/tax-161c.pdf.enc",
    "ito-amendment275-2024": "sources/ito-amendment275-2024.pdf.enc",
    "ito-consolidation-btl-retained20261109": "sources/income-tax-ordinance-btl.pdf.enc",
    "form161-official-currentlink20261109": "sources/form161-official.pdf.enc",
    "life-discounts-2026-1-4": "sources/life-discounts-2026-1-4.pdf.enc",
    "provident-approval-regs-btl-retained20261109": "sources/provident-approval-regs-btl.pdf.enc",
    "severance-pay-law-btl-retained20261109": "sources/severance-pay-law-btl.pdf.enc",
    "moh-health-surgery-report-2026": "sources/moh-health-surgery-report-2026.pdf.enc",
    "menora-mekifa": "sources/menora-mekifa.pdf.enc",
    "clal-y703-5-2026": "sources/clal-y703-5-2026.pdf.enc",
    "harel-6-2025": "sources/harel-6-2025.pdf.enc",
    "migdal-ishit-062025": "sources/migdal-ishit-062025.pdf.enc",
    "meitav-2026-booklet": "sources/meitav-2026-booklet.pdf.enc",
    "altshuler-010625": "sources/altshuler-010625.pdf.enc",
    "more-4-2026": "sources/more-4-2026.pdf.enc",
    "infinity-5-2025": "sources/infinity-5-2025.pdf.enc",
    "phoenix-1-7-2024": "sources/phoenix-1-7-2024.pdf.enc",
    "phoenix-changes-122025": "sources/phoenix-changes-122025.pdf.enc"
  }
};
var PDF_NAME = {
  "tax-161d-2026": "tax-161d-2026.pdf",
  "tax-booklet-2026": "tax-booklet-2026.pdf",
  "tax-161c-official-retained-20261109": "tax-161c.pdf",
  "ito-amendment275-2024": "ito-amendment275-2024.pdf",
  "ito-consolidation-btl-retained20261109": "income-tax-ordinance-btl.pdf",
  "form161-official-currentlink20261109": "form161-official.pdf",
  "life-discounts-2026-1-4": "life-discounts-2026-1-4.pdf",
  "provident-approval-regs-btl-retained20261109": "provident-approval-regs-btl.pdf",
  "severance-pay-law-btl-retained20261109": "severance-pay-law-btl.pdf",
  "moh-health-surgery-report-2026": "moh-health-surgery-report-2026.pdf",
  "menora-mekifa": "menora-mekifa.pdf",
  "clal-y703-5-2026": "clal-y703-5-2026.pdf",
  "harel-6-2025": "harel-6-2025.pdf",
  "migdal-ishit-062025": "migdal-ishit-062025.pdf",
  "meitav-2026-booklet": "meitav-2026-booklet.pdf",
  "altshuler-010625": "altshuler-010625.pdf",
  "more-4-2026": "more-4-2026.pdf",
  "infinity-5-2025": "infinity-5-2025.pdf",
  "phoenix-1-7-2024": "phoenix-1-7-2024.pdf",
  "phoenix-changes-122025": "phoenix-changes-122025.pdf"
};
var PBKDF2_ITER = 300000;

var state = null;          // decrypted data JSON
var keyCache = {};         // saltHex -> CryptoKey
var blobCache = {};        // fileId -> objectURL

function bufToHex(buf){
  var a = new Uint8Array(buf), s = "";
  for (var i=0;i<a.length;i++) s += a[i].toString(16).padStart(2,"0");
  return s;
}
function deriveKey(password, salt){
  var hex = bufToHex(salt) + "|" + password;
  if (keyCache[hex]) return Promise.resolve(keyCache[hex]);
  var enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
    .then(function(base){
      return crypto.subtle.deriveKey(
        {name:"PBKDF2", salt: salt, iterations: PBKDF2_ITER, hash:"SHA-256"},
        base, {name:"AES-GCM", length:256}, false, ["decrypt"]);
    })
    .then(function(k){ keyCache[hex]=k; return k; });
}
function decryptBlob(url, password){
  return fetch(url).then(function(r){
    if(!r.ok) throw new Error("fetch "+url+" -> "+r.status);
    return r.arrayBuffer();
  }).then(function(buf){
    var b = new Uint8Array(buf);
    var salt = b.slice(0,16), iv = b.slice(16,28), ct = b.slice(28);
    return deriveKey(password, salt).then(function(key){
      return crypto.subtle.decrypt({name:"AES-GCM", iv: iv}, key, ct);
    });
  });
}

/* ---------- gate ---------- */
var gateForm = document.getElementById("gate-form");
var gateErr = document.getElementById("gate-error");
var gateWait = document.getElementById("gate-wait");
var gateBtn = document.getElementById("gate-btn");
var savedPassword = null;

gateForm.addEventListener("submit", function(ev){
  ev.preventDefault();
  var pw = document.getElementById("gate-pass").value;
  if(!pw) return;
  gateErr.hidden = true; gateWait.hidden = false; gateBtn.disabled = true;
  decryptBlob(FILES.data, pw).then(function(buf){
    var txt = new TextDecoder().decode(buf);
    state = JSON.parse(txt);
    savedPassword = pw;
    document.getElementById("gate-pass").value = "";
    try{ renderApp(); }catch(e){ gateWait.hidden = false; gateWait.textContent = "שגיאת תצוגה: " + (e && e.message ? e.message : String(e)); throw e; }
    document.getElementById("gate").hidden = true;
    document.getElementById("app").hidden = false;
    document.getElementById("q").focus();
  }).catch(function(){
    keyCache = {};
    gateWait.hidden = true; gateBtn.disabled = false;
    gateErr.textContent = "הסיסמה שגויה או שהקובץ פגום. נסו שוב.";
    gateErr.hidden = false;
  });
});

document.getElementById("lock-btn").addEventListener("click", function(){
  state = null; savedPassword = null; keyCache = {};
  for (var k in blobCache){ URL.revokeObjectURL(blobCache[k]); }
  blobCache = {};
  // A fresh document removes decrypted DOM, cached keys and pending handlers.
  window.location.reload();
});

/* ---------- tabs ---------- */
document.getElementById("tabs").addEventListener("click", function(ev){
  var b = ev.target.closest(".tab"); if(!b) return;
  document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active");});
  document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active");});
  b.classList.add("active");
  document.getElementById("tab-"+b.dataset.tab).classList.add("active");
  if(b.scrollIntoView) b.scrollIntoView({block:"nearest", inline:"center"});
});

/* ---------- render ---------- */
function esc(s){ var d=document.createElement("div"); d.textContent=s==null?"":String(s); return d.innerHTML; }

function renderApp(){
  document.getElementById("edition-line").textContent =
    "מהדורה " + state.edition + " · " + state.primary_source_count + " מסמכים רשמיים + 10 תקנונים · " + state.total_source_pages + " עמודי מקור · טקסט חלקי; 518 עמודים עם טבלאות מוסתרות ו-79 עמודים לא זמינים כטקסט";
  document.getElementById("scope-banner").textContent = "⚠ " + (state.scope_he || state.scope);

  renderSources();
  renderDatasets();
  renderProfmap();
  renderNotes();
  renderFunds();
  renderDownloads();
  renderAbout();
}

function sourceById(id){
  for (var i=0;i<state.sources.length;i++) if(state.sources[i].id===id) return state.sources[i];
  return null;
}

function renderSources(){
  var html = "";
  ["official","provider_historical"].forEach(function(group){
    html += '<h2>'+(group==="official"?"מסמכים רשמיים":"תקנוני חברות - עותקים היסטוריים")+'</h2>';
    state.sources.filter(function(x){return x.group===group;}).forEach(function(s){
      html += '<div class="card"><h2>'+esc(s.title)+'</h2><p>'+esc(s.publisher)+' · מהדורה '+esc(s.edition)+'</p>'
       + '<p class="small">נשמר: '+esc(s.retained_on)+' · לא אומת מחדש מול המקור החי</p>'
       + '<p class="note-warn">'+esc(s.verification)+'</p>'
       + (s.group==="provider_historical"?'<p class="small">'+s.nonempty_text_pages+' עמודים עם חילוץ טקסט (עשוי להיות חלקי) מתוך '+s.pdf_pages+' · מספרים וטבלאות דורשים בדיקה מול ה-PDF המקורי.</p>':'')
       + (s.url?'<a class="ext-link" href="'+esc(s.url)+'" target="_blank" rel="noopener">כתובת המקור המתועדת (לא אומתה מחדש)</a>':'<p class="note-warn">אין כתובת מקור מקוון שמורה למסמך זה</p>')
       + '<p class="hash">SHA-256 מקור PDF: '+esc(s.sha256)+'</p>'
       + '<button class="primary" data-readsource="'+esc(s.id)+'">קריאת הטקסט</button> '
       + '<button class="ghost" data-dltxt="'+esc(s.id)+'">הורדת טקסט</button> '
       + (s.has_pdf?'<button class="ghost" data-dlpdf="'+esc(s.id)+'">PDF מקור</button>':'<p class="small">אין PDF באתר</p>')+'</div>';
    });
  });
  document.getElementById("sources-list").innerHTML=html;
  var sel=document.getElementById("source-filter");
  sel.innerHTML='<option value="">כל המקורות</option><option value="official">מסמכים רשמיים בלבד</option><option value="provider_historical">תקנוני חברות בלבד</option>'+state.sources.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>';}).join('');
  document.getElementById("ledger").innerHTML=(state.ledger||[]).map(function(x){return '<div class="card"><h2>'+esc(x.date)+' · '+esc(x.title)+'</h2><p>'+esc(x.details)+'</p></div>';}).join('');
}

function renderNotes(){
  document.getElementById("notes-body").innerHTML = mdToHtml(state.notes_md);
}

/* minimal markdown: headings, bold, bullets, links, paragraphs */
function mdToHtml(md){
  var lines = md.split(/\r?\n/), out = [], inList=false;
  function inline(t){
    t = esc(t);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(https?:\/\/[^\s)]+)/g, function(u){ return '<a class="ext-link" href="'+u+'" target="_blank" rel="noopener">'+u+'</a>'; });
    return t;
  }
  function closeList(){ if(inList){ out.push("</ul>"); inList=false; } }
  lines.forEach(function(ln){
    if(/^\s*$/.test(ln)){ closeList(); return; }
    var m;
    if((m = ln.match(/^###\s+(.*)/))){ closeList(); out.push("<h3>"+inline(m[1])+"</h3>"); return; }
    if((m = ln.match(/^##\s+(.*)/))){ closeList(); out.push("<h2>"+inline(m[1])+"</h2>"); return; }
    if((m = ln.match(/^#\s+(.*)/))){ closeList(); out.push("<h2>"+inline(m[1])+"</h2>"); return; }
    if((m = ln.match(/^-\s+(.*)/))){ if(!inList){ out.push("<ul>"); inList=true; } out.push("<li>"+inline(m[1])+"</li>"); return; }
    closeList(); out.push("<p>"+inline(ln)+"</p>");
  });
  closeList();
  return out.join("\n");
}

function renderFunds(){
  document.getElementById("fund-status").textContent = state.fund_corpus_status_he || state.fund_corpus_status;
  var rows = state.fund_csv;
  if(!rows || !rows.length){ document.getElementById("fund-table").innerHTML=""; return; }
  var html = "<thead><tr><th>חברה</th><th>קובץ</th><th>מהדורה מתועדת</th><th>עמודי מקדמים</th><th>הערה</th><th>כתובת מתועדת (8.11.2026)</th></tr></thead><tbody>";
  rows.forEach(function(r){
    var u = r.source_url_recorded_2026_11_08 || "";
    var link = /^https?:\/\//.test(u)
      ? '<a class="ext-link" href="'+esc(u)+'" target="_blank" rel="noopener">קישור</a>'
      : '<span class="muted small">לא תועדה</span>';
    html += "<tr><td>"+esc(r.company)+"</td><td><span dir=\"ltr\">"+esc(r.filename)+"</span></td><td>"+esc(r.edition_recorded)+"</td><td>"+esc(r.coefficient_pages_recorded)+"</td><td>"+esc(r.caveat||"")+"</td>"
      + "<td>"+link+"</td></tr>";
  });
  html += "</tbody>";
  document.getElementById("fund-table").innerHTML = html;
}

function renderDownloads(){
  document.getElementById("zip-hash-line").textContent = "SHA-256 של חבילת ה-ZIP המקורית: " + state.zip_sha256;
  var html = "";
  state.sources.forEach(function(s){
    html += '<div class="card"><h2>'+esc(s.title)+'</h2>'
      + '<div class="actions">'
      + (s.has_pdf?'<button class="ghost" data-dlpdf="'+esc(s.id)+'">הורדת PDF</button> ':'<span class="small">אין PDF באתר</span> ')
      + '<button class="ghost" data-dltxt="'+esc(s.id)+'">הורדת טקסט לפי עמודים</button>'
      + '</div></div>';
  });
  document.getElementById("download-sources").innerHTML = html;
}

function renderAbout(){
  var g = state.gaps, gh = state.gaps_he || {};
  var html = '<div class="card"><h2>מה הספרייה מכילה — ומה לא</h2>'
    + '<p>'+esc(gh.coverage || g.coverage)+'</p>'
    + '<p>'+esc(state.readme_extra || "")+'</p></div>'
    + '<div class="card"><h2>פערים ידועים בכיסוי</h2><ul>';
  (gh.priority_open || g.priority_open || []).forEach(function(x){ html += "<li>"+esc(x)+"</li>"; });
  html += '</ul></div>'
    + '<div class="card"><h2>אמינות ותחזוקה</h2>'
    + '<p>'+esc(gh.current_law_check || g.current_law_check)+'</p>'
    + '<p>'+esc(gh.unofficial_material || g.unofficial_material)+'</p>'
    + '<p>הספרייה נשמרת גם בגיבוי עצמאי מחוץ לאתר זה. האתר הוא עותק קריאה נוסף, לא המקום היחיד שבו החומר נשמר.</p>'
    + '<p class="muted small">גישה לאתר מוגבלת בסיסמת בעלים משותפת (שער מוצפן בצד-לקוח) — אין הפרדה בין משתמשים שונים ואין יומן גישה אישי.</p>'
    + '</div>';
  document.getElementById("about-body").innerHTML = html;
}

/* ---------- search ---------- */
var qEl = document.getElementById("q");
var searchTimer = null;
qEl.addEventListener("input", function(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
});
qEl.addEventListener("keydown", function(ev){ if(ev.key==="Enter"){ ev.preventDefault(); runSearch(); } });

function norm(s){ return (s||"").replace(/[\u0591-\u05C7]/g,""); } // strip niqqud

function runSearch(){
  if(!state) return;
  var raw = qEl.value.trim();
  var resEl = document.getElementById("results");
  var statsEl = document.getElementById("search-stats");
  if(!raw){ resEl.innerHTML=""; statsEl.textContent=""; return; }
  var terms = norm(raw).split(/\s+/).filter(Boolean);
  var hits = [];
  state.pages.forEach(function(p){
    var filter=document.getElementById("source-filter").value;
    var source=sourceById(p.source_id);
    if(filter && filter!==p.source_id && filter!==source.group) return;
    var t = norm(p.text);
    for (var i=0;i<terms.length;i++){ if(t.indexOf(terms[i])<0) return; }
    var idx = t.indexOf(terms[0]);
    var start = Math.max(0, idx-140), end = Math.min(p.text.length, idx+terms[0].length+220);
    hits.push({p:p, snippet:(start>0?"…":"")+p.text.slice(start,end)+(end<p.text.length?"…":"")});
  });
  statsEl.textContent = hits.length ? ("נמצאו "+hits.length+" עמודים תואמים (מוצגים עד 30)") : "אין תוצאה — היעדר תוצאה אינו היעדר דין.";
  var html = "";
  hits.slice(0,30).forEach(function(h){
    var s = sourceById(h.p.source_id);
    var snip = esc(h.snippet);
    terms.forEach(function(t){
      if(!t) return;
      snip = snip.split(esc(t)).join("<mark>"+esc(t)+"</mark>");
    });
    html += '<div class="result"><h3>'+esc(s?s.title:h.p.source_id)+' · עמוד '+h.p.page+'</h3>'
      + '<p class="small">'+(s.group==="official"?"מדריך מס רשמי, עותק שמור":"תקנון חברה היסטורי, לא אומת מחדש")+'</p>' + '<div class="snippet">'+snip+'</div>'
      + '<div class="actions">'
      + (s.has_pdf?'<button class="ghost small" data-openpdf="'+esc(h.p.source_id)+'" data-page="'+h.p.page+'">PDF מקור</button> ':'<span class="small">אין PDF באתר</span> ')
      + '<button class="ghost small" data-showtext="'+esc(h.p.source_id)+'" data-page="'+h.p.page+'">הצג טקסט העמוד</button>'
      + '</div></div>';
  });
  resEl.innerHTML = html;
}


/* ---------- datasets (provider data, not law pages) ---------- */
function colIndex(ref){var m=/^([A-Z]+)(\d+)$/.exec(ref);if(!m)return null;var n=0;for(var i=0;i<m[1].length;i++)n=n*26+(m[1].charCodeAt(i)-64);return {c:n,r:parseInt(m[2],10)};}
function renderDatasets(){
  var box=document.getElementById("datasets-body");box.textContent="";
  (state.datasets||[]).forEach(function(ds){
    var card=document.createElement("div");card.className="card";
    function add(tag,txt,cls){var e=document.createElement(tag);if(cls)e.className=cls;e.textContent=txt;card.appendChild(e);return e;}
    add("h2",ds.title);
    add("p",ds.publisher+" · "+ds.kind_he);
    add("p",ds.scope_he,"note-warn");
    add("p","חודשי דיווח: "+ds.reporting_months[0]+" עד "+ds.reporting_months[ds.reporting_months.length-1]+" ("+ds.reporting_months.length+") · גיליון אחד, "+ds.rows+" שורות, "+ds.columns+" עמודות, "+ds.nonempty_cells+" תאים לא ריקים · מזהה קרן "+ds.fund_identifier,"small");
    var ul=document.createElement("ul");ul.className="small";ds.limits_he.forEach(function(l){var li=document.createElement("li");li.textContent=l;ul.appendChild(li);});add("p","מגבלות:","small");card.appendChild(ul);
    add("p","דף המקור: "+ds.source_page,"small");
    add("p","כתובת ההורדה שנרשמה (לא הורדה מחדש): "+ds.download_url_observed,"small");
    add("p","SHA-256 XLSX מקורי: "+ds.sha256_xlsx,"hash");
    add("p","SHA-256 cells.json: "+ds.sha256_cells_json+" · SHA-256 values.csv: "+ds.sha256_values_csv,"hash");
    var act=document.createElement("div");act.className="actions";
    [["xlsx","הורדת XLSX מקורי","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",ds.id+".xlsx"],["csv","הורדת CSV","text/csv;charset=utf-8",ds.id+".values.csv"],["cells","הורדת JSON תאים","application/json",ds.id+".cells.json"]].forEach(function(x){
      var b=document.createElement("button");b.className="ghost";b.textContent=x[1];b.addEventListener("click",function(){
        b.disabled=true;decryptBlob(ds.files[x[0]]+".enc",savedPassword).then(function(buf){downloadBytes(buf,x[3],x[2]);}).catch(function(){alert("שגיאה בהורדה");}).finally(function(){b.disabled=false;});});
      act.appendChild(b);});
    var vb=document.createElement("button");vb.className="primary";vb.textContent="הצגת הטבלה (ערכים גולמיים)";vb.addEventListener("click",function(){showDatasetTable(ds,vb);});act.appendChild(vb);
    card.appendChild(act);
    var tw=document.createElement("div");tw.className="table-wrap";tw.id="ds-table-"+ds.id;tw.hidden=true;card.appendChild(tw);
    box.appendChild(card);
  });
}
function showDatasetTable(ds,btn){
  var wrap=document.getElementById("ds-table-"+ds.id);
  if(!wrap.hidden){wrap.hidden=true;btn.textContent="הצגת הטבלה (ערכים גולמיים)";return;}
  btn.disabled=true;
  decryptBlob(ds.files.cells+".enc",savedPassword).then(function(buf){
    var cells=JSON.parse(new TextDecoder().decode(buf)),grid={},maxR=0,maxC=0;
    cells.forEach(function(x){var p=colIndex(x.cell);if(!p)return;(grid[p.r]=grid[p.r]||{})[p.c]=x;if(p.r>maxR)maxR=p.r;if(p.c>maxC)maxC=p.c;});
    var t=document.createElement("table");t.dir="rtl";t.style.width="auto";t.style.whiteSpace="nowrap";
    var hr=document.createElement("tr");var corner=document.createElement("th");corner.textContent="שורה";hr.appendChild(corner);
    for(var c=1;c<=maxC;c++){var th=document.createElement("th");var s="",n=c;while(n>0){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26);}th.textContent=s;hr.appendChild(th);}
    t.appendChild(hr);
    for(var r=1;r<=maxR;r++){if(!grid[r])continue;var tr=document.createElement("tr");var rh=document.createElement("th");rh.textContent=String(r);tr.appendChild(rh);
      for(var c2=1;c2<=maxC;c2++){var td=document.createElement("td");var x=grid[r][c2];if(x){td.textContent=x.value==null?"":String(x.value);td.dir="auto";td.style.padding="3px 10px";if(x.type==="n")td.style.textAlign="left";}tr.appendChild(td);}
      t.appendChild(tr);}
    wrap.textContent="";var note=document.createElement("p");note.className="small";note.style.padding="6px 10px";note.textContent="ערכי תאים גולמיים כפי ששמורים בקובץ. אין עיצוב מספרים, ממוזגי תאים או חישוב. לבדיקה מול המקור יש להשתמש בקובץ ה-XLSX. שורות ריקות הושמטו.";wrap.appendChild(note);wrap.appendChild(t);wrap.style.maxHeight="70vh";wrap.style.overflow="auto";wrap.hidden=false;btn.textContent="הסתרת הטבלה";
  }).catch(function(){alert("שגיאה בטעינת הטבלה");}).finally(function(){btn.disabled=false;});
}

/* ---------- pdf/text actions ---------- */
function ensurePdfBlob(id){
  if(blobCache["pdf:"+id]) return Promise.resolve(blobCache["pdf:"+id]);
  return decryptBlob(FILES.pdf[id], savedPassword).then(function(buf){
    var url = URL.createObjectURL(new Blob([buf], {type:"application/pdf"}));
    blobCache["pdf:"+id] = url;
    return url;
  });
}
function download(url, name){
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function downloadBytes(buf, name, mime){
  var url = URL.createObjectURL(new Blob([buf], {type:mime||"application/octet-stream"}));
  download(url, name);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
}

document.body.addEventListener("click", function(ev){
  var b = ev.target.closest("button"); if(!b || !state) return;
  if(b.dataset.readsource){
    openTextPage(b.dataset.readsource,1);
  } else if(b.dataset.openpdf){
    b.disabled = true;
    var sid = b.dataset.openpdf, pg = b.dataset.page || 1;
    ensurePdfBlob(sid).then(function(url){
      var s = sourceById(sid);
      document.getElementById("pdf-title").textContent = (s?s.title:sid)+" · עמוד "+pg;
      document.getElementById("pdf-frame").src = url + "#page=" + pg;
      document.getElementById("pdf-download").dataset.dlpdf = sid;
      var tb = document.getElementById("pdf-text");
      tb.dataset.showtext = sid; tb.dataset.page = pg;
      document.getElementById("pdf-modal").hidden = false; document.getElementById("page-modal").hidden = true;
    }).catch(function(){ alert("שגיאה בפתיחת ה-PDF"); })
      .finally(function(){ b.disabled = false; });
  } else if(b.dataset.dlpdf){
    b.disabled = true;
    ensurePdfBlob(b.dataset.dlpdf).then(function(url){
      download(url, PDF_NAME[b.dataset.dlpdf]||"document.pdf");
    }).finally(function(){ b.disabled = false; });
  } else if(b.dataset.dltxt){
    var sid = b.dataset.dltxt;
    var text = state.pages.filter(function(p){return p.source_id===sid;})
      .sort(function(a,b){return a.page-b.page;})
      .map(function(p){ return "=== עמוד "+p.page+" ===\n"+(p.text||p.note||""); }).join("\n\n");
    downloadBytes(new TextEncoder().encode("חילוץ אוטומטי: ייתכנו השמטות, לרבות מספרי סעיפים. טבלאות לא-מאומתות אינן מוצגות. יש לבדוק מול ה-PDF המקורי.\n\n"+text), sid+".txt", "text/plain;charset=utf-8");
  } else if(b.dataset.showtext){
    openTextPage(b.dataset.showtext,Number(b.dataset.page));
  }
});
function openTextPage(sid,page){
  var p=state.pages.find(function(x){return x.source_id===sid && x.page===page;});
  if(!p)return;
  var source=sourceById(sid);
  document.getElementById("modal-title").textContent=source.title+" · עמוד "+page;
  document.getElementById("modal-caveat").hidden=false;
  document.getElementById("modal-text").textContent=p.text.trim()?p.text:(p.note||"לא חולץ טקסט לעמוד זה. אין להסיק שהעמוד ריק במקור.");
  var max=state.pages.filter(function(x){return x.source_id===sid;}).length;
  var num=document.getElementById("page-number");num.value=page;num.max=max;num.dataset.source=sid;
  var prev=document.getElementById("page-prev"),next=document.getElementById("page-next");
  prev.dataset.showtext=sid;prev.dataset.page=page-1;prev.disabled=page<=1;
  next.dataset.showtext=sid;next.dataset.page=page+1;next.disabled=page>=max;
  var op=document.getElementById("page-openpdf");op.hidden=!source.has_pdf;op.dataset.openpdf=sid;op.dataset.page=page;
  document.getElementById("page-modal").hidden=false;
}
document.getElementById("page-go").addEventListener("click",function(){var num=document.getElementById("page-number");var page=Number(num.value);if(Number.isInteger(page)&&page>=1&&page<=Number(num.max))openTextPage(num.dataset.source,page);});
document.getElementById("source-filter").addEventListener("change",runSearch);
document.getElementById("modal-close").addEventListener("click", function(){
  document.getElementById("page-modal").hidden = true;
});
document.getElementById("pdf-close").addEventListener("click", function(){
  document.getElementById("pdf-modal").hidden = true;
  document.getElementById("pdf-frame").src = "about:blank";
});
document.getElementById("page-modal").addEventListener("click", function(ev){
  if(ev.target === this) this.hidden = true;
});

document.getElementById("dl-zip").addEventListener("click", function(){
  var b = this; b.disabled = true; b.textContent = "מפענח ומוריד…";
  decryptBlob(FILES.zip, savedPassword).then(function(buf){
    downloadBytes(buf, "mataf-library-2026-11-09-v3.zip", "application/zip");
  }).catch(function(){ alert("שגיאה בהורדת החבילה"); })
    .finally(function(){ b.disabled = false; b.textContent = "הורדת mataf-library-2026-11-09-v3.zip"; });
});

/* ---------- all original PDFs as one ZIP (store, built in the browser) ---------- */
var CRC_T=(function(){var t=[],c,n,k;for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){var c=0xFFFFFFFF;for(var i=0;i<u.length;i++)c=CRC_T[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function buildStoreZip(entries){
  var parts=[],central=[],offset=0,enc=new TextEncoder();
  entries.forEach(function(e){
    var name=enc.encode(e.name),crc=crc32(e.data),size=e.data.length;
    var h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,0,true);h.setUint16(12,0x21,true);
    h.setUint32(14,crc,true);h.setUint32(18,size,true);h.setUint32(22,size,true);h.setUint16(26,name.length,true);h.setUint16(28,0,true);
    parts.push(h.buffer,name,e.data);
    var c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,0x21,true);
    c.setUint32(16,crc,true);c.setUint32(20,size,true);c.setUint32(24,size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    central.push(c.buffer,name);
    offset+=30+name.length+size;
  });
  var cdSize=0;central.forEach(function(p){cdSize+=p.byteLength!==undefined?p.byteLength:p.length;});
  var end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  return new Blob(parts.concat(central,[end.buffer]),{type:"application/zip"});
}
var dlAll=document.getElementById("dl-allpdf");
dlAll.addEventListener("click",function(){
  var b=this,ids=state.sources.filter(function(s){return s.has_pdf;}).map(function(s){return s.id;}),done=0,entries=[];
  b.disabled=true;b.textContent="מפענח 0/"+ids.length+"…";
  ids.reduce(function(p,id){return p.then(function(){
    return decryptBlob(FILES.pdf[id],savedPassword).then(function(buf){
      entries.push({name:PDF_NAME[id]||(id+".pdf"),data:new Uint8Array(buf)});done++;b.textContent="מפענח "+done+"/"+ids.length+"…";});
  });},Promise.resolve()).then(function(){
    var blob=buildStoreZip(entries);
    download(URL.createObjectURL(blob),"mataf-library-original-pdfs-2026-11-09.zip");
  }).catch(function(){alert("שגיאה בהורדת קובצי ה-PDF");})
    .finally(function(){b.disabled=false;b.textContent="הורדת כל קובצי ה-PDF המקוריים (ZIP, כ-36MB)";});
});
document.getElementById("dl-notes").addEventListener("click", function(){
  downloadBytes(new TextEncoder().encode(state.notes_md), "retirement-v4.md", "text/markdown;charset=utf-8");
});


/* ---------- profession map: editorial index, not verified obligations ---------- */
function renderProfmap(){
  var pi=state.profession_index; if(!pi) return;
  document.getElementById("profmap-intro").textContent =
    "מפת המקצוע היא אינדקס עריכה של נושאי העבודה וסוגי הראיות הנדרשות לסוכן ביטוח פנסיוני ולתכנון פרישה, ורשימת משפחות המסמכים שיש לאסוף. היא אינה רשימת חובות משפטיות מאומתות, אינה מחליפה בדיקת מקור מחייב, ואין לראות במספר המקורות ציון מוכנות. גרסה " + pi.version + " · נכון ל-" + String(pi.as_of).slice(0,10) + " · " + pi.counts.domains + " תחומים · " + pi.counts.topics + " נושאים · " + pi.counts.source_families + " משפחות מסמכים לאיסוף.";
  var lg=document.getElementById("profmap-legend"); lg.textContent="";
  var lh=document.createElement("h2"); lh.textContent="מקרא סטטוסים ובקרת איכות"; lg.appendChild(lh);
  if(pi.completion_statement){ var cs=document.createElement("p"); cs.className="small"; cs.textContent=pi.completion_statement; lg.appendChild(cs); }
  var ul1=document.createElement("ul"); ul1.className="small";
  (pi.status_legend||[]).forEach(function(x){var li=document.createElement("li");li.textContent=x;ul1.appendChild(li);}); lg.appendChild(ul1);
  var qg=document.createElement("p"); qg.className="small"; qg.textContent="שער איכות לכל נושא:"; lg.appendChild(qg);
  var ul2=document.createElement("ul"); ul2.className="small";
  (pi.quality_gate||[]).forEach(function(x){var li=document.createElement("li");li.textContent=x;ul2.appendChild(li);}); lg.appendChild(ul2);
  if(pi.source_family_note){ var sfn=document.createElement("p"); sfn.className="small"; sfn.textContent=pi.source_family_note; lg.appendChild(sfn); }
  if(pi.collection_order){ var co=document.createElement("p"); co.className="small"; co.textContent="סדר עבודה: "+pi.collection_order; lg.appendChild(co); }
  var pq=document.getElementById("profmap-priority"); pq.textContent="";
  var ph=document.createElement("h2"); ph.textContent="תור עדיפויות לאיסוף ובדיקה"; pq.appendChild(ph);
  (pi.priority_queue||[]).forEach(function(p){
    var pp=document.createElement("p"); pp.className="small";
    pp.textContent="עדיפות "+p.priority+": "+p.task+" ("+(p.topic_ids||[]).join(", ")+")";
    pq.appendChild(pp);
  });
  renderProfmapList();
}
function profmapFamiliesById(pi){
  var m={}; (pi.collection_manifest||[]).forEach(function(f){m[f.id]=f;}); return m;
}
function renderProfmapList(){
  var pi=state.profession_index; if(!pi) return;
  var q=(document.getElementById("profmap-q").value||"").trim();
  var nosrc=document.getElementById("profmap-nosrc").checked;
  var body=document.getElementById("profmap-body"); body.textContent="";
  var heldById={}; (pi.held_sources||[]).forEach(function(h){heldById[h.id]=h;});
  var famById=profmapFamiliesById(pi);
  var shown=0;
  (pi.domains||[]).forEach(function(dom){
    var topics=(pi.topics||[]).filter(function(t){return t.domain_id===dom.id;});
    var matched=topics.filter(function(t){
      if(nosrc && (t.held_source_candidates||[]).length) return false;
      if(q){ var hay=t.title+" "+(t.source_checklist||[]).join(" ")+" "+(t.next_action||""); if(hay.indexOf(q)===-1) return false; }
      return true;
    });
    if(!matched.length) return;
    shown+=matched.length;
    var card=document.createElement("div"); card.className="card";
    var h=document.createElement("h2"); h.textContent=dom.id+" · "+dom.title; card.appendChild(h);
    var ds=document.createElement("p"); ds.className="small"; ds.textContent=dom.status+" · "+dom.coverage_note; card.appendChild(ds);
    matched.forEach(function(t){
      var div=document.createElement("div"); div.className="topic";
      var th=document.createElement("h3"); th.textContent=t.id+" · "+t.title; div.appendChild(th);
      var ul=document.createElement("ul"); ul.className="small";
      (t.source_checklist||[]).forEach(function(c){var li=document.createElement("li");li.textContent=c;ul.appendChild(li);});
      div.appendChild(ul);
      var s=document.createElement("p"); s.className="small"; s.textContent="סטטוס: "+t.source_status+" · "+t.readiness; div.appendChild(s);
      if((t.held_source_candidates||[]).length){
        var cp=document.createElement("p"); cp.className="small";
        cp.appendChild(document.createTextNode("מקורות קשורים (ברמת תחום בלבד): "));
        t.held_source_candidates.forEach(function(cid,i){
          var hsrc=heldById[cid];
          if(hsrc&&hsrc.url){ var a=document.createElement("a"); a.href=hsrc.url; a.target="_blank"; a.rel="noopener"; a.textContent=hsrc.title; cp.appendChild(a); }
          else { cp.appendChild(document.createTextNode(hsrc?hsrc.title:cid)); }
          if(i<t.held_source_candidates.length-1) cp.appendChild(document.createTextNode(" · "));
        });
        div.appendChild(cp);
        var cm=document.createElement("p"); cm.className="small"; cm.textContent=t.candidate_link_meaning; div.appendChild(cm);
      } else {
        var none=document.createElement("p"); none.className="small"; none.textContent="אין מקור קשור שמור - יש לאתר ולשמור מקור."; div.appendChild(none);
      }
      if((t.required_source_family_ids||[]).length){
        var fp=document.createElement("p"); fp.className="small";
        fp.appendChild(document.createTextNode("משפחות מסמכים נדרשות: "));
        t.required_source_family_ids.forEach(function(fid,i){
          var f=famById[fid];
          if(f&&f.observed_url){ var a=document.createElement("a"); a.href=f.observed_url; a.target="_blank"; a.rel="noopener"; a.textContent=fid+" "+f.title; fp.appendChild(a); }
          else { fp.appendChild(document.createTextNode(fid+(f?" "+f.title:""))); }
          if(i<t.required_source_family_ids.length-1) fp.appendChild(document.createTextNode(" · "));
        });
        div.appendChild(fp);
      }
      var na=document.createElement("p"); na.className="small"; na.textContent="פעולה הבאה: "+t.next_action; div.appendChild(na);
      card.appendChild(div);
    });
    body.appendChild(card);
  });
  document.getElementById("profmap-stats").textContent="מוצגים "+shown+" מתוך "+pi.counts.topics+" נושאים.";
  renderProfmapFamilies(pi, famById, q);
}
function renderProfmapFamilies(pi, famById, q){
  var box=document.getElementById("profmap-families"); box.textContent="";
  var h=document.createElement("h2"); h.textContent="משפחות מסמכים לאיסוף ("+(pi.collection_manifest||[]).length+")"; box.appendChild(h);
  var note=document.createElement("p"); note.className="small"; note.textContent="רשימת איסוף נדרשת: סוג, מנפיק, מהדורה נדרשת וסטטוס. כתובת שלא אותרה מסומנת במפורש ולא הומצאה."; box.appendChild(note);
  var shown=0;
  (pi.collection_manifest||[]).forEach(function(f){
    if(q){ var hay=f.title+" "+(f.issuer_or_owner||"")+" "+(f.source_type||""); if(hay.indexOf(q)===-1) return; }
    shown++;
    var div=document.createElement("div"); div.className="topic";
    var th=document.createElement("h3"); th.textContent=f.id+" · "+f.title; div.appendChild(th);
    var p1=document.createElement("p"); p1.className="small"; p1.textContent="סוג: "+f.source_type+" · מנפיק: "+f.issuer_or_owner+" · תחומים: "+(f.domain_ids||[]).join(", "); div.appendChild(p1);
    var p2=document.createElement("p"); p2.className="small"; p2.textContent="מהדורה/תחולה נדרשת: "+f.required_edition_scope; div.appendChild(p2);
    var p3=document.createElement("p"); p3.className="small"; p3.textContent="סטטוס: "+f.acquisition_status+" · "+f.url_status; div.appendChild(p3);
    if(f.observed_url){ var a=document.createElement("a"); a.href=f.observed_url; a.target="_blank"; a.rel="noopener"; a.textContent="כתובת שנצפתה"; a.className="ext-link"; div.appendChild(a); }
    var p4=document.createElement("p"); p4.className="small"; p4.textContent="פעולה: "+f.collection_action; div.appendChild(p4);
    box.appendChild(div);
  });
  var st=document.createElement("p"); st.className="muted small"; st.textContent="מוצגות "+shown+" משפחות."; box.appendChild(st);
}
document.getElementById("profmap-q").addEventListener("input",function(){ if(state&&state.profession_index) renderProfmapList(); });
document.getElementById("profmap-nosrc").addEventListener("change",function(){ if(state&&state.profession_index) renderProfmapList(); });
document.getElementById("dl-profmap-json").addEventListener("click",function(){
  downloadBytes(new TextEncoder().encode(JSON.stringify(state.profession_index,null,1)),"profession-index.json","application/json;charset=utf-8"); });
document.getElementById("dl-profmap-csv").addEventListener("click",function(){
  downloadBytes(new TextEncoder().encode(state.profmap_csv||""),"profession-index.csv","text/csv;charset=utf-8"); });
document.getElementById("dl-profmap-md").addEventListener("click",function(){
  downloadBytes(new TextEncoder().encode(state.profmap_md||""),"profession-index-he.md","text/markdown;charset=utf-8"); });
document.getElementById("dl-profmap-manifest").addEventListener("click",function(){
  downloadBytes(new TextEncoder().encode(state.profmap_manifest_csv||""),"collection-manifest.csv","text/csv;charset=utf-8"); });

})();
