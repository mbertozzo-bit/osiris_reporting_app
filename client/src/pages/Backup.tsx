import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import backupService, { BackupFile } from '../services/backupService';
import toast from 'react-hot-toast';

const Backup: React.FC = () => {
  const [confirmRestore, setConfirmRestore] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch backup list and stats
  const { data: backupData, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupService.listBackups()
  });

  // Create backup mutation
  const createBackupMutation = useMutation({
    mutationFn: () => backupService.createBackup(),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Backup created: ${data.backupFile}`);
        queryClient.invalidateQueries({ queryKey: ['backups'] });
      } else {
        toast.error(data.error || 'Failed to create backup');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create backup');
    }
  });

  // Restore backup mutation
  const restoreMutation = useMutation({
    mutationFn: (filename: string) => backupService.restoreBackup(filename, true),
    onSuccess: () => {
      toast.success('Backup restored successfully');
      setSelectedBackup(null);
      setConfirmRestore('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to restore backup');
    }
  });

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: (filename: string) => backupService.deleteBackup(filename, true),
    onSuccess: () => {
      toast.success('Backup deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete backup');
    }
  });

  const backups: BackupFile[] = backupData?.backups || [];
  const stats = backupData?.stats;

  const handleRestore = (filename: string) => {
    setSelectedBackup(filename);
    setConfirmRestore('');
  };

  const confirmRestoreAction = () => {
    if (confirmRestore.toLowerCase() === 'restore') {
      if (selectedBackup) {
        restoreMutation.mutate(selectedBackup);
      }
    } else {
      toast.error('Type "restore" to confirm');
    }
  };

  const handleDelete = (filename: string) => {
    if (window.confirm(`Are you sure you want to delete "${filename}"? This cannot be undone.`)) {
      deleteMutation.mutate(filename);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Backup Management</h1>
        <p className="mt-2 text-gray-600">
          Manage database backups and restoration
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Total Backups</h3>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalBackups || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Storage Used</h3>
              <p className="text-3xl font-bold text-gray-900">{stats?.formattedTotalSize || '0 B'}</p>
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
              <h3 className="text-lg font-medium text-gray-900">Oldest Backup</h3>
              <p className="text-sm font-bold text-gray-900">
                {stats?.oldestBackup ? formatDate(stats.oldestBackup) : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Newest Backup</h3>
              <p className="text-sm font-bold text-gray-900">
                {stats?.newestBackup ? formatDate(stats.newestBackup) : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Backup Button */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Database Backup</h2>
            <p className="text-sm text-gray-500">
              Create a manual backup of the SQLite database. Backups are retained for 30 days.
            </p>
          </div>
          <button
            onClick={() => createBackupMutation.mutate()}
            disabled={createBackupMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {createBackupMutation.isPending ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Backup
              </>
            )}
          </button>
        </div>
      </div>

      {/* Backup List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Available Backups</h2>
          <p className="text-sm text-gray-500">
            {backups.length} backup{backups.length !== 1 ? 's' : ''} stored
          </p>
        </div>

        {isLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="mt-4 text-gray-500">No backups found.</p>
            <p className="mt-2 text-sm text-gray-400">Create a backup to protect your data.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <span className="text-sm font-mono text-gray-900">{backup.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {backup.formattedSize}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(backup.created)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleRestore(backup.filename)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handleDelete(backup.filename)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Restore Backup</h3>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
              <div className="flex">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.326-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.654-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Warning:</strong> This will overwrite all current data with the backup.
                  </p>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              To restore backup "<strong>{selectedBackup}</strong>", type "restore" below:
            </p>
            
            <input
              type="text"
              value={confirmRestore}
              onChange={(e) => setConfirmRestore(e.target.value)}
              placeholder='Type "restore" to confirm'
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 mb-4"
            />

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setSelectedBackup(null); setConfirmRestore(''); }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestoreAction}
                disabled={confirmRestore.toLowerCase() !== 'restore' || restoreMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoreMutation.isPending ? 'Restoring...' : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backup;