import { Outlet } from "react-router-dom"
import { AppHeader } from "../components/AppHeader"

export function Layout() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8 max-w-5xl">
        <Outlet />
      </main>
    </div>
  )
}
