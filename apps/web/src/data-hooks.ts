import type {
  BatchSetSpaceMemberRolesSchema,
  CreateDocumentSchema,
  CreateFolderSchema,
  CreateGroupSchema,
  CreateMemberSchema,
  CreateSpaceSchema,
  SetGroupGrantsSchema,
  SetGroupMembersSchema,
  UpdateDocumentSchema,
  UpdateDocumentShareSchema,
  UpdateFolderSchema,
  UpdateGroupSchema,
  UpdateMemberSchema,
  UpdateSpaceSchema,
} from '@atlas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiForm, apiGet, apiJson } from './api-client';

type BatchSetSpaceMemberRolesInput = z.infer<typeof BatchSetSpaceMemberRolesSchema>;
type CreateSpaceInput = z.infer<typeof CreateSpaceSchema>;
type UpdateSpaceInput = z.infer<typeof UpdateSpaceSchema>;
type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;
type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;
type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
type UpdateShareInput = z.infer<typeof UpdateDocumentShareSchema>;
type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;
type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
type SetGroupMembersInput = z.infer<typeof SetGroupMembersSchema>;
type SetGroupGrantsInput = z.infer<typeof SetGroupGrantsSchema>;

type Toast = { msg: string; meta?: string };
type PushToast = (toast: Toast) => void;

export const atlasKeys = {
  me: ['me'] as const,
  spaces: ['spaces'] as const,
  documents: ['documents'] as const,
  document: (documentId: string) => ['documents', documentId] as const,
  members: ['members'] as const,
  groups: ['groups'] as const,
  permissions: ['permissions'] as const,
  spaceMembers: (spaceId: string) => ['space-members', spaceId] as const,
  trash: ['trash'] as const,
  trashFolders: ['trash-folders'] as const,
  share: (documentId: string) => ['share', documentId] as const,
  shareMemberSearch: (documentId: string, query: string) =>
    ['share-members', documentId, query] as const,
};

export function useAtlasData() {
  const meQuery = useQuery({
    queryKey: atlasKeys.me,
    queryFn: () => apiGet('/auth/me'),
  });
  const currentUser = meQuery.data?.user;
  const capabilities: string[] = meQuery.data?.capabilities ?? [];
  const hasCapability = (cap: string) => capabilities.includes(cap);
  // Admin (workspace-level) OR a holder of the relevant capability unlocks the management
  // surface. The backend enforces the same rule, so this is purely a UI optimization.
  const isWorkspaceAdmin = currentUser?.role === 'admin';
  const canManageMembers = isWorkspaceAdmin || hasCapability('manageMembers');
  const canManageGroups = isWorkspaceAdmin || hasCapability('manageGroups');

  const spacesQuery = useQuery({
    queryKey: atlasKeys.spaces,
    queryFn: () => apiGet('/spaces'),
  });
  const membersQuery = useQuery({
    queryKey: atlasKeys.members,
    queryFn: () => apiGet('/members'),
    enabled: canManageMembers,
  });
  const permissionsQuery = useQuery({
    queryKey: atlasKeys.permissions,
    queryFn: () => apiGet('/members/permissions'),
    enabled: canManageMembers,
  });
  const groupsQuery = useQuery({
    queryKey: atlasKeys.groups,
    queryFn: () => apiGet('/groups'),
    enabled: canManageGroups,
  });

  return {
    spaces: spacesQuery.data || [],
    members: canManageMembers ? membersQuery.data || [] : [],
    groups: canManageGroups ? groupsQuery.data || [] : [],
    permissions: canManageMembers ? permissionsQuery.data || [] : [],
    capabilities,
    hasCapability,
    canManageMembers,
    canManageGroups,
    currentUser,
    session: meQuery.data?.session,
    isLoading:
      spacesQuery.isLoading ||
      meQuery.isLoading ||
      (canManageMembers && (membersQuery.isLoading || permissionsQuery.isLoading)) ||
      (canManageGroups && groupsQuery.isLoading),
    error:
      spacesQuery.error ||
      meQuery.error ||
      (canManageMembers ? membersQuery.error || permissionsQuery.error : null) ||
      (canManageGroups ? groupsQuery.error : null),
  };
}

