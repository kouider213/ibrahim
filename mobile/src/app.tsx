import './app.css';
import ChatInterface from './components/ChatInterface.js';

export default function App() {
  return (
    <div className="app-root">
      <div className="app-page app-page--active">
        <ChatInterface />
      </div>
    </div>
  );
}
