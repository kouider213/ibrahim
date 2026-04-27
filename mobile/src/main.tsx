import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.js';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          height:'100%', background:'#05070a', color:'#14a85a',
          fontFamily:'monospace', padding:'24px', textAlign:'center', gap:'12px',
        }}>
          <div style={{fontSize:'32px'}}>◎</div>
          <div style={{fontSize:'14px', letterSpacing:'.1em'}}>DZARYX</div>
          <div style={{fontSize:'11px', color:'rgba(255,255,255,.4)', maxWidth:'280px'}}>{this.state.error}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
