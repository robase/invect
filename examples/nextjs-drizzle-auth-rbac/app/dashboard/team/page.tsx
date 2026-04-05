import { db } from '@/db';
import { teamMembers } from '@/db/schema';

export default async function TeamPage() {
  const allMembers = await db.select().from(teamMembers);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted">{allMembers.length} team members</p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          Invite Member
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allMembers.map((member) => (
          <div key={member.id} className="rounded-lg border border-card-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                {member.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div>
                <div className="font-medium">{member.name}</div>
                <div className="text-xs text-muted">{member.email}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize">
                {member.role}
              </span>
              {member.department && <span className="text-xs text-muted">{member.department}</span>}
              {!member.isActive && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  Inactive
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
