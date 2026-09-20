import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../../../../utils/cn';

interface UploadDropzoneProps {
  title: string;
  hint: string;
  multiple: boolean;
  isDragging: boolean;
  onFiles: (files: File[]) => void;
}

/** Click-or-drop file picker in the rail. Drag state is owned by the window so drops anywhere count. */
export function UploadDropzone({ title, hint, multiple, isDragging, onFiles }: UploadDropzoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = (): void => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files?.length) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      className={cn('atlas-token-creator__dropzone', isDragging && 'atlas-dragging')}
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
    >
      <div className="atlas-token-creator__dropzone-icon"><Upload /></div>
      <span className="atlas-token-creator__dropzone-title">{title}</span>
      <span className="atlas-token-creator__dropzone-hint">{hint}</span>
      <span className="atlas-token-creator__dropzone-formats">PNG · JPG · WebP</span>
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} onChange={handleChange} />
    </div>
  );
}
