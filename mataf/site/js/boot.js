// pdf.js worker bootstrap (was an inline script; moved out so script-src self holds under CSP).
if (window.pdfjsLib) { pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js"; }
