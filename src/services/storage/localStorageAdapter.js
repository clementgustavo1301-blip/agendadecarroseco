import { STORAGE_KEYS } from '../../core/constants.js';
import { uid } from '../../utils/dom.js';

class LocalStorageAdapter {
  constructor() {
    this.memoryFallback = new Map();
  }

  isAvailable() {
    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  async get(key) {
    if (this.isAvailable()) {
      const item = localStorage.getItem(key);
      if (item === null) return null;
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    }
    return this.memoryFallback.get(key) || null;
  }

  async set(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.isAvailable()) {
      localStorage.setItem(key, serialized);
    } else {
      this.memoryFallback.set(key, value);
    }
    return true;
  }

  async remove(key) {
    if (this.isAvailable()) {
      localStorage.removeItem(key);
    } else {
      this.memoryFallback.delete(key);
    }
    return true;
  }

  async initSeed() {
    let users = await this.get(STORAGE_KEYS.USERS);
    if (!users || !Array.isArray(users) || users.length === 0) {
      users = [{
        id: uid(),
        nome: 'Administrador',
        cpf: '00000000000',
        senha: 'admin123',
        isAdmin: true,
        isAdminMestre: true,
        senhaProvisoria: true
      }];
      await this.set(STORAGE_KEYS.USERS, users);
      return { isFirstRun: true };
    }

    let cars = await this.get(STORAGE_KEYS.CARS);
    if (!cars || !Array.isArray(cars)) {
      await this.set(STORAGE_KEYS.CARS, []);
    }

    let schedules = await this.get(STORAGE_KEYS.SCHEDULES);
    if (!schedules || !Array.isArray(schedules)) {
      await this.set(STORAGE_KEYS.SCHEDULES, []);
    }

    return { isFirstRun: false };
  }
}

export const storage = new LocalStorageAdapter();
