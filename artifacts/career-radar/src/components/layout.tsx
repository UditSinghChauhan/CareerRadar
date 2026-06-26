import { useUser, useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  UserCircle, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/profile", icon: UserCircle },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  const NavLinks = () => (
    <div className="flex flex-col space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
            <div
              className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <div className="flex items-center space-x-2 text-primary font-bold text-xl">
            <Briefcase className="h-6 w-6" />
            <span>CareerRadar</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto py-6 px-4">
          <NavLinks />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-16 items-center justify-between px-4 md:px-8 border-b border-border bg-card">
          <div className="flex items-center md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="mr-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle mobile menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="h-16 flex items-center justify-center border-b border-border px-6">
                  <SheetTitle className="flex items-center space-x-2 text-primary font-bold text-xl m-0">
                    <Briefcase className="h-6 w-6" />
                    <span>CareerRadar</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="py-6 px-4">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex items-center space-x-2 text-primary font-bold text-lg">
              <Briefcase className="h-5 w-5" />
              <span>CareerRadar</span>
            </div>
          </div>
          
          <div className="hidden md:block">
            {/* Empty space for desktop header left */}
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium hidden sm:inline-block">
              {user?.fullName || user?.primaryEmailAddress?.emailAddress}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
