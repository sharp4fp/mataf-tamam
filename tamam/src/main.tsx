import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppV1 } from './AppV1';
import './base.css';
import './style.css';

// גרסה 1 של הטופס נשמרת ונפתחת רק בקישור ישיר ?layout=v1 (כלל 0.6 בנהלים).
const layout = new URLSearchParams(window.location.search).get('layout');

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {layout === 'v1' ? <AppV1 /> : <App />}
    </React.StrictMode>,
);
