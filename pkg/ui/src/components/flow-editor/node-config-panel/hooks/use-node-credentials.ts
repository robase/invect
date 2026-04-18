import { useState, useCallback } from 'react';
import {
  useCredentials,
  useCreateCredential,
  useUpdateCredential,
} from '../../../../api/credentials.api';
import type { Credential } from '../../../../api/types';

/**
 * Manages credential CRUD modals and state for the node config panel:
 * - Fetches credentials list
 * - Create credential modal open/close + submission
 * - Edit credential modal open/close + submission
 */
export function useNodeCredentials({
  enabled,
  onFieldChange,
}: {
  enabled: boolean;
  onFieldChange: (fieldName: string, value: unknown) => void;
}) {
  const {
    data: credentials = [],
    isLoading: credentialsLoading,
    isError: credentialsError,
    refetch: refetchCredentials,
  } = useCredentials({ includeShared: true }, { enabled });

  const createCredentialMutation = useCreateCredential();
  const updateCredentialMutation = useUpdateCredential();

  // Create credential modal
  const [isCreateCredentialOpen, setIsCreateCredentialOpen] = useState(false);
  const [activeCredentialField, setActiveCredentialField] = useState<string | null>(null);

  // Edit credential modal
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

  const handleAddNewCredential = useCallback((fieldName: string) => {
    setActiveCredentialField(fieldName);
    setIsCreateCredentialOpen(true);
  }, []);

  const handleCloseCredentialModal = useCallback(() => {
    setIsCreateCredentialOpen(false);
    setActiveCredentialField(null);
  }, []);

  const handleCreateCredential = useCallback(
    (input: Parameters<typeof createCredentialMutation.mutate>[0]) => {
      createCredentialMutation.mutate(input, {
        onSuccess: (createdCredential: Credential) => {
          if (activeCredentialField) {
            onFieldChange(activeCredentialField, createdCredential.id);
          }
          handleCloseCredentialModal();
        },
      });
    },
    [createCredentialMutation, activeCredentialField, onFieldChange, handleCloseCredentialModal],
  );

  const handleEditCredential = useCallback((credential: Credential) => {
    setEditingCredential(credential);
  }, []);

  const handleCloseEditCredential = useCallback(() => {
    setEditingCredential(null);
  }, []);

  const handleUpdateCredential = useCallback(
    (data: Parameters<typeof updateCredentialMutation.mutate>[0]['data']) => {
      if (!editingCredential) {
        return;
      }
      updateCredentialMutation.mutate(
        { id: editingCredential.id, data },
        { onSuccess: () => setEditingCredential(null) },
      );
    },
    [editingCredential, updateCredentialMutation],
  );

  return {
    credentials,
    credentialsLoading,
    credentialsError,
    refetchCredentials,

    // Create modal
    isCreateCredentialOpen,
    handleAddNewCredential,
    handleCloseCredentialModal,
    handleCreateCredential,
    isCreating: createCredentialMutation.isPending,

    // Edit modal
    editingCredential,
    handleEditCredential,
    handleCloseEditCredential,
    handleUpdateCredential,
    isUpdating: updateCredentialMutation.isPending,
  };
}
