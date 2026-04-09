import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import reportService, { ManagedReportUpdatePayload, Report } from '../services/reportService';

interface EditableField {
  key: keyof ManagedReportUpdatePayload;
  label: string;
  unit: string;
  inputType: 'number' | 'text';
  step?: string;
  placeholder?: string;
}

const SUMMARY_FIELDS: EditableField[] = [
  { key: 'total_handle_calls', label: 'Total Handle Calls', unit: '#', inputType: 'number', step: '1' },
  { key: 'average_handle_time', label: 'Average Handle Time (AHT)', unit: 'Minutes', inputType: 'text', placeholder: 'HH:MM' },
  { key: 'agent_unavailable_time_hours', label: 'Agent Unavailable Time (AUT)', unit: 'Hours', inputType: 'number', step: '0.0001' },
  { key: 'escalation_rate', label: 'Escalation Rate', unit: '%', inputType: 'number', step: '0.01' },
  { key: 'call_quality_score', label: 'Call Quality Monitoring Score', unit: '%', inputType: 'number', step: '0.01' },
  { key: 'schedule_adherence', label: 'Schedule Adherence', unit: '%', inputType: 'number', step: '0.01' },
  { key: 'refused_calls', label: 'Refused Calls', unit: '%', inputType: 'number', step: '0.01' }
];

const AUT_FIELDS: EditableField[] = [
  { key: 'arf_seconds', label: 'ARF', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'correcting_repost_seconds', label: 'Correcting & Repost', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'edit_transfer_seconds', label: 'Edit & Transfer', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'emails_seconds', label: 'Emails', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'faxes_seconds', label: 'Faxes', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'meeting_seconds', label: 'Meeting', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'misc_seconds', label: 'Misc', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'payment_plan_seconds', label: 'Payment Plan', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'personal_seconds', label: 'Personal', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'printing_log_seconds', label: 'Printing/Adding to log', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'statements_seconds', label: 'Statements', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'task_seconds', label: 'Task', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'technical_issue_seconds', label: 'Technical Issue', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'training_seconds', label: 'Training', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'vms_seconds', label: 'Vms', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'wrap_up_seconds', label: 'Wrap Up (above allotted 30s)', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'break_seconds', label: 'Break (above allotted time)', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'lunch_seconds', label: 'Lunch (above allotted time)', unit: 'seconds', inputType: 'number', step: '1' },
  { key: 'total_seconds', label: 'Total', unit: 'seconds', inputType: 'number', step: '1' }
];

