import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'personal' | 'business' | null;
export type BusinessType = 'car_rental' | 'restaurant' | 'salon' | 'freelance' | 'retail' | 'custom' | null;
export type ActorId = 'kouider' | 'houari' | null;

const TOKENS: Record<string, string> = {
  kouider: process.env.EXPO_PUBLIC_MOBILE_TOKEN        ?? '',
  houari:  process.env.EXPO_PUBLIC_MOBILE_TOKEN_HOUARI ?? '',
};

interface UserState {
  // Auth
  userId:       string | null;
  displayName:  string | null;
  telegramId:   string | null;
  actorId:      ActorId;

  // Onboarding
  mode:           AppMode;
  businessType:   BusinessType;
  businessName:   string | null;
  city:           string | null;
  onboardingDone: boolean;

  // Subscription
  isSubscribed:   boolean;

  // Derived
  mobileToken: () => string;
  sessionId:   () => string;

  // Actions
  setUser:          (id: string, name: string) => void;
  setActor:         (id: ActorId) => void;
  setMode:          (mode: AppMode) => void;
  setBusiness:      (type: BusinessType, name: string, city: string) => void;
  setPersonal:      (city: string) => void;
  completeOnboarding: () => void;
  setSubscribed:    (val: boolean) => void;
  reset:            () => void;
}

export const useStore = create<UserState>((set, get) => ({
  userId:       null,
  displayName:  null,
  telegramId:   null,
  actorId:      null,
  mode:         null,
  businessType: null,
  businessName: null,
  city:         null,
  onboardingDone: false,
  isSubscribed: false,

  mobileToken: () => TOKENS[get().actorId ?? 'kouider'] ?? TOKENS['kouider'] ?? '',
  sessionId:   () => `mobile_${get().actorId ?? 'kouider'}`,

  setUser:  (id, name) => set({ userId: id, displayName: name }),
  setActor: (id) => {
    set({ actorId: id });
    if (id) AsyncStorage.setItem('actor_id', id);
  },
  setMode:  (mode) => set({ mode }),
  setBusiness: (type, name, city) => set({ businessType: type, businessName: name, city }),
  setPersonal: (city) => set({ city }),
  completeOnboarding: () => {
    set({ onboardingDone: true });
    AsyncStorage.setItem('onboarding_done', 'true');
  },
  setSubscribed: (val) => set({ isSubscribed: val }),
  reset: () => {
    AsyncStorage.multiRemove(['onboarding_done', 'actor_id']);
    set({
      userId: null, displayName: null, actorId: null, mode: null,
      businessType: null, businessName: null, city: null,
      onboardingDone: false, isSubscribed: false,
    });
  },
}));
