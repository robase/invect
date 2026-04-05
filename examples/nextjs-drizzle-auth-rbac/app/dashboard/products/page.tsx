import { db } from '@/db';
import { products } from '@/db/schema';

export default async function ProductsPage() {
  const allProducts = await db.select().from(products);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted">{allProducts.length} products in catalog</p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          Add Product
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allProducts.map((product) => (
          <div key={product.id} className="rounded-lg border border-card-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{product.name}</h3>
                <p className="mt-1 text-xs text-muted">SKU: {product.sku}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {product.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold">${(product.priceInCents / 100).toFixed(0)}</span>
              <span className="text-xs text-muted capitalize">{product.category}</span>
            </div>
            {product.description && (
              <p className="mt-2 text-sm text-muted">{product.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
