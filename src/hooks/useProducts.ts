import { useCallback, useEffect, useState } from "react"
import { searchProducts } from "../services/product.service.js"
import type { ProductWithVariants } from "../types/index.js"

export function useProducts() {
  const [products, setProducts] = useState<ProductWithVariants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      setProducts(await searchProducts(query))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load products")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(search)
  }, [search, load])

  const refetch = useCallback(() => {
    void load(search)
  }, [search, load])

  return { products, loading, error, search, setSearch, refetch }
}
