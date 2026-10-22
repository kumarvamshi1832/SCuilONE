import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useNavigate, useParams } from "react-router-dom";
import type { DashboardSummary } from "../../types/dashboard";
import "./DashboardCharts.css";

interface DashboardChartsProps {
  summary: DashboardSummary;
}

const COLORS = [
  "#4F8EF7",
  "#22C55E",
  "#F59E0B",
  "#A78BFA",
  "#F87171",
  "#2DD4BF",
  "#FB923C",
];

export default function DashboardCharts({
  summary,
}: DashboardChartsProps) {
  const navigate = useNavigate();
  const { industry } = useParams();

  const industryPath = industry || "real-estate";

  const leadData = summary.leadStatusBreakdown;
  const dealData = summary.dealStageBreakdown;

  const taskData = [
    { name: "Pending", value: summary.pendingTasks, color: "#F59E0B" },
    { name: "Completed", value: summary.completedTasks, color: "#22C55E" },
    { name: "Overdue", value: summary.overdueTasks, color: "#F87171" },
  ];

  const openLeadsByStatus = (status: string) => {
    navigate(
      `/${industryPath}/leads?status=${encodeURIComponent(status)}`
    );
  };

  const openDealsByStage = (stage: string) => {
    navigate(
      `/${industryPath}/deals?stage=${encodeURIComponent(stage)}`
    );
  };

  const openTasksByStatus = (status: string) => {
    if (status === "Overdue") {
      navigate(`/${industryPath}/tasks?overdue=true`);
      return;
    }

    navigate(
      `/${industryPath}/tasks?status=${encodeURIComponent(status)}`
    );
  };

  return (
    <div className="dashboard-charts">
      <section className="dashboard-chart-card">
        <h3>Lead Status</h3>

        {leadData.length === 0 ? (
          <p className="dashboard-chart-empty">
            No lead data available.
          </p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={leadData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="45%"
                  outerRadius={85}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {leadData.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={COLORS[index % COLORS.length]}
                      cursor="pointer"
                      onClick={() => openLeadsByStatus(entry.status)}
                    />
                  ))}
                </Pie>

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#242424",
                    border: "1px solid #444",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-empty">
          Click a slice to view leads with that status.
        </p>
      </section>

      <section className="dashboard-chart-card">
        <h3>Deals by Stage</h3>

        {dealData.length === 0 ? (
          <p className="dashboard-chart-empty">
            No deal data available.
          </p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={dealData}
                margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  stroke="#383838"
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="stage"
                  tick={{ fill: "#A0A0A0", fontSize: 11 }}
                  angle={-15}
                  textAnchor="end"
                  height={55}
                  interval={0}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#A0A0A0", fontSize: 12 }}
                />

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#242424",
                    border: "1px solid #444",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />

                <Bar
                  dataKey="count"
                  name="Deals"
                  fill="#4F8EF7"
                  radius={[5, 5, 0, 0]}
                  cursor="pointer"
                  onClick={(_, index) => {
                    const stage = dealData[index]?.stage;

                    if (stage) {
                      openDealsByStage(stage);
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-empty">
          Click a bar to view deals at that stage.
        </p>
      </section>

      <section className="dashboard-chart-card">
        <h3>Task Overview</h3>

        {taskData.every((task) => task.value === 0) ? (
          <p className="dashboard-chart-empty">
            No task data available.
          </p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={taskData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={85}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {taskData.map((task) => (
                    <Cell
                      key={task.name}
                      fill={task.color}
                      cursor="pointer"
                      onClick={() => openTasksByStatus(task.name)}
                    />
                  ))}
                </Pie>

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#242424",
                    border: "1px solid #444",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-empty">
          Click a slice to view matching tasks.
        </p>
      </section>
    </div>
  );
}
