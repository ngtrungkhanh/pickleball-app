'use client';
import { User, UserX } from 'lucide-react';
import { cn, getAvatarLetter } from '@/lib/utils';

export function PlayerList({ players }: { players: any[] }) {
  if (!players || players.length === 0) {
    return <div className="p-8 text-center glass rounded-2xl text-secondary-foreground/70">No players found.</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {players.map((p) => (
        <div 
          key={p.id} 
          className={cn(
            "p-5 rounded-2xl flex items-center justify-between transition-all shadow-sm hover:shadow-md",
            p.active 
              ? "glass border border-primary/20 bg-card/60" 
              : "border border-border/50 bg-background/30 opacity-60 grayscale"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner",
              p.active ? "bg-gradient-to-br from-primary to-accent" : "bg-secondary-foreground/30"
            )}>
              {getAvatarLetter(p.name)}
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{p.name}</p>
              <p className={cn(
                "text-xs font-medium mt-1 uppercase tracking-wide",
                p.active ? "text-primary" : "text-secondary-foreground/50"
              )}>
                {p.active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
          <div>
            {p.active 
              ? <User className="w-6 h-6 text-primary drop-shadow-sm" /> 
              : <UserX className="w-6 h-6 text-secondary-foreground/40" />
            }
          </div>
        </div>
      ))}
    </div>
  );
}
