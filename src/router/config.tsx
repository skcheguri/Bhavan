import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import Home from "../pages/home/page";
import Login from "../pages/login/page";
import Signup from "../pages/signup/page";
import RequireAdmin from "../components/feature/RequireAdmin";

// Everything below is lazy-loaded per route -- Home/Login/Signup stay
// eager since they're the most common entry points and lazy-loading them
// would just add a Suspense round-trip on the page most visitors land on
// first. Every other route was bundled into one ~1.3MB JS file with no
// splitting at all; this puts each route (and each admin page, which most
// visitors never touch) in its own chunk instead.
const NotFound = lazy(() => import("../pages/NotFound"));
const Forbidden = lazy(() => import("../pages/Forbidden"));
const ServerError = lazy(() => import("../pages/ServerError"));
const Listings = lazy(() => import("../pages/listings/page"));
const ListingDetail = lazy(() => import("../pages/listing-detail/page"));
const Community = lazy(() => import("../pages/community/page"));
const About = lazy(() => import("../pages/about/page"));
const Contact = lazy(() => import("../pages/contact/page"));
const AuthCallback = lazy(() => import("../pages/auth-callback/page"));
const ResetPassword = lazy(() => import("../pages/reset-password/page"));
const ListProperty = lazy(() => import("../pages/list-property/page"));
const Feedback = lazy(() => import("../pages/feedback/page"));
const AadhaarVerify = lazy(() => import("../pages/aadhaar-verify/page"));
const TenantProfile = lazy(() => import("../pages/tenant-profile/page"));
const OwnerProfile = lazy(() => import("../pages/owner-profile/page"));
const ScanLanding = lazy(() => import("../pages/scan/page"));
const HowItWorks = lazy(() => import("../pages/how-it-works/page"));
const Terms = lazy(() => import("../pages/terms/page"));
const Privacy = lazy(() => import("../pages/privacy/page"));
const Cookies = lazy(() => import("../pages/cookies/page"));
const Accessibility = lazy(() => import("../pages/accessibility/page"));
const TaxForms = lazy(() => import("../pages/tax-forms/page"));
const RentReceipts = lazy(() => import("../pages/rent-receipts/page"));
const RentalAgreements = lazy(() => import("../pages/rental-agreements/page"));
const Notifications = lazy(() => import("../pages/notifications/page"));
const SubscriptionPage = lazy(() => import("../pages/subscription/page"));
const RentPayment = lazy(() => import("../pages/rent-payment/page"));
const AdminDashboard = lazy(() => import("../pages/admin/page"));
const AdminBrokerReports = lazy(() => import("../pages/admin/broker-reports/page"));
const AdminVerification = lazy(() => import("../pages/admin/verification/page"));
const AdminPropertyVerification = lazy(() => import("../pages/admin/property-verification/page"));
const AdminListingReports = lazy(() => import("../pages/admin/listing-reports/page"));
const AdminPurgedAccounts = lazy(() => import("../pages/admin/purged-accounts/page"));
const AdminCommunity = lazy(() => import("../pages/admin/community/page"));
const AdminUsers = lazy(() => import("../pages/admin/users/page"));
const AdminListings = lazy(() => import("../pages/admin/listings/page"));
const AdminSupport = lazy(() => import("../pages/admin/support/page"));
const AdminErrors = lazy(() => import("../pages/admin/errors/page"));
const AdminLogin = lazy(() => import("../pages/admin/login/page"));
const AdminMfaSetup = lazy(() => import("../pages/admin/mfa-setup/page"));
const AdminMfaChallenge = lazy(() => import("../pages/admin/mfa-challenge/page"));
const AdminSecurity = lazy(() => import("../pages/admin/security/page"));

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
    path: "/terms",
    element: <Terms />,
  },
  {
    path: "/privacy",
    element: <Privacy />,
  },
  {
    path: "/cookies",
    element: <Cookies />,
  },
  {
    path: "/accessibility",
    element: <Accessibility />,
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
    path: "/admin/mfa-setup",
    element: <AdminMfaSetup />,
  },
  {
    path: "/admin/mfa-challenge",
    element: <AdminMfaChallenge />,
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
    path: "/admin/listing-reports",
    element: <RequireAdmin><AdminListingReports /></RequireAdmin>,
  },
  {
    path: "/admin/purged-accounts",
    element: <RequireAdmin><AdminPurgedAccounts /></RequireAdmin>,
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
    path: "/admin/errors",
    element: <RequireAdmin><AdminErrors /></RequireAdmin>,
  },
  {
    path: "/admin/security",
    element: <RequireAdmin><AdminSecurity /></RequireAdmin>,
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
