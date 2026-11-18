import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

(window as { __SWARA_MOUNTED__?: boolean }).__SWARA_MOUNTED__ = true;
createRoot(document.getElementById('root')!).render(<App />);
