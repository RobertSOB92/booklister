import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookCopy, Play, Trash2 } from 'lucide-react'
import { ImageUploader } from '../components/ImageUploader'
import { BookQueueItem } from '../components/BookQueueItem'
import { Button } from '../components/ui/Button'
import { useScannerStore } from '../stores/scannerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { identifyBookFromImage } from '../services/geminiService'
import { copyToClipboard } from '../services/clipboardService'
import { formatAllResults } from '../utils/formatBookText'

export function ScannerPage() {
  const navigate = useNavigate()
  const { items, addItem, removeItem, clearItems, updateItemStatus } = useScannerStore()
  const { geminiApiKey, targetDomains, prefixText } = useSettingsStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  
  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const handleFilesSelected = (files: File[]) => {
    if (items.length + files.length > 10) {
      alert("Możesz dodać maksymalnie 10 zdjęć. Nadmiarowe zdjęcia zostały zignorowane.")
      files = files.slice(0, Math.max(0, 10 - items.length))
    }
    
    files.forEach(file => {
      addItem({
        id: crypto.randomUUID(),
        originalFile: file,
        previewUrl: URL.createObjectURL(file),
        status: 'idle'
      })
    })
  }

  const processItem = async (id: string, file: File) => {
    updateItemStatus(id, 'processing')
    try {
      const result = await identifyBookFromImage({
        apiKey: geminiApiKey,
        image: file,
        allowedDomains: targetDomains
      })
      updateItemStatus(id, 'success', result)
    } catch (error: any) {
      updateItemStatus(id, 'failure', undefined, error.message)
    }
  }

  const handleProcessAll = async () => {
    if (!geminiApiKey) {
      alert("Dodaj klucz Gemini API w ustawieniach, aby analizować okładki książek.")
      navigate('/settings')
      return
    }
    
    if (!navigator.onLine) {
        alert("Brak połączenia z internetem. Połącz się z internetem, aby wysłać zdjęcie do Google Gemini.")
        return
    }
    
    const pendingItems = items.filter(item => item.status === 'idle' || item.status === 'failure')
    if (pendingItems.length === 0) return
    
    setIsProcessing(true)
    
    // Process sequentially to respect rate limits
    for (const item of pendingItems) {
      await processItem(item.id, item.originalFile)
    }
    
    setIsProcessing(false)
  }

  const handleRetry = async (id: string) => {
    if (!navigator.onLine) {
        alert("Brak połączenia z internetem.")
        return
    }
    const item = items.find(i => i.id === id)
    if (item) {
      setIsProcessing(true)
      await processItem(item.id, item.originalFile)
      setIsProcessing(false)
    }
  }

  const handleCopyAll = async () => {
    const successItems = items.filter(item => item.status === 'success' && item.result).map(item => item.result!)
    if (successItems.length === 0) {
      showToast("Brak gotowych wyników do skopiowania.")
      return
    }
    
    const text = formatAllResults(successItems, prefixText)
    const success = await copyToClipboard(text)
    if (success) {
      showToast("Skopiowano wszystkie wyniki")
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md shadow-lg z-50 text-sm animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}

      {!geminiApiKey && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">Dodaj własny Gemini API Key w ustawieniach.</span>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings')} className="bg-background">
            Ustawienia
          </Button>
        </div>
      )}

      <ImageUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />

      {items.length === 0 ? (
        <div className="text-center py-16 px-4 bg-muted/20 border-2 border-dashed rounded-lg">
          <BookCopy className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Brak książek</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Dodaj zdjęcia okładek, aby rozpocząć.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/40 p-4 rounded-lg">
            <div className="text-sm font-medium" aria-live="polite">
              Kolejka: {items.length}/10 
              <span className="text-muted-foreground ml-2 hidden sm:inline-block">
                (Gotowe: {items.filter(i => i.status === 'success').length})
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button 
                onClick={handleProcessAll} 
                disabled={isProcessing || !items.some(i => i.status === 'idle' || i.status === 'failure')}
                className="flex-1 sm:flex-none"
              >
                <Play size={16} className="mr-2" /> 
                {isProcessing ? 'Przetwarzanie...' : 'Przetwórz'}
              </Button>
              <Button 
                onClick={handleCopyAll} 
                variant="secondary"
                disabled={isProcessing || !items.some(i => i.status === 'success')}
                className="flex-1 sm:flex-none"
              >
                <BookCopy size={16} className="mr-2" /> <span className="hidden sm:inline">Kopiuj </span>wszystkie
              </Button>
              <Button 
                onClick={() => {
                  if (confirm('Czy na pewno chcesz usunąć wszystkie zdjęcia z kolejki?')) {
                    clearItems()
                  }
                }} 
                variant="ghost" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                disabled={isProcessing}
                aria-label="Wyczyść całą listę"
              >
                <Trash2 size={20} />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <BookQueueItem 
                key={item.id}
                item={item}
                index={index}
                onRemove={removeItem}
                onRetry={handleRetry}
                onClickDetails={(id) => navigate(`/book/${id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
