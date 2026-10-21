export interface InsuranceKpiData {
  totalPolicyholders: number;
  policyholdersTrend: string;
  activePolicies: number;
  activePoliciesTrend: string;
  pendingQuotes: number;
  quotesTrend: string;
  openClaims: number;
  claimsTrend: string;
  upcomingRenewals: number;
  renewalsTrend: string;
  premiumCollected: number;
  premiumTrend: string;
}

export interface MonthlyCollectionData {
  month: string;
  premiumCollected: number;
  target: number;
}

export interface PolicyTypeDistribution {
  name: string;
  percentage: number;
  count: number;
  color: string;
}

export interface ClaimStatusDistribution {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

export interface UpcomingRenewalItem {
  id: string;
  policyNumber: string;
  policyholder: string;
  insuranceType: string;
  renewalDate: string;
  premiumAmount: number;
  assignedAgent: string;
  agentInitials: string;
  agentAvatarBg?: string;
  status: 'Due Soon' | 'Pending' | 'Active' | 'Overdue';
}

export interface AgentPerformanceItem {
  id: string;
  name: string;
  initials: string;
  avatarBg?: string;
  policiesSold: number;
  premium: number;
  renewals: number;
  openTasks: number;
}

export interface RecentPolicyholderItem {
  id: string;
  name: string;
  initials: string;
  avatarBg?: string;
  email: string;
  phone: string;
  insuranceInterest: string;
  assignedAgent: string;
  agentInitials: string;
  createdAt: string;
}

export interface InsuranceTaskItem {
  id: string;
  title: string;
  type: 'Call' | 'Email' | 'Claim' | 'Document' | 'Meeting';
  relatedTo: string;
  dueDate: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
}

export interface RecentClaimItem {
  id: string;
  claimNumber: string;
  policyholder: string;
  type: string;
  amount: number;
  status: 'Under Review' | 'Approved' | 'Submitted' | 'Settled' | 'Rejected';
}

export const initialInsuranceKpis: InsuranceKpiData = {
  totalPolicyholders: 1248,
  policyholdersTrend: '↑ 12% vs last month',
  activePolicies: 986,
  activePoliciesTrend: '↑ 8% vs last month',
  pendingQuotes: 132,
  quotesTrend: '↑ 15% vs last month',
  openClaims: 48,
  claimsTrend: '↓ 20% vs last month',
  upcomingRenewals: 210,
  renewalsTrend: '↑ 18% next 30 days',
  premiumCollected: 2480000,
  premiumTrend: '↑ 25% vs last month',
};

export const monthlyCollectionData: MonthlyCollectionData[] = [
  { month: 'Jan', premiumCollected: 180000, target: 200000 },
  { month: 'Feb', premiumCollected: 240000, target: 250000 },
  { month: 'Mar', premiumCollected: 310000, target: 300000 },
  { month: 'Apr', premiumCollected: 420000, target: 380000 },
  { month: 'May', premiumCollected: 390000, target: 420000 },
  { month: 'Jun', premiumCollected: 480000, target: 460000 },
  { month: 'Jul', premiumCollected: 520000, target: 510000 },
  { month: 'Aug', premiumCollected: 580000, target: 550000 },
  { month: 'Sep', premiumCollected: 640000, target: 600000 },
  { month: 'Oct', premiumCollected: 690000, target: 650000 },
  { month: 'Nov', premiumCollected: 720000, target: 700000 },
  { month: 'Dec', premiumCollected: 780000, target: 720000 },
];

export const policiesByTypeData: PolicyTypeDistribution[] = [
  { name: 'Health Insurance', percentage: 32, count: 316, color: '#7C3AED' },
  { name: 'Life Insurance', percentage: 24, count: 237, color: '#0D9488' },
  { name: 'Motor Insurance', percentage: 18, count: 178, color: '#0284C7' },
  { name: 'Property Insurance', percentage: 12, count: 120, color: '#F59E0B' },
  { name: 'Travel Insurance', percentage: 8, count: 79, color: '#F43F5E' },
  { name: 'Other', percentage: 6, count: 56, color: '#94A3B8' },
];

export const claimsOverviewData: ClaimStatusDistribution[] = [
  { status: 'Submitted', count: 10, percentage: 21, color: '#0D9488' },
  { status: 'Under Review', count: 14, percentage: 29, color: '#38BDF8' },
  { status: 'Approved', count: 8, percentage: 17, color: '#10B981' },
  { status: 'Rejected', count: 4, percentage: 8, color: '#EF4444' },
  { status: 'Settled', count: 12, percentage: 25, color: '#6366F1' },
];

export const upcomingRenewalsList: UpcomingRenewalItem[] = [
  {
    id: 'ren-1',
    policyNumber: 'POL-2024-001',
    policyholder: 'Rahul Kumar',
    insuranceType: 'Health Insurance',
    renewalDate: 'Oct 28, 2026',
    premiumAmount: 25000,
    assignedAgent: 'Ananya Roy',
    agentInitials: 'AR',
    agentAvatarBg: '#dbeafe',
    status: 'Due Soon',
  },
  {
    id: 'ren-2',
    policyNumber: 'POL-2024-002',
    policyholder: 'Priya Sharma',
    insuranceType: 'Life Insurance',
    renewalDate: 'Nov 02, 2026',
    premiumAmount: 48000,
    assignedAgent: 'Karthik Verma',
    agentInitials: 'KV',
    agentAvatarBg: '#fef3c7',
    status: 'Pending',
  },
  {
    id: 'ren-3',
    policyNumber: 'POL-2024-003',
    policyholder: 'Arjun Reddy',
    insuranceType: 'Motor Insurance',
    renewalDate: 'Nov 05, 2026',
    premiumAmount: 18500,
    assignedAgent: 'Sneha Nair',
    agentInitials: 'SN',
    agentAvatarBg: '#e0e7ff',
    status: 'Due Soon',
  },
  {
    id: 'ren-4',
    policyNumber: 'POL-2024-004',
    policyholder: 'Neha Patel',
    insuranceType: 'Property Insurance',
    renewalDate: 'Nov 12, 2026',
    premiumAmount: 32000,
    assignedAgent: 'Vikram Singh',
    agentInitials: 'VS',
    agentAvatarBg: '#d1fae5',
    status: 'Active',
  },
  {
    id: 'ren-5',
    policyNumber: 'POL-2024-005',
    policyholder: 'Suresh Babu',
    insuranceType: 'Health Insurance',
    renewalDate: 'Nov 15, 2026',
    premiumAmount: 28000,
    assignedAgent: 'Rohan Kapoor',
    agentInitials: 'RK',
    agentAvatarBg: '#fee2e2',
    status: 'Overdue',
  },
];

export const agentPerformanceList: AgentPerformanceItem[] = [
  {
    id: 'ag-1',
    name: 'Ananya Roy',
    initials: 'AR',
    avatarBg: '#dbeafe',
    policiesSold: 28,
    premium: 640000,
    renewals: 12,
    openTasks: 8,
  },
  {
    id: 'ag-2',
    name: 'Karthik Verma',
    initials: 'KV',
    avatarBg: '#fef3c7',
    policiesSold: 24,
    premium: 580000,
    renewals: 10,
    openTasks: 6,
  },
  {
    id: 'ag-3',
    name: 'Sneha Nair',
    initials: 'SN',
    avatarBg: '#e0e7ff',
    policiesSold: 18,
    premium: 420000,
    renewals: 8,
    openTasks: 5,
  },
  {
    id: 'ag-4',
    name: 'Vikram Singh',
    initials: 'VS',
    avatarBg: '#d1fae5',
    policiesSold: 16,
    premium: 390000,
    renewals: 7,
    openTasks: 4,
  },
  {
    id: 'ag-5',
    name: 'Rohan Kapoor',
    initials: 'RK',
    avatarBg: '#fee2e2',
    policiesSold: 12,
    premium: 280000,
    renewals: 6,
    openTasks: 3,
  },
];

export const recentPolicyholdersList: RecentPolicyholderItem[] = [
  {
    id: 'ph-1',
    name: 'Rahul Kumar',
    initials: 'RK',
    avatarBg: '#dbeafe',
    email: 'rahul@gmail.com',
    phone: '9876543210',
    insuranceInterest: 'Health',
    assignedAgent: 'Ananya Roy',
    agentInitials: 'AR',
    createdAt: '15 Oct 2026',
  },
  {
    id: 'ph-2',
    name: 'Priya Sharma',
    initials: 'PS',
    avatarBg: '#fef3c7',
    email: 'priya@gmail.com',
    phone: '9123456780',
    insuranceInterest: 'Life',
    assignedAgent: 'Karthik Verma',
    agentInitials: 'KV',
    createdAt: '14 Oct 2026',
  },
  {
    id: 'ph-3',
    name: 'Arjun Reddy',
    initials: 'AR',
    avatarBg: '#e0e7ff',
    email: 'arjun@gmail.com',
    phone: '9988776655',
    insuranceInterest: 'Motor',
    assignedAgent: 'Sneha Nair',
    agentInitials: 'SN',
    createdAt: '13 Oct 2026',
  },
  {
    id: 'ph-4',
    name: 'Neha Patel',
    initials: 'NP',
    avatarBg: '#d1fae5',
    email: 'neha@gmail.com',
    phone: '9012345678',
    insuranceInterest: 'Property',
    assignedAgent: 'Vikram Singh',
    agentInitials: 'VS',
    createdAt: '12 Oct 2026',
  },
  {
    id: 'ph-5',
    name: 'Suresh Babu',
    initials: 'SB',
    avatarBg: '#fee2e2',
    email: 'suresh@gmail.com',
    phone: '8899776655',
    insuranceInterest: 'Health',
    assignedAgent: 'Rohan Kapoor',
    agentInitials: 'RK',
    createdAt: '11 Oct 2026',
  },
];

export const insuranceTasksList: InsuranceTaskItem[] = [
  {
    id: 'task-1',
    title: 'Call for renewal',
    type: 'Call',
    relatedTo: 'Rahul Kumar',
    dueDate: 'Oct 28, 2026',
    status: 'Pending',
  },
  {
    id: 'task-2',
    title: 'Send quote details',
    type: 'Email',
    relatedTo: 'Priya Sharma',
    dueDate: 'Oct 25, 2026',
    status: 'In Progress',
  },
  {
    id: 'task-3',
    title: 'Follow up on claim',
    type: 'Claim',
    relatedTo: 'Claim #CL-102',
    dueDate: 'Oct 24, 2026',
    status: 'Pending',
  },
  {
    id: 'task-4',
    title: 'Policy document collection',
    type: 'Document',
    relatedTo: 'Neha Patel',
    dueDate: 'Oct 22, 2026',
    status: 'Completed',
  },
  {
    id: 'task-5',
    title: 'Discuss family plan',
    type: 'Meeting',
    relatedTo: 'Arjun Reddy',
    dueDate: 'Oct 21, 2026',
    status: 'Pending',
  },
];

export const recentClaimsList: RecentClaimItem[] = [
  {
    id: 'cl-1',
    claimNumber: 'CL-102',
    policyholder: 'Rahul Kumar',
    type: 'Health',
    amount: 45000,
    status: 'Under Review',
  },
  {
    id: 'cl-2',
    claimNumber: 'CL-101',
    policyholder: 'Priya Sharma',
    type: 'Motor',
    amount: 28000,
    status: 'Approved',
  },
  {
    id: 'cl-3',
    claimNumber: 'CL-100',
    policyholder: 'Neha Patel',
    type: 'Property',
    amount: 125000,
    status: 'Submitted',
  },
  {
    id: 'cl-4',
    claimNumber: 'CL-099',
    policyholder: 'Arjun Reddy',
    type: 'Health',
    amount: 32000,
    status: 'Settled',
  },
  {
    id: 'cl-5',
    claimNumber: 'CL-098',
    policyholder: 'Suresh Babu',
    type: 'Life',
    amount: 75000,
    status: 'Rejected',
  },
];
