import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, ExternalLink, Image as ImageIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useScannerStore } from '../stores/scannerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { Button } from '../components/ui/Button'
import { copyToClipboard } from '../services/clipboardService'
import { formatBookHeader, formatBookContent } from '../utils/formatBookText'
import { generateSearchUrl } from '../utils/generateSearchUrl'
import { Card, CardContent } from '../components/ui/Card'

export function BookDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { items } = useScannerStore()
  const { prefixText, targetDomains } = useSettingsStore()
  
  const [toastMessage, setToastMessage] = useState('')
  
  const item = items.find(i => i.id === id)
  
  useEffect(() => {
    if (!item || item.status !== 'success' || !item.result) {
      navigate('/')
    }
  }, [item, navigate])

  if (!item || item.status !== 'success' || !item.result) {
    return null
  }

  const { result, previewUrl } = item

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const handleCopyHeader = async () => {
    const text = formatBookHeader(result)
    const success = await copyToClipboard(text)
    if (success) showToast("Skopiowano nagłówek")
  }

  const handleCopyContent = async () => {
    const text = formatBookContent(result, prefixText)
    const success = await copyToClipboard(text)
    if (success) showToast("Skopiowano treść")
  }

  const handleSearch = () => {
    const url = generateSearchUrl(result.title, result.author, targetDomains)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-md shadow-lg z-50 text-sm animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-2xl font-bold flex-1 truncate">Szczegóły książki</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <Card className="overflow-hidden bg-muted/30 flex items-center justify-center p-2 h-64 md:h-auto md:aspect-[2/3]">
            {previewUrl ? (
              <img 
                src={previewUrl} 
                alt="Okładka książki" 
                className="max-h-full max-w-full object-contain rounded shadow-sm"
              />
            ) : (
              <ImageIcon className="h-16 w-16 text-muted-foreground opacity-50" />
            )}
          </Card>
          
          <Button className="w-full" onClick={handleSearch}>
            <ExternalLink size={18} className="mr-2" /> Znajdź informacje w Google
          </Button>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Tytuł i Autor</h2>
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="font-semibold text-lg">{result.title}</p>
                  <p className="text-muted-foreground">{result.author}</p>
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={handleCopyHeader}>
                <Copy size={16} className="mr-2" /> Kopiuj: Tytuł - Autor
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Prefix i Opis</h2>
                <div className="p-4 bg-muted/50 rounded-lg border whitespace-pre-wrap font-mono text-sm leading-relaxed overflow-x-auto max-h-96">
                  {formatBookContent(result, prefixText)}
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={handleCopyContent}>
                <Copy size={16} className="mr-2" /> Kopiuj: Prefix + Opis
              </Button>
            </CardContent>
          </Card>
          
          {result.sourceUrl && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Źródło AI:</span>{' '}
              <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                {result.sourceUrl}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
