import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Image, AlertCircle, Plus } from 'lucide-react';
import { FileFormat } from '../types';

interface UploaderProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  acceptedFormats?: FileFormat[];
}

export default function Uploader({
  onFilesSelected,
  multiple = false,
  acceptedFormats = ['pdf', 'jpg', 'png'],
}: UploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAcceptString = () => {
    return acceptedFormats
      .map((f) => {
        if (f === 'pdf') return 'application/pdf';
        if (f === 'jpg') return 'image/jpeg,image/jpg';
        if (f === 'png') return 'image/png';
        return '';
      })
      .filter(Boolean)
      .join(',');
  };

  const validateAndProcessFiles = (fileList: FileList) => {
    const validFiles: File[] = [];
    setError(null);

    const allowedExtensions = acceptedFormats.map((f) => f.toLowerCase());

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      // Map jpeg to jpg internal type
      const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;

      if (allowedExtensions.includes(normalizedExt as FileFormat)) {
        validFiles.push(file);
      } else {
        setError(`Invalid format: .${ext}. Only ${acceptedFormats.join(', ').toUpperCase()} are allowed.`);
      }
    }

    if (validFiles.length > 0) {
      if (!multiple) {
        onFilesSelected([validFiles[0]]);
      } else {
        onFilesSelected(validFiles);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndProcessFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full" id="uploader-container">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`w-full border-2 border-dashed rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
          isDragActive
            ? 'border-violet-500 bg-violet-600/10 scale-[0.99] shadow-inner'
            : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-upload-input"
          className="hidden"
          multiple={multiple}
          accept={getAcceptString()}
          onChange={handleChange}
        />

        {/* Pulse Background Animation on Hover */}
        <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/0 via-fuchsia-600/0 to-indigo-600/0 group-hover:from-violet-600/5 group-hover:to-indigo-600/5 transition-all duration-500 rounded-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Icons container with nice overlapping layout */}
          <div className="flex items-center justify-center gap-2 mb-4 relative">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-md">
              <FileText className="w-5.5 h-5.5 animate-pulse" />
            </div>
            
            <div className="w-14 h-14 rounded-2xl bg-violet-600/30 text-violet-400 flex items-center justify-center scale-110 shadow-lg border border-violet-500/30 ring-4 ring-slate-900/40">
              <UploadCloud className="w-6 h-6 text-violet-300" />
            </div>

            <div className="w-12 h-12 rounded-2xl bg-fuchsia-600/20 text-fuchsia-400 flex items-center justify-center border border-fuchsia-500/20 shadow-md">
              <Image className="w-5.5 h-5.5" />
            </div>
          </div>

          <p className="text-slate-100 font-semibold text-sm sm:text-base leading-snug">
            {multiple ? 'Choose or drop files to convert' : 'Tap to upload or drag file'}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1.5 font-medium">
            Supports {acceptedFormats.map((f) => f.toUpperCase()).join(', ')}
          </p>

          <button
            type="button"
            className="mt-4 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg transition duration-200 cursor-pointer pointer-events-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Select Files</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-rose-300 text-xs animate-fade-in" id="upload-error">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}
