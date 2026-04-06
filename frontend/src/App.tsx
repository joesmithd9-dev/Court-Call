import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PublicLiveList } from './pages/PublicLiveList';
import { RegistrarScreen } from './pages/RegistrarScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/public/:courtDayId" element={<PublicLiveList />} />
        <Route path="/registrar/:courtDayId" element={<RegistrarScreen />} />
        <Route path="*" element={<FallbackHome />} />
      </Routes>
    </BrowserRouter>
  );
}

function FallbackHome() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-white">CourtCall</h1>
      <p className="text-court-text-dim text-center max-w-md">
        Real-time courtroom list system. Navigate to{' '}
        <code className="bg-court-surface-2 px-1.5 py-0.5 rounded text-sm">/public/:courtDayId</code>{' '}
        for the public live list or{' '}
        <code className="bg-court-surface-2 px-1.5 py-0.5 rounded text-sm">/registrar/:courtDayId</code>{' '}
        for the registrar control screen.
      </p>
    </div>
  );
}
