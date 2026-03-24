import { useState, useRef, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InlineEditProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
}

export function InlineEdit({
  value,
  onChange,
  placeholder = 'Enter text',
  className,
  displayClassName,
  inputClassName,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isEditing) {
          handleCancel();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim()) {
      onChange(editValue.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div ref={containerRef} className={cn('flex items-center gap-2 max-w-md', className)}>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn('h-9', inputClassName)}
        />
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={handleSave}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={handleCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('flex items-center gap-2 group', className)}>
      <span className={cn('cursor-pointer', displayClassName)} onClick={() => setIsEditing(true)}>
        {value || placeholder}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="w-8 h-8 shrink-0"
        onClick={() => setIsEditing(true)}
      >
        <Pencil className="w-4 h-4" />
      </Button>
    </div>
  );
}
