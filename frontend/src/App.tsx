import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Waitlist from './pages/Waitlist'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import CourtGrid from './pages/CourtGrid'
import Announcements from './pages/Announcements'
import Events from './pages/Events'
import Documents from './pages/Documents'
import PhotoGallery from './pages/PhotoGallery'
import USTATeams from './pages/USTATeams'
import MemberDirectory from './pages/MemberDirectory'
import GuestPasses from './pages/GuestPasses'
import MyDues from './pages/MyDues'
import ClubInfo from './pages/ClubInfo'
import Bylaws from './pages/Bylaws'
import ProShop from './pages/ProShop'
import RoleEmail from './pages/RoleEmail'
import RoleDrive from './pages/RoleDrive'
import Profile from './pages/Profile'
import Friends from './pages/Friends'
import Messages from './pages/Messages'
import InviteResponse from './pages/InviteResponse'
import EventSignup from './pages/EventSignup'
import AdminEventSignups from './pages/admin/AdminEventSignups'
import Admin from './pages/admin/Admin'
import AdminUsers from './pages/admin/AdminUsers'
import AdminSettings from './pages/admin/AdminSettings'
import AdminResets from './pages/admin/AdminResets'
import AdminLog from './pages/admin/AdminLog'
import AdminDues from './pages/admin/AdminDues'
import AdminWaitlist from './pages/admin/AdminWaitlist'
import AdminTestEmail from './pages/admin/AdminTestEmail'
import AdminPermissions from './pages/admin/AdminPermissions'
import AdminFeedback from './pages/admin/AdminFeedback'
import AdminEmailTemplates from './pages/admin/AdminEmailTemplates'
import AdminReceipts from './pages/admin/AdminReceipts'
import AdminBookingDocs from './pages/admin/AdminBookingDocs'
import AdminBookings from './pages/admin/AdminBookings'
import AdminFantasy from './pages/admin/AdminFantasy'
import AdminNotes from './pages/admin/AdminNotes'
import AdminLadder from './pages/admin/AdminLadder'
import TennisLadder from './pages/TennisLadder'
import AdminLiveball from './pages/admin/AdminLiveball'
import AdminBroadcast from './pages/admin/AdminBroadcast'
import AdminBoardMeetings from './pages/admin/AdminBoardMeetings'
import AdminProShop from './pages/admin/AdminProShop'
import AdminBallTracking from './pages/admin/AdminBallTracking'
import AdminTeachingPro from './pages/admin/AdminTeachingPro'
import BoardMeetingResponse from './pages/BoardMeetingResponse'
import LiveballResponse from './pages/LiveballResponse'
import BookingReminderResponse from './pages/BookingReminderResponse'
import Fantasy from './pages/Fantasy'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  if (!user) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicRoute><Home /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/waitlist" element={<Waitlist />} />
      <Route path="/invite/:token/:action" element={<InviteResponse />} />
      <Route path="/board-meeting/:token/:action" element={<BoardMeetingResponse />} />
      <Route path="/liveball/:token/:action" element={<LiveballResponse />} />
      <Route path="/liveball/:token" element={<LiveballResponse />} />
      <Route path="/booking-reminder/:token/:action" element={<BookingReminderResponse />} />
      <Route path="/booking-reminder/:token" element={<BookingReminderResponse />} />
      <Route path="/events/:id/signup" element={<EventSignup />} />

      {/* Member pages */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
      <Route path="/court-grid" element={<Navigate to="/dashboard" replace />} />
      <Route path="/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/photos" element={<ProtectedRoute><PhotoGallery /></ProtectedRoute>} />
      <Route path="/usta-teams" element={<ProtectedRoute><USTATeams /></ProtectedRoute>} />
      <Route path="/directory" element={<ProtectedRoute><MemberDirectory /></ProtectedRoute>} />
      <Route path="/guests" element={<ProtectedRoute><GuestPasses /></ProtectedRoute>} />
      <Route path="/dues" element={<ProtectedRoute><MyDues /></ProtectedRoute>} />
      <Route path="/club-info" element={<ProtectedRoute><ClubInfo /></ProtectedRoute>} />
      <Route path="/bylaws" element={<ProtectedRoute><Bylaws /></ProtectedRoute>} />
      <Route path="/pro-shop" element={<ProtectedRoute><ProShop /></ProtectedRoute>} />
      <Route path="/email" element={<ProtectedRoute><RoleEmail /></ProtectedRoute>} />
      <Route path="/drive" element={<ProtectedRoute><RoleDrive /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
      <Route path="/fantasy" element={<ProtectedRoute><Fantasy /></ProtectedRoute>} />
      <Route path="/ladder" element={<ProtectedRoute><TennisLadder /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/users" replace />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="dues" element={<AdminDues />} />
        <Route path="waitlist" element={<AdminWaitlist />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="resets" element={<AdminResets />} />
        <Route path="events/:id/signups" element={<AdminEventSignups />} />
        <Route path="test-email" element={<AdminTestEmail />} />
        <Route path="log" element={<AdminLog />} />
        <Route path="permissions" element={<AdminPermissions />} />
        <Route path="feedback" element={<AdminFeedback />} />
        <Route path="email-templates" element={<AdminEmailTemplates />} />
        <Route path="receipts" element={<AdminReceipts />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="booking-docs" element={<AdminBookingDocs />} />
        <Route path="fantasy" element={<AdminFantasy />} />
        <Route path="notes" element={<AdminNotes />} />
        <Route path="pro-shop" element={<AdminProShop />} />
        <Route path="ball-tracking" element={<AdminBallTracking />} />
        <Route path="teaching-pro" element={<AdminTeachingPro />} />
        <Route path="ladder" element={<AdminLadder />} />
        <Route path="liveball" element={<AdminLiveball />} />
        <Route path="broadcast" element={<AdminBroadcast />} />
        <Route path="board-meetings" element={<AdminBoardMeetings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
