import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import reportService from '../services/reportService';
import emailService, { EmailHistoryRecord } from '../services/emailService';

const Email: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [ccRecipientsText, setCcRecipientsText] = useState('');
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

  const { data: agentsWithEmails = [] } = useQuery({
    queryKey: ['agentsWithEmails', selectedMonth, selectedYear],
    queryFn: () => reportService.getAgentList(undefined, selectedMonth, selectedYear),
    enabled: availableMonths.length > 0
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['emailHistory', selectedMonth, selectedYear],
    queryFn: () => emailService.getEmailHistory(undefined, selectedMonth, selectedYear)
  });

  const { data: emailConfig } = useQuery({
    queryKey: ['emailConfig'],
    queryFn: () => emailService.getConfig()
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      emailService.sendAgentEmail(
        selectedAgents[0],
        selectedMonth,
        selectedYear,
        emailSubject,
        true,
        parseCcRecipients(ccRecipientsText).recipients
      ),
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to generate preview');
    }
  });

  const sendSingleMutation = useMutation({
    mutationFn: () =>
      emailService.sendAgentEmail(
        selectedAgents[0],
        selectedMonth,
        selectedYear,
        emailSubject,
        false,
        parseCcRecipients(ccRecipientsText).recipients
      ),
    onSuccess: () => {
      toast.success('Email sent successfully');
      setSelectedAgents([]);
      queryClient.invalidateQueries({ queryKey: ['emailHistory'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to send email');
    }
  });

  const sendBulkMutation = useMutation({
    mutationFn: () =>
      emailService.sendBulkEmails(
        selectedAgents,
        selectedMonth,
        selectedYear,
        emailSubject,
        false,
        parseCcRecipients(ccRecipientsText).recipients
      ),
    onSuccess: (data) => {
      toast.success(`Sent ${data.summary.sent} of ${data.summary.total} emails`);
      setSelectedAgents([]);
      queryClient.invalidateQueries({ queryKey: ['emailHistory'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to send emails');
    }
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const history: EmailHistoryRecord[] = historyData?.history || [];
  const totalAgentsForPeriod = agentsWithEmails.length;
  const agents = useMemo(
    () => agentsWithEmails.filter((a: any) => a.email),
    [agentsWithEmails]
  );
  const hasAvailableData = availableMonths.length > 0;
  const isGraphAvailable = emailConfig?.configured ?? false;
  const senderMailbox = emailConfig?.senderAddress || 'configured Graph sender';

  useEffect(() => {
    const validIds = new Set(agents.map((agent: any) => agent.agent_id));

    setSelectedAgents((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [agents]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const selectAll = () => {
    setSelectedAgents(agents.map((a: any) => a.agent_id));
  };

  const clearSelection = () => {
    setSelectedAgents([]);
  };

  const handlePreview = () => {
    if (!hasAvailableData) {
      toast.error('No report data available to email');
      return;
    }

    if (selectedAgents.length === 0) {
      toast.error('Please select at least one agent');
      return;
    }

    if (selectedAgents.length > 1) {
      toast('Preview shows first selected agent only');
    }

    const ccValidation = parseCcRecipients(ccRecipientsText);
    if (ccValidation.invalid.length > 0) {
      toast.error(`Invalid CC email: ${ccValidation.invalid[0]}`);
      return;
    }

    previewMutation.mutate();
  };

  const handleSend = () => {
    if (!hasAvailableData) {
      toast.error('No report data available to email');
      return;
    }

    if (selectedAgents.length === 0) {
      toast.error('Please select at least one agent');
      return;
    }

    if (!isGraphAvailable) {
      toast.error('Email sender is not configured on Microsoft Graph');
      return;
    }

    const ccValidation = parseCcRecipients(ccRecipientsText);
    if (ccValidation.invalid.length > 0) {
      toast.error(`Invalid CC email: ${ccValidation.invalid[0]}`);
      return;
    }

    if (selectedAgents.length === 1) {
      sendSingleMutation.mutate();
      return;
    }

    sendBulkMutation.mutate();
  };

  const parseCcRecipients = (value: string): { recipients: string[]; invalid: string[] } => {
    const parsed = value
      .split(/[,;\n]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    const unique = [...new Set(parsed)];
    const invalid = unique.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const recipients = unique.filter((email) => !invalid.includes(email));

    return { recipients, invalid };
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Email Reports</h1>
        <p className="mt-2 text-gray-600">Send performance reports to agents via email</p>
      </div>

      {!isGraphAvailable && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.326-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.654-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Email Service Not Configured</h3>
              <p className="text-sm text-yellow-700">
                Configure `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, and `MAIL_TARGET_ADDRESS` on the backend.
              </p>
            </div>
          </div>
        </div>
      )}

      {isGraphAvailable && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700">
            Emails will be sent from <span className="font-semibold">{senderMailbox}</span> via Microsoft Graph API.
          </p>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Compose Email</h2>

        {!hasAvailableData && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            No month/year data is available yet. Upload reports first.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={!hasAvailableData}
            >
              {monthOptionsForYear.length === 0 ? (
                <option value={selectedMonth}>No data</option>
              ) : (
                monthOptionsForYear.map((month) => (
                  <option key={month} value={month}>
                    {monthNames[month - 1]}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={!hasAvailableData}
            >
              {yearOptions.length === 0 ? (
                <option value={selectedYear}>No data</option>
              ) : (
                yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Subject (optional)</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder={`Monthly Performance Report - ${monthNames[selectedMonth - 1]} ${selectedYear}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">CC (optional)</label>
          <textarea
            value={ccRecipientsText}
            onChange={(e) => setCcRecipientsText(e.target.value)}
            placeholder="cc1@company.com, cc2@company.com"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="mt-1 text-xs text-gray-500">Use comma, semicolon, or new line to add multiple CC recipients.</p>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Select Agents ({selectedAgents.length} selected)
            </label>
            <div className="space-x-2">
              <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-800">
                Select All
              </button>
              <button onClick={clearSelection} className="text-sm text-gray-600 hover:text-gray-800">
                Clear
              </button>
            </div>
          </div>

          <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
            {agents.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {totalAgentsForPeriod > 0
                  ? `Data exists for ${monthNames[selectedMonth - 1]} ${selectedYear}, but none of the ${totalAgentsForPeriod} agents has an email configured. Update emails in Agents section.`
                  : `No report data found for ${monthNames[selectedMonth - 1]} ${selectedYear}`}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {agents.map((agent: any) => (
                  <label key={agent.agent_id} className="flex items-center p-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.agent_id)}
                      onChange={() => toggleAgent(agent.agent_id)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <div className="ml-3">
                      <span className="text-sm font-medium text-gray-900">{agent.agent_name}</span>
                      <span className="ml-2 text-sm text-gray-500">{agent.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={handlePreview}
            disabled={selectedAgents.length === 0}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Preview
          </button>
          <button
            onClick={handleSend}
            disabled={
              !hasAvailableData ||
              selectedAgents.length === 0 ||
              !isGraphAvailable ||
              sendSingleMutation.isPending ||
              sendBulkMutation.isPending
            }
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendSingleMutation.isPending || sendBulkMutation.isPending
              ? 'Sending...'
              : `Send ${selectedAgents.length === 1 ? 'Email' : `${selectedAgents.length} Emails`}`}
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Email History</h2>
          <p className="text-sm text-gray-500">
            {historyData?.summary?.sent_count || 0} sent, {historyData?.summary?.failed_count || 0} failed
          </p>
        </div>

        {historyLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No emails sent yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month/Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{record.full_name || record.agent_id}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{record.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.month}/{record.year}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(record.status)}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(record.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPreview && previewData && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Email Preview</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm">
                <strong>To:</strong> {previewData.to}
              </p>
              {previewData.ccRecipients?.length > 0 && (
                <p className="text-sm">
                  <strong>CC:</strong> {previewData.ccRecipients.join(', ')}
                </p>
              )}
              <p className="text-sm">
                <strong>Subject:</strong> {previewData.subject}
              </p>
            </div>

            <iframe
              title="Email HTML Preview"
              srcDoc={previewData.htmlBody}
              className="w-full h-[560px] border border-gray-200 rounded-md bg-white"
              sandbox=""
            />

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Email;
