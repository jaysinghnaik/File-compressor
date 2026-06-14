export type FileFormat = 'pdf' | 'jpg' | 'png';

export interface UploadedFile {
  id: string;
  name: string;
  size: number; // in bytes
  type: FileFormat;
  rawFile: File;
  previewUrl: string | null;
  dimensions?: { width: number; height: number };
  pageCount?: number;
}

export interface HistoryItem {
  id: string;
  timestamp: Date;
  operation: 'CONVERT' | 'COMPRESS';
  fileName: string;
  fromFormat: FileFormat;
  toFormat: FileFormat;
  originalSize: number;
  finalSize: number;
  downloadUrl: string;
}

export interface ScaleSetting {
  label: string;
  dpi: number;
  scale: number;
}

export interface CompressionOptions {
  targetSizeKb: number; // custom target size in KB
  keepFormat: boolean; // convert PNG to JPG for maximum compression or keep PNG and downscale
}
