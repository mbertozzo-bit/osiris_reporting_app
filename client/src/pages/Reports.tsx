import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reportService, { Report } from '../services/reportService';
import toast from 'react-hot-toast';

interface PreviewRow {
  criteria: string;
  unit: string;
  value: string;
  isSection?: boolean;
}

const Reports: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingComment, setEditingComment] = useState<{ agentId: string; comment: string } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const queryClient = useQueryClient();

  const { data: availableMonths = [] } = useQuery({
    queryKey: ['availableMonths'],
    queryFn: () => reportService.getAvailableMonths()
  });

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    availableMonths.forEach((item) => years.add(item.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [availableMonths]);

  const monthOptionsForYear = useMemo(() => {
    return availableMonths
      .filter((item) => item.year === selectedYear)
      .map((item) => item.month)
      .sort((a, b) => b - a);
  }, [availableMonths, selectedYear]);

  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    const hasSelection = availableMonths.some(
      (item) => item.month === selectedMonth && item.year === selectedYear
    );

    if (!hasSelection) {
      const latest = availableMonths[0];
      setSelectedMonth(latest.month);
      setSelectedYear(latest.year);
    }
  }, [availableMonths, selectedMonth, selectedYear]);

  useEffect(() => {
    if (monthOptionsForYear.length === 0) {
      return;
    }

    if (!monthOptionsForYear.includes(selectedMonth)) {
      setSelectedMonth(monthOptionsForYear[0]);
    }
  }, [monthOptionsForYear, selectedMonth]);

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['reports', selectedMonth, selectedYear, selectedAgent],
    queryFn: () => reportService.getReports(selectedMonth, selectedYear, selectedAgent || undefined)
  });

  const { data: agentsList = [] } = useQuery({
    queryKey: ['agentList'],
    queryFn: () => reportService.getAgentList(searchTerm)
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ agentId, comment }: { agentId: string; comment: string }) =>
      reportService.updateAgentComment(agentId, selectedMonth, selectedYear, comment),
    onSuccess: () => {
      toast.success('Comment saved successfully');
      setEditingComment(null);
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => {
      toast.error('Failed to save comment');
    }
  });

  const reports: Report[] = reportsData?.reports || [];

  const filteredAgents = searchTerm
    ? agentsList.filter(a =>
        a.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.agent_id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : agentsList;

  const handleSaveComment = () => {
    if (editingComment && commentText.trim()) {
      updateCommentMutation.mutate({
        agentId: editingComment.agentId,
        comment: commentText
      });
    }
  };

  const startEditComment = (agentId: string, currentComment?: string) => {
    setEditingComment({ agentId, comment: currentComment || '' });
    setCommentText(currentComment || '');
  };

  const cancelEditComment = () => {
    setEditingComment(null);
    setCommentText('');
  };

  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return 'N/A';
    const [hours, minutes] = timeStr.split(':');
    return `${hours}h ${minutes}m`;
  };

  const formatAUTHours = (hours: number | null | undefined) => {
    return hours !== null && hours !== undefined ? hours.toFixed(2) : '0.00';
  };

  const formatAHTForPreview = (value: string | null | undefined) => {
    if (!value) return '';

    const parts = value.split(':');
    if (parts.length < 2) {
      return value;
    }

    const hours = Number.parseInt(parts[0], 10);
    if (Number.isNaN(hours)) {
      return value;
    }

    return `${hours}:${parts[1]}`;
  };

  const formatValue = (value: number | string | null | undefined, decimals?: number) => {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (typeof value === 'number') {
      if (decimals !== undefined) {
        return value.toFixed(decimals);
      }
      return Number.isInteger(value) ? value.toString() : value.toString();
    }

    if (decimals !== undefined) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed.toFixed(decimals);
      }
    }

    return String(value);
  };

  const buildPreviewRows = (report: Report): PreviewRow[] => {
    const totalHours =
      report.total_seconds !== null && report.total_seconds !== undefined
        ? (report.total_seconds / 3600).toFixed(4)
        : '';

    return [
      { criteria: 'Total Handle Calls', unit: '#', value: formatValue(report.total_handle_calls) },
      { criteria: 'Average Handle Time (AHT)', unit: 'Minutes', value: formatAHTForPreview(report.average_handle_time) },
      { criteria: 'Agent Unavailable Time (AUT)', unit: 'Hours', value: formatValue(report.agent_unavailable_time_hours, 4) },
      { criteria: 'Escalation rate', unit: '%', value: formatValue(report.escalation_rate) },
      { criteria: 'Call quality monitoring score', unit: '%', value: formatValue(report.call_quality_score) },
      { criteria: 'Schedule adherence', unit: '%', value: formatValue(report.schedule_adherence) },
      { criteria: 'Refused Calls', unit: '%', value: formatValue(report.refused_calls) },
      { criteria: 'AUT breakdown', unit: 'seconds', value: '', isSection: true },
      { criteria: 'ARF', unit: 'seconds', value: formatValue(report.arf_seconds) },
      { criteria: 'Correcting & Repost', unit: 'seconds', value: formatValue(report.correcting_repost_seconds) },
      { criteria: 'Edit & Transfer', unit: 'seconds', value: formatValue(report.edit_transfer_seconds) },
      { criteria: 'Emails', unit: 'seconds', value: formatValue(report.emails_seconds) },
      { criteria: 'Faxes', unit: 'seconds', value: formatValue(report.faxes_seconds) },
      { criteria: 'Meeting', unit: 'seconds', value: formatValue(report.meeting_seconds) },
      { criteria: 'Misc', unit: 'seconds', value: formatValue(report.misc_seconds) },
      { criteria: 'Payment Plan', unit: 'seconds', value: formatValue(report.payment_plan_seconds) },
      { criteria: 'Personal', unit: 'seconds', value: formatValue(report.personal_seconds) },
      { criteria: 'Printing/Adding to log', unit: 'seconds', value: formatValue(report.printing_log_seconds) },
      { criteria: 'Statements', unit: 'seconds', value: formatValue(report.statements_seconds) },
      { criteria: 'Task', unit: 'seconds', value: formatValue(report.task_seconds) },
      { criteria: 'Technical Issue', unit: 'seconds', value: formatValue(report.technical_issue_seconds) },
      { criteria: 'Training', unit: 'seconds', value: formatValue(report.training_seconds) },
      { criteria: 'Vms', unit: 'seconds', value: formatValue(report.vms_seconds) },
      { criteria: 'Wrap Up (above the allotted 30s per call)', unit: 'seconds', value: formatValue(report.wrap_up_seconds) },
      { criteria: 'Break (above the allotted time)', unit: 'seconds', value: formatValue(report.break_seconds) },
      { criteria: 'Lunch (above the allotted time)', unit: 'seconds', value: formatValue(report.lunch_seconds) },
      { criteria: 'Total', unit: 'Hours', value: totalHours }
    ];
  };

  const previewRows = useMemo(() => {
    if (!previewReport) {
      return [];
    }
    return buildPreviewRows(previewReport);
  }, [previewReport]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const hasAvailableData = availableMonths.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="mt-2 text-gray-600">
          View and analyze agent performance data for selected month
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={!hasAvailableData}
            >
              {monthOptionsForYear.length === 0 ? (
                <option value={selectedMonth}>No data</option>
              ) : (
                monthOptionsForYear.map((month) => (
                  <option key={month} value={month}>{monthNames[month - 1]}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={!hasAvailableData}
            >
              {yearOptions.length === 0 ? (
                <option value={selectedYear}>No data</option>
              ) : (
                yearOptions.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Agent Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Agents</option>
              {filteredAgents.map(agent => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.agent_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Agent Performance - {monthNames[selectedMonth - 1]} {selectedYear}
          </h2>
          <p className="text-sm text-gray-500">
            {reports.length} agent{reports.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {reportsLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading reports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-gray-500">No reports found for the selected filters.</p>
            <p className="mt-2 text-sm text-gray-400">Upload Excel files to generate reports.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Handle Calls</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Handle Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AUT (Hours)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Refused</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full Report</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comment</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reports.map((report) => (
                  <tr key={report.agent_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{report.agent_name}</span>
                        <span className="text-xs text-gray-500">ID: {report.agent_id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {report.total_handle_calls?.toLocaleString() || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTime(report.average_handle_time)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatAUTHours(report.agent_unavailable_time_hours)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {report.refused_calls || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        onClick={() => setPreviewReport(report)}
                        className="inline-flex items-center px-3 py-1.5 border border-blue-200 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                      >
                        View Email Format
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {editingComment?.agentId === report.agent_id ? (
                        <div className="space-y-2">
                          <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Add a comment..."
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500"
                            rows={2}
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={handleSaveComment}
                              disabled={updateCommentMutation.isPending}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditComment}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer text-sm text-gray-600 hover:text-gray-900"
                          onClick={() => startEditComment(report.agent_id, report.comment)}
                        >
                          {report.comment || <span className="text-gray-400 italic">Add comment...</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reports.length > 0 && (
        <div className="flex justify-end space-x-4">
          <button
            onClick={async () => {
              try {
                const data = await reportService.exportReports(selectedMonth, selectedYear, 'csv');
                const blob = new Blob([data as any], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `reports_${selectedMonth}_${selectedYear}.csv`;
                a.click();
                toast.success('Export started');
              } catch {
                toast.error('Export failed');
              }
            }}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
        </div>
      )}

      {previewReport && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Email Body Preview</h3>
                <p className="text-sm text-gray-600">
                  {previewReport.agent_name} - {monthNames[previewReport.month - 1]} {previewReport.year}
                </p>
              </div>
              <button
                onClick={() => setPreviewReport(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <table className="min-w-full border border-gray-300 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">Criteria</th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">unit</th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">value</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.criteria}-${index}`} className={row.isSection ? 'bg-gray-50' : 'bg-white'}>
                      <td className={`border border-gray-300 px-3 py-2 ${row.isSection ? 'font-semibold text-blue-900' : 'text-gray-900'}`}>
                        {row.criteria}
                      </td>
                      <td className={`border border-gray-300 px-3 py-2 ${row.isSection ? 'font-semibold text-blue-900' : 'text-gray-900'}`}>
                        {row.unit}
                      </td>
                      <td className={`border border-gray-300 px-3 py-2 ${row.isSection ? 'font-semibold text-blue-900' : 'text-gray-900'}`}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {previewReport.comment && (
                <div className="mt-4 p-4 rounded-md border border-yellow-200 bg-yellow-50">
                  <h4 className="text-sm font-semibold text-yellow-900 mb-1">Supervisor Comment</h4>
                  <p className="text-sm text-yellow-800">{previewReport.comment}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
