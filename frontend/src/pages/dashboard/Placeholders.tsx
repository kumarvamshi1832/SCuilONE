

const Placeholder = ({ title, description }: { title: string, description: string }) => (
  <div style={{ padding: '32px', animation: 'fadeIn 0.3s ease-in-out' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '8px' }}>{title}</h1>
    <p style={{ color: '#718096', fontSize: '0.95rem' }}>{description}</p>
  </div>
);

export const Leads = () => <Placeholder title="Leads" description="Real Estate leads management will be available here." />;
export const Contacts = () => <Placeholder title="Contacts" description="Real Estate contacts management will be available here." />;
export const Deals = () => <Placeholder title="Deals" description="Real Estate deals management will be available here." />;
export const Activities = () => <Placeholder title="Activities" description="Activities and follow-ups will be available here." />;
export const Reports = () => <Placeholder title="Reports" description="Real Estate reports will be available here." />;
export const Roles = () => <Placeholder title="Roles" description="Role management will be available here." />;
export const Permissions = () => <Placeholder title="Permissions" description="Permission management will be available here." />;
export const Settings = () => <Placeholder title="Settings" description="Tenant settings will be available here." />;
