import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './app.css';
import ChatInterface from './components/ChatInterface.js';
import Dashboard     from './components/dashboard/Dashboard.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={
          <div className="app-root">
            <ChatInterface />
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
