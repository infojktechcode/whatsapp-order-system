import { useState } from "react"
import { useProducts } from "../../hooks/useProducts.js"
import { useCartStore } from "../cart/useCartStore.js"
import type { ProductVariant, ProductWithVariants } from "../../types/index.js"

function VariantCard({ variant, onSelect }: { variant: ProductVariant; onSelect: (v: ProductVariant) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(variant)}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:scale-[0.98] transition"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{variant.scent?.name ?? variant.sku}</span>
        <span className="text-sm text-gray-500">{variant.size}</span>
      </div>
      <div className="mt-1 text-sm text-gray-600">
        {variant.product_type?.name} - {variant.retail_price.toLocaleString()} KES
        {variant.wholesale_price > 0 && (
          <span className="ml-2 text-green-700">
            Wholesale {variant.wholesale_price.toLocaleString()} KES ({variant.wholesale_threshold}+)
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        SKU: {variant.sku} | Stock: {variant.stock_quantity}
      </div>
    </button>
  )
}

export function ProductList() {
  const { products, loading, error, search, setSearch, refetch } = useProducts()
  const [openProductId, setOpenProductId] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const addItem = useCartStore((s) => s.addItem)

  const handleSelectVariant = (variant: ProductVariant) => {
    setSelectedVariant(variant)
    addItem({
      variant_id: variant.id,
      quantity: 1,
      unit_price: variant.retail_price,
      pricing_tier: "retail",
      line_total: variant.retail_price,
    })
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Loading products...</div>
  if (error)
    return (
      <div className="p-4 text-center text-red-600">
        {error}{" "}
        <button type="button" onClick={refetch} className="underline">
          Retry
        </button>
      </div>
    )

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Shop Products</h1>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search scent, SKU, size..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      {products.map((product: ProductWithVariants) => (
        <div key={product.id} className="space-y-2">
          <button
            type="button"
            onClick={() => setOpenProductId(openProductId === product.id ? null : product.id)}
            className="w-full text-left font-semibold text-gray-800 bg-gray-50 rounded-lg px-3 py-2"
          >
            {product.name} {openProductId === product.id ? "Hide" : "View"}
          </button>
          {openProductId === product.id && (
            <div className="grid gap-2 pl-2">
              {product.variants.map((variant) => (
                <VariantCard key={variant.id} variant={variant} onSelect={handleSelectVariant} />
              ))}
              {product.variants.length === 0 && (
                <p className="text-sm text-gray-500">No variants available.</p>
              )}
            </div>
          )}
        </div>
      ))}

      {products.length === 0 && <p className="text-gray-500 text-sm">No products found.</p>}

      {selectedVariant && (
        <div className="fixed bottom-14 inset-x-0 z-10 border-t bg-white p-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm">
              {selectedVariant.scent?.name ?? selectedVariant.sku} - {selectedVariant.size}
            </span>
            <button
              type="button"
              onClick={() => setSelectedVariant(null)}
              className="rounded bg-gray-100 px-3 py-1 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
