import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

// Configure pdfjs-dist worker URL automatically using the package version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Loads a File object as an HTMLImageElement
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Failed to load image element'));
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Parses a pdf file to fetch metadata (number of pages)
 */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error) {
    console.error('Error getting page count:', error);
    throw new Error('This PDF file seems invalid or password-protected.');
  }
}

/**
 * Renders all PDF pages as image Blobs
 */
export async function renderPdfPages(
  file: File,
  dpiScale: number = 1.5,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; width: number; height: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const results: { blob: Blob; width: number; height: number }[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpiScale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create 2D canvas context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page into canvas
    await page.render({ canvasContext: context, viewport } as any).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });

    if (blob) {
      results.push({
        blob,
        width: viewport.width,
        height: viewport.height,
      });
    }

    if (onProgress) {
      onProgress(pageNum, totalPages);
    }
  }

  return results;
}

/**
 * Compiles an array of images (data URLs) into a single PDF
 */
export async function createPdfFromImages(
  images: { dataUrl: string; width: number; height: number }[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  if (images.length === 0) throw new Error('No images provided for PDF compilation');

  const first = images[0];
  const pdf = new jsPDF({
    orientation: first.width > first.height ? 'l' : 'p',
    unit: 'px',
    format: [first.width, first.height],
  });

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (i > 0) {
      pdf.addPage([img.width, img.height], img.width > img.height ? 'l' : 'p');
    }
    // Set margins to 0, width/height to image width/height for seamless scaling
    pdf.addImage(img.dataUrl, 'JPEG', 0, 0, img.width, img.height);

    if (onProgress) {
      onProgress(i + 1, images.length);
    }
  }

  return pdf.output('blob');
}

/**
 * Compresses an image targeting a specific file size in bytes
 */
export async function compressImageToTargetBytes(
  file: File,
  targetBytes: number,
  options: { convertPngToJpg: boolean },
  onProgress?: (msg: string) => void
): Promise<{ blob: Blob; width: number; height: number; quality: number; scale: number }> {
  const img = await loadImage(file);
  const originalWidth = img.width;
  const originalHeight = img.height;

  // Decide export format: JPG supports compression quality; PNG does not, so if user wants to keep PNG, dimensions reduction is key.
  const isPng = file.type === 'image/png';
  const outMime = isPng && !options.convertPngToJpg ? 'image/png' : 'image/jpeg';

  let minScale = 0.15;
  let maxScale = 1.0;
  let minQuality = 0.1;
  let maxQuality = 0.95;

  let bestBlob: Blob | null = null;
  let bestQuality = 0.8;
  let bestScale = 1.0;

  // Binary search to find optimal quality & scale combination
  for (let iter = 1; iter <= 6; iter++) {
    const scale = (minScale + maxScale) / 2;
    const quality = outMime === 'image/jpeg' ? (minQuality + maxQuality) / 2 : 1.0;

    if (onProgress) {
      onProgress(
        `Step ${iter}/6: Testing resolution scale ${(scale * 100).toFixed(0)}%, quality ${quality.toFixed(2)}`
      );
    }

    const testWidth = Math.round(originalWidth * scale);
    const testHeight = Math.round(originalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = testWidth;
    canvas.height = testHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context retrieval failed');

    ctx.drawImage(img, 0, 0, testWidth, testHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outMime, quality);
    });

    if (!blob) continue;

    const size = blob.size;

    if (size <= targetBytes) {
      bestBlob = blob;
      bestScale = scale;
      bestQuality = quality;

      // We are below target; let's try larger scale/quality for better visuals
      minScale = scale;
      if (outMime === 'image/jpeg') {
        minQuality = quality;
      }
    } else {
      // Over budget; must scale down or lower quality
      maxScale = scale;
      if (outMime === 'image/jpeg') {
        maxQuality = quality;
      }

      if (!bestBlob) {
        bestBlob = blob;
        bestScale = scale;
        bestQuality = quality;
      }
    }
  }

  if (!bestBlob) {
    throw new Error('Failed to compress image file');
  }

  return {
    blob: bestBlob,
    width: Math.round(originalWidth * bestScale),
    height: Math.round(originalHeight * bestScale),
    quality: bestQuality,
    scale: bestScale,
  };
}

/**
 * Compresses a complete multi-page PDF targeting a specific file size in bytes
 */
export async function compressPdfToTargetBytes(
  file: File,
  targetBytes: number,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ blob: Blob; initialSize: number; finalSize: number; pagesCompressed: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const initialSize = file.size;

  // Distribute target byte size to pages, accounting for some PDF wrapper overhead (roughly 15%)
  const pageTargetBytes = Math.floor((targetBytes * 0.85) / totalPages);

  const compressedImages: { dataUrl: string; width: number; height: number }[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, totalPages, `Rendering PDF page ${pageNum} / ${totalPages}`);
    }

    const page = await pdf.getPage(pageNum);
    // Baseline DPI scale: 1.5 zoom for perfect balance of speed and reading resolution
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas 2D context for page render');

    await page.render({ canvasContext: context, viewport } as any).promise;

    if (onProgress) {
      onProgress(pageNum, totalPages, `Reducing size for page ${pageNum} / ${totalPages}`);
    }

    // Binary search quality of this page canvas to fit the target page budget
    let minQuality = 0.05;
    let maxQuality = 0.85;
    let bestPageDataUrl = '';
    let chosenScale = 1.0;

    // Apply scaling search if budget is tight
    const canvasRef = { width: canvas.width, height: canvas.height };
    if (pageTargetBytes < 100 * 1024) {
      // Scale down canvas for tighter compression limits (e.g., target 100kB a page)
      chosenScale = 0.75;
    }

    const compressCanvas = document.createElement('canvas');
    compressCanvas.width = Math.round(canvasRef.width * chosenScale);
    compressCanvas.height = Math.round(canvasRef.height * chosenScale);
    const compressCtx = compressCanvas.getContext('2d');
    if (compressCtx) {
      compressCtx.drawImage(canvas, 0, 0, compressCanvas.width, compressCanvas.height);
    }
    const finalCompressCanvas = compressCtx ? compressCanvas : canvas;

    for (let step = 1; step <= 4; step++) {
      const q = (minQuality + maxQuality) / 2;
      const testDataUrl = finalCompressCanvas.toDataURL('image/jpeg', q);
      // Rough estimation of binary size from the base64 string
      const estimatedSize = (testDataUrl.length - 22) * 0.75;

      if (estimatedSize <= pageTargetBytes) {
        bestPageDataUrl = testDataUrl;
        minQuality = q; // under limit; we can bump quality
      } else {
        maxQuality = q; // over limit; decrease quality
        if (!bestPageDataUrl) {
          bestPageDataUrl = testDataUrl;
        }
      }
    }

    compressedImages.push({
      dataUrl: bestPageDataUrl,
      width: finalCompressCanvas.width,
      height: finalCompressCanvas.height,
    });
  }

  if (onProgress) {
    onProgress(totalPages, totalPages, 'Bundling together high-compression PDF file...');
  }

  const finalPdfBlob = await createPdfFromImages(compressedImages);

  return {
    blob: finalPdfBlob,
    initialSize,
    finalSize: finalPdfBlob.size,
    pagesCompressed: totalPages,
  };
}
