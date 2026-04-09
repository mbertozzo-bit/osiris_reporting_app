import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import reportService from '../services/reportService';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agentOptions, setAgentOptions] = useState<Array<{ agent_id: string; agent_name: string }>>([]);

  // Fetch available months
  const { data: availableMonths } = useQuery({
    queryKey: ['availableMonths'],
    queryFn: () => reportService.getAvailableMonths()
  });

  // Fetch agent list for dropdown
  const { data: agentsData } = useQuery({
    queryKey: ['agentList'],
    queryFn: () => reportService.getAgentList()
  });

  // Fetch report summary for selected month/year
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['reportSummary', selectedMonth, selectedYear],
    queryFn: () => reportService.getReportSummary(selectedMonth, selectedYear),
    enabled: !!selectedMonth && !!selectedYear
  });

  // Fetch time series data for selected agent
  const { data: timeSeriesData, isLoading: timeSeriesLoading } = useQuery({
    queryKey: ['timeSeries', selectedAgent, selectedMonth, selectedYear],
    queryFn: () => reportService.getAgentTimeSeries(selectedAgent, 'handle_calls'),
    enabled: !!selectedAgent
  });

  useEffect(() => {
    if (agentsData) {
      setAgentOptions(agentsData);
      if (agentsData.length > 0 && !selectedAgent) {
        setSelectedAgent(agentsData[0].agent_id);
      }
    }
  }, [agentsData, selectedAgent]);

  const handleMonthYearChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  // Generate month options
  const monthOptions = availableMonths?.map(m => ({
    value: `${m.year}-${m.month}`,
    label: `${m.month}/${m.year}`,
    month: m.month,
    year: m.year
  })) || [];

  // Prepare chart data for summary
  const summaryChartData = {
    labels: ['Total Agents', 'Handle Calls', 'AUT Hours', 'Refused Calls'],
    datasets: [
      {
        label: 'Summary Statistics',
        data: [
          summaryData?.totalAgents || 0,
          summaryData?.totalHandleCalls || 0,
          summaryData?.totalAUTHours || 0,
          summaryData?.totalRefusedCalls || 0
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.5)',
          'rgba(16, 185, 129, 0.5)',
          'rgba(245, 158, 11, 0.5)',
          'rgba(239, 68, 68, 0.5)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(245, 158, 11)',
          'rgb(239, 68, 68)'
        ],
        borderWidth: 1
      }
    ]
  };

  // Prepare time series chart data
  const timeSeriesChartData = {
    labels: timeSeriesData?.timeSeries.map(ts => ts.date) || [],
    datasets: [
      {
        label: 'Handle Calls Over Time',
        data: timeSeriesData?.timeSeries.map(ts => ts.value) || [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.1
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Overview of agent performance and reporting data
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Month/Year
            </label>
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number);
                handleMonthYearChange(month, year);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Agents</option>
              {agentOptions.map(agent => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.agent_name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                toast.success('Filters applied');
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13 0a5 5 0 00-7.07-7.07" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Total Agents</h3>
              {summaryLoading ? (
                <div className="h-8 bg-gray-200 animate-pulse rounded w-16"></div>
              ) : (
                <p className="text-3xl font-bold text-gray-900">
                  {summaryData?.totalAgents || 0}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Handle Calls</h3>
              {summaryLoading ? (
                <div className="h-8 bg-gray-200 animate-pulse rounded w-16"></div>
              ) : (
                <p className="text-3xl font-bold text-gray-900">
                  {summaryData?.totalHandleCalls?.toLocaleString() || 0}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">AUT Hours</h3>
              {summaryLoading ? (
                <div className="h-8 bg-gray-200 animate-pulse rounded w-16"></div>
              ) : (
                <p className="text-3xl font-bold text-gray-900">
                  {summaryData?.totalAUTHours?.toFixed(2) || 0}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Refused Calls</h3>
              {summaryLoading ? (
                <div className="h-8 bg-gray-200 animate-pulse rounded w-16"></div>
              ) : (
                <p className="text-3xl font-bold text-gray-900">
                  {summaryData?.totalRefusedCalls || 0}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Summary Chart */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Monthly Summary</h2>
          <div className="h-80">
            <Bar 
              data={summaryChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: `Summary for ${selectedMonth}/${selectedYear}`
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {selectedAgent ? 'Agent Performance Over Time' : 'Select an agent to view performance'}
          </h2>
          <div className="h-80">
            {selectedAgent && !timeSeriesLoading ? (
              <Line 
                data={timeSeriesChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: true,
                      text: `${agentOptions.find(a => a.agent_id === selectedAgent)?.agent_name || 'Agent'} Performance`
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true
                    }
                  }
                }}
              />
            ) : selectedAgent && timeSeriesLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-gray-500">Loading chart data...</div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-gray-500">Please select an agent from the dropdown</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/upload"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <svg className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            <span className="font-medium text-gray-900">Upload New Reports</span>
            <span className="text-sm text-gray-500 mt-1">Process Excel files</span>
          </a>

          <a
            href="/reports"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
          >
            <svg className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="font-medium text-gray-900">View Reports</span>
            <span className="text-sm text-gray-500 mt-1">Analyze agent data</span>
          </a>

          <a
            href="/email"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <svg className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="font-medium text-gray-900">Send Emails</span>
            <span className="text-sm text-gray-500 mt-1">Distribute reports</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;