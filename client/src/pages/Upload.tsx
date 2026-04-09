import React, { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import uploadService from '../services/uploadService';
import toast from 'react-hot-toast';

type ReportFileType = 'agentSummary' | 'agentUnavailable';

interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

const Upload: React.FC = () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const defaultMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const defaultYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [month, setMonth] = useState<number>(defaultMonth);
  const [year, setSelectedYear] = useState<number>(defaultYear);
  const [allowInProgressMonths, setAllowInProgressMonths] = useState(false);
  const [agentSummaryFile, setAgentSummaryFile] = useState<File | null>(null);
  const [agentUnavailableFile, setAgentUnavailableFile] = useState<File | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateExists, setDuplicateExists] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  const validateFile = (file: File | null, expectedType: ReportFileType): FileValidationResult => {
    if (!file) {
      return {
        valid: false,
        errors: [
          expectedType === 'agentSummary'
            ? 'Agent Summary report is required'
            : 'Agent Unavailable Time report is required'
        ]
      };
    }

    const errors: string[] = [];
    const lowerName = file.name.toLowerCase();
    const hasValidExtension = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    if (!hasValidExtension) {
      errors.push('File must be .xlsx or .xls');
    }

    if (file.type && !ACCEPTED_MIME_TYPES.includes(file.type)) {
      errors.push('Invalid Excel MIME type');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push('File exceeds 10MB limit');
    }

    if (expectedType === 'agentSummary' && !lowerName.includes('summary')) {
      errors.push('Filename should include "summary"');
    }

    if (expectedType === 'agentUnavailable' && !lowerName.includes('unavailable')) {
      errors.push('Filename should include "unavailable"');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };

  const summaryValidation = useMemo(
    () => validateFile(agentSummaryFile, 'agentSummary'),
    [agentSummaryFile]
  );

  const unavailableValidation = useMemo(
    () => validateFile(agentUnavailableFile, 'agentUnavailable'),
    [agentUnavailableFile]
  );

  const isMonthClosed = (targetMonth: number, targetYear: number) =>
    targetYear < currentYear || (targetYear === currentYear && targetMonth < currentMonth);

  const selectedMonthAllowed = allowInProgressMonths || isMonthClosed(month, year);

  const canProcessFiles =
    summaryValidation.valid &&
    unavailableValidation.valid &&
    !duplicateExists &&
    selectedMonthAllowed &&
    !isProcessing;

  const setFileForType = (type: ReportFileType, file: File | null) => {
    if (type === 'agentSummary') {
      setAgentSummaryFile(file);
      return;
    }

    setAgentUnavailableFile(file);
  };

  const getValidationForType = (type: ReportFileType) =>
    type === 'agentSummary' ? summaryValidation : unavailableValidation;

  const handleDroppedFile = (
    type: ReportFileType,
    acceptedFiles: File[],
    fileRejections: FileRejection[]
  ) => {
    if (fileRejections.length > 0) {
      const firstRejection = fileRejections[0];
      const reason = firstRejection.errors[0]?.message || 'Invalid file';
      setFileForType(type, null);
      toast.error(reason);
      return;
    }

    const file = acceptedFiles[0];
    if (!file) {
      return;
    }

    setFileForType(type, file);

    const validation = validateFile(file, type);
    if (validation.valid) {
      toast.success(`${type === 'agentSummary' ? 'Agent Summary' : 'Agent Unavailable Time'} file is ready`);
      return;
    }

    toast.error(validation.errors[0]);
  };

  const summaryDropzone = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles, fileRejections) =>
      handleDroppedFile('agentSummary', acceptedFiles, fileRejections)
  });

  const unavailableDropzone = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles, fileRejections) =>
      handleDroppedFile('agentUnavailable', acceptedFiles, fileRejections)
  });

  const checkDuplicateMutation = useMutation({
    mutationFn: () => uploadService.checkDuplicate(month, year),
    onMutate: () => {
      setIsCheckingDuplicate(true);
    },
    onSuccess: (data) => {
      setDuplicateExists(data.exists);
      if (data.exists) {
        toast.error(`Data for ${month}/${year} already exists (${data.count} records)`);
      } else {
        toast.success('No duplicate data found. Ready to upload.');
      }
    },
    onError: (error: any) => {
      toast.error(`Error checking for duplicates: ${error.message}`);
    },
    onSettled: () => {
      setIsCheckingDuplicate(false);
    }
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!agentSummaryFile || !agentUnavailableFile) {
        throw new Error('Both report files are required');
      }

      return uploadService.uploadFiles(
        agentSummaryFile,
        agentUnavailableFile,
        month,
        year,
        allowInProgressMonths
      );
    },
    onMutate: () => {
      setIsProcessing(true);
    },
    onSuccess: (data) => {
      toast.success(`Successfully processed ${data.data.agentsProcessed} agents`);
      queryClient.invalidateQueries({ queryKey: ['availableMonths'] });
      queryClient.invalidateQueries({ queryKey: ['agentList'] });
      setAgentSummaryFile(null);
      setAgentUnavailableFile(null);
      setDuplicateExists(false);
    },
    onError: (error: any) => {
      if (error.response?.data?.duplicate) {
        setDuplicateExists(true);
      }
      toast.error(error.response?.data?.error || error.message || 'Upload failed');
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  const overwriteMutation = useMutation({
    mutationFn: () => uploadService.overwriteData(month, year),
    onSuccess: () => {
      toast.success('Existing data deleted. Ready for new upload.');
      setDuplicateExists(false);
    },
    onError: (error: any) => {
      toast.error(`Overwrite failed: ${error.message}`);
    }
  });

  const handleCheckDuplicate = () => {
    checkDuplicateMutation.mutate();
  };

  const handleUpload = () => {
    if (!selectedMonthAllowed) {
      toast.error('Selected month is still in progress. Enable override to continue.');
      return;
    }

    if (!summaryValidation.valid || !unavailableValidation.valid) {
      const allErrors = [...summaryValidation.errors, ...unavailableValidation.errors];
      toast.error(allErrors[0] || 'Please upload both valid files before processing');
      return;
    }

    if (duplicateExists) {
      toast.error('Duplicate data exists. Overwrite existing data before processing.');
      return;
    }

    uploadMutation.mutate();
  };

  const handleOverwrite = () => {
    if (window.confirm(`Are you sure you want to overwrite data for ${month}/${year}? This cannot be undone.`)) {
      overwriteMutation.mutate();
    }
  };

  const removeFile = (type: ReportFileType) => {
    setFileForType(type, null);
  };

  const formatFileSizeMB = (file: File) => `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (allowInProgressMonths) {
      return;
    }

    if (isMonthClosed(month, year)) {
      return;
    }

    const fallbackMonth = year < currentYear ? 12 : Math.max(currentMonth - 1, 1);
    setMonth(fallbackMonth);
  }, [allowInProgressMonths, month, year, currentMonth, currentYear]);

  useEffect(() => {
    setDuplicateExists(false);
  }, [month, year]);

  const renderUploadCard = (
    type: ReportFileType,
    title: string,
    subtitle: string,
    dropzone: ReturnType<typeof useDropzone>,
    file: File | null
  ) => {
    const validation = getValidationForType(type);

    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">{subtitle}</p>

        <div
          {...dropzone.getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dropzone.isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
          }`}
        >
          <input {...dropzone.getInputProps()} />
          <p className="text-sm text-gray-700">Drop file here or click to select</p>
          <p className="text-xs text-gray-500 mt-1">.xlsx or .xls, max 10MB</p>
        </div>

        {file && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 break-all">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSizeMB(file)}</p>
              </div>
              <button
                onClick={() => removeFile(type)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        <div className="mt-3">
          {validation.valid ? (
            <p className="text-sm text-green-700">File accepted</p>
          ) : (
            <p className="text-sm text-red-600">{validation.errors[0]}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Reports</h1>
        <p className="mt-2 text-gray-600">
          Upload each required report in its own section, then process once both are valid.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">Upload Rules</h3>
        <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
          <li>Agent Summary report goes in the Agent Summary section.</li>
          <li>Agent Unavailable Time report goes in the Agent Unavailable section.</li>
          <li>Files must be Excel (.xlsx or .xls) and up to 10MB.</li>
          <li>Process button stays disabled until both files pass validation.</li>
        </ul>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-lg font-medium text-gray-900">Select Month and Year</h2>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowInProgressMonths}
              onChange={(e) => setAllowInProgressMonths(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span className="ml-2">Allow in-progress months (override)</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {monthNames.map((name, index) => (
                <option
                  key={index}
                  value={index + 1}
                  disabled={!allowInProgressMonths && !isMonthClosed(index + 1, year)}
                >
                  {name}{!allowInProgressMonths && !isMonthClosed(index + 1, year) ? ' (in progress)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={year}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!allowInProgressMonths && (
          <p className="mt-3 text-xs text-gray-500">
            Current and future months are disabled by default to avoid partial-month uploads.
          </p>
        )}

        {!selectedMonthAllowed && (
          <p className="mt-2 text-sm text-red-600">
            Selected month is still in progress. Enable override to continue.
          </p>
        )}

        <div className="mt-6 flex space-x-4">
          <button
            onClick={handleCheckDuplicate}
            disabled={isCheckingDuplicate || !selectedMonthAllowed}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCheckingDuplicate ? 'Checking...' : 'Check for Duplicates'}
          </button>

          {duplicateExists && (
            <button
              onClick={handleOverwrite}
              disabled={overwriteMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {overwriteMutation.isPending ? 'Deleting...' : 'Overwrite Existing Data'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Excel Files</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderUploadCard(
            'agentSummary',
            'Agent Summary report',
            'Expected filename should include "summary"',
            summaryDropzone,
            agentSummaryFile
          )}

          {renderUploadCard(
            'agentUnavailable',
            'Agent Unavailable Time report',
            'Expected filename should include "unavailable"',
            unavailableDropzone,
            agentUnavailableFile
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={handleUpload}
            disabled={!canProcessFiles}
            className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing
              ? 'Processing Files...'
              : `Process Files for ${monthNames[month - 1]} ${year}`}
          </button>

          {!canProcessFiles && (
            <p className="mt-2 text-sm text-gray-600 text-center">
              Upload one valid file in each section to enable processing.
            </p>
          )}

          {duplicateExists && (
            <p className="mt-2 text-sm text-red-600 text-center">
              Data already exists for this month/year. Overwrite existing data before processing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Upload;
