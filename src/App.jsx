import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAdmin from './components/RequireAdmin'
import { missingEnv } from './lib/supabase'
import SetupNeeded from './pages/SetupNeeded'
import OrderForm from './pages/OrderForm'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OrderDetail from './pages/OrderDetail'
import Calculator from './pages/Calculator'
import AdminProducts from './pages/AdminProducts'
import QuoteReview from './pages/QuoteReview'
import ProofReview from './pages/ProofReview'
import ShopProducts from './pages/ShopProducts'
import Downloads from './pages/Downloads'

const admin = (el) => <RequireAdmin>{el}</RequireAdmin>

export default function App() {
  if (missingEnv.length) return <SetupNeeded missing={missingEnv} />
  return (
    <BrowserRouter>
      <Routes>
        {/* Customer-facing */}
        <Route path="/" element={<OrderForm />} />
        <Route path="/order" element={<OrderForm />} />
        <Route path="/quote/:orderId" element={<QuoteReview />} />
        <Route path="/proof/:orderId" element={<ProofReview />} />
        <Route path="/shop" element={<Navigate to="/shop/products" replace />} />
        <Route path="/shop/products" element={<ShopProducts />} />
        <Route path="/downloads/:orderId" element={<Downloads />} />

        {/* Admin */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={admin(<Dashboard />)} />
        <Route path="/dashboard/order/:id" element={admin(<OrderDetail />)} />
        <Route path="/dashboard/calculator" element={admin(<Calculator />)} />
        <Route path="/calculator" element={<Navigate to="/dashboard/calculator" replace />} />
        <Route path="/dashboard/products" element={admin(<AdminProducts />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
