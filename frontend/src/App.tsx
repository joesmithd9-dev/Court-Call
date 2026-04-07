import { useState } from 'react';
import { RegistrarScreen } from './screens/RegistrarScreen';
import { JudgeScreen } from './screens/JudgeScreen';
import { PublicScreen } from './screens/PublicScreen';
import type { ViewRole } from './lib/types';

const ROLES: { key: ViewRole; label: string; icon: string }[] = [
  { key: 'registrar', label: 'Registrar', icon: '⌨' },
  { key: 'judge',     label: 'Judge',     icon: '⚖' },
  { key: 'public',    label: 'Public',    icon: '📋' },
];

function App() {
  const [role, setRole] = useState<ViewRole>('registrar');

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-slate-100 max-w-lg mx-auto">
      {/* Top Bar */}
      <header className="bg-[#003865] flex items-center gap-3 px-4 h-[52px] shrink-0 border-b-[3px] border-[#b5882a]">
        <svg className="w-8 h-8 shrink-0" viewBox="0 0 48 54" fill="none">
          <rect x="21" y="0" width="6" height="54" rx="2" fill="white" opacity="0.9"/>
          <rect x="8" y="11" width="32" height="5" rx="1.5" fill="white" opacity="0.85"/>
          <rect x="4" y="43" width="40" height="5" rx="1.5" fill="white" opacity="0.85"/>
          <rect x="8" y="11" width="5" height="32" rx="1.5" fill="white" opacity="0.75"/>
          <rect x="35" y="11" width="5" height="32" rx="1.5" fill="white" opacity="0.75"/>
          <rect x="20" y="11" width="8" height="32" rx="1.5" fill="white" opacity="0.75"/>
        </svg>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white tracking-wide leading-tight">Courts Service Ireland</div>
          <div className="text-[10px] text-white/60 tracking-widest uppercase">CourtCall — Live List System</div>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Connected" />
      </header>

      {/* Role Tabs */}
      <nav className="flex bg-[#002347] border-b border-slate-600 shrink-0">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-widest border-b-[3px] transition-colors font-serif ${
              role === r.key
                ? 'text-[#b5882a] border-[#b5882a] bg-white/5'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </nav>

      {/* Screen */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {role === 'registrar' && <RegistrarScreen />}
        {role === 'judge' && <JudgeScreen />}
        {role === 'public' && <PublicScreen />}
      </main>
    </div>
  );
}

export default App;
