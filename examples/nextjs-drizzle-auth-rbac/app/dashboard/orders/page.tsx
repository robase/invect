import { db } from '@/db';
import { orders, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function OrdersPage() {
  const allOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalInCents: orders.totalInCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      customerName: customers.name,
      customerCompany: customers.company,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id));

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    refunded: 'bg-gray-100 text-gray-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-muted">{allOrders.length} orders total</p>
        </div>
      </div>

      <div className="overflow-hidden border rounded-lg border-card-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="text-xs font-medium tracking-wider text-left uppercase border-b border-card-border text-muted">
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {allOrders.map((order) => (
              <tr key={order.id} className="text-sm hover:bg-accent/50">
                <td className="px-4 py-3 font-mono text-xs text-muted">{order.id.slice(0, 8)}…</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{order.customerName || 'Unknown'}</div>
                  <div className="text-xs text-muted">{order.customerCompany || ''}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[order.status] || ''}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">
                  ${(order.totalInCents / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