const ALL_FIELDS = [...SUMMARY_FIELDS, ...AUT_FIELDS];

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DataManagement: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [allowInProgressMonths, setAllowInProgressMonths] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [commentValue, setCommentValue] = useState('');
  const queryClient = useQueryClient();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isMonthClosed = (month: number, year: number) =>
    year < currentYear || (year === currentYear && month < currentMonth);

  const { data: availableMonths = [] } = useQuery({
    queryKey: ['availableMonths'],
    queryFn: () => reportService.getAvailableMonths()
  });

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    availableMonths.forEach(({ year }) => years.add(year));
    return Array.from(years).sort((a, b) => b - a);
  }, [availableMonths]);

  const monthOptionsForYear = useMemo(() => {
    if (selectedYear === null) {
      return [];
    }

    return availableMonths
      .filter((item) => item.year === selectedYear)
      .map((item) => item.month)
      .sort((a, b) => b - a);
  }, [availableMonths, selectedYear]);

  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    const isCurrentSelectionValid = selectedMonth !== null && selectedYear !== null && availableMonths.some(
      (item) => item.month === selectedMonth && item.year === selectedYear
    );

    const isCurrentSelectionAllowed = selectedMonth !== null && selectedYear !== null && (
      allowInProgressMonths || isMonthClosed(selectedMonth, selectedYear)
    );

    if (isCurrentSelectionValid && isCurrentSelectionAllowed) {
      return;
    }

    const preferred = availableMonths.find((item) =>
      allowInProgressMonths || isMonthClosed(item.month, item.year)
    ) || availableMonths[0];

    setSelectedMonth(preferred.month);
    setSelectedYear(preferred.year);
  }, [availableMonths, allowInProgressMonths, selectedMonth, selectedYear]);

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['reports', selectedMonth, selectedYear],
    queryFn: () => reportService.getReports(selectedMonth || undefined, selectedYear || undefined, undefined, 1, 500),
    enabled: selectedMonth !== null && selectedYear !== null
  });

  const reports: Report[] = reportsData?.reports || [];
  const selectedReport = reports.find((report) => report.agent_id === selectedAgentId) || null;

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedAgentId('');
      return;
    }

    const exists = reports.some((report) => report.agent_id === selectedAgentId);
    if (!exists) {
      setSelectedAgentId(reports[0].agent_id);
    }
  }, [reports, selectedAgentId]);

  useEffect(() => {
    if (!selectedReport) {
      setFormValues({});
      setCommentValue('');
      return;
    }

    const nextValues: Record<string, string> = {};

    ALL_FIELDS.forEach((field) => {
      const value = selectedReport[field.key];
      nextValues[field.key] = value === null || value === undefined ? '' : String(value);
    });

    setFormValues(nextValues);
    setCommentValue(selectedReport.comment || '');
  }, [selectedReport]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReport || selectedMonth === null || selectedYear === null) {
        throw new Error('Select month, year, and agent first');
      }

      const payload: ManagedReportUpdatePayload = {};

      for (const field of ALL_FIELDS) {
        const rawValue = (formValues[field.key] || '').trim();

        if (field.key === 'average_handle_time') {
          payload[field.key] = rawValue || null;
          continue;
        }

        if (!rawValue) {
          payload[field.key] = null;
          continue;
        }

        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Invalid value for "${field.label}"`);
        }

        payload[field.key] = numericValue;
      }

      return reportService.updateManagedReport(
        selectedReport.agent_id,
        selectedMonth,
        selectedYear,
        payload,
        commentValue
      );
    },
    onSuccess: () => {
      toast.success('Report data updated successfully');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['availableMonths'] });
      queryClient.invalidateQueries({ queryKey: ['agentList'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to save');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selectedReport || selectedMonth === null || selectedYear === null) {
        throw new Error('Select month, year, and agent first');
      }

      return reportService.deleteManagedReport(selectedReport.agent_id, selectedMonth, selectedYear);
    },
    onSuccess: () => {
      toast.success('Report data deleted successfully');
      setSelectedAgentId('');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['availableMonths'] });
      queryClient.invalidateQueries({ queryKey: ['agentList'] });
      queryClient.invalidateQueries({ queryKey: ['emailHistory'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to delete');
    }
  });

  const handleSave = () => {
    if (!selectedReport) {
      toast.error('Select an agent first');
      return;
    }

    saveMutation.mutate();
  };

  const handleDelete = () => {
    if (!selectedReport || selectedMonth === null || selectedYear === null) {
      toast.error('Select month, year, and agent first');
      return;
    }

    const confirmed = window.confirm(
      `Delete data for ${selectedReport.agent_name} (${monthNames[selectedMonth - 1]} ${selectedYear})? This also removes related comments and email history for this month.`
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate();
  };

  const renderFieldRow = (field: EditableField) => (
    <div key={field.key} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] gap-3 items-center py-2 border-b border-gray-100 last:border-b-0">
      <div className="text-sm text-gray-900">{field.label}</div>
      <div className="text-xs text-gray-500">{field.unit}</div>
      <input
        type={field.inputType}
        value={formValues[field.key] || ''}
        onChange={(event) =>
          setFormValues((prev) => ({
            ...prev,
            [field.key]: event.target.value
          }))
        }
        step={field.step}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Data Management</h1>
        <p className="mt-2 text-gray-600">
          Edit or delete report data by month and agent.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-medium text-gray-900">Select Data Scope</h2>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowInProgressMonths}
              onChange={(event) => setAllowInProgressMonths(event.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span className="ml-2">Allow in-progress months (override)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={selectedYear ?? ''}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={yearOptions.length === 0}
            >
              <option value="" disabled>Select year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
            <select
              value={selectedMonth ?? ''}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={selectedYear === null || monthOptionsForYear.length === 0}
            >
              <option value="" disabled>Select month</option>
              {monthOptionsForYear.map((month) => {
                const closed = selectedYear !== null && isMonthClosed(month, selectedYear);
                const disabled = !allowInProgressMonths && !closed;

                return (
                  <option key={month} value={month} disabled={disabled}>
                    {monthNames[month - 1]}{disabled ? ' (in progress)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Agent</label>
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              disabled={reports.length === 0}
            >
              <option value="">Select agent</option>
              {reports.map((report) => (
                <option key={report.agent_id} value={report.agent_id}>
                  {report.agent_name} ({report.agent_id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {!allowInProgressMonths && (
          <p className="text-xs text-gray-500">
            Current and future months are grayed out by default to prevent partial-month mistakes.
          </p>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        {reportsLoading ? (
          <div className="py-8 text-center text-gray-500">Loading data...</div>
        ) : !selectedReport ? (
          <div className="py-8 text-center text-gray-500">
            Select a month/year/agent with data to begin editing.
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                Editing: {selectedReport.agent_name}
              </h2>
              <p className="text-sm text-gray-500">
                {monthNames[selectedReport.month - 1]} {selectedReport.year} | Agent ID: {selectedReport.agent_id}
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Summary Metrics</h3>
              <div className="space-y-1">
                {SUMMARY_FIELDS.map(renderFieldRow)}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">AUT Breakdown</h3>
              <div className="space-y-1">
                {AUT_FIELDS.map(renderFieldRow)}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
              <textarea
                value={commentValue}
                onChange={(event) => setCommentValue(event.target.value)}
                rows={4}
                placeholder="Add or edit supervisor comment"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete This Agent Data'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataManagement;
