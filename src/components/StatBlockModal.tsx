import React from 'react';
import { Entity, DndStats } from '../types';
import { X, BookOpen } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';

interface StatBlockModalProps {
  entity: Entity;
  isOpen: boolean;
  onClose: () => void;
  markdownComponents: any;
}

export const StatBlockModal: React.FC<StatBlockModalProps> = ({
  entity,
  isOpen,
  onClose,
  markdownComponents
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <div>
            <h2 className="text-xl font-cinzel font-bold text-stone-100">Stat Block</h2>
            <p className="text-sm text-stone-400">{entity.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {entity.dndStats && (
            <div className="mb-8 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {entity.dndStats.armorClass && (
                  <div>
                    <span className="text-amber-500 font-bold">Armor Class</span> <span className="text-stone-300">{entity.dndStats.armorClass}</span>
                  </div>
                )}
                {entity.dndStats.hitPoints && (
                  <div>
                    <span className="text-amber-500 font-bold">Hit Points</span> <span className="text-stone-300">{entity.dndStats.hitPoints}</span>
                  </div>
                )}
                {entity.dndStats.speed && (
                  <div>
                    <span className="text-amber-500 font-bold">Speed</span> <span className="text-stone-300">{entity.dndStats.speed}</span>
                  </div>
                )}
              </div>

              <div className="border-y border-amber-900/50 py-4">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
                  {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => {
                    const score = entity.dndStats?.[stat as keyof DndStats] as number || 10;
                    const mod = Math.floor((score - 10) / 2);
                    const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                    return (
                      <div key={stat}>
                        <div className="font-bold text-amber-500 uppercase">{stat}</div>
                        <div className="text-stone-300">{score} ({modStr})</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {entity.statBlock && (
            <div data-color-mode="dark" className="prose prose-invert prose-stone max-w-none bg-transparent">
              <MDEditor.Markdown source={entity.statBlock} className="!bg-transparent" components={markdownComponents} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
