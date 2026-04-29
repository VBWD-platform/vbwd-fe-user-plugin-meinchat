import { defineStore } from 'pinia';
import { getMyNickname, setMyNickname } from '../api';

interface State {
  nickname: string | null;
  loading: boolean;
}

export const useNicknameStore = defineStore('meinchat-nickname', {
  state: (): State => ({ nickname: null, loading: false }),

  actions: {
    async fetchMine() {
      this.loading = true;
      try {
        const result = await getMyNickname();
        this.nickname = result.nickname;
      } finally {
        this.loading = false;
      }
    },

    async update(newNickname: string) {
      const previous = this.nickname;
      this.nickname = newNickname;  // optimistic
      try {
        const row = await setMyNickname(newNickname);
        this.nickname = row.nickname;  // canonical from server
      } catch (err) {
        this.nickname = previous;
        throw err;
      }
    },
  },
});
