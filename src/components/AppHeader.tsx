import { Book, Settings } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "./ui/Button"

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <Book className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg sm:inline-block">AI Book Scanner</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/settings">
            <Button variant="ghost" size="icon" aria-label="Ustawienia">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
