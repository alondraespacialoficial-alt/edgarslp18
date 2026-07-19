// Shared helpers for reading/uploading user-selected files (case attachments, hero image, etc).
// Images are resized/recompressed client-side so large phone photos don't hit the
// platform's request body size limit (Vercel caps requests at ~4.5MB), which previously
// caused confusing 413 errors when clients tried to attach evidence photos.

export const MAX_NON_IMAGE_ATTACHMENT_MB = 4;

// Resize + recompress an image client-side before uploading.
export function resizeImageFile(file: File, maxDimension = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Reads a File into an attachment-ready { content, type }, compressing images
// and guarding oversized non-image files (which can't be compressed client-side).
export async function readAttachmentFile(file: File): Promise<{ content: string; type: string }> {
  if (file.type.startsWith('image/')) {
    const content = await resizeImageFile(file);
    return { content, type: 'image/jpeg' };
  }

  if (file.size > MAX_NON_IMAGE_ATTACHMENT_MB * 1024 * 1024) {
    throw new Error(`El archivo "${file.name}" pesa demasiado (máx. ${MAX_NON_IMAGE_ATTACHMENT_MB}MB para PDFs y otros documentos). Intenta comprimirlo o dividirlo antes de subirlo.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo "${file.name}".`));
    reader.onload = () => resolve({ content: reader.result as string, type: file.type });
    if (file.type === 'application/pdf') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

// Safely extracts a friendly error message from a failed fetch response, even when
// the body isn't valid JSON (e.g. platform-level 413 errors return plain text/HTML).
export async function parseApiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.clone().json();
    return data.error || fallback;
  } catch {
    if (res.status === 413) return 'El archivo es demasiado pesado para subirse. Intenta con uno más ligero.';
    return `${fallback} (código ${res.status})`;
  }
}
