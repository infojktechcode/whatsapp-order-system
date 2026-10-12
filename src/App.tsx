import { BrowserRouter, Routes, Route, NavLink, Link } from "react-router-dom"
import { ProductList } from "./features/products/ProductList.js"
import { CheckoutPage } from "./features/checkout/CheckoutPage.js"
import { DeliveryForm } from "./features/delivery/DeliveryForm.js"
import { WhatsAppChat } from "./features/whatsapp/WhatsAppChat.js"
import { AdminDashboard } from "./features/admin/AdminDashboard.js"
import { useCartStore } from "./features/cart/useCartStore.js"

const NAV = [
  { to: "/", label: "Shop" },
  { to: "/checkout", label: "Cart" },
  { to: "/delivery", label: "Delivery" },
  { to: "/chat", label: "Chat" },
  { to: "/admin", label: "Admin" },
]

function Shell({ children }: { children: React.ReactNode }) {
  const count = useCartStore((s) => s.count)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#25D366] px-4 py-3 text-white">
        <Link to="/" className="text-lg font-semibold">
          Dear Body
        </Link>
        <Link to="/checkout" className="text-sm">
          Cart{count > 0 ? ` (${count})` : ""}
        </Link>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-white">
        <div className="mx-auto flex max-w-md">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex-1 py-3 text-center text-xs ${
                  isActive ? "font-semibold text-[#25D366]" : "text-gray-500"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/delivery" element={<DeliveryForm />} />
          <Route path="/chat" element={<WhatsAppChat />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route
            path="*"
            element={
              <div className="p-4 text-center text-gray-500">
                Page not found.{" "}
                <Link to="/" className="underline">
                  Back to shop
                </Link>
              </div>
            }
          />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
