/**
 * SCuilONE Import & Export Module Configurations
 * Defines module-specific field mappings, validation rules, export transformations,
 * sample template rows, and existing create API handlers.
 */

import { ImportFieldConfig } from '../services/importExportService';
import { createLead } from '../services/leadService';
import { createContact } from '../services/contactService';
import { createAccount } from '../services/accountService';
import { createDeal } from '../services/dealService';
import { createActivity } from '../services/activityService';
import { createBuyerRequirement } from '../services/buyerRequirementService';
import { createSoftwareProject } from '../services/softwareProjectService';
import { createSoftwareRequirement } from '../services/softwareRequirementService';
import { createSoftwareEstimate } from '../services/softwareEstimateService';
import { createSoftwareContract } from '../services/softwareContractService';
import { createSoftwareSprint } from '../services/softwareSprintService';
import { createSoftwareInvoice } from '../services/softwareInvoiceService';
import { createUser } from '../services/userService';

export interface ModuleImportExportConfig {
  moduleId: string;
  moduleName: string;
  supportsImport: boolean;
  supportsExport: boolean;
  fields: ImportFieldConfig[];
  sampleRows?: Record<string, any>[];
  createHandler?: (record: Record<string, any>) => Promise<any>;
}

export const MODULE_CONFIGS: Record<string, ModuleImportExportConfig> = {
  /* ─── Sales & CRM ─── */
  leads: {
    moduleId: 'leads',
    moduleName: 'Leads',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'first_name', label: 'First Name', aliases: ['Firstname', 'First_Name', 'FName'], required: true, type: 'string', sampleValue: 'John' },
      { key: 'last_name', label: 'Last Name', aliases: ['Lastname', 'Last_Name', 'LName'], required: true, type: 'string', sampleValue: 'Doe' },
      { key: 'email', label: 'Email Address', aliases: ['Email', 'EmailAddress', 'E-mail'], required: true, type: 'email', sampleValue: 'john.doe@example.com' },
      { key: 'phone', label: 'Phone Number', aliases: ['Phone', 'Mobile', 'Tel'], type: 'string', sampleValue: '+1-555-0199' },
      { key: 'company', label: 'Company Name', aliases: ['Company', 'Organization'], type: 'string', sampleValue: 'Acme Technologies' },
      { key: 'status', label: 'Status', aliases: ['LeadStatus'], type: 'select', options: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'], sampleValue: 'New' },
      { key: 'source', label: 'Lead Source', aliases: ['Source'], type: 'string', sampleValue: 'Website' },
      { key: 'notes', label: 'Notes', aliases: ['Description', 'Comment'], type: 'string', sampleValue: 'Interested in cloud migration and SaaS licensing.' },
    ],
    sampleRows: [
      {
        first_name: 'Sarah',
        last_name: 'Connor',
        email: 'sarah.connor@cyberdyne.com',
        phone: '+1-555-0144',
        company: 'Cyberdyne Systems',
        status: 'Qualified',
        source: 'Referral',
        notes: 'Enterprise customer reviewing delivery timelines.',
      },
      {
        first_name: 'David',
        last_name: 'Miller',
        email: 'd.miller@apexlogic.io',
        phone: '+1-555-0182',
        company: 'Apex Logic',
        status: 'New',
        source: 'Organic Search',
        notes: 'Requested product demo for next sprint.',
      },
    ],
    createHandler: async (item) => createLead(item as any),
  },

  contacts: {
    moduleId: 'contacts',
    moduleName: 'Contacts',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'first_name', label: 'First Name', aliases: ['Firstname', 'FName'], required: true, type: 'string', sampleValue: 'Jane' },
      { key: 'last_name', label: 'Last Name', aliases: ['Lastname', 'LName'], required: true, type: 'string', sampleValue: 'Smith' },
      { key: 'email', label: 'Email', aliases: ['EmailAddress', 'E-mail'], required: true, type: 'email', sampleValue: 'jane.smith@example.com' },
      { key: 'phone', label: 'Phone', aliases: ['Mobile', 'Telephone'], type: 'string', sampleValue: '+1-555-0177' },
      { key: 'job_title', label: 'Job Title', aliases: ['Title', 'Role', 'Position'], type: 'string', sampleValue: 'Director of Engineering' },
      { key: 'department', label: 'Department', aliases: ['Dept'], type: 'string', sampleValue: 'Information Technology' },
    ],
    sampleRows: [
      {
        first_name: 'Michael',
        last_name: 'Chang',
        email: 'm.chang@innovate.org',
        phone: '+1-555-0128',
        job_title: 'Chief Information Officer',
        department: 'Executive',
      },
    ],
    createHandler: async (item) => createContact(item as any),
  },

  accounts: {
    moduleId: 'accounts',
    moduleName: 'Accounts',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'name', label: 'Account Name', aliases: ['Company', 'Account', 'Client'], required: true, type: 'string', sampleValue: 'Global Logistics Corp' },
      { key: 'industry', label: 'Industry', aliases: ['Sector'], type: 'string', sampleValue: 'Transportation & Logistics' },
      { key: 'website', label: 'Website', aliases: ['URL', 'Domain'], type: 'string', sampleValue: 'https://globallogistics.example.com' },
      { key: 'phone', label: 'Office Phone', aliases: ['Phone', 'Tel'], type: 'string', sampleValue: '+1-800-555-0199' },
      { key: 'email', label: 'General Email', aliases: ['Email'], type: 'email', sampleValue: 'contact@globallogistics.example.com' },
      { key: 'annual_revenue', label: 'Annual Revenue', aliases: ['Revenue'], type: 'number', sampleValue: 5000000 },
      { key: 'city', label: 'City', type: 'string', sampleValue: 'Seattle' },
      { key: 'country', label: 'Country', type: 'string', sampleValue: 'United States' },
    ],
    sampleRows: [
      {
        name: 'Horizon Software Labs',
        industry: 'Software & Technology',
        website: 'https://horizonlabs.io',
        phone: '+1-555-0166',
        email: 'procurement@horizonlabs.io',
        annual_revenue: 2500000,
        city: 'Austin',
        country: 'United States',
      },
    ],
    createHandler: async (item) => createAccount(item as any),
  },

  deals: {
    moduleId: 'deals',
    moduleName: 'Deals & Opportunities',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Deal Title', aliases: ['Title', 'Opportunity', 'DealName'], required: true, type: 'string', sampleValue: 'Cloud Infrastructure Migration' },
      { key: 'amount', label: 'Amount', aliases: ['DealValue', 'Value', 'Budget'], required: true, type: 'number', sampleValue: 125000 },
      { key: 'currency', label: 'Currency', aliases: ['Curr'], type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'stage', label: 'Stage', aliases: ['DealStage', 'Status'], type: 'select', options: ['Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'], sampleValue: 'Proposal' },
      { key: 'probability', label: 'Probability (%)', aliases: ['Probability'], type: 'number', sampleValue: 70 },
      { key: 'expected_close_date', label: 'Expected Close Date', aliases: ['CloseDate', 'TargetDate'], type: 'date', sampleValue: '2026-12-15' },
      { key: 'description', label: 'Description', aliases: ['Notes'], type: 'string', sampleValue: 'Full migration of on-prem services to Kubernetes.' },
    ],
    sampleRows: [
      {
        title: 'Mobile Banking App Redesign',
        amount: 85000,
        currency: 'USD',
        stage: 'Negotiation',
        probability: 80,
        expected_close_date: '2026-12-31',
        description: 'iOS & Android frontend revamp with biometric authentication.',
      },
    ],
    createHandler: async (item) => createDeal(item as any),
  },

  activities: {
    moduleId: 'activities',
    moduleName: 'Activities',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Activity Title', aliases: ['Subject', 'Title'], required: true, type: 'string', sampleValue: 'Client Kickoff Call' },
      { key: 'type', label: 'Activity Type', aliases: ['Type'], type: 'select', options: ['Meeting', 'Call', 'Email', 'Task', 'Note'], sampleValue: 'Meeting' },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'In Progress', 'Completed', 'Cancelled'], sampleValue: 'Pending' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'], sampleValue: 'Medium' },
      { key: 'due_date', label: 'Due Date', aliases: ['Date', 'DueDate'], type: 'date', sampleValue: '2026-11-20' },
      { key: 'description', label: 'Description', aliases: ['Details', 'Notes'], type: 'string', sampleValue: 'Review project scope and confirm milestones.' },
    ],
    sampleRows: [
      {
        title: 'Follow-up on Architecture Proposal',
        type: 'Call',
        status: 'Pending',
        priority: 'High',
        due_date: '2026-11-18',
        description: 'Discuss security compliance and AWS tenancy configuration.',
      },
    ],
    createHandler: async (item) => createActivity(item as any),
  },

  tasks: {
    moduleId: 'tasks',
    moduleName: 'Tasks',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Task Title', aliases: ['Subject', 'Title', 'Task'], required: true, type: 'string', sampleValue: 'Prepare Sprint 4 Backlog' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'], sampleValue: 'High' },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'In Progress', 'Completed'], sampleValue: 'Pending' },
      { key: 'due_date', label: 'Due Date', aliases: ['DueDate', 'Date'], type: 'date', sampleValue: '2026-11-25' },
      { key: 'description', label: 'Description', aliases: ['Details', 'Notes'], type: 'string', sampleValue: 'Refine user stories with product owner.' },
    ],
    sampleRows: [
      {
        title: 'Verify SSL Certificate Expiration',
        priority: 'Urgent',
        status: 'Pending',
        due_date: '2026-11-15',
        description: 'Renew certificates for staging and production web clusters.',
      },
    ],
    createHandler: async (item) =>
      createActivity({ ...item, is_task: true, type: 'Task' } as any),
  },

  'buyer-requirements': {
    moduleId: 'buyer-requirements',
    moduleName: 'Buyer Requirements',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Requirement Title', aliases: ['Title', 'Requirement'], required: true, type: 'string', sampleValue: 'Luxury 3BHK Penthouse in City Center' },
      { key: 'location', label: 'Target Location', aliases: ['Location', 'City'], type: 'string', sampleValue: 'Downtown Financial District' },
      { key: 'property_type', label: 'Property Type', aliases: ['Type'], type: 'string', sampleValue: 'Apartment' },
      { key: 'min_budget', label: 'Min Budget', type: 'number', sampleValue: 800000 },
      { key: 'max_budget', label: 'Max Budget', type: 'number', sampleValue: 1200000 },
      { key: 'bedrooms', label: 'Bedrooms', aliases: ['Beds', 'BHK'], type: 'number', sampleValue: 3 },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Fulfilled', 'Archived'], sampleValue: 'Active' },
      { key: 'notes', label: 'Client Notes', type: 'string', sampleValue: 'Must have dedicated parking and skyline views.' },
    ],
    sampleRows: [
      {
        title: 'Commercial Office Space 5000 sqft',
        location: 'Tech Park Area',
        property_type: 'Commercial Office',
        min_budget: 1500000,
        max_budget: 2000000,
        bedrooms: 0,
        status: 'Active',
        notes: 'Requires 24/7 power backup and fiber optic connectivity.',
      },
    ],
    createHandler: async (item) => createBuyerRequirement(item as any),
  },

  /* ─── Software Delivery ─── */
  'software-projects': {
    moduleId: 'software-projects',
    moduleName: 'Software Projects',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'name', label: 'Project Name', aliases: ['Title', 'Name'], required: true, type: 'string', sampleValue: 'E-Commerce Platform Modernization' },
      { key: 'project_number', label: 'Project #', aliases: ['Code', 'ProjectNumber'], type: 'string', sampleValue: 'PRJ-2026-001' },
      { key: 'status', label: 'Status', type: 'select', options: ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'], sampleValue: 'In Progress' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'], sampleValue: 'High' },
      { key: 'budget', label: 'Total Budget', type: 'number', sampleValue: 150000 },
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'start_date', label: 'Start Date', type: 'date', sampleValue: '2026-10-01' },
      { key: 'target_end_date', label: 'Target End Date', aliases: ['EndDate'], type: 'date', sampleValue: '2027-03-31' },
      { key: 'description', label: 'Description', type: 'string', sampleValue: 'Full-stack microservices refactor with React storefront.' },
    ],
    sampleRows: [
      {
        name: 'Healthcare Patient Portal',
        project_number: 'PRJ-2026-002',
        status: 'Planning',
        priority: 'Urgent',
        budget: 95000,
        currency: 'USD',
        start_date: '2026-11-15',
        target_end_date: '2027-04-30',
        description: 'HIPAA-compliant telehealth consultation web application.',
      },
    ],
    createHandler: async (item) => createSoftwareProject(item as any),
  },

  'software-requirements': {
    moduleId: 'software-requirements',
    moduleName: 'Software Requirements',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Requirement Title', aliases: ['Title', 'Requirement'], required: true, type: 'string', sampleValue: 'OAuth2 Single Sign-On Integration' },
      { key: 'software_type', label: 'Software Type', aliases: ['Type'], type: 'string', sampleValue: 'Web Application' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'], sampleValue: 'High' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Analysis', 'Approved', 'In Development', 'Completed', 'Rejected'], sampleValue: 'Approved' },
      { key: 'min_budget', label: 'Min Budget', type: 'number', sampleValue: 10000 },
      { key: 'max_budget', label: 'Max Budget', type: 'number', sampleValue: 20000 },
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'target_date', label: 'Target Date', type: 'date', sampleValue: '2026-12-20' },
      { key: 'description', label: 'Description', type: 'string', sampleValue: 'Support Google, Microsoft, and SAML identity providers.' },
    ],
    sampleRows: [
      {
        title: 'Payment Gateway Webhook Architecture',
        software_type: 'Backend Microservice',
        priority: 'Critical',
        status: 'Approved',
        min_budget: 15000,
        max_budget: 25000,
        currency: 'USD',
        target_date: '2026-12-10',
        description: 'Idempotent event processing with signature verification.',
      },
    ],
    createHandler: async (item) => createSoftwareRequirement(item as any),
  },

  'software-estimates': {
    moduleId: 'software-estimates',
    moduleName: 'Software Estimates',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Estimate Title', aliases: ['Title', 'Proposal'], required: true, type: 'string', sampleValue: 'DevOps CI/CD Automation Proposal' },
      { key: 'billing_type', label: 'Billing Type', aliases: ['BillingModel'], type: 'select', options: ['Fixed Price', 'Time & Material'], sampleValue: 'Fixed Price' },
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'hourly_rate', label: 'Hourly Rate', type: 'number', sampleValue: 120 },
      { key: 'estimated_hours', label: 'Estimated Hours', type: 'number', sampleValue: 80 },
      { key: 'issue_date', label: 'Issue Date', type: 'date', sampleValue: '2026-11-01' },
      { key: 'expiry_date', label: 'Valid Until (Expiry Date)', aliases: ['ExpiryDate'], type: 'date', sampleValue: '2026-12-01' },
      { key: 'description', label: 'Scope of Work', aliases: ['Description', 'Notes'], type: 'string', sampleValue: 'GitHub Actions setup with container scanning and multi-region deployment.' },
    ],
    sampleRows: [
      {
        title: 'AI Customer Support Bot Implementation',
        billing_type: 'Fixed Price',
        currency: 'USD',
        hourly_rate: 150,
        estimated_hours: 120,
        issue_date: '2026-11-10',
        expiry_date: '2026-12-10',
        description: 'LLM retrieval-augmented generation model with vector database search.',
      },
    ],
    createHandler: async (item) => createSoftwareEstimate(item as any),
  },

  'software-contracts': {
    moduleId: 'software-contracts',
    moduleName: 'Software Contracts',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'title', label: 'Contract Title', aliases: ['Title', 'Agreement'], required: true, type: 'string', sampleValue: 'Master Services Agreement - Cyberdyne' },
      { key: 'contract_number', label: 'Contract #', aliases: ['Code', 'ContractNumber'], type: 'string', sampleValue: 'MSA-2026-088' },
      { key: 'billing_type', label: 'Billing Mode', type: 'string', sampleValue: 'Milestone Based' },
      { key: 'contract_value', label: 'Contract Value', aliases: ['Value', 'TotalAmount'], required: true, type: 'number', sampleValue: 250000 },
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'start_date', label: 'Start Date', type: 'date', sampleValue: '2026-11-01' },
      { key: 'end_date', label: 'End Date', type: 'date', sampleValue: '2027-10-31' },
      { key: 'description', label: 'Contract Terms', type: 'string', sampleValue: 'Multi-year enterprise development and maintenance contract.' },
    ],
    sampleRows: [
      {
        title: 'Annual Cloud Architecture SLA',
        contract_number: 'SLA-2026-012',
        billing_type: 'Retainer',
        contract_value: 120000,
        currency: 'USD',
        start_date: '2026-12-01',
        end_date: '2027-11-30',
        description: '99.95% uptime guarantee with 1-hour P1 incident response time.',
      },
    ],
    createHandler: async (item) => createSoftwareContract(item as any),
  },

  'software-sprints': {
    moduleId: 'software-sprints',
    moduleName: 'Software Sprints',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'name', label: 'Sprint Name', aliases: ['Title', 'SprintName'], required: true, type: 'string', sampleValue: 'Sprint 24 - Payment Gateway' },
      { key: 'status', label: 'Status', type: 'select', options: ['Planning', 'Active', 'Completed', 'Cancelled'], sampleValue: 'Active' },
      { key: 'start_date', label: 'Start Date', type: 'date', sampleValue: '2026-11-10' },
      { key: 'end_date', label: 'End Date', type: 'date', sampleValue: '2026-11-24' },
      { key: 'goal', label: 'Sprint Goal', aliases: ['Description', 'Goal'], type: 'string', sampleValue: 'Finalize Stripe Checkout integration and end-to-end receipt generation.' },
    ],
    sampleRows: [
      {
        name: 'Sprint 25 - User Management & RBAC',
        status: 'Planning',
        start_date: '2026-11-25',
        end_date: '2026-12-09',
        goal: 'Complete role permissions matrix and tenant invitation flows.',
      },
    ],
    createHandler: async (item) => createSoftwareSprint(item as any),
  },

  'software-invoices': {
    moduleId: 'software-invoices',
    moduleName: 'Software Invoices',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'invoice_number', label: 'Invoice #', aliases: ['InvoiceNumber', 'Number'], required: true, type: 'string', sampleValue: 'INV-2026-0042' },
      { key: 'total_amount', label: 'Invoice Amount', aliases: ['Amount', 'Total'], required: true, type: 'number', sampleValue: 35000 },
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'], sampleValue: 'USD' },
      { key: 'issue_date', label: 'Issue Date', type: 'date', sampleValue: '2026-11-01' },
      { key: 'due_date', label: 'Due Date', type: 'date', sampleValue: '2026-11-30' },
      { key: 'notes', label: 'Notes', type: 'string', sampleValue: 'Milestone 2 deliverable signoff invoice.' },
    ],
    sampleRows: [
      {
        invoice_number: 'INV-2026-0043',
        total_amount: 18500,
        currency: 'USD',
        issue_date: '2026-11-05',
        due_date: '2026-12-05',
        notes: 'Monthly retainer for managed infrastructure support.',
      },
    ],
    createHandler: async (item) => createSoftwareInvoice(item as any),
  },

  /* ─── Administration ─── */
  users: {
    moduleId: 'users',
    moduleName: 'Users',
    supportsImport: true,
    supportsExport: true,
    fields: [
      { key: 'full_name', label: 'Full Name', aliases: ['Name', 'FullName'], required: true, type: 'string', sampleValue: 'Alex Morgan' },
      { key: 'email', label: 'Email Address', aliases: ['Email', 'EmailAddress'], required: true, type: 'email', sampleValue: 'alex.morgan@company.com' },
      { key: 'role', label: 'Role', aliases: ['RoleName'], required: true, type: 'select', options: ['Admin', 'Manager', 'Sales', 'Operations', 'Support', 'Auditor'], sampleValue: 'Manager' },
    ],
    sampleRows: [
      {
        full_name: 'Elena Rostova',
        email: 'elena.rostova@company.com',
        role: 'Sales',
      },
    ],
    createHandler: async (item) => createUser(item as any),
  },

  /* ─── Export Only Modules (Calculated Reports & System Metadata) ─── */
  reports: {
    moduleId: 'reports',
    moduleName: 'CRM Reports & Analytics',
    supportsImport: false,
    supportsExport: true,
    fields: [
      { key: 'metric', label: 'Metric Category', type: 'string' },
      { key: 'label', label: 'Description / Metric', type: 'string' },
      { key: 'value', label: 'Count / Value', type: 'string' },
      { key: 'percentage', label: 'Percentage (%)', type: 'string' },
    ],
  },

  'software-delivery-reports': {
    moduleId: 'software-delivery-reports',
    moduleName: 'Software Delivery Reports',
    supportsImport: false,
    supportsExport: true,
    fields: [
      { key: 'project_name', label: 'Project Name', type: 'string' },
      { key: 'total_hours', label: 'Total Hours Logged', type: 'number' },
      { key: 'billable_hours', label: 'Billable Hours', type: 'number' },
      { key: 'non_billable_hours', label: 'Non-Billable Hours', type: 'number' },
      { key: 'utilization_rate', label: 'Utilization Rate (%)', type: 'string' },
      { key: 'billable_amount', label: 'Total Billable Amount', type: 'string' },
    ],
  },

  roles: {
    moduleId: 'roles',
    moduleName: 'Roles Catalog',
    supportsImport: false,
    supportsExport: true,
    fields: [
      { key: 'name', label: 'Role Name', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'users_count', label: 'Assigned Users', type: 'number' },
      { key: 'permissions_count', label: 'Permissions Count', type: 'number' },
    ],
  },

  permissions: {
    moduleId: 'permissions',
    moduleName: 'Permissions Catalog',
    supportsImport: false,
    supportsExport: true,
    fields: [
      { key: 'name', label: 'Permission Key', type: 'string' },
      { key: 'module', label: 'Module Category', type: 'string' },
      { key: 'action', label: 'Action', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
    ],
  },
};
