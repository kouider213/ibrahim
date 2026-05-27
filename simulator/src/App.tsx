import AppShell from './components/Phone.tsx';

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <AppShell />
    </div>
  );
}
