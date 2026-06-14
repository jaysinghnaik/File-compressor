import React from 'react';
import { History, Download, Trash2, Calendar, FileText, CheckCircle, Smartphone } from 'lucide-react';
import { HistoryItem } from '../types';

interface HistoryListProps {
  items: HistoryItem[];
  onClearHistory: () => void;
  onRemoveItem: (id: string) => void;
}

export default function HistoryList({ items, onClearHistory, onRemoveItem }: HistoryListProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFormatIcon = (format: string) => {
    return (
      <div className="w-8 h-8 rounded-lg bg-slate-700/80 flex items-center justify-center font-bold text-[10px] text-slate-300 uppercase tracking-widest border border-slate-600">
        {format}
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800/10 rounded-3xl border border-slate-800/40" id="empty-history">
        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-500 mb-3 border border-slate-700/20">
          <History className="w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-300">No session tools run yet</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Completed conversions and shrinking processes will record here for lookup and immediate download.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" id="history-container">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 text-slate-300">
          <History className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider">Session Task Logs</h3>
        </div>
        <button
          onClick={onClearHistory}
          className="text-[10px] bg-slate-800/60 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 px-2.5 py-1 rounded-full border border-slate-700/50 hover:border-rose-900/30 transition duration-150 cursor-pointer font-medium"
        >
          Clear Logs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[380px]" id="history-scroll-panel">
        {items.map((item) => {
          const reduction = item.operation === 'COMPRESS' && item.originalSize > 0
            ? Math.round((1 - item.finalSize / item.originalSize) * 100)
            : null;

          return (
            <div
              key={item.id}
              className="bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/30 rounded-2xl p-3 flex flex-col gap-2.5 transition group"
            >
              {/* Top Row: File Name and Action */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {getFormatIcon(item.toFormat)}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate pr-2">
                      {item.fileName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                        item.operation === 'CONVERT'
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/10'
                          : 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/10'
                      }`}>
                        {item.operation}
                      </span>
                      <span className="text-[9px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={item.downloadUrl}
                    download={item.fileName}
                    className="w-7 bg-violet-600 font-semibold hover:bg-violet-500 text-white rounded-full flex items-center justify-center p-1.5 shadow-md shadow-violet-950/20 transition cursor-pointer self-center"
                    title="Download File"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="w-7 text-slate-500 hover:text-rose-400 hover:bg-slate-700/30 rounded-full flex items-center justify-center p-1.5 transition cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bottom Row: Compression Info / Statistics */}
              <div className="bg-slate-900/30 rounded-xl p-2 flex items-center justify-between text-[10px] text-slate-400 font-medium border border-slate-800/40">
                <div className="flex items-center gap-1">
                  <span>In: <b className="text-slate-300">{formatBytes(item.originalSize)}</b></span>
                  <span>•</span>
                  <span>Out: <b className="text-emerald-400">{formatBytes(item.finalSize)}</b></span>
                </div>

                {reduction !== null && reduction > 0 && (
                  <div className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/15">
                    <span>Reduced by {reduction}%</span>
                  </div>
                )}
                {item.operation === 'CONVERT' && (
                  <div className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md border border-indigo-500/15 uppercase font-semibold">
                    {item.fromFormat} → {item.toFormat}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
