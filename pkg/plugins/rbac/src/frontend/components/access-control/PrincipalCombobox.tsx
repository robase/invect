import { useState } from 'react';
import { User, Users, X } from 'lucide-react';
import type { Team } from '../../../shared/types';
import type { AuthUser, PrincipalSelection } from './types';

export function PrincipalCombobox({
  users,
  teams,
  excludeUserIds,
  excludeTeamIds,
  selection,
  onSelect,
}: {
  users: AuthUser[];
  teams: Team[];
  excludeUserIds: Set<string | null | undefined>;
  excludeTeamIds: Set<string | null | undefined>;
  selection: PrincipalSelection | null;
  onSelect: (selection: PrincipalSelection | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filteredUsers = users.filter((user) => {
    if (excludeUserIds.has(user.id)) {
      return false;
    }
    const haystack = `${user.name || ''} ${user.email || ''} ${user.id}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const filteredTeams = teams.filter((team) => {
    if (excludeTeamIds.has(team.id)) {
      return false;
    }
    const haystack = `${team.name} ${team.description || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const selectedLabel = selection
    ? selection.type === 'user'
      ? users.find((user) => user.id === selection.id)?.name ||
        users.find((user) => user.id === selection.id)?.email ||
        selection.id
      : teams.find((team) => team.id === selection.id)?.name || selection.id
    : '';

  return (
    <div className="relative flex-1 min-w-0">
      {selection ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex items-center w-full gap-2 px-2 py-1 text-xs text-left border rounded border-imp-border bg-imp-background"
        >
          {selection.type === 'user' ? <User className="w-3 h-3" /> : <Users className="w-3 h-3" />}
          <span className="flex-1 min-w-0 truncate">{selectedLabel}</span>
          <X className="w-3 h-3 text-imp-muted-foreground" />
        </button>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search users or teams…"
            className="w-full px-2 py-1 text-xs border rounded border-imp-border bg-imp-background placeholder:text-imp-muted-foreground"
          />
          {open && (
            <div className="absolute left-0 z-20 w-full mt-1 overflow-y-auto border rounded-md shadow-lg top-full max-h-52 border-imp-border bg-imp-background">
              {filteredTeams.length === 0 && filteredUsers.length === 0 ? (
                <div className="px-3 py-2 text-xs text-imp-muted-foreground">No matches.</div>
              ) : (
                <>
                  {filteredTeams.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-imp-muted-foreground">
                        Teams
                      </div>
                      {filteredTeams.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            onSelect({ type: 'team', id: team.id });
                            setOpen(false);
                            setQuery('');
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-imp-muted/50"
                        >
                          <Users className="h-3.5 w-3.5 text-imp-muted-foreground" />
                          <span className="truncate">{team.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {filteredUsers.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-imp-muted-foreground">
                        Users
                      </div>
                      {filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            onSelect({ type: 'user', id: user.id });
                            setOpen(false);
                            setQuery('');
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-imp-muted/50"
                        >
                          <User className="h-3.5 w-3.5 text-imp-muted-foreground" />
                          <span className="truncate">{user.name || user.email || user.id}</span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
