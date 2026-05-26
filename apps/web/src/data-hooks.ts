// @ts-nocheck — keeps the migrated prototype moving while API wiring lands.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiForm, apiGet, apiJson } from './api-client';

export const atlasKeys = {
  me: ['me'],
  spaces: ['spaces'],
  documents: ['documents'],
  members: ['members'],
  permissions: ['permissions'],
  trash: ['trash'],
  skills: ['skills'],
  share: (documentId) => ['share', documentId],
};

export function useAtlasData() {
  const meQuery = useQuery({
    queryKey: atlasKeys.me,
    queryFn: () => apiGet('/auth/me'),
  });
  const currentUser = meQuery.data?.user;
  const isWorkspaceAdmin = currentUser?.role === 'admin';

  const spacesQuery = useQuery({
    queryKey: atlasKeys.spaces,
    queryFn: () => apiGet('/spaces'),
  });
  const membersQuery = useQuery({
    queryKey: atlasKeys.members,
    queryFn: () => apiGet('/members'),
    enabled: isWorkspaceAdmin,
  });
  const permissionsQuery = useQuery({
    queryKey: atlasKeys.permissions,
    queryFn: () => apiGet('/members/permissions'),
    enabled: isWorkspaceAdmin,
  });

  return {
    spaces: spacesQuery.data || [],
    members: isWorkspaceAdmin ? membersQuery.data || [] : [],
    permissions: isWorkspaceAdmin ? permissionsQuery.data || [] : [],
    currentUser,
    session: meQuery.data?.session,
    isLoading:
      spacesQuery.isLoading ||
      meQuery.isLoading ||
      (isWorkspaceAdmin && (membersQuery.isLoading || permissionsQuery.isLoading)),
    error:
      spacesQuery.error ||
      meQuery.error ||
      (isWorkspaceAdmin ? membersQuery.error || permissionsQuery.error : null),
  };
}

export function useAtlasMutations(pushToast) {
  const queryClient = useQueryClient();
  const invalidateCore = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: atlasKeys.spaces }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.documents }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.permissions }),
      queryClient.invalidateQueries({ queryKey: atlasKeys.trash }),
    ]);
  };

  const createSpace = useMutation({
    mutationFn: (data) => apiJson('/spaces', 'POST', data),
    onSuccess: async (_data, variables) => {
      await invalidateCore();
      pushToast?.({ msg: '空间已创建', meta: variables.name });
    },
  });

  const updateSpace = useMutation({
    mutationFn: ({ id, patch }) => apiJson(`/spaces/${id}`, 'PATCH', patch),
    onSuccess: async (_data, variables) => {
      await invalidateCore();
      pushToast?.({ msg: '空间已更新', meta: variables.patch?.name });
    },
  });

  const deleteSpace = useMutation({
    mutationFn: (id) => apiJson(`/spaces/${id}`, 'DELETE'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '空间已删除' });
    },
  });

  const createDocument = useMutation({
    mutationFn: (data) => apiJson('/documents', 'POST', data),
    onSuccess: async (_data, variables) => {
      await invalidateCore();
      pushToast?.({ msg: '文章已创建', meta: variables.title });
    },
  });

  const updateDocument = useMutation({
    mutationFn: ({ id, patch }) => apiJson(`/documents/${id}`, 'PATCH', patch),
    onSuccess: async (_data, variables) => {
      await invalidateCore();
      pushToast?.({ msg: '已保存', meta: variables.patch?.title || '内容已更新' });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (id) => apiJson(`/documents/${id}`, 'DELETE'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '已移至回收站' });
    },
  });

  const restoreDocument = useMutation({
    mutationFn: (id) => apiJson(`/documents/${id}/restore`, 'POST'),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '已恢复' });
    },
  });

  const purgeExpiredTrash = useMutation({
    mutationFn: () => apiJson('/documents/trash/purge-expired', 'POST'),
    onSuccess: async (data) => {
      await invalidateCore();
      pushToast?.({ msg: '已清理过期项目', meta: `${data?.purged ?? 0} 篇` });
    },
  });

  const uploadDocument = useMutation({
    mutationFn: (formData) => apiForm('/documents/upload', formData),
    onSuccess: async (_data, variables) => {
      await invalidateCore();
      pushToast?.({ msg: '已发布', meta: variables.get('title') });
    },
  });

  const setSpaceRole = useMutation({
    mutationFn: ({ spaceId, memberId, role }) =>
      apiJson(`/spaces/${spaceId}/members/${memberId}`, 'PUT', { role }),
    onSuccess: async () => {
      await invalidateCore();
      pushToast?.({ msg: '空间权限已更新' });
    },
  });

  const createMember = useMutation({
    mutationFn: (data) => apiJson('/members', 'POST', data),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.members });
      pushToast?.({ msg: '成员已新增', meta: data?.name });
    },
  });

  const updateMember = useMutation({
    mutationFn: ({ id, patch }) => apiJson(`/members/${id}`, 'PATCH', patch),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.members });
      pushToast?.({
        msg: variables.patch?.password ? '成员密码已更新' : '成员已更新',
        meta: _data?.name,
      });
    },
  });

  const deleteMember = useMutation({
    mutationFn: (id) => apiJson(`/members/${id}`, 'DELETE'),
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
    mutationFn: ({ documentId, patch }) =>
      apiJson(`/documents/${documentId}/share`, 'PATCH', patch),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.share(variables.documentId) });
      pushToast?.({ msg: '分享设置已更新' });
    },
  });

  const activateSkill = useMutation({
    mutationFn: (version) => apiJson(`/skills/${version}/activate`, 'POST'),
    onSuccess: async (_data, version) => {
      await queryClient.invalidateQueries({ queryKey: atlasKeys.skills });
      pushToast?.({ msg: '已切换 skill 版本', meta: `v${version}` });
    },
  });

  return {
    createSpace: (data) => createSpace.mutate(data),
    updateSpace: (id, patch) => updateSpace.mutate({ id, patch }),
    deleteSpace: (id) => deleteSpace.mutate(id),
    createDocument: (data, options) => createDocument.mutate(data, options),
    updateDocument: (id, patch, options) => updateDocument.mutate({ id, patch }, options),
    deleteDocument: (id) => deleteDocument.mutate(id),
    restoreDocument: (id) => restoreDocument.mutate(id),
    purgeExpiredTrash: () => purgeExpiredTrash.mutate(),
    uploadDocument: (formData, options) => uploadDocument.mutate(formData, options),
    setSpaceRole: (spaceId, memberId, role) => setSpaceRole.mutate({ spaceId, memberId, role }),
    createMember: (data, options) => createMember.mutate(data, options),
    updateMember: (id, patch, options) => updateMember.mutate({ id, patch }, options),
    deleteMember: (id, options) => deleteMember.mutate(id, options),
    updateShare: (documentId, patch) => updateShare.mutate({ documentId, patch }),
    activateSkill: (version) => activateSkill.mutate(version),
  };
}
