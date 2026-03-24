import { useState } from 'react';
import { User, X } from 'lucide-react';
import type { AuthUser } from './types';

export function MemberCombobox({
  users,
  excludeIds,
  selectedUserId,
  onSelect,
}: {
  users: AuthUser[];
  excludeIds: Set<string>;
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filteredUsers = users.filter((user) => {
    if (excludeIds.has(user.id)) {
      return false;
    }
    const haystack = `${user.name || ''} ${user.email || ''} ${user.id}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const selectedUser = selectedUserId ? users.find((user) => user.id === selectedUserId) : null;

  return (
    <div className="relative flex-1 min-w-0">
      {selectedUser ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex items-center w-full gap-2 px-2 py-1 text-xs text-left border rounded border-imp-border bg-imp-background"
        >
          <User className="w-3 h-3" />
          <span className="flex-1 min-w-0 truncate">
            {selectedUser.name || selectedUser.email || selectedUser.id}
          </span>
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
            placeholder="Search users…"
            className="w-full px-2 py-1 text-xs border rounded border-imp-border bg-imp-background placeholder:text-imp-muted-foreground"
          />
          {open && (
            <div className="absolute left-0 z-20 w-full mt-1 overflow-y-auto border rounded-md shadow-lg top-full max-h-52 border-imp-border bg-imp-background">
              {filteredUsers.length === 0 ? (
                <div className="px-3 py-2 text-xs text-imp-muted-foreground">No matches.</div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      onSelect(user.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-imp-muted/50"
                  >
                    <User className="h-3.5 w-3.5 text-imp-muted-foreground" />
                    <span className="truncate">{user.name || user.email || user.id}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
