export interface TrainingDashboardStats {
  totalInquiries: number;
  activeStudents: number;
  activeBatches: number;
  completionRate: string;
  placementsAchieved: number;
  upcomingDemos: number;
}

export interface EnrollmentTrendItem {
  month: string;
  inquiries: number;
  enrolled: number;
}

export interface CourseDistributionItem {
  name: string;
  value: number;
  fill: string;
  colorClass?: string;
}

export interface UpcomingBatchItem {
  id: number;
  course: string;
  batchCode: string;
  trainer: string;
  schedule: string;
  mode: 'Online Live' | 'In-Person Lab' | 'Hybrid';
  enrolledCount: number;
  capacity: number;
  startDate: string;
  status: 'Starting Soon' | 'In Progress' | 'Registration Open';
}

export interface UpcomingDemoItem {
  id: number;
  time: string;
  title: string;
  trainer: string;
  course: string;
  mode: 'Online' | 'Offline';
  registeredCount: number;
}

export interface RecentTrainingLead {
  id: number;
  name: string;
  email: string;
  phone: string;
  course: string;
  batchPreference: string;
  status: 'New' | 'Contacted' | 'Demo Booked' | 'Enrolled' | 'Follow Up';
  assignedCounselor: string;
  createdOn: string;
}

export const trainingDashboardStats: TrainingDashboardStats = {
  totalInquiries: 384,
  activeStudents: 196,
  activeBatches: 22,
  completionRate: '95.2%',
  placementsAchieved: 154,
  upcomingDemos: 8,
};

export const enrollmentTrendData: EnrollmentTrendItem[] = [
  { month: "May", inquiries: 38, enrolled: 16 },
  { month: "Jun", inquiries: 46, enrolled: 22 },
  { month: "Jul", inquiries: 54, enrolled: 28 },
  { month: "Aug", inquiries: 68, enrolled: 36 },
  { month: "Sep", inquiries: 79, enrolled: 44 },
  { month: "Oct", inquiries: 99, enrolled: 50 },
];

export const courseDistributionData: CourseDistributionItem[] = [
  { name: "Full Stack Development", value: 58, fill: "#3b82f6" },
  { name: "AI & Data Science", value: 48, fill: "#10b981" },
  { name: "Cloud & DevOps", value: 34, fill: "#8b5cf6" },
  { name: "Cyber Security", value: 28, fill: "#f59e0b" },
  { name: "UI/UX Design", value: 18, fill: "#ec4899" },
  { name: "DevSecOps & QA", value: 10, fill: "#06b6d4" },
];

export const upcomingBatches: UpcomingBatchItem[] = [
  {
    id: 1,
    course: "Full Stack MERN & Next.js",
    batchCode: "FSD-OCT-W2",
    trainer: "Arjun Rampal",
    schedule: "Mon-Wed-Fri • 7:00 PM IST",
    mode: "Online Live",
    enrolledCount: 22,
    capacity: 25,
    startDate: "Oct 20, 2026",
    status: "Starting Soon"
  },
  {
    id: 2,
    course: "Generative AI & LLM Engineering",
    batchCode: "GAI-OCT-WKND",
    trainer: "Dr. Shalini Rao",
    schedule: "Sat-Sun • 10:00 AM IST",
    mode: "Hybrid",
    enrolledCount: 28,
    capacity: 30,
    startDate: "Oct 24, 2026",
    status: "Registration Open"
  },
  {
    id: 3,
    course: "AWS Solutions Architect & Terraform",
    batchCode: "CLD-NOV-M1",
    trainer: "Karthik Verma",
    schedule: "Tue-Thu-Sat • 6:30 PM IST",
    mode: "Online Live",
    enrolledCount: 16,
    capacity: 20,
    startDate: "Nov 02, 2026",
    status: "Registration Open"
  },
  {
    id: 4,
    course: "Ethical Hacking & SOC Analyst",
    batchCode: "CYB-OCT-EVG",
    trainer: "Farhan Siddiqui",
    schedule: "Daily Evening • 8:00 PM IST",
    mode: "In-Person Lab",
    enrolledCount: 18,
    capacity: 20,
    startDate: "Oct 28, 2026",
    status: "Starting Soon"
  }
];

export const upcomingDemos: UpcomingDemoItem[] = [
  {
    id: 1,
    time: "10:30 AM",
    title: "Zero to Production with Microservices",
    trainer: "Arjun Rampal",
    course: "Full Stack Development",
    mode: "Online",
    registeredCount: 38
  },
  {
    id: 2,
    time: "02:00 PM",
    title: "Building Real-time RAG with LangChain",
    trainer: "Dr. Shalini Rao",
    course: "Generative AI",
    mode: "Online",
    registeredCount: 52
  },
  {
    id: 3,
    time: "04:30 PM",
    title: "Kubernetes Cluster Hands-on Workshop",
    trainer: "Karthik Verma",
    course: "Cloud & DevOps",
    mode: "Offline",
    registeredCount: 24
  },
  {
    id: 4,
    time: "06:00 PM",
    title: "Live Penetration Testing Demonstration",
    trainer: "Farhan Siddiqui",
    course: "Cyber Security",
    mode: "Online",
    registeredCount: 41
  }
];

export const recentTrainingLeads: RecentTrainingLead[] = [
  {
    id: 1,
    name: "Vikram Malhotra",
    email: "vikram.m@gmail.com",
    phone: "+91 98765 43210",
    course: "Full Stack Development",
    batchPreference: "Weekend Fast-Track",
    status: "Enrolled",
    assignedCounselor: "Ananya Roy",
    createdOn: "Oct 14, 2026"
  },
  {
    id: 2,
    name: "Sneha Mukherjee",
    email: "sneha.m@outlook.com",
    phone: "+91 98451 23456",
    course: "Generative AI & LLMs",
    batchPreference: "Weekday Evening",
    status: "Demo Booked",
    assignedCounselor: "Rohan Kapoor",
    createdOn: "Oct 13, 2026"
  },
  {
    id: 3,
    name: "Aditya Nair",
    email: "aditya.nair@gmail.com",
    phone: "+91 99887 66554",
    course: "Cloud & DevOps",
    batchPreference: "Morning Batch",
    status: "New",
    assignedCounselor: "Pooja Verma",
    createdOn: "Oct 13, 2026"
  },
  {
    id: 4,
    name: "Divya Krishnan",
    email: "divya.k@gmail.com",
    phone: "+91 97123 45678",
    course: "Cyber Security & SOC",
    batchPreference: "Weekend Batch",
    status: "Enrolled",
    assignedCounselor: "Ananya Roy",
    createdOn: "Oct 12, 2026"
  },
  {
    id: 5,
    name: "Manish Agarwal",
    email: "manish.a@yahoo.com",
    phone: "+91 96543 21890",
    course: "UI/UX Product Design",
    batchPreference: "Flexible Online",
    status: "Contacted",
    assignedCounselor: "Rohan Kapoor",
    createdOn: "Oct 12, 2026"
  },
  {
    id: 6,
    name: "Pooja Hegde",
    email: "pooja.hegde@techcorp.in",
    phone: "+91 98112 33445",
    course: "Full Stack Development",
    batchPreference: "Weekday Evening",
    status: "Follow Up",
    assignedCounselor: "Pooja Verma",
    createdOn: "Oct 11, 2026"
  }
];
