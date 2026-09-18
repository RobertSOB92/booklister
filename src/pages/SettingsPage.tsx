import { useState } from 'react'
import { Eye, EyeOff, Save, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { verifyGeminiKey } from '../services/geminiService'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Label } from '../components/ui/Label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/Card'

export function SettingsPage() {
  const { geminiApiKey, prefixText, targetDomains, updateSettings, clearSettings } = useSettingsStore()
  
  const [keyInput, setKeyInput] = useState(geminiApiKey)
  const [prefixInput, setPrefixInput] = useState(prefixText)
  const [domainsInput, setDomainsInput] = useState(targetDomains.join(', '))
  
  const [showKey, setShowKey] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const handleSave = () => {
    // Process domains: remove spaces, empty values, protocols and trailing slashes
    const processedDomains = domainsInput
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0)
      .map(d => d.replace(/^https?:\/\//, '').replace(/\/$/, ''))
    
    updateSettings({
      geminiApiKey: keyInput.trim(),
      prefixText: prefixInput,
      targetDomains: processedDomains.length > 0 ? processedDomains : ['lubimyczytac.pl', 'empik.com']
    })
    
    setSaveMessage('Ustawienia zostały zapisane.')
    setTimeout(() => setSaveMessage(''), 3000)
    setDomainsInput(processedDomains.length > 0 ? processedDomains.join(', ') : 'lubimyczytac.pl, empik.com')
  }

  const handleVerify = async () => {
    if (!keyInput.trim()) {
      setVerificationStatus('error')
      return
    }
    
    setIsVerifying(true)
    setVerificationStatus('idle')
    
    const result = await verifyGeminiKey(keyInput.trim())
    
    setIsVerifying(false)
    if (result.isValid) {
      setVerificationStatus('success')
      if (result.modelUsed) {
        setSaveMessage(`Połączono! Został wybrany model: ${result.modelUsed}`)
        setTimeout(() => setSaveMessage(''), 5000)
      }
    } else {
      setVerificationStatus('error')
      setSaveMessage(`Błąd API: ${result.error}`)
      setTimeout(() => setSaveMessage(''), 8000)
    }
  }

  const handleDelete = () => {
    if (confirm('Czy na pewno chcesz usunąć klucz API i zresetować ustawienia?')) {
      clearSettings()
      setKeyInput('')
      setPrefixInput('')
      setDomainsInput('lubimyczytac.pl, empik.com')
      setVerificationStatus('idle')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">Ustawienia</h1>
      
      <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Bezpieczeństwo (Model BYOK)</p>
          <p>Klucz jest przechowywany lokalnie w tej przeglądarce. Nie używaj aplikacji na publicznym lub współdzielonym urządzeniu.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Gemini API Key</CardTitle>
          <p className="text-sm text-muted-foreground">Wprowadź własny klucz Google Gemini API. Aplikacja użyje go bezpośrednio do analizy zdjęć okładek.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Klucz API</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleVerify} disabled={isVerifying || !keyInput} variant="secondary">
              {isVerifying ? 'Sprawdzanie...' : 'Sprawdź klucz'}
            </Button>
            <Button onClick={handleDelete} variant="destructive" className="ml-auto">
              <Trash2 className="mr-2 h-4 w-4" /> Zresetuj
            </Button>
          </div>
          
          {verificationStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mt-2">
              <CheckCircle size={16} /> Klucz Gemini API działa poprawnie.
            </div>
          )}
          {verificationStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm mt-2">
              <XCircle size={16} /> Nie udało się zweryfikować klucza Gemini API lub wygasł.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formatowanie opisu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prefix">Prefix dla social media (opcjonalnie)</Label>
            <Textarea
              id="prefix"
              value={prefixInput}
              onChange={(e) => setPrefixInput(e.target.value)}
              placeholder="#Polecajka"
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domains">Preferowane domeny (po przecinku)</Label>
            <Input
              id="domains"
              value={domainsInput}
              onChange={(e) => setDomainsInput(e.target.value)}
              placeholder="lubimyczytac.pl, empik.com"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center bg-muted/50 rounded-b-lg border-t pt-4">
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            {saveMessage}
          </span>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> Zapisz ustawienia
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
