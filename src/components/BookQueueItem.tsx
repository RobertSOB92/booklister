import type { BookProcessItem } from "../types/book"
import { RefreshCw, Trash2, ChevronRight, AlertCircle, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "./ui/Button"
import { Card } from "./ui/Card"
import { cn } from "../utils/cn"

interface BookQueueItemProps {
  item: BookProcessItem;
  index: number;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onClickDetails: (id: string) => void;
}

export function BookQueueItem({ item, index, onRemove, onRetry, onClickDetails }: BookQueueItemProps) {
  const isProcessing = item.status === "processing"
  const isSuccess = item.status === "success"
  const isError = item.status === "failure"
  const isIdle = item.status === "idle"

  return (
    <Card 
      className={cn(
        "flex flex-col sm:flex-row items-center p-3 gap-4 transition-colors",
        isSuccess ? "cursor-pointer hover:bg-muted/50 border-green-200 dark:border-green-900/30" : "",
        isError ? "border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20" : ""
      )}
      onClick={() => isSuccess && onClickDetails(item.id)}
    >
      <div className="shrink-0 relative">
        <img 
          src={item.previewUrl} 
          alt={`Książka ${index + 1}`} 
          className="w-16 h-24 object-cover rounded shadow-sm bg-muted"
        />
        <div className="absolute -top-2 -left-2 bg-background border text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
          {index + 1}
        </div>
      </div>
      
      <div className="flex-1 min-w-0 w-full text-center sm:text-left">
        {isSuccess && item.result ? (
          <div>
            <h4 className="font-semibold truncate" title={item.result.title}>{item.result.title}</h4>
            <p className="text-sm text-muted-foreground truncate" title={item.result.author}>{item.result.author}</p>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-center sm:justify-start gap-1">
              <CheckCircle2 size={14} /> Gotowe
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <h4 className="font-medium">Nieznana książka</h4>
            
            {isIdle && (
              <div className="text-sm text-muted-foreground">Oczekuje na przetwarzanie</div>
            )}
            
            {isProcessing && (
              <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center justify-center sm:justify-start gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Gemini analizuje okładkę...
              </div>
            )}
            
            {isError && (
              <div className="text-sm text-red-600 dark:text-red-400 flex items-start sm:items-center justify-center sm:justify-start gap-1 text-left sm:text-left">
                <AlertCircle size={14} className="shrink-0 mt-0.5 sm:mt-0" />
                <span>{item.errorMessage || "Nie udało się przetworzyć tej okładki."}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0" onClick={(e) => e.stopPropagation()}>
        {isError && (
          <Button size="sm" variant="outline" onClick={() => onRetry(item.id)} className="flex-1 sm:flex-none">
            <RefreshCw size={16} className="mr-2" /> Ponów
          </Button>
        )}
        
        {isSuccess ? (
          <Button size="sm" variant="secondary" onClick={() => onClickDetails(item.id)} className="flex-1 sm:flex-none">
            Szczegóły <ChevronRight size={16} className="ml-1" />
          </Button>
        ) : (
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-1 sm:flex-none"
            onClick={() => onRemove(item.id)}
            disabled={isProcessing}
          >
            <Trash2 size={16} /> <span className="sm:hidden ml-2">Usuń</span>
          </Button>
        )}
      </div>
    </Card>
  )
}
