import { friendsApi } from '../api/friends';
import type { FriendGroup, User } from '../../entity/api/types';

/**
 * The reader's friends and the groups it sorts them into. Online only, like sharing itself, so there
 * is no copy on the device: the list is read when a dialog that needs it opens.
 */
class FriendsState {
  friends = $state<User[]>([]);
  groups = $state<FriendGroup[]>([]);
  loaded = $state(false);

  async load(): Promise<void> {
    const { friends, groups } = await friendsApi.list();
    this.friends = friends;
    this.groups = groups;
    this.loaded = true;
  }

  byId(id: number): User | undefined {
    return this.friends.find((friend) => friend.id === id);
  }

  async add(login: string): Promise<User> {
    const friend = await friendsApi.add(login);
    this.friends = [...this.friends, friend];
    return friend;
  }

  /** The server takes the friend out of every group too, and so does this copy. */
  async remove(userId: number): Promise<void> {
    await friendsApi.remove(userId);
    this.friends = this.friends.filter((friend) => friend.id !== userId);
    this.groups = this.groups.map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((id) => id !== userId)
    }));
  }

  async createGroup(name: string, memberIds: number[] = []): Promise<FriendGroup> {
    const group = await friendsApi.createGroup({ name, memberIds });
    this.groups = [...this.groups, group].sort(byName);
    return group;
  }

  async updateGroup(id: number, changes: { name?: string; memberIds?: number[] }): Promise<void> {
    const updated = await friendsApi.updateGroup(id, changes);
    this.groups = this.groups.map((group) => (group.id === id ? updated : group)).sort(byName);
  }

  async removeGroup(id: number): Promise<void> {
    await friendsApi.removeGroup(id);
    this.groups = this.groups.filter((group) => group.id !== id);
  }

  reset(): void {
    this.friends = [];
    this.groups = [];
    this.loaded = false;
  }
}

function byName(a: FriendGroup, b: FriendGroup): number {
  return a.name.localeCompare(b.name);
}

export const friends = new FriendsState();
