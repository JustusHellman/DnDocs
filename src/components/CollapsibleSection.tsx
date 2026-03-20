import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export default function CollapsibleSection({ title, children, defaultExpanded = true }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-8 border border-stone-800/50 rounded-xl overflow-hidden bg-stone-900/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-stone-900/50 hover:bg-stone-800/50 transition-colors text-left"
      >
        <h3 className="text-lg font-display font-bold text-amber-500">{title}</h3>
        <div className="text-stone-400">
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </button>
      <div
        className={clsx(
          "transition-all duration-300 ease-in-out overflow-hidden",
          isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-4 border-t border-stone-800/50">
          {children}
        </div>
      </div>
    </div>
  );
}
