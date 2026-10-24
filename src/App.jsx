import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAdmin from './components/RequireAdmin'
import { missingEnv } from './lib/supabase'
import SetupNeeded from './pages/SetupNeeded'
import Home from './pages/Home'
import OrderForm from './pages/OrderForm'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OrderDetail from './pages/OrderDetail'
import Calculator from './pages/Calculator'
import Inbox from './pages/Inbox'
import AdminProducts from './pages/AdminProducts'
import QuoteReview from './pages/QuoteReview'
import ProofReview from './pages/ProofReview'
import ShopProducts from './pages/ShopProducts'
import ProductPage from './pages/ProductPage'
import Downloads from './pages/Downloads'
import Partners from './pages/Partners'
import PartnerPage from './pages/PartnerPage'
import ReviewPage from './pages/ReviewPage'
import { PrivacyPage, TermsPage } from './pages/Legal'

const admin = (el) => <RequireAdmin>{el}</RequireAdmin>

export default function App() {
  if (missingEnv.length) return <SetupNeeded missing={missingEnv} />
  return (
    <BrowserRouter>
      <Routes>
        {/* Customer-facing */}
        <Route path="/" element={<Home />} />
        <Route path="/custom" element={<OrderForm />} />
        <Route path="/order" element={<OrderForm />} />
        <Route path="/quote/:orderId" element={<QuoteReview />} />
        <Route path="/proof/:orderId" element={<ProofReview />} />
        <Route path="/shop" element={<Navigate to="/shop/products" replace />} />
        <Route path="/shop/products" element={<ShopProducts />} />
        <Route path="/p/:id" element={<ProductPage />} />
        <Route path="/downloads/:orderId" element={<Downloads />} />
        <Route path="/partner/:token" element={<PartnerPage />} />
        <Route path="/review/:orderId" element={<ReviewPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Admin */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={admin(<Dashboard />)} />
        <Route path="/dashboard/order/:id" element={admin(<OrderDetail />)} />
        <Route path="/dashboard/calculator" element={admin(<Calculator />)} />
        <Route path="/dashboard/inbox" element={admin(<Inbox />)} />
        <Route path="/calculator" element={<Navigate to="/dashboard/calculator" replace />} />
        <Route path="/dashboard/products" element={admin(<AdminProducts />)} />
        <Route path="/dashboard/partners" element={admin(<Partners />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
