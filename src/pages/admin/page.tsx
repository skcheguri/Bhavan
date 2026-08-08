import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminBrokerReports } from '@/hooks/useBrokerReport';
import { useAdminPropertyVerification } from '@/hooks/useAdminPropertyVerification';
import { useAdminSocieties } from '@/hooks/useAdminSocieties';
import { useAdminListingReports } from '@/hooks/useListingReports';
import { useAdminPurgedAccounts } from '@/hooks/useAdminPurgedAccounts';
import { useAdminCommunityModeration } from '@/hooks/useCommunity';
import { useAdminUserStats } from '@/hooks/useAdminUsers';
import { useAdminOverviewCounts } from '@/hooks/useAdminOverview';
import { useAdminContactInquiries } from '@/hooks/useContactInquiries';
import { useAdminErrorLogs } from '@/hooks/useAdminErrorLogs';
import { useErrorRateAlerts } from '@/hooks/useErrorRateAlerts';

interface AdminCard {
  title: string;
  count: number;
  icon: string;
  color: string;
  to: string;
  description: string;
  alertLabel?: string;
}

export default function AdminDashboard() {
  const { reports, activeSoftBlockCount } = useAdminBrokerReports();
  const { requests: propertyVerificationRequests } = useAdminPropertyVerification();
  const { reports: listingReports } = useAdminListingReports();
  const { accounts: purgedAccounts } = useAdminPurgedAccounts();
  const { posts: communityPosts } = useAdminCommunityModeration();
  const { stats: userStats } = useAdminUserStats();
  const { counts: overviewCounts } = useAdminOverviewCounts();
  const { inquiries } = useAdminContactInquiries();
  const { logs: errorLogs } = useAdminErrorLogs();
  const { activeAlerts } = useErrorRateAlerts();
  const [search, setSearch] = useState('');

  const pendingReports = reports.filter((r) => r.status === 'pending').length;
  const pendingPropertyVerifications = propertyVerificationRequests.filter((r) => r.status === 'pending').length;
  const { pendingCount: pendingSocieties } = useAdminSocieties();
  const pendingListingReports = listingReports.filter((r) => r.status === 'pending').length;
  const flaggedPosts = communityPosts.filter((p) => p.report_count > 0 && !p.hidden).length;
  const newInquiries = inquiries.filter((i) => i.status === 'new').length;
  const recentErrors = errorLogs.filter((l) => Date.now() - new Date(l.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;

  const cards: AdminCard[] = [
    {
      title: 'User Management',
      count: userStats?.suspendedCount ?? 0,
      icon: 'ri-user-settings-line',
      color: 'bg-charcoal/10 text-charcoal',
      to: '/admin/users',
      description: 'Search accounts, review verification status, suspend or reactivate users.',
    },
    {
      title: 'Listings Oversight',
      count: 0,
      icon: 'ri-home-gear-line',
      color: 'bg-teal-50 text-teal-600',
      to: '/admin/listings',
      description: 'Search every listing on the platform and take down policy violations.',
    },
    {
      title: 'Support Inquiries',
      count: newInquiries,
      icon: 'ri-mail-line',
      color: 'bg-indigo-50 text-indigo-600',
      to: '/admin/support',
      description: 'Messages submitted through the public Contact Us form.',
    },
    {
      title: 'Error Logs',
      count: recentErrors,
      icon: 'ri-bug-line',
      color: 'bg-rose-50 text-rose-600',
      to: '/admin/errors',
      description: 'Crashes and uncaught errors reported by real browser sessions in the last 7 days.',
      // Distinguish the two, since they need different responses: an
      // error spike means look at stack traces, a stalled job means look
      // at pg_cron (see INCIDENT_RESPONSE.md).
      alertLabel: activeAlerts.length === 0
        ? undefined
        : activeAlerts.some((a) => a.kind === 'cron_stalled')
          ? 'Job stopped'
          : 'Error spike',
    },
    {
      title: 'Broker Reports',
      count: pendingReports,
      icon: 'ri-flag-2-line',
      color: 'bg-red-50 text-red-600',
      to: '/admin/broker-reports',
      description: 'Review and resolve flagged broker reports from landlords.',
    },
    {
      title: 'Aadhaar Verification',
      count: 0,
      icon: 'ri-shield-user-line',
      color: 'bg-amber-50 text-amber-600',
      to: '/admin/verification',
      description: 'Audit log of automated Aadhaar e-KYC attempts (auto-verified via provider, no action needed).',
    },
    {
      title: 'Property Verification',
      count: pendingPropertyVerifications,
      icon: 'ri-file-shield-2-line',
      color: 'bg-green-50 text-green-600',
      to: '/admin/property-verification',
      description: 'Review ownership documents submitted by landlords.',
    },
    {
      title: 'Society Approvals',
      count: pendingSocieties,
      icon: 'ri-building-2-line',
      color: 'bg-blue-50 text-blue-600',
      to: '/admin/societies',
      description: 'Apartment complexes and villa communities awaiting review before their join code goes live.',
    },
    {
      title: 'Listing Reports',
      count: pendingListingReports,
      icon: 'ri-flag-2-line',
      color: 'bg-orange-50 text-orange-600',
      to: '/admin/listing-reports',
      description: 'Tenant-flagged listings — mismatched photos, inaccurate details, or unavailable properties.',
    },
    {
      title: 'Purged Accounts',
      count: purgedAccounts.length,
      icon: 'ri-delete-bin-line',
      color: 'bg-lightgray text-charcoal/60',
      to: '/admin/purged-accounts',
      description: 'Record of unconfirmed signups auto-removed after 30 days by the daily cleanup job.',
    },
    {
      title: 'Community Moderation',
      count: flaggedPosts,
      icon: 'ri-discuss-line',
      color: 'bg-blue-50 text-blue-600',
      to: '/admin/community',
      description: 'Moderate community posts and comments flagged by users.',
    },
    {
      title: 'Soft Blocks',
      count: activeSoftBlockCount,
      icon: 'ri-lock-line',
      color: 'bg-purple-50 text-purple-600',
      to: '/admin/broker-reports',
      description: 'View and manage active account restrictions.',
    },
    {
      title: 'Security',
      count: 0,
      icon: 'ri-shield-keyhole-line',
      color: 'bg-emerald-50 text-emerald-600',
      to: '/admin/security',
      description: 'Manage your two-factor authenticator device.',
    },
  ];

  const overviewStats = [
    { label: 'Total Users', value: userStats?.totalUsers, icon: 'ri-group-line' },
    { label: 'Tenants', value: userStats?.totalTenants, icon: 'ri-user-line' },
    { label: 'Owners', value: userStats?.totalOwners, icon: 'ri-home-line' },
    { label: 'Active Listings', value: overviewCounts?.activeListings, icon: 'ri-building-line' },
    { label: 'Total Listings', value: overviewCounts?.totalListings, icon: 'ri-list-check-2' },
  ];

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600">Admin</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Admin Dashboard</h1>
            <p className="text-sm text-charcoal/60 mt-1">Platform overview, trust & safety, and content moderation.</p>
          </div>
          <div className="relative">
            <div className="w-5 h-5 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2">
              <i className="ri-search-line text-charcoal/40 text-sm" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search across all admin sections..."
              className="w-full sm:w-72 pl-10 pr-4 py-2.5 bg-white rounded-full border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        </div>

        {/* Platform overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-black/5 p-4">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-lightgray mb-2">
                <i className={`${stat.icon} text-charcoal/60 text-sm`} />
              </div>
              <p className="text-xl font-bold text-charcoal">{stat.value ?? '—'}</p>
              <p className="text-[11px] text-charcoal/60 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Sections */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards
            .filter((card) => card.title.toLowerCase().includes(search.toLowerCase()) || search === '')
            .map((card) => (
              <Link
                key={card.title}
                to={card.to}
                className="bg-white rounded-3xl border border-black/5 p-5 hover:border-amber-200 transition group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${card.color}`}>
                    <i className={`${card.icon} text-lg`} />
                  </div>
                  {card.alertLabel ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                      {card.alertLabel}
                    </span>
                  ) : (
                    card.count > 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                        {card.count} pending
                      </span>
                    )
                  )}
                </div>
                <h3 className="text-sm font-bold text-charcoal mb-1">{card.title}</h3>
                <p className="text-xs text-charcoal/60 leading-relaxed">{card.description}</p>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
