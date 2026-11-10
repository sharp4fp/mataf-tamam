// Pages advanced mode: הפונקציה היא אותו שער כניסה של functions/_middleware.js, עטוף כ-_worker.js
// כדי שהעלאה ישירה (direct upload) תקמפל אותו. next() מתורגם ל-ASSETS.fetch.
import { onRequest } from './gate/_middleware.js';
export default {
    async fetch(request, env, ctx) {
        return onRequest({ request, env, ctx, next: () => env.ASSETS.fetch(request) });
    },
};
