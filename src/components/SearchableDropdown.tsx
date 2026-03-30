import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import clsx from 'clsx';
import AutoExpandingTextarea from './AutoExpandingTextarea';

export interface DropdownOption {
  id: string;
  label: string;
  type: string;
}

interface Props {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCreateNew?: (name: string) => void;
}

export default function SearchableDropdown({ options, value, onChange, placeholder = 'Select...', onCreateNew }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group options by type
  const groupedOptions = filteredOptions.reduce((acc, option) => {
    if (!acc[option.type]) {
      acc[option.type] = [];
    }
    acc[option.type].push(option);
    return acc;
  }, {} as Record<string, DropdownOption[]>);

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus-within:ring-2 focus-within:ring-amber-500/50 transition-all font-medium flex items-center justify-between cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <span className={clsx("truncate", !selectedOption && "text-stone-500")}>
          {selectedOption ? `${selectedOption.label} (${selectedOption.type})` : placeholder}
        </span>
        <div className="flex items-center gap-2">
          {selectedOption && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="text-stone-500 hover:text-stone-300"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown size={16} className="text-stone-500" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-stone-800 flex items-center gap-2">
            <Search size={16} className="text-stone-500" />
            <AutoExpandingTextarea
              autoFocus
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-stone-100 focus:outline-none text-sm min-h-[32px] border-none ring-0 focus:ring-0 px-0 py-1"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div 
            className="max-h-60 overflow-y-auto p-2 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {onCreateNew && searchTerm.trim() && !options.some(o => o.label.toLowerCase() === searchTerm.toLowerCase()) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateNew(searchTerm);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 rounded-lg transition-colors border border-emerald-900/30 mb-2"
              >
                Create "{searchTerm}"
              </button>
            )}
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="p-3 text-center text-stone-500 text-sm">No results found</div>
            ) : (
              Object.entries(groupedOptions).map(([type, typeOptions]) => (
                <div key={type}>
                  <div className="px-2 py-1 text-xs font-bold text-stone-500 uppercase tracking-wider">{type}</div>
                  {typeOptions.map(option => (
                    <div
                      key={option.id}
                      className={clsx(
                        "px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                        value === option.id 
                          ? "bg-amber-950/50 text-amber-400" 
                          : "text-stone-300 hover:bg-stone-800 hover:text-stone-100"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(option.id);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
