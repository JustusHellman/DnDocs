import React, { useRef, useEffect } from 'react';
import clsx from 'clsx';

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
  list?: string;
}

export default function AutoExpandingTextarea({ maxHeight = 500, className, value, onChange, ...props }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      
      // If we hit the max height, enable scrolling
      if (textarea.scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      {...(props as any)}
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        adjustHeight();
      }}
      className={clsx(
        "w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all resize-y",
        className
      )}
    />
  );
}
