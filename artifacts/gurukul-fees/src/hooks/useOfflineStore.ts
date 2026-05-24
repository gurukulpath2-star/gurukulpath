import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface QueuedRequest {
  id: string;
  method: string;
  url: string;
  body: unknown;
  timestamp: number;
}

interface DraftPayment {
  id: string;
  studentId: string;
  amount: number;
  feeType: string;
  timestamp: number;
}

interface OfflineStore {
  // Connection state
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Queued requests
  queuedRequests: QueuedRequest[];
  addQueuedRequest: (req: Omit<QueuedRequest, 'id' | 'timestamp'>) => void;
  removeQueuedRequest: (id: string) => void;
  clearQueuedRequests: () => void;

  // Cached data
  cachedStudents: unknown[];
  setCachedStudents: (students: unknown[]) => void;

  cachedFeeRecords: unknown[];
  setCachedFeeRecords: (records: unknown[]) => void;

  cachedPayments: unknown[];
  setCachedPayments: (payments: unknown[]) => void;

  // Draft data for offline entry
  draftPayments: DraftPayment[];
  addDraftPayment: (payment: Omit<DraftPayment, 'id' | 'timestamp'>) => void;
  removeDraftPayment: (id: string) => void;
  clearDraftPayments: () => void;
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      // Connection state
      isOnline: navigator.onLine,
      setIsOnline: (online) => set({ isOnline: online }),

      // Queued requests
      queuedRequests: [],
      addQueuedRequest: (req) =>
        set((state) => ({
          queuedRequests: [
            ...state.queuedRequests,
            {
              ...req,
              id: `${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
            },
          ],
        })),
      removeQueuedRequest: (id) =>
        set((state) => ({
          queuedRequests: state.queuedRequests.filter((r) => r.id !== id),
        })),
      clearQueuedRequests: () => set({ queuedRequests: [] }),

      // Cached data
      cachedStudents: [],
      setCachedStudents: (students) => set({ cachedStudents: students }),

      cachedFeeRecords: [],
      setCachedFeeRecords: (records) => set({ cachedFeeRecords: records }),

      cachedPayments: [],
      setCachedPayments: (payments) => set({ cachedPayments: payments }),

      // Draft data
      draftPayments: [],
      addDraftPayment: (payment) =>
        set((state) => ({
          draftPayments: [
            ...state.draftPayments,
            {
              ...payment,
              id: `draft-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
            },
          ],
        })),
      removeDraftPayment: (id) =>
        set((state) => ({
          draftPayments: state.draftPayments.filter((p) => p.id !== id),
        })),
      clearDraftPayments: () => set({ draftPayments: [] }),
    }),
    {
      name: 'gurukul-offline-store',
      storage: {
        getItem: (name) => {
          const item = localStorage.getItem(name);
          return item ? JSON.parse(item) : null;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