export function useDocument(documentId?: string | null, enabled = true) {
  return useQuery({
    queryKey: atlasKeys.document(documentId || ''),
    queryFn: () => apiGet(`/documents/${documentId}`),
    enabled: enabled && Boolean(documentId),
  });
}

export function useAtlasMutations(pushToast?: PushToast) {
  const queryClient = useQueryClient();
  const invalidateCore = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atlasKeys.spaces }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.documents }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.permissions }),
      queryClient.invalidateQueries({ queryKey: ['space-members'] }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.trash }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.trashFolders }),
    ]);
  };

  const createSpace = useMutation({
    mutationFn: (data: CreateSpaceInput) => apiJson('/spaces', 'POST', data),
    onSuccess: async (_data: unknown, variables: CreateSpaceInput) => {
      await invalidateCore();
      pushToast?.({ msg: '空间已创建', meta: variables.name });
    },
  });

  const updateSpace = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSpaceInput }) =>
      apiJson(`/spaces/${id}`, 'PATCH', patch),
    onSuccess: async (_data: unknown, variables: { id: string; patch: UpdateSpaceInput }) => {
      await invalidateCore();
      pushToast?.({ msg: '空间已更新', meta: variables.patch?.name });
    },
  });

  const deleteSpace = useMutation({
    mutationFn: (id: string) => apiJson(`/spaces/${id}`, 'DELETE'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '空间已删除' });
    },
  });

  const createFolder = useMutation({
    mutationFn: (data: CreateFolderInput) => apiJson('/folders', 'POST', data),
    onSuccess: async (_data: unknown, variables: CreateFolderInput) => {
      await invalidateCore();
      pushToast?.({ msg: '文件夹已创建', meta: variables.name });
    },
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateFolderInput }) =>
      apiJson(`/folders/${id}`, 'PATCH', patch),
    onSuccess: async (_data: unknown, variables: { id: string; patch: UpdateFolderInput }) => {
      await invalidateCore();
      pushToast?.({ msg: '文件夹已更新', meta: variables.patch?.name });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => apiJson(`/folders/${id}`, 'DELETE'),
    onSuccess: async (data: unknown) => {
      await invalidateCore();
      const docs = (data as { docs?: number })?.docs ?? 0;
      pushToast?.({ msg: '文件夹已移至回收站', meta: docs > 0 ? `含 ${docs} 篇文章` : undefined });
    },
    onError: (err: unknown) => {
      pushToast?.({ msg: '无法删除文件夹', meta: (err as Error)?.message });
    },
  });

  const restoreFolder = useMutation({
    mutationFn: (id: string) => apiJson(`/folders/${id}/restore`, 'POST'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '文件夹已恢复' });
    },
  });

  const permanentDeleteFolder = useMutation({
    mutationFn: (id: string) => apiJson(`/folders/${id}/permanent`, 'DELETE'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '文件夹已永久删除' });
    },
  });

  const createDocument = useMutation({
    mutationFn: (data: CreateDocumentInput) => apiJson('/documents', 'POST', data),
    onSuccess: async (_data: unknown, variables: CreateDocumentInput) => {
      await invalidateCore();
      pushToast?.({ msg: '文章已创建', meta: variables.title });
    },
  });

  const updateDocument = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDocumentInput }) =>
      apiJson(`/documents/${id}`, 'PATCH', patch),
    onSuccess: async (_data: unknown, variables: { id: string; patch: UpdateDocumentInput }) => {
      const directoryFields: (keyof UpdateDocumentInput)[] = [
        'title',
        'desc',
        'access',
        'dot',
        'tags',
        'spaceId',
      ];
      const mayUpdateDirectoryMetadata =
        variables.patch.html !== undefined ||
        directoryFields.some((field) => variables.patch[field] !== undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atlasKeys.document(variables.id) }),
        queryClient.invalidateQueries({ queryKey: atlasKeys.documents }),
        ...(mayUpdateDirectoryMetadata
          ? [queryClient.invalidateQueries({ queryKey: atlasKeys.spaces })]
          : []),
      ]);
      pushToast?.({ msg: '已保存', meta: variables.patch?.title || '内容已更新' });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (id: string) => apiJson(`/documents/${id}`, 'DELETE'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '已移至回收站' });
    },
  });

  const restoreDocument = useMutation({
    mutationFn: (id: string) => apiJson(`/documents/${id}/restore`, 'POST'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '已恢复' });
    },
  });

  const purgeExpiredTrash = useMutation({
    mutationFn: () => apiJson('/documents/trash/purge-expired', 'POST'),
    onSuccess: async (data: unknown) => {
      await invalidateCore();
      const result = data as { purged?: number; folders?: number };
      const parts = [`${result?.purged ?? 0} 篇`];
      if (result?.folders) parts.push(`${result.folders} 个文件夹`);
      pushToast?.({ msg: '已清理过期项目', meta: parts.join(' · ') });
    },
  });

  const uploadDocument = useMutation({
    mutationFn: (formData: FormData) => apiForm('/documents/upload', formData),
    onSuccess: async (_data: unknown, variables: FormData) => {
      await invalidateCore();
      pushToast?.({ msg: '已发布', meta: variables.get('title') as string | undefined });
    },
  });

  type SetSpaceRoleVars = {
    spaceId: string;
    memberId: string;
    role: string | null;
    silent?: boolean;
  };
  const refreshSpacePermissionQueries = async (spaceId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atlasKeys.spaceMembers(spaceId) }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.permissions }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.spaces }),
    ]);
  };
  const setSpaceRole = useMutation({
    mutationFn: ({ spaceId, memberId, role }: SetSpaceRoleVars) =>
      apiJson(`/spaces/${spaceId}/members/${memberId}`, 'PUT', { role }),
    onSuccess: async (_data: unknown, variables: SetSpaceRoleVars) => {
      await refreshSpacePermissionQueries(variables.spaceId);
      if (!variables?.silent) {
        pushToast?.({ msg: '空间权限已更新' });
      }
    },
  });

  type SetSpaceRolesVars = BatchSetSpaceMemberRolesInput & {
    spaceId: string;
    silent?: boolean;
  };
  const setSpaceRoles = useMutation({
    mutationFn: ({ spaceId, updates }: SetSpaceRolesVars) =>
      apiJson(`/spaces/${spaceId}/members`, 'PUT', { updates }),
    onSuccess: async (_data: unknown, variables: SetSpaceRolesVars) => {
      await refreshSpacePermissionQueries(variables.spaceId);
      if (!variables?.silent) {
        pushToast?.({ msg: '空间权限已批量更新' });
      }
    },
  });

  const createMember = useMutation({
    mutationFn: (data: CreateMemberInput) => apiJson('/members', 'POST', data),
    onSuccess: async (data: unknown) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.members });
      pushToast?.({ msg: '成员已新增', meta: (data as { name?: string })?.name });
    },
  });

  const updateMember = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMemberInput }) =>
      apiJson(`/members/${id}`, 'PATCH', patch),
    onSuccess: async (data: unknown, variables: { id: string; patch: UpdateMemberInput }) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.members });
      pushToast?.({
        msg: variables.patch?.password ? '成员密码已更新' : '成员已更新',
        meta: (data as { name?: string })?.name,
      });
    },
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => apiJson(`/members/${id}`, 'DELETE'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: atlasKeys.members }),
        queryClient.invalidateQueries({ queryKey: atlasKeys.permissions }),
        queryClient.invalidateQueries({ queryKey: atlasKeys.spaces }),
      ]);
      pushToast?.({ msg: '成员已删除' });
    },
  });

  const updateShare = useMutation({
    mutationFn: ({ documentId, patch }: { documentId: string; patch: UpdateShareInput }) =>
      apiJson(`/documents/${documentId}/share`, 'PATCH', patch),
    onSuccess: async (
      _data: unknown,
      variables: { documentId: string; patch: UpdateShareInput },
    ) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.share(variables.documentId) });
      pushToast?.({ msg: '分享设置已更新' });
    },
  });

  // Group grants/memberships change effective access, so refresh spaces alongside the group list.
  const invalidateGroups = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atlasKeys.groups }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.spaces }),
    ]);
  };

  const createGroup = useMutation({
    mutationFn: (data: CreateGroupInput) => apiJson('/groups', 'POST', data),
    onSuccess: async (data: unknown) => {
      await invalidateGroups();
      pushToast?.({ msg: '权限组已创建', meta: (data as { name?: string })?.name });
    },
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateGroupInput }) =>
      apiJson(`/groups/${id}`, 'PATCH', patch),
    onSuccess: async () => {
      await invalidateGroups();
      pushToast?.({ msg: '权限组已更新' });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => apiJson(`/groups/${id}`, 'DELETE'),
    onSuccess: async () => {
      await invalidateGroups();
      pushToast?.({ msg: '权限组已删除' });
    },
  });

  const setGroupMembers = useMutation({
    mutationFn: ({ id, memberIds }: { id: string } & SetGroupMembersInput) =>
      apiJson(`/groups/${id}/members`, 'PUT', { memberIds }),
    onSuccess: async () => {
      await invalidateGroups();
      pushToast?.({ msg: '组成员已更新' });
    },
  });

  const setGroupGrants = useMutation({
    mutationFn: ({ id, grants }: { id: string } & SetGroupGrantsInput) =>
      apiJson(`/groups/${id}/grants`, 'PUT', { grants }),
    onSuccess: async () => {
      await invalidateGroups();
      pushToast?.({ msg: '组授权已更新' });
    },
  });

  return {
    createSpace: (data: CreateSpaceInput) => createSpace.mutate(data),
    updateSpace: (id: string, patch: UpdateSpaceInput) => updateSpace.mutate({ id, patch }),
    deleteSpace: (id: string) => deleteSpace.mutate(id),
    createFolder: (data: CreateFolderInput) => createFolder.mutate(data),
    updateFolder: (id: string, patch: UpdateFolderInput) => updateFolder.mutate({ id, patch }),
    deleteFolder: (id: string) => deleteFolder.mutate(id),
    restoreFolder: (id: string) => restoreFolder.mutate(id),
    permanentDeleteFolder: (id: string) => permanentDeleteFolder.mutate(id),
    createDocument: (
      data: CreateDocumentInput,
      options?: Parameters<typeof createDocument.mutate>[1],
    ) => createDocument.mutate(data, options),
    updateDocument: (
      id: string,
      patch: UpdateDocumentInput,
      options?: Parameters<typeof updateDocument.mutate>[1],
    ) => updateDocument.mutate({ id, patch }, options),
    deleteDocument: (id: string) => deleteDocument.mutate(id),
    restoreDocument: (id: string) => restoreDocument.mutate(id),
    purgeExpiredTrash: () => purgeExpiredTrash.mutate(),
    uploadDocument: (formData: FormData, options?: Parameters<typeof uploadDocument.mutate>[1]) =>
      uploadDocument.mutate(formData, options),
    setSpaceRole: (
      spaceId: string,
      memberId: string,
      role: string | null,
      options: { silent?: boolean } & Parameters<typeof setSpaceRole.mutate>[1] = {},
    ) => {
      const { silent, ...mutationOptions } = options;
      setSpaceRole.mutate({ spaceId, memberId, role, silent }, mutationOptions);
    },
    setSpaceRoles: (
      spaceId: string,
      updates: BatchSetSpaceMemberRolesInput['updates'],
      options: { silent?: boolean } & Parameters<typeof setSpaceRoles.mutate>[1] = {},
    ) => {
      const { silent, ...mutationOptions } = options;
      setSpaceRoles.mutate({ spaceId, updates, silent }, mutationOptions);
    },
    createMember: (data: CreateMemberInput, options?: Parameters<typeof createMember.mutate>[1]) =>
      createMember.mutate(data, options),
    updateMember: (
      id: string,
      patch: UpdateMemberInput,
      options?: Parameters<typeof updateMember.mutate>[1],
    ) => updateMember.mutate({ id, patch }, options),
    deleteMember: (id: string, options?: Parameters<typeof deleteMember.mutate>[1]) =>
      deleteMember.mutate(id, options),
    updateShare: (documentId: string, patch: UpdateShareInput) =>
      updateShare.mutate({ documentId, patch }),
    createGroup: (data: CreateGroupInput) => createGroup.mutate(data),
    updateGroup: (id: string, patch: UpdateGroupInput) => updateGroup.mutate({ id, patch }),
    deleteGroup: (id: string) => deleteGroup.mutate(id),
    setGroupMembers: (id: string, memberIds: string[]) => setGroupMembers.mutate({ id, memberIds }),
    setGroupGrants: (id: string, grants: SetGroupGrantsInput['grants']) =>
      setGroupGrants.mutate({ id, grants }),
  };
}
