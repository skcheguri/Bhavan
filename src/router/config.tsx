import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Forbidden from "../pages/Forbidden";
import ServerError from "../pages/ServerError";
import Home from "../pages/home/page";
import Listings from "../pages/listings/page";
import ListingDetail from "../pages/listing-detail/page";
import Community from "../pages/community/page";
import About from "../pages/about/page";
import Contact from "../pages/contact/page";
import Login from "../pages/login/page";
import Signup from "../pages/signup/page";
import AuthCallback from "../pages/auth-callback/page";
import ResetPassword from "../pages/reset-password/page";
import ListProperty from "../pages/list-property/page";
import Feedback from "../pages/feedback/page";
import AadhaarVerify from "../pages/aadhaar-verify/page";
import TenantProfile from "../pages/tenant-profile/page";
import OwnerProfile from "../pages/owner-profile/page";
import ScanLanding from "../pages/scan/page";
import HowItWorks from "../pages/how-it-works/page";
import TaxForms from "../pages/tax-forms/page";
import RentReceipts from "../pages/rent-receipts/page";
import RentalAgreements from "../pages/rental-agreements/page";
import Notifications from "../pages/notifications/page";
import SubscriptionPage from "../pages/subscription/page";
import RentPayment from "../pages/rent-payment/page";
import AdminDashboard from "../pages/admin/page";
import AdminBrokerReports from "../pages/admin/broker-reports/page";
import AdminVerification from "../pages/admin/verification/page";
import AdminPropertyVerification from "../pages/admin/property-verification/page";
import AdminCommunity from "../pages/admin/community/page";
import AdminUsers from "../pages/admin/users/page";
import AdminListings from "../pages/admin/listings/page";
import AdminSupport from "../pages/admin/support/page";
import AdminLogin from "../pages/admin/login/page";
import RequireAdmin from "../components/feature/RequireAdmin";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/listings",
    element: <Listings />,
  },
  {
    path: "/listings/:id",
    element: <ListingDetail />,
  },
  {
    path: "/community",
    element: <Community />,
  },
  {
    path: "/about",
    element: <About />,
  },
  {
    path: "/how-it-works",
    element: <HowItWorks />,
  },
  {
    path: "/contact",
    element: <Contact />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/signup",
    element: <Signup />,
  },
  {
    path: "/auth/callback",
    element: <AuthCallback />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  {
    path: "/list-property",
    element: <ListProperty />,
  },
  {
    path: "/feedback",
    element: <Feedback />,
  },
  {
    path: "/aadhaar-verify",
    element: <AadhaarVerify />,
  },
  {
    path: "/tenant-profile",
    element: <TenantProfile />,
  },
  {
    path: "/owner-profile",
    element: <OwnerProfile />,
  },
  {
    path: "/scan/:id",
    element: <ScanLanding />,
  },
  {
    path: "/tax-forms",
    element: <TaxForms />,
  },
  {
    path: "/rent-receipts",
    element: <RentReceipts />,
  },
  {
    path: "/rental-agreements",
    element: <RentalAgreements />,
  },
  {
    path: "/notifications",
    element: <Notifications />,
  },
  {
    path: "/subscription",
    element: <SubscriptionPage />,
  },
  {
    path: "/rent-payment",
    element: <RentPayment />,
  },
  {
    path: "/admin/login",
    element: <AdminLogin />,
  },
  {
    path: "/admin",
    element: <RequireAdmin><AdminDashboard /></RequireAdmin>,
  },
  {
    path: "/admin/broker-reports",
    element: <RequireAdmin><AdminBrokerReports /></RequireAdmin>,
  },
  {
    path: "/admin/verification",
    element: <RequireAdmin><AdminVerification /></RequireAdmin>,
  },
  {
    path: "/admin/property-verification",
    element: <RequireAdmin><AdminPropertyVerification /></RequireAdmin>,
  },
  {
    path: "/admin/community",
    element: <RequireAdmin><AdminCommunity /></RequireAdmin>,
  },
  {
    path: "/admin/users",
    element: <RequireAdmin><AdminUsers /></RequireAdmin>,
  },
  {
    path: "/admin/listings",
    element: <RequireAdmin><AdminListings /></RequireAdmin>,
  },
  {
    path: "/admin/support",
    element: <RequireAdmin><AdminSupport /></RequireAdmin>,
  },
  {
    path: "/403",
    element: <Forbidden />,
  },
  {
    path: "/500",
    element: <ServerError />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;