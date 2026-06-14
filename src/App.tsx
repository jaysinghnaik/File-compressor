import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Settings, 
  HelpCircle, 
  ArrowRight, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Download, 
  Layers, 
  Sliders, 
  CheckCircle, 
  FileText, 
  Image as ImageIcon, 
  Smartphone, 
  Zap, 
  Info,
  Clock,
  Loader2,
  FileDown
} from 'lucide-react';
import PhoneFrame from './components/PhoneFrame';
import Uploader from './components/Uploader';
import HistoryList from './components/HistoryList';
import { 
  UploadedFile, 
  HistoryItem, 
  FileFormat, 
  ScaleSetting 
} from './types';
import { 
  getPdfPageCount, 
  renderPdfPages, 
  createPdfFromImages, 
  compressImageToTargetBytes, 
  compressPdfToTargetBytes 
} from './utils/fileEngine';
import JSZip from 'jszip';

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'convert' | 'compress' | 'history'>('convert');

  // --- Session Task History ---
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load session logs on startup from localStorage (if any)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('file_utility_history_v1');
      if (stored) {
        // Parse dates correctly
        const parsed = JSON.parse(stored).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
        setHistory(parsed);
      }
    } catch (e) {
      console.error('Error loading history:', e);
    }
  }, []);

  // Save changes to localStorage helper
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem('file_utility_history_v1', JSON.stringify(newHistory));
    } catch (e) {
      console.error('Error saving history:', e);
    }
  };

  const handleClearHistory = () => {
    saveHistory([]);
  };

  const handleRemoveHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    saveHistory(updated);
  };

  const addToHistory = (
    operation: 'CONVERT' | 'COMPRESS',
    fileName: string,
    fromFormat: FileFormat,
    toFormat: FileFormat,
    originalSize: number,
    finalSize: number,
    blob: Blob
  ) => {
    const fileUrl = URL.createObjectURL(blob);
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      operation,
      fileName,
      fromFormat,
      toFormat,
      originalSize,
      finalSize,
      downloadUrl: fileUrl,
    };
    const updated = [newItem, ...history];
    saveHistory(updated);
  };


  // --- CONVERTER WORKFLOW STATE ---
  const [convertFiles, setConvertFiles] = useState<UploadedFile[]>([]);
  const [targetFormat, setTargetFormat] = useState<FileFormat>('pdf');
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [convertStatusUrl, setConvertStatusUrl] = useState<string | null>(null);
  const [convertResultName, setConvertResultName] = useState<string>('');
  const [convertPdfMode, setConvertPdfMode] = useState<'single' | 'grid'>('single'); // single joined pdf or individual image targets

  // Special sub-states for PDF-to-Image results
  const [renderedPages, setRenderedPages] = useState<{ id: string; url: string; number: number; selected: boolean }[]>([]);
  const [zipDownloadUrl, setZipDownloadUrl] = useState<string | null>(null);

  // Resolution presets for PDF generation / scaling
  const [pdfQualityScale, setPdfQualityScale] = useState<number>(1.5); // 1.5 standard, 1.0 medium, 2.0 high

  const handleConvertFilesSelected = async (files: File[]) => {
    // Reset previous conversion results
    resetConvertForm();

    const mapped: UploadedFile[] = [];
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      let fileType: FileFormat = 'jpg';
      if (ext === 'pdf') fileType = 'pdf';
      else if (ext === 'png') fileType = 'png';

      let pageCount: number | undefined;
      if (fileType === 'pdf') {
        try {
          pageCount = await getPdfPageCount(f);
        } catch (err) {
          console.error(err);
        }
      }

      mapped.push({
        id: Math.random().toString(36).substring(2, 9),
        name: f.name,
        size: f.size,
        type: fileType,
        rawFile: f,
        previewUrl: fileType !== 'pdf' ? URL.createObjectURL(f) : null,
        pageCount,
      });
    }

    setConvertFiles((prev) => [...prev, ...mapped]);

    // Simple default target format chooser based on uploaded files
    if (mapped.length > 0) {
      const firstType = mapped[0].type;
      if (firstType === 'pdf') {
        setTargetFormat('jpg');
      } else {
        setTargetFormat('pdf');
      }
    }
  };

  const handleRemoveConvertFile = (id: string) => {
    setConvertFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleMoveFile = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= convertFiles.length) return;

    const updated = [...convertFiles];
    const temp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = temp;
    setConvertFiles(updated);
  };

  const resetConvertForm = () => {
    // Revoke previous URLs
    renderedPages.forEach((p) => URL.revokeObjectURL(p.url));
    if (convertStatusUrl) URL.revokeObjectURL(convertStatusUrl);
    if (zipDownloadUrl) URL.revokeObjectURL(zipDownloadUrl);

    setConvertFiles([]);
    setIsConverting(false);
    setConvertProgress(0);
    setConvertStatusUrl(null);
    setRenderedPages([]);
    setZipDownloadUrl(null);
    setConvertResultName('');
  };

  // Run File Conversion Engine
  const executeConversion = async () => {
    if (convertFiles.length === 0) return;
    setIsConverting(true);
    setConvertProgress(10);

    try {
      const firstFile = convertFiles[0];

      // --- Scenario A: PDF TO IMAGE (JPG or PNG) ---
      if (firstFile.type === 'pdf') {
        setConvertProgress(30);
        // Render pages to image blobs
        const pages = await renderPdfPages(firstFile.rawFile, pdfQualityScale, (curr, tot) => {
          setConvertProgress(Math.floor(30 + (curr / tot) * 50));
        });

        // Map blobs to dynamic urls
        const rendered = pages.map((page, idx) => ({
          id: Math.random().toString(36).substring(2, 9),
          url: URL.createObjectURL(page.blob),
          number: idx + 1,
          selected: true,
          blob: page.blob,
          width: page.width,
          height: page.height,
        }));

        setRenderedPages(rendered);

        // Bundle zip in background using JSZip
        const zip = new JSZip();
        rendered.forEach((img, idx) => {
          const extension = targetFormat === 'png' ? 'png' : 'jpg';
          zip.file(`page_${img.number}.${extension}`, img.blob);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        setZipDownloadUrl(zipUrl);

        // Save first extracted image to history Log as representative sample
        if (rendered.length > 0) {
          addToHistory(
            'CONVERT',
            `${firstFile.name.replace(/\.[^/.]+$/, "")}_extracted_images.zip`,
            'pdf',
            targetFormat,
            firstFile.size,
            zipBlob.size,
            zipBlob
          );
        }

        setConvertProgress(100);
      } 
      // --- Scenario B: IMAGE TO PDF ---
      else if (targetFormat === 'pdf') {
        const imageObjects: { dataUrl: string; width: number; height: number }[] = [];

        for (let i = 0; i < convertFiles.length; i++) {
          const fileObj = convertFiles[i];
          setConvertProgress(Math.floor(20 + (i / convertFiles.length) * 60));

          // Load image size
          const reader = new FileReader();
          const p = new Promise<{ dataUrl: string; width: number; height: number }>((resolve) => {
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                resolve({
                  dataUrl: e.target?.result as string,
                  width: img.width,
                  height: img.height,
                });
              };
              img.src = e.target?.result as string;
            };
            reader.readAsDataURL(fileObj.rawFile);
          });

          const resolvedImg = await p;
          imageObjects.push(resolvedImg);
        }

        setConvertProgress(85);
        const compiledPdfBlob = await createPdfFromImages(imageObjects, (curr, tot) => {
          setConvertProgress(Math.floor(85 + (curr / tot) * 15));
        });

        const pdfUrl = URL.createObjectURL(compiledPdfBlob);
        setConvertStatusUrl(pdfUrl);

        const customName = convertResultName.trim()
          ? `${convertResultName.replace(/\.pdf$/i, "")}.pdf`
          : `${firstFile.name.replace(/\.[^/.]+$/, "")}_converted.pdf`;

        setConvertResultName(customName);

        // Log to Session History
        addToHistory(
          'CONVERT',
          customName,
          firstFile.type,
          'pdf',
          convertFiles.reduce((acc, curr) => acc + curr.size, 0),
          compiledPdfBlob.size,
          compiledPdfBlob
        );

        setConvertProgress(100);
      } 
      // --- Scenario C: IMAGE TO IMAGE (JPG to PNG or PNG to JPG) ---
      else {
        setConvertProgress(40);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('Image load fail'));
            im.src = e.target?.result as string;
          };
          reader.readAsDataURL(firstFile.rawFile);
        });

        setConvertProgress(70);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context fail');

        // Draw with offwhite grid to prevent transparency backfill issues on conversion to JPEG
        if (targetFormat === 'jpg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);

        setConvertProgress(90);
        const mimeType = targetFormat === 'png' ? 'image/png' : 'image/jpeg';
        const convertedBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), mimeType, 0.95);
        });

        if (!convertedBlob) throw new Error('Blob generation failed');

        const convertedUrl = URL.createObjectURL(convertedBlob);
        setConvertStatusUrl(convertedUrl);

        const newName = `${firstFile.name.replace(/\.[^/.]+$/, "")}.${targetFormat}`;
        setConvertResultName(newName);

        addToHistory(
          'CONVERT',
          newName,
          firstFile.type,
          targetFormat,
          firstFile.size,
          convertedBlob.size,
          convertedBlob
        );

        setConvertProgress(100);
      }
    } catch (err: any) {
      console.error(err);
      alert(`An error occurred during conversion: ${err.message || 'Check files.'}`);
    } finally {
      setIsConverting(false);
    }
  };


  // --- COMPRESSOR WORKFLOW STATE ---
  const [compressFile, setCompressFile] = useState<UploadedFile | null>(null);
  const [targetBytes, setTargetBytes] = useState<number>(300 * 1024); // default 300KB
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressLogs, setCompressLogs] = useState<string[]>([]);
  const [compressResultUrl, setCompressResultUrl] = useState<string | null>(null);
  const [compressOutputBlob, setCompressOutputBlob] = useState<Blob | null>(null);
  const [compressedDetails, setCompressedDetails] = useState<{
    originalSize: number;
    finalSize: number;
    scale?: number;
    quality?: number;
  } | null>(null);

  // Option: Allow JPG to PNG or PNG to JPG conversion during compression
  const [convertPngToJpg, setConvertPngToJpg] = useState<boolean>(true);

  // Set default slider recommendation based on file input
  const handleCompressFileSelected = (files: File[]) => {
    resetCompressForm();

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let fileType: FileFormat = 'jpg';
    if (ext === 'pdf') fileType = 'pdf';
    else if (ext === 'png') fileType = 'png';

    const uploaded = {
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      size: file.size,
      type: fileType,
      rawFile: file,
      previewUrl: fileType !== 'pdf' ? URL.createObjectURL(file) : null,
    };

    setCompressFile(uploaded);

    // Dynamic starting target bytes: we suggest 40% of standard size, capped between 50KB and 2MB
    const fortyPercent = Math.round(file.size * 0.4);
    const suggested = Math.max(50 * 1024, Math.min(fortyPercent, 1.5 * 1024 * 1024));
    setTargetBytes(suggested);
  };

  const resetCompressForm = () => {
    if (compressFile?.previewUrl) URL.revokeObjectURL(compressFile.previewUrl);
    if (compressResultUrl) URL.revokeObjectURL(compressResultUrl);

    setCompressFile(null);
    setIsCompressing(false);
    setCompressLogs([]);
    setCompressResultUrl(null);
    setCompressOutputBlob(null);
    setCompressedDetails(null);
  };

  // Run File Compression Engine
  const executeCompression = async () => {
    if (!compressFile) return;
    setIsCompressing(true);
    setCompressLogs(['Initializing high-precision compressor...', `Source file size: ${formatBytes(compressFile.size)}`]);
    setCompressResultUrl(null);
    setCompressedDetails(null);

    try {
      if (compressFile.type === 'pdf') {
        const result = await compressPdfToTargetBytes(
          compressFile.rawFile,
          targetBytes,
          (curr, tot, msg) => {
            setCompressLogs((prev) => [...prev, `[Page ${curr}/${tot}] ${msg}`]);
          }
        );

        setCompressLogs((prev) => [
          ...prev,
          '✓ Render & scaling successful!',
          `✓ Output generated: ${formatBytes(result.finalSize)}`,
          `✓ Size shrunk by ${Math.round((1 - result.finalSize / compressFile.size) * 100)}%!`
        ]);

        const outUrl = URL.createObjectURL(result.blob);
        setCompressResultUrl(outUrl);
        setCompressOutputBlob(result.blob);
        setCompressedDetails({
          originalSize: compressFile.size,
          finalSize: result.finalSize,
        });

        // Add to history
        addToHistory(
          'COMPRESS',
          `${compressFile.name.replace(/\.pdf$/i, "")}_optimized.pdf`,
          'pdf',
          'pdf',
          compressFile.size,
          result.finalSize,
          result.blob
        );

      } else {
        // Image compression
        const result = await compressImageToTargetBytes(
          compressFile.rawFile,
          targetBytes,
          { convertPngToJpg },
          (msg) => {
            setCompressLogs((prev) => [...prev, `${msg}`]);
          }
        );

        const finalExt = (compressFile.type === 'png' && !convertPngToJpg) ? 'png' : 'jpg';
        const outputSize = result.blob.size;

        setCompressLogs((prev) => [
          ...prev,
          '✓ Iterative binary-fitting completed!',
          `✓ Final Resolution: ${result.width} x ${result.height} px`,
          `✓ Output File format: ${finalExt.toUpperCase()}`,
          `✓ Compressed file size: ${formatBytes(outputSize)}`,
          `✓ Shrunk by ${Math.round((1 - outputSize / compressFile.size) * 100)}%!`
        ]);

        const outUrl = URL.createObjectURL(result.blob);
        setCompressResultUrl(outUrl);
        setCompressOutputBlob(result.blob);
        setCompressedDetails({
          originalSize: compressFile.size,
          finalSize: outputSize,
          scale: result.scale,
          quality: result.quality,
        });

        const newName = `${compressFile.name.replace(/\.[^/.]+$/, "")}_compressed.${finalExt}`;

        // Add to history
        addToHistory(
          'COMPRESS',
          newName,
          compressFile.type,
          finalExt as FileFormat,
          compressFile.size,
          outputSize,
          result.blob
        );
      }
    } catch (err: any) {
      console.error(err);
      setCompressLogs((prev) => [...prev, `❌ Error: ${err.message || 'Compression failed.'}`]);
    } finally {
      setIsCompressing(false);
    }
  };


  // --- HELPERS ---
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <PhoneFrame title="Android File Converter & Compressor">
      
      {/* Dynamic Main App Outer Screen Frame inside Phone Simulation view */}
      <div className="flex flex-col h-full bg-slate-900 border-x border-slate-950/20" id="main-applet-screen">
        
        {/* Soft Branding Header */}
        <div className="px-5 pt-5 pb-4 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-950/50">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-50 tracking-wide mt-0.5">AndroReduce</h2>
              <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider -mt-0.5">File Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-800/50 p-0.5 rounded-full border border-slate-700/40">
            <button 
              onClick={() => setActiveTab('convert')}
              className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition cursor-pointer select-none ${
                activeTab === 'convert' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Convert
            </button>
            <button 
              onClick={() => setActiveTab('compress')}
              className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition cursor-pointer select-none ${
                activeTab === 'compress' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compress
            </button>
          </div>
        </div>

        {/* Dynamic Core Screen Views Container */}
        <div className="flex-1 p-4 overflow-y-auto" id="screen-viewport">
          
          {/* TAB 1: CONVERT PANEL */}
          {activeTab === 'convert' && (
            <div className="space-y-4 animate-fade-in" id="panel-convert">
              
              {/* Feature Intro */}
              <div className="bg-slate-800/15 border border-slate-800 rounded-3xl p-3.5 flex items-start gap-2.5">
                <div className="p-2.5 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/10">
                  <RefreshCw className="w-4 h-4 text-indigo-400 shrink-0" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100">Android Format Converter</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    Convert between PDF, JPG, and PNG instantly. Select multiple images to assemble a single consolidated PDF, or render/extract high-quality photos from PDF pages!
                  </p>
                </div>
              </div>

              {/* Upload Input Area */}
              {convertFiles.length === 0 && (
                <Uploader
                  onFilesSelected={handleConvertFilesSelected}
                  multiple={true}
                  acceptedFormats={['pdf', 'jpg', 'png']}
                />
              )}

              {/* Selected Files List & Adjustments */}
              {convertFiles.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-slate-800/30 border border-slate-800/80 rounded-3xl p-3.5">
                    
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2.5">
                      <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        Uploaded Files ({convertFiles.length})
                      </span>
                      <button
                        onClick={resetConvertForm}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700/80 text-rose-400 font-medium px-2 py-0.5 rounded-full border border-slate-700 transition cursor-pointer"
                      >
                        Reset Upload
                      </button>
                    </div>

                    {/* Files Loop */}
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {convertFiles.map((file, idx) => (
                        <div
                          key={file.id}
                          className="bg-slate-900/60 border border-slate-800/40 p-2 rounded-2xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {file.type === 'pdf' ? (
                              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                                PDF
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                                <img
                                  src={file.previewUrl || ''}
                                  alt="preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-200 truncate pr-2">
                                {file.name}
                              </p>
                              <p className="text-[9px] text-slate-500 font-medium">
                                Size: {formatBytes(file.size)}
                                {file.pageCount && ` • ${file.pageCount} Pages`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            {/* Sequence adjusters if multiple files & targeting PDF compilation */}
                            {convertFiles.length > 1 && targetFormat === 'pdf' && (
                              <div className="flex flex-col">
                                <button
                                  onClick={() => handleMoveFile(idx, 'up')}
                                  disabled={idx === 0}
                                  className="p-1 hover:bg-slate-800 disabled:opacity-20 text-slate-400 rounded-full cursor-pointer"
                                  title="Move Up Page"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveFile(idx, 'down')}
                                  disabled={idx === convertFiles.length - 1}
                                  className="p-1 hover:bg-slate-800 disabled:opacity-20 text-slate-400 rounded-full cursor-pointer"
                                  title="Move Down Page"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            <button
                              onClick={() => handleRemoveConvertFile(file.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 rounded-full hover:bg-slate-800/40 transition cursor-pointer"
                              title="Delete File"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Target Format Selector & Options */}
                    <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-1 gap-3.5">
                      
                      {/* Select Format Toggle */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                          Output Destination format
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['pdf', 'jpg', 'png'] as FileFormat[]).map((format) => {
                            // Check if source files are all PDFs. If so, they cannot choose 'pdf' as target format because PDF to PDF is a Compression job
                            const isSourcePdf = convertFiles.every((f) => f.type === 'pdf');
                            const isDisabled = isSourcePdf && format === 'pdf';

                            return (
                              <button
                                key={format}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => setTargetFormat(format)}
                                className={`py-1.5 rounded-xl border font-bold text-xs capitalize transition cursor-pointer select-none ${
                                  targetFormat === format
                                    ? 'bg-violet-600 border-violet-500 text-white shadow-md'
                                    : isDisabled
                                    ? 'opacity-25 border-slate-800 bg-slate-900/60 text-slate-600 pointer-events-none'
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100'
                                }`}
                              >
                                {format.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* PDF Specific Extra settings */}
                      {targetFormat === 'pdf' && (
                        <div className="bg-slate-900/40 p-2.5 rounded-2xl border border-slate-800/60 space-y-2">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                            <Settings className="w-3 h-3" />
                            Target PDF Compilation Properties
                          </span>
                          
                          {/* Combined Filename */}
                          <div>
                            <span className="text-[9px] text-slate-400 font-medium block mb-1">
                              Target Output PDF Filename:
                            </span>
                            <input
                              type="text"
                              placeholder="E.g. scanned_documents.pdf"
                              value={convertResultName}
                              onChange={(e) => setConvertResultName(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* PDF Extraction Image Resolution Setting (for rendering pages) */}
                      {convertFiles[0]?.type === 'pdf' && (
                        <div className="bg-slate-900/40 p-2.5 rounded-2xl border border-slate-800/60 space-y-2">
                          <span className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-wider flex items-center gap-1">
                            <Sliders className="w-3 h-3" />
                            PDF Page Extractions Zoom
                          </span>

                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { label: 'Standard (72 DPI)', scale: 1.0 },
                              { label: 'Crisp (108 DPI)', scale: 1.5 },
                              { label: 'Super High (144 DPI)', scale: 2.0 },
                            ].map((preset) => (
                              <button
                                key={preset.scale}
                                type="button"
                                onClick={() => setPdfQualityScale(preset.scale)}
                                className={`py-1 rounded-lg text-[9px] font-semibold text-center border capitalize transition cursor-pointer ${
                                  pdfQualityScale === preset.scale
                                    ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-300'
                                    : 'bg-slate-955 border-slate-800 text-slate-400 hover:text-slate-300'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Progress States & Action button */}
                    <div className="mt-4 pt-3 border-t border-slate-800/30">
                      {isConverting ? (
                        <div className="space-y-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-3" id="convert-progress-area">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold mb-1">
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                              Applying conversion algorithm...
                            </span>
                            <span className="font-mono text-violet-300 font-bold">{convertProgress}%</span>
                          </div>
                          
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-violet-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${convertProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={executeConversion}
                          className="w-full bg-violet-600 active:scale-[0.98] hover:bg-violet-500 text-white font-bold py-2.5 rounded-2xl shadow-xl shadow-violet-950/20 text-xs transition duration-200 cursor-pointer flex items-center justify-center gap-2 select-none"
                          id="btn-run-convert"
                        >
                          <Zap className="w-3.5 h-3.5 fill-white" />
                          <span>Convert to {targetFormat.toUpperCase()} format</span>
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* Conversion Output Results Section */}
              {(convertStatusUrl || renderedPages.length > 0) && !isConverting && (
                <div className="bg-slate-800/35 border border-slate-800 rounded-3xl p-4 space-y-3.5 animate-scale-in" id="convert-result-card">
                  
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-5 h-5" />
                    <h3 className="text-sm font-extrabold text-slate-100">Tasks Successfully Completed!</h3>
                  </div>

                  {/* If image results rendered from a PDF source, present the high-fidelity thumbnail viewer */}
                  {renderedPages.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Extracted Pages ({renderedPages.length})
                          </p>
                          {zipDownloadUrl && (
                            <a
                              href={zipDownloadUrl}
                              download={`${convertFiles[0]?.name.replace(/\.[^/.]+$/, "")}_extracted_pages.zip`}
                              className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 transition shadow-md shadow-indigo-950/30 cursor-pointer select-none"
                            >
                              <FileDown className="w-3 h-3" />
                              <span>Download ZIP Bundle</span>
                            </a>
                          )}
                        </div>
                        
                        <p className="text-[9px] text-slate-500 mt-1">Tap individual images inside modern Android browser to read/download specific pages:</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                        {renderedPages.map((img) => (
                          <div 
                            key={img.id} 
                            className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex flex-col gap-1.5 relative group"
                          >
                            <div className="h-24 bg-slate-950 rounded-lg overflow-hidden relative">
                              <img 
                                src={img.url} 
                                alt={`Page ${img.number}`} 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                              <span className="absolute bottom-1 right-1 bg-slate-900/95 border border-slate-800 text-[8px] font-bold px-1.5 py-0.5 text-slate-400 rounded-md">
                                Page {img.number}
                              </span>
                            </div>

                            <a 
                              href={img.url} 
                              download={`extracted_page_${img.number}.jpg`}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1 rounded-lg text-[9px] font-bold text-center flex items-center justify-center gap-1 transition cursor-pointer select-none"
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>Page {img.number}</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Standard compilation downloadable link (e.g., Image to PDF, PNG to JPG) */
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-5 h-5 text-violet-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-200 truncate pr-2">
                            {convertResultName}
                          </p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                            Destination Type: {targetFormat}
                          </p>
                        </div>
                      </div>

                      {convertStatusUrl && (
                        <a
                          href={convertStatusUrl}
                          download={convertResultName}
                          className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-3 py-1.5 rounded-full text-[10px] flex items-center justify-center gap-1 transition shadow-lg shadow-violet-950/20 cursor-pointer select-none shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      )}
                    </div>
                  )}

                  <button
                    onClick={resetConvertForm}
                    className="w-full text-slate-400 bg-slate-900 hover:bg-slate-800 py-2 rounded-xl text-[10px] font-semibold border border-slate-800/80 hover:text-slate-200 transition cursor-pointer select-none"
                  >
                    Load another file
                  </button>

                </div>
              )}

            </div>
          )}

          {/* TAB 2: COMPRESS PANEL */}
          {activeTab === 'compress' && (
            <div className="space-y-4 animate-fade-in" id="panel-compress">
              
              {/* Feature Intro */}
              <div className="bg-slate-800/15 border border-slate-800 rounded-3xl p-3.5 flex items-start gap-2.5">
                <div className="p-2.5 bg-fuchsia-600/10 text-fuchsia-400 rounded-2xl border border-fuchsia-500/10">
                  <Sliders className="w-4 h-4 text-fuchsia-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100">Android Target-Size Compressor</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    Set a target size (in KB or MB) and shink your PDF/JPG/PNG files as close as possible to it under safety limits! Good for web application uploads, email attachments, and keeping local memory.
                  </p>
                </div>
              </div>

              {/* Upload Input Selector */}
              {!compressFile && (
                <Uploader
                  onFilesSelected={handleCompressFileSelected}
                  multiple={false}
                  acceptedFormats={['pdf', 'jpg', 'png']}
                />
              )}

              {/* Compression Configuration & Parameters Form */}
              {compressFile && (
                <div className="space-y-4">
                  <div className="bg-slate-800/30 border border-slate-800/80 rounded-3xl p-4 space-y-4">
                    
                    {/* Header Details */}
                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2.5">
                      <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        File To Compress
                      </span>
                      <button
                        onClick={resetCompressForm}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700/80 text-rose-400 font-medium px-2 py-0.5 rounded-full border border-slate-700 transition cursor-pointer"
                      >
                        Change File
                      </button>
                    </div>

                    {/* Compact File Info Box */}
                    <div className="bg-slate-900/60 border border-slate-800/40 p-2.5 rounded-2xl flex items-center gap-2.5 text-xs">
                      {compressFile.type === 'pdf' ? (
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          PDF
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                          {compressFile.previewUrl && (
                            <img
                              src={compressFile.previewUrl}
                              alt="preview"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-200 truncate pr-2">
                          {compressFile.name}
                        </p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          Original Size: <b className="text-slate-300 font-semibold">{formatBytes(compressFile.size)}</b>
                        </p>
                      </div>
                    </div>

                    {/* Compression sliders and targeting */}
                    <div className="space-y-3 pt-1">
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Set Target File Size
                        </span>
                        <span className="text-[11px] font-mono text-fuchsia-300 font-semibold">
                          Target: {formatBytes(targetBytes)}
                        </span>
                      </div>

                      {/* Targeted Size Input Range Slider */}
                      <div className="space-y-2">
                        <input
                          type="range"
                          // Slider range goes from 20KB to original file size minus 5%
                          min={20 * 1024}
                          max={Math.max(30 * 1024, compressFile.size * 0.95)}
                          step={1024}
                          value={targetBytes}
                          onChange={(e) => setTargetBytes(Number(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                        />
                        <div className="flex justify-between text-[8px] text-slate-500 font-medium">
                          <span>20 KB (Ultra Compact)</span>
                          <span>{formatBytes(Math.round(compressFile.size / 2))} (Medium)</span>
                          <span>{formatBytes(compressFile.size)} (Original)</span>
                        </div>
                      </div>

                      {/* Quick click presets targets */}
                      <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                        {[
                          { label: '50 KB', value: 50 * 1024 },
                          { label: '100 KB', value: 100 * 1024 },
                          { label: '250 KB', value: 250 * 1024 },
                          { label: '500 KB', value: 500 * 1024 },
                        ].map((preset) => {
                          // Allow preset only if it is actually less than original size
                          const isDisabled = preset.value >= compressFile.size;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => setTargetBytes(preset.value)}
                              className={`py-1 rounded-lg text-[9px] font-bold text-center border transition cursor-pointer select-none ${
                                targetBytes === preset.value
                                  ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-300'
                                  : isDisabled
                                  ? 'opacity-25 border-slate-900 bg-slate-950 text-slate-600 cursor-not-allowed'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* PNG specific optimizations */}
                      {compressFile.type === 'png' && (
                        <div className="bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/60 space-y-2 text-[10px]">
                          <div className="flex items-center gap-1.5 text-fuchsia-400 font-bold uppercase tracking-wider">
                            <Info className="w-3.5 h-3.5" />
                            PNG Optimization Option
                          </div>
                          
                          <p className="text-slate-400 leading-normal">
                            PNG images don't support compression quality filters. Converting to JPG will dynamically reduce the size significantly to hit target byte sizes easily.
                          </p>
                          
                          <label className="flex items-center gap-2 mt-1 px-1 py-1.5 hover:bg-slate-800/40 rounded-xl cursor-pointer">
                            <input
                              type="checkbox"
                              checked={convertPngToJpg}
                              onChange={(e) => setConvertPngToJpg(e.target.checked)}
                              className="accent-fuchsia-500"
                            />
                            <span className="font-semibold text-slate-300">Convert to JPG format for compression</span>
                          </label>
                        </div>
                      )}

                    </div>

                    {/* Compress progress dashboard logger */}
                    {isCompressing && (
                      <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 font-mono text-[9px] text-fuchsia-300 space-y-1 max-h-[140px] overflow-y-auto" id="compress-logs">
                        <div className="flex items-center gap-1.5 font-bold mb-1 border-b border-slate-850 pb-1 text-slate-400/80 uppercase">
                          <Loader2 className="w-3 h-3 text-fuchsia-400 animate-spin shrink-0" />
                          Compression Debug Logs
                        </div>
                        {compressLogs.map((log, idx) => (
                          <div key={idx} className="leading-relaxed">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action execution buttons */}
                    <div className="pt-2 border-t border-slate-800/40">
                      {isCompressing ? (
                        <div className="w-full bg-slate-900 text-xs py-2.5 rounded-2xl border border-slate-800 text-fuchsia-300/80 flex items-center justify-center gap-2 select-none">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Allocating data blocks...</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={executeCompression}
                          className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-2.5 rounded-2xl shadow-xl shadow-fuchsia-950/20 text-xs transition duration-200 cursor-pointer flex items-center justify-center gap-2 select-none"
                          id="btn-run-compress"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Execute Compressor Engine</span>
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* Compressed Results Banner */}
              {compressResultUrl && compressedDetails && !isCompressing && (
                <div className="bg-slate-800/35 border border-slate-800 rounded-3xl p-4 space-y-3.5 animate-scale-in" id="compress-result-card">
                  
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-5 h-5" />
                    <h3 className="text-sm font-extrabold text-slate-100">Compression Completed!</h3>
                  </div>

                  {/* Size reduction comparative stat card */}
                  <div className="bg-gradient-to-r from-slate-900 to-indigo-950/30 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Storage Reduction Stat</p>
                      <h4 className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                        Shrunk by {Math.round((1 - compressedDetails.finalSize / compressedDetails.originalSize) * 100)}%!
                      </h4>
                    </div>
                    
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex flex-col items-center justify-center border border-emerald-500/15">
                      <span className="text-[14px] font-bold">✓</span>
                    </div>
                  </div>

                  {/* Comparison Details Panel */}
                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>Uploaded Original:</span>
                      <span className="font-mono text-slate-300 font-bold">{formatBytes(compressedDetails.originalSize)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-850 pt-1.5">
                      <span>Target Goal Limit:</span>
                      <span className="font-mono text-slate-400 font-medium">{formatBytes(targetBytes)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-emerald-400 border-t border-slate-850 pt-1.5 font-semibold">
                      <span>Delivered Final Size:</span>
                      <span className="font-mono font-bold">{formatBytes(compressedDetails.finalSize)}</span>
                    </div>
                  </div>

                  {/* Downloader Trigger Link */}
                  {compressResultUrl && compressFile && (
                    <a
                      href={compressResultUrl}
                      download={
                        compressFile.type === 'pdf'
                          ? `${compressFile.name.replace(/\.pdf$/i, "")}_optimized.pdf`
                          : `${compressFile.name.replace(/\.[^/.]+$/, "")}_compressed.${(compressFile.type === 'png' && !convertPngToJpg) ? 'png' : 'jpg'}`
                      }
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-2xl shadow-lg shadow-emerald-950/20 text-xs transition duration-200 cursor-pointer flex items-center justify-center gap-2 select-none"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Optimized File</span>
                    </a>
                  )}

                  <button
                    onClick={resetCompressForm}
                    className="w-full text-slate-400 bg-slate-900 hover:bg-slate-800 py-2 rounded-xl text-[10px] font-semibold border border-slate-800/80 hover:text-slate-200 transition cursor-pointer select-none"
                  >
                    Compress another file
                  </button>

                </div>
              )}

            </div>
          )}

          {/* TAB 3: LOGS FEED TABLE */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-fade-in" id="panel-history">
              <HistoryList 
                items={history}
                onClearHistory={handleClearHistory}
                onRemoveItem={handleRemoveHistoryItem}
              />
            </div>
          )}

        </div>

        {/* Beautiful Bottom Tab Navigation Bar (True Material UI) */}
        <div className="h-[58px] bg-slate-950/90 border-t border-slate-950 flex items-center justify-between px-6 select-none z-30">
          
          <button
            onClick={() => setActiveTab('convert')}
            className={`flex flex-col items-center gap-1 transition cursor-pointer relative ${
              activeTab === 'convert' ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {activeTab === 'convert' && (
              <span className="absolute -top-1.5 w-7 h-1 rounded-full bg-violet-400 animate-pulse" />
            )}
            <RefreshCw className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold tracking-wide">Converter</span>
          </button>

          <button
            onClick={() => setActiveTab('compress')}
            className={`flex flex-col items-center gap-1 transition cursor-pointer relative ${
              activeTab === 'compress' ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {activeTab === 'compress' && (
              <span className="absolute -top-1.5 w-7 h-1 rounded-full bg-violet-400 animate-pulse" />
            )}
            <Sliders className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold tracking-wide">Compressor</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1 transition cursor-pointer relative ${
              activeTab === 'history' ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {activeTab === 'history' && (
              <span className="absolute -top-1.5 w-7 h-1 rounded-full bg-violet-400 animate-pulse" />
            )}
            <Clock className="w-4.5 h-4.5" />
            <span className="text-[10px] font-bold tracking-wide">Recent Tasks</span>
          </button>

        </div>

      </div>
    </PhoneFrame>
  );
}
