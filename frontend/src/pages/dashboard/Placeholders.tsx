// import React from "react";
import "../users/Users.css";
const Placeholder = ({ title, description }: { title: string, description: string }) => (
  <div style={{ padding: '32px', animation: 'fadeIn 0.3s ease-in-out' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '8px' }}>{title}</h1>
    <p style={{ color: '#718096', fontSize: '0.95rem' }}>{description}</p>
  </div>
);


export const Contacts = () => (
  <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
    <div className="page-header">
      <div>
        <h1>Contacts</h1>
        <p className="text-muted">Real Estate contacts management will be available here.</p>
      </div>
    </div>
  </div>
);
export const Accounts = () => <Placeholder title="Accounts" description="Real Estate accounts management will be available here." />;
export const Deals = () => <Placeholder title="Deals" description="Real Estate deals management will be available here." />;
export const Tasks = () => <Placeholder title="Tasks" description="Tasks and follow-ups will be available here." />;
export const Activities = () => <Placeholder title="Activities" description="Activities will be available here." />;
export const Reports = () => <Placeholder title="Reports" description="Real Estate reports will be available here." />;

export const Settings = () => <Placeholder title="Settings" description="Tenant settings will be available here." />;
