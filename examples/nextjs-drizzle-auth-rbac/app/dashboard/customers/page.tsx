import { db } from '@/db';
import { customers } from '@/db/schema';

export default async function CustomersPage() {
  const allCustomers = await db.select().from(customers);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted">{allCustomers.length} customers total</p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          Add Customer
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-card-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-card-border text-left text-xs font-medium uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">MRR</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {allCustomers.map((customer) => (
              <tr key={customer.id} className="text-sm hover:bg-accent/50">
                <td className="px-4 py-3">
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-xs text-muted">{customer.email}</div>
                </td>
                <td className="px-4 py-3 text-muted">{customer.company || '—'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize">
                    {customer.plan}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm">
                  ${customer.mrr.toFixed(0)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      customer.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : customer.status === 'churned'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {customer.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
