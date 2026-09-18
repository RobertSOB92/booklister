import { useRef } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { Button } from './ui/Button'
import { validateImage } from '../utils/validateImage'

interface ImageUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function ImageUploader({ onFilesSelected, disabled }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = [];
      for (const f of files) {
        const v = validateImage(f);
        if (v.isValid) {
          validFiles.push(f);
        } else {
          alert(`Plik ${f.name}: ${v.error}`);
        }
      }
      if (validFiles.length > 0) onFilesSelected(validFiles);
    }
    e.target.value = '';
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full justify-center p-6 border-2 border-dashed rounded-lg bg-muted/30">
      <input 
        type="file" 
        accept="image/jpeg,image/png,image/webp,image/heic" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileChange}
        disabled={disabled}
      />
      <input 
        type="file" 
        accept="image/jpeg,image/png,image/webp,image/heic" 
        capture="environment" 
        className="hidden" 
        ref={cameraInputRef} 
        onChange={handleFileChange}
        disabled={disabled}
      />
      <Button 
        size="lg" 
        className="w-full sm:w-auto gap-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <ImagePlus size={20} /> Wybierz zdjęcia z galerii
      </Button>
      <Button 
        size="lg" 
        variant="secondary"
        className="w-full sm:w-auto gap-2"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled}
      >
        <Camera size={20} /> Użyj aparatu
      </Button>
    </div>
  )
}
