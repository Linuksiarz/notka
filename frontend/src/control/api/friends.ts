import { api } from './client';
import type {
  CreateFriendGroupRequest,
  FriendGroup,
  FriendsResponse,
  UpdateFriendGroupRequest,
  User
} from '../../entity/api/types';

export const friendsApi = {
  list: () => api.get<FriendsResponse>('/friends'),

  add: (login: string) => api.post<User>('/friends', { login }),

  remove: (userId: number) => api.delete<void>(`/friends/${userId}`),

  createGroup: (body: CreateFriendGroupRequest) => api.post<FriendGroup>('/friend-groups', body),

  updateGroup: (id: number, body: UpdateFriendGroupRequest) => api.patch<FriendGroup>(`/friend-groups/${id}`, body),

  removeGroup: (id: number) => api.delete<void>(`/friend-groups/${id}`)
};
