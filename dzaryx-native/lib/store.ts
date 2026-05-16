import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'personal' | 'business' | null;
export type BusinessType = 'car_rental' | 'restaurant' | 'salon' | 'freelance' | 'retail' | 'custom' | null;

interface UserState {
  // Auth
  userId:       string | null;
  displayName:  string | null;
  telegramId:   string | null;

  // Onboarding
  mode:           AppMode;
  businessType:   BusinessType;
  businessName:   string | null;
  city:           string | null;
  onboardingDone: boolean;

  // Subscription
  isSubscribed:   boolean;

  // Actions
  setUser:          (id: string, name: string) => void;
  setMode:          (mode: AppMode) => void;
  setBusiness:      (type: BusinessType, name: string, city: string) => void;
  setPersonal:      (city: string) => void;
  completeOnboarding: () => void;
  setSubscribed:    (val: boolean) => void;
  reset:            () => void;
}

export const useStore = create<UserState>((set) => ({
  userId:       null,
  displayName:  null,
  telegramId:   null,
  mode:         null,
  businessType: null,
  businessName: null,
  city:         null,
  onboardingDone: false,
  isSubscribed: false,

  setUser: (id, name) => set({ userId: id, displayName: name }),
  setMode: (mode) => set({ mode }),
  setBusiness: (type, name, city) => set({ businessType: type, businessName: name, city }),
  setPersonal: (city) => set({ city }),
  completeOnboarding: () => {
    set({ onboardingDone: true });
    AsyncStorage.setItem('onboarding_done', 'true');
  },
  setSubscribed: (val) => set({ isSubscribed: val }),
  reset: () => set({
    userId: null, displayName: null, mode: null,
    businessType: null, businessName: null, city: null,
    onboardingDone: false, isSubscribed: false,
  }),
}));
