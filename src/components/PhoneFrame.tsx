import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Battery, Wifi, Signal } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
  title: string;
}

export default function PhoneFrame({ children, title }: PhoneFrameProps) {
  const [isMobileFrame, setIsMobileFrame] = useState(true);
  const [currentTime, setCurrentTime] = useState('12:00');

  // Keep a live clock matching Android style (HH:MM)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setCurrentTime(`${hours}:${minutes} ${ampm}`);
    };
    
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!isMobileFrame) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans" id="desktop-view">
        {/* Top Desktop Navigation Bar */}
        <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-950/40">
              <span className="font-bold text-white tracking-wider">🗜️</span>
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-50 leading-tight">{title}</h1>
              <p className="text-xs text-slate-400">Professional conversion & compression tools</p>
            </div>
          </div>

          <button
            onClick={() => setIsMobileFrame(true)}
            className="flex items-center gap-2 bg-violet-600/20 hover:bg-violet-600 border border-violet-500/30 text-violet-300 hover:text-white px-4 py-2 rounded-xl transition duration-200 text-sm font-medium cursor-pointer"
            id="toggle-mobile"
          >
            <Smartphone className="w-4.5 h-4.5" />
            <span>Switch to Android Mockup view</span>
          </button>
        </header>

        {/* Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-3 sm:p-6 font-sans">
      
      {/* Frame Toggle control in header */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between px-2">
        <div className="flex flex-col">
          <span className="text-xs font-mono text-violet-400 tracking-wider font-semibold uppercase">Mobile Android Preview</span>
          <h2 className="text-sm text-slate-300 font-medium">Testing on viewport simulation</h2>
        </div>
        <button
          onClick={() => setIsMobileFrame(false)}
          className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-600 text-xs font-medium transition cursor-pointer"
          id="toggle-desktop"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Full-Width Mode</span>
        </button>
      </div>

      {/* Physical Phone Case Wrapper */}
      <div 
        className="w-full max-w-[412px] h-[820px] bg-slate-950 rounded-[48px] p-3.5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border-[6px] border-slate-800 relative flex flex-col overflow-hidden ring-1 ring-white/15"
        id="phone-wrapper"
      >
        {/* Dynamic Island / Camera Punch Hole */}
        <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 flex items-center justify-center border border-slate-800/20">
          <div className="w-3.5 h-3.5 bg-slate-900 rounded-full border-2 border-slate-950 absolute left-4" />
          <div className="w-1.5 h-1.5 bg-[#0a101d] rounded-full absolute right-6" />
        </div>

        {/* Internal Screen Content */}
        <div className="flex-1 bg-slate-900 rounded-[38px] overflow-hidden flex flex-col relative border border-slate-900">
          
          {/* Simulated Status Bar (Android Material) */}
          <div className="h-10 bg-slate-950/80 backdrop-blur px-6 pt-2 pb-1 flex items-center justify-between text-[11px] font-medium text-slate-200 z-40 select-none">
            <span>{currentTime}</span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-3.5 h-3.5 text-slate-300" />
              <Wifi className="w-3.5 h-3.5 text-slate-300" />
              <Battery className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500" />
              <span className="text-[10px]">98%</span>
            </div>
          </div>

          {/* Actual Application Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col bg-slate-900">
            {children}
          </div>

          {/* Android Bottom Navigation Bar Bar */}
          <div className="h-12 bg-slate-950/90 flex items-center justify-around px-8 border-t border-slate-950 py-2 z-40 select-none">
            {/* Back button (Triangle) */}
            <div className="w-10 h-10 flex items-center justify-center opacity-60 active:bg-slate-800 rounded-full transition">
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-r-[9px] border-r-slate-300 border-b-[5px] border-b-transparent" />
            </div>
            {/* Home Button (Circle) */}
            <div className="w-10 h-10 flex items-center justify-center opacity-60 active:bg-slate-800 rounded-full transition">
              <div className="w-3 h-3 rounded-full border-2 border-slate-300" />
            </div>
            {/* Overview / Recent tasks (Square) */}
            <div className="w-10 h-10 flex items-center justify-center opacity-60 active:bg-slate-800 rounded-full transition">
              <div className="w-2.5 h-2.5 border-2 border-slate-300 rounded-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
