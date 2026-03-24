/**
 * Database seed script for Acme Dashboard.
 *
 * Run with: pnpm db:seed
 * (Requires tables to exist — run `pnpm db:push` first)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as appSchema from './schema';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://acme:acme@localhost:5432/acme_dashboard';
const db = drizzle(connectionString, { schema: appSchema });

async function seed() {
  console.log('🌱 Seeding Acme Dashboard database...\n');

  // ─── Team Members ──────────────────────────────────────────
  const teamMembers = [
    { id: randomUUID(), name: 'Sarah Chen', email: 'sarah@acme.io', role: 'admin' as const, department: 'Engineering' },
    { id: randomUUID(), name: 'Marcus Johnson', email: 'marcus@acme.io', role: 'manager' as const, department: 'Sales' },
    { id: randomUUID(), name: 'Priya Patel', email: 'priya@acme.io', role: 'member' as const, department: 'Support' },
    { id: randomUUID(), name: 'Alex Rivera', email: 'alex@acme.io', role: 'member' as const, department: 'Engineering' },
    { id: randomUUID(), name: 'Jordan Lee', email: 'jordan@acme.io', role: 'manager' as const, department: 'Product' },
  ];

  for (const member of teamMembers) {
    await db.insert(appSchema.teamMembers).values(member).onConflictDoNothing();
  }
  console.log(`  ✓ ${teamMembers.length} team members`);

  // ─── Customers ─────────────────────────────────────────────
  const customers = [
    { id: randomUUID(), name: 'TechStart Inc', email: 'billing@techstart.io', company: 'TechStart', plan: 'pro' as const, mrr: 299, status: 'active' as const },
    { id: randomUUID(), name: 'DataFlow Labs', email: 'admin@dataflow.dev', company: 'DataFlow Labs', plan: 'enterprise' as const, mrr: 999, status: 'active' as const },
    { id: randomUUID(), name: 'GreenLeaf Co', email: 'ops@greenleaf.co', company: 'GreenLeaf', plan: 'starter' as const, mrr: 49, status: 'active' as const },
    { id: randomUUID(), name: 'NovaBuild', email: 'team@novabuild.io', company: 'NovaBuild', plan: 'pro' as const, mrr: 299, status: 'active' as const },
    { id: randomUUID(), name: 'Rapid Retail', email: 'hello@rapidretail.com', company: 'Rapid Retail', plan: 'free' as const, mrr: 0, status: 'trial' as const },
    { id: randomUUID(), name: 'CloudNine SaaS', email: 'billing@cloudnine.app', company: 'CloudNine', plan: 'enterprise' as const, mrr: 1499, status: 'active' as const },
    { id: randomUUID(), name: 'OldCorp LLC', email: 'it@oldcorp.com', company: 'OldCorp', plan: 'starter' as const, mrr: 0, status: 'churned' as const },
  ];

  for (const customer of customers) {
    await db.insert(appSchema.customers).values(customer).onConflictDoNothing();
  }
  console.log(`  ✓ ${customers.length} customers`);

  // ─── Products ──────────────────────────────────────────────
  const products = [
    { id: randomUUID(), name: 'Acme Platform — Starter', sku: 'ACME-STARTER', priceInCents: 4900, category: 'saas' as const },
    { id: randomUUID(), name: 'Acme Platform — Pro', sku: 'ACME-PRO', priceInCents: 29900, category: 'saas' as const },
    { id: randomUUID(), name: 'Acme Platform — Enterprise', sku: 'ACME-ENT', priceInCents: 99900, category: 'saas' as const },
    { id: randomUUID(), name: 'Priority Support Add-on', sku: 'ADDON-SUPPORT', priceInCents: 9900, category: 'addon' as const },
    { id: randomUUID(), name: 'Custom Integration', sku: 'SVC-INTEGRATION', priceInCents: 250000, category: 'service' as const },
    { id: randomUUID(), name: 'API Rate Limit Boost', sku: 'ADDON-RATELIMIT', priceInCents: 4900, category: 'addon' as const },
  ];

  for (const product of products) {
    await db.insert(appSchema.products).values(product).onConflictDoNothing();
  }
  console.log(`  ✓ ${products.length} products`);

  // ─── Orders ────────────────────────────────────────────────
  const orderData = [
    { customerId: customers[0].id, status: 'delivered' as const, totalInCents: 29900 },
    { customerId: customers[1].id, status: 'confirmed' as const, totalInCents: 99900 },
    { customerId: customers[2].id, status: 'pending' as const, totalInCents: 4900 },
    { customerId: customers[3].id, status: 'shipped' as const, totalInCents: 39800 },
    { customerId: customers[5].id, status: 'delivered' as const, totalInCents: 149900 },
  ];

  const createdOrders: { id: string; totalInCents: number }[] = [];
  for (const order of orderData) {
    const id = randomUUID();
    await db.insert(appSchema.orders).values({ id, ...order }).onConflictDoNothing();
    createdOrders.push({ id, totalInCents: order.totalInCents });
  }
  console.log(`  ✓ ${orderData.length} orders`);

  // ─── Order Items ───────────────────────────────────────────
  const orderItems = [
    { orderId: createdOrders[0].id, productId: products[1].id, quantity: 1, unitPriceInCents: 29900 },
    { orderId: createdOrders[1].id, productId: products[2].id, quantity: 1, unitPriceInCents: 99900 },
    { orderId: createdOrders[2].id, productId: products[0].id, quantity: 1, unitPriceInCents: 4900 },
    { orderId: createdOrders[3].id, productId: products[1].id, quantity: 1, unitPriceInCents: 29900 },
    { orderId: createdOrders[3].id, productId: products[3].id, quantity: 1, unitPriceInCents: 9900 },
    { orderId: createdOrders[4].id, productId: products[2].id, quantity: 1, unitPriceInCents: 99900 },
    { orderId: createdOrders[4].id, productId: products[4].id, quantity: 1, unitPriceInCents: 50000 },
  ];

  for (const item of orderItems) {
    await db
      .insert(appSchema.orderItems)
      .values({ id: randomUUID(), ...item })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${orderItems.length} order items`);

  console.log('\n✅ Seed complete!\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
